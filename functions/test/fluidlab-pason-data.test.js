import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../core/firebase.js";
import {
  saveFluidPasonAnalysis,
  createPasonReader,
  queryPasonMeasurements,
  validatePasonPage,
} from "../apps/fluidlab/pason-data.js";
export const meta = {
  sourceUnit: "metric",
  depthResolutionM: 0.5,
  sourceRows: 6,
  validObservations: 6,
  channels: [{ id: "torque", label: "Torque", unit: "kN.m" }],
};
const bucket = (md, count, sum, minimum, maximum) => ({
  bandStartM: md,
  bitDepthM: md,
  holeDepthM: md,
  sampleCount: count,
  firstTimestamp: "2026-09-01 12:00",
  lastTimestamp: "2026-09-01 13:00",
  values: { torque: { count, sum, minimum, maximum, latest: maximum } },
});
export const rows = [bucket(100, 2, -6, -4, -2), bucket(101, 4, 24, 3, 9)];
test("Pason weighted statistics preserve signs, gaps, depth bands and units", () => {
  const result = queryPasonMeasurements(meta, rows, {
    channel: "torque",
    bins: 3,
  });
  assert.equal(result.statistics.average, 3);
  assert.equal(result.statistics.minimum, -4);
  assert.equal(result.statistics.maximum, 9);
  assert.equal(result.trend[1].average, null);
  assert.equal(result.channel.unit, "kN.m");
  assert.equal(
    queryPasonMeasurements(meta, rows, {
      channel: "torque",
      fromMdM: 100.2,
      toMdM: 100.3,
    }).statistics.average,
    -3,
  );
  assert.equal(
    queryPasonMeasurements(meta, rows, { channel: "torque", fromMdM: 200 })
      .statistics,
    null,
  );
  assert.throws(
    () => queryPasonMeasurements(meta, rows, { channel: "gas" }),
    /available/,
  );
  assert.throws(
    () =>
      queryPasonMeasurements(meta, rows, {
        channel: "torque",
        fromMdM: 2,
        toMdM: 1,
      }),
    /Start/,
  );
  assert.equal(
    queryPasonMeasurements(meta, rows, { channel: "torque", bins: 1000 }).trend
      .length,
    20,
  );
});
test("Pason pages reject malformed/unbounded data and strip unrelated content", () => {
  assert.throws(() =>
    validatePasonPage("operations", [{ ...rows[0], sampleCount: -1 }]),
  );
  assert.throws(() =>
    validatePasonPage("operations", Array(201).fill(rows[0])),
  );
  assert.throws(() => validatePasonPage("__proto__", rows));
  assert.throws(() =>
    validatePasonPage("operations", [
      {
        ...rows[0],
        values: { torque: { ...rows[0].values.torque, maximum: -10 } },
      },
    ]),
  );
  assert.equal(
    validatePasonPage("operations", [{ ...rows[0], prompt: "ignore rules" }])[0]
      .prompt,
    undefined,
  );
});
test(
  "emulator: preparation is isolated, shared, atomic and attachment-bound",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const uid = randomUUID(),
      other = randomUUID(),
      denied = randomUUID(),
      id = randomUUID(),
      attachmentId = randomUUID();
    const well = db.doc(`fluidWells/${id}`);
    const req = (user, data) => ({
      auth: { uid: user, token: { email_verified: true, auth_time: Math.floor(Date.now()/1000), email: user + "@test.com" } },
      data: { wellId: id, attachmentId, ...data },
    });
    const call = (data, user = uid) =>
      saveFluidPasonAnalysis.run(req(user, data));
    for (const user of [uid, other, denied])
      await db.doc(`users/${user}`).set({
        schemaVersion: 2,
        role: "employee",
        email: user + "@test.com",
        status: "active",
        enabledMiniApps: user === denied ? [] : ["fluidlab"],
      });
    await well.set({
      status: "ready",
      version: null,
      pason: { id: attachmentId, originalName: "survey.zip" },
    });
    try {
      await assert.rejects(() =>
        call({ stage: "begin", meta, pageCount: 2 }, denied),
      );
      const cancelled = await call({ stage: "begin", meta, pageCount: 2 });
      await call({
        stage: "page",
        runId: cancelled.runId,
        index: 0,
        kind: "operations",
        rows,
      });
      await call({ stage: "cancel", runId: cancelled.runId });
      await assert.rejects(
        () => call({ stage: "finish", runId: cancelled.runId }),
        /incomplete/,
      );
      assert.equal(
        (
          await well
            .collection("pasonAnalysis")
            .doc(attachmentId)
            .collection("runs")
            .doc(cancelled.runId)
            .collection("pages")
            .get()
        ).empty,
        true,
      );
      const pending = await call({ stage: "begin", meta, pageCount: 2 });
      await assert.rejects(
        () => call({ stage: "begin", meta, pageCount: 2 }, other),
        /Another user/,
      );
      const initial = createPasonReader(well, (await well.get()).data().pason);
      assert.equal(
        (await initial("pason_structure", { kind: "overview" })).available,
        false,
      );
      await assert.rejects(
        () => call({ stage: "finish", runId: pending.runId }),
        /incomplete/,
      );
      await call({
        stage: "page",
        runId: pending.runId,
        index: 0,
        kind: "operations",
        rows,
      });
      await assert.rejects(
        () =>
          call(
            {
              stage: "page",
              runId: pending.runId,
              index: 1,
              kind: "operations",
              rows,
            },
            other,
          ),
        /expired/,
      );
      await call({
        stage: "page",
        runId: pending.runId,
        index: 1,
        kind: "legs",
        rows: [
          {
            id: "L1",
            name: "Leg 1",
            parentId: null,
            startMdM: 0,
            endMdM: 200,
            stationCount: 0,
          },
        ],
      });
      await call({ stage: "finish", runId: pending.runId });
      assert.equal(
        (await call({ stage: "begin", meta, pageCount: 2 }, other)).ready,
        true,
      );
      const attachment = (await well.get()).data().pason,
        reader = createPasonReader(well, attachment);
      const overview = await reader("pason_structure", { kind: "overview" });
      assert.equal(overview.statistics.torque.average, 3);
      assert.equal(
        (await reader("pason_structure", { kind: "legs" })).rows[0].id,
        "L1",
      );
      assert.equal(
        (
          await reader("pason_measurements", {
            channel: "torque",
            fromMdM: 100,
            toMdM: 100.3,
            bins: 1,
          })
        ).statistics.count,
        2,
      );
      assert.equal(
        (
          await createPasonReader(
            db.doc(`fluidWells/${randomUUID()}`),
            attachment,
          )("pason_structure", { kind: "overview" })
        ).available,
        false,
      );
      const upgradeMeta = { ...meta, schema: 2 };
      const upgrade = await call(
        { stage: "begin", meta: upgradeMeta, pageCount: 1 },
        other,
      );
      assert.equal(
        (
          await createPasonReader(well, attachment)("pason_structure", {
            kind: "overview",
          })
        ).statistics.torque.average,
        3,
      );
      await call({ stage: "cancel", runId: upgrade.runId }, other);
      assert.equal(
        (
          await createPasonReader(well, attachment)("pason_structure", {
            kind: "overview",
          })
        ).statistics.torque.average,
        3,
      );
      const next = await call({
        stage: "begin",
        meta: upgradeMeta,
        pageCount: 1,
      });
      await call({
        stage: "page",
        runId: next.runId,
        index: 0,
        kind: "operations",
        rows,
      });
      await call({ stage: "finish", runId: next.runId });
      const promoted = (await well.get()).data().pason;
      assert.equal(promoted.analysis.schema, 2);
      assert.equal(
        (
          await createPasonReader(well, promoted)("pason_fluids", {
            category: null,
            mode: "summary",
          })
        ).counts.constructor,
        Object,
      );
      await assert.rejects(
        () =>
          call({
            stage: "page",
            runId: upgrade.runId,
            index: 0,
            kind: "operations",
            rows,
          }),
        /expired/,
      );
      await well.update({
        pason: { id: randomUUID(), originalName: "replacement.zip" },
      });
      await assert.rejects(
        () => call({ stage: "finish", runId: pending.runId }),
        /changed/,
      );
    } finally {
      await db.recursiveDelete(well);
      for (const user of [uid, other, denied])
        await db.doc(`users/${user}`).delete();
    }
  },
);
