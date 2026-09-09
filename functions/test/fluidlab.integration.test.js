import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { db } from "../core/firebase.js";
import {
  createFluidWell,
  getFluidWell,
  saveFluidWell,
  restoreFluidVersion,
  getFluidHistory,
  deleteFluidWell,
  beginFluidImport,
  cancelFluidImport,
} from "../apps/fluidlab/service.js";
const enabled =
  !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.STORAGE_EMULATOR_HOST;
const uid = `fluid-test-${randomUUID()}`;
const request = (data = {}, user = uid) => ({
  auth: { uid: user, token: { email: `${user}@example.com` } },
  data,
});
test(
  "emulator: FluidLab snapshots, optimistic concurrency, restore, and cross-user isolation",
  { skip: !enabled },
  async () => {
    await db.doc(`users/${uid}`).set({
      schemaVersion: 1,
      email: `${uid}@example.com`,
      status: "active",
      enabledMiniApps: ["fluidlab"],
    });
    const id = randomUUID();
    let created;
    try {
      created = await createFluidWell.run(
        request({ name: "Integration", mutationId: id }),
      );
      const duplicate = await createFluidWell.run(
        request({ name: "Ignored retry", mutationId: id }),
      );
      assert.equal(duplicate.well.name, "Integration");
      const b = {
        id: "branch",
        label: "Leg 1",
        startM: 0,
        endM: 200,
        diameterMm: 200,
        parent: null,
        inclination: 90,
        azimuth: 0,
        visible: true,
        status: "edited",
        sources: [],
      };
      const change = {
        wellId: id,
        baseRevision: 0,
        mutationId: randomUUID(),
        geometry: [b],
      };
      const first = await saveFluidWell.run(request(change));
      assert.equal(first.revision, 1);
      const repeated = await saveFluidWell.run(request(change));
      assert.equal(repeated.revision, 1);
      await assert.rejects(
        saveFluidWell.run(request({ ...change, mutationId: randomUUID() })),
        /changed/,
      );
      const current = await getFluidWell.run(request({ wellId: id }));
      assert.equal(current.geometry[0].endM, 200);
      await saveFluidWell.run(
        request({
          wellId: id,
          baseRevision: 1,
          mutationId: randomUUID(),
          geometry: [{ ...b, endM: 300 }],
        }),
      );
      await restoreFluidVersion.run(
        request({
          wellId: id,
          version: first.version,
          baseRevision: 2,
          mutationId: randomUUID(),
        }),
      );
      assert.equal(
        (await getFluidWell.run(request({ wellId: id }))).geometry[0].endM,
        200,
      );
      assert.equal(
        (await getFluidHistory.run(request({ wellId: id }))).versions.length,
        3,
      );
      const importId = randomUUID();
      const upload = {
        wellId: id,
        mutationId: importId,
        files: [{ name: "any.csv", size: 10, sha256: "a".repeat(64) }],
      };
      const reserved = await beginFluidImport.run(request(upload));
      assert.equal(reserved.job.status, "uploading");
      assert.equal(
        (await beginFluidImport.run(request(upload))).job.id,
        importId,
      );
      await assert.rejects(
        beginFluidImport.run(request({ ...upload, mutationId: randomUUID() })),
        /Another import/,
      );
      await cancelFluidImport.run(request({ importId }));
      assert.equal(
        (await cancelFluidImport.run(request({ importId }))).status,
        "cancelled",
      );
      const next = await beginFluidImport.run(
        request({ ...upload, mutationId: randomUUID() }),
      );
      await cancelFluidImport.run(request({ importId: next.job.id }));
      await db
        .doc(`users/${uid}/miniApps/fluidlab/imports/${importId}`)
        .update({ status: "ready" });
      await assert.rejects(
        beginFluidImport.run(request({ ...upload, mutationId: randomUUID() })),
        /already been imported/,
      );
      const other = `${uid}-other`;
      await db.doc(`users/${other}`).set({
        schemaVersion: 1,
        email: `${other}@example.com`,
        status: "active",
        role: "admin",
      });
      await assert.rejects(
        getFluidWell.run(request({ wellId: id }, other)),
        /not found/,
      );
      await assert.rejects(
        beginFluidImport.run(
          request({ wellId: id, mutationId: randomUUID(), files: [] }, other),
        ),
        /not found/,
      );
      await db.doc(`users/${other}`).delete();
    } finally {
      if (created)
        await deleteFluidWell.run(
          request({ wellId: id, mutationId: randomUUID() }),
        );
      await db.recursiveDelete(db.doc(`users/${uid}`));
    }
  },
);
