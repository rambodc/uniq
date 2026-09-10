// Three bounded live-model questions against synthetic local emulator data only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { db, storage } from "../core/firebase.js";
import { saveFluidPasonAnalysis } from "../apps/fluidlab/pason-data.js";
import { askFluidChat, getFluidChat } from "../apps/fluidlab/service.js";
import { emptyDataset } from "../apps/fluidlab/model.js";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST)
  throw new Error("Local emulators required.");
process.env.OPENAI_API_KEY = execFileSync(
  "gcloud",
  [
    "secrets",
    "versions",
    "access",
    "latest",
    "--secret=OPENAI_API_KEY",
    "--project=uniqenergy-de71c",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
).trim();
const uid = randomUUID(),
  other = randomUUID(),
  id = randomUUID(),
  attachmentId = randomUUID(),
  well = db.doc(`fluidWells/${id}`),
  path = `fluidlab/${id}/versions/reports.json`;
const req = (data, user = uid) => ({
  auth: { uid: user, token: { email: user + "@test.com" } },
  data: { wellId: id, attachmentId, ...data },
});
const prepare = (data) => saveFluidPasonAnalysis.run(req(data));
for (const user of [uid, other])
  await db
    .doc(`users/${user}`)
    .set({
      schemaVersion: 1,
      email: user + "@test.com",
      status: "active",
      enabledMiniApps: ["fluidlab"],
    });
await well.set({
  name: "Pason verification",
  status: "ready",
  version: null,
  revision: 1,
  pason: { id: attachmentId, originalName: "synthetic.zip" },
});
try {
  const meta = {
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
    firstTimestamp: "2026-09-01",
    lastTimestamp: "2026-09-01",
    values: { torque: { count, sum, minimum, maximum, latest: maximum } },
  });
  const { runId } = await prepare({ stage: "begin", meta, pageCount: 1 });
  await prepare({
    stage: "page",
    runId,
    index: 0,
    kind: "operations",
    rows: [bucket(100, 2, 6, 2, 4), bucket(101, 4, 24, 3, 9)],
  });
  await prepare({ stage: "finish", runId });
  let total = 0;
  const ask = async (question, version = null) => {
    const result = await askFluidChat.run(
      req({ version, question, mutationId: randomUUID() }),
    );
    total += result.message.usage.totalTokens;
    assert.ok(total < 40000, "Bounded verification token budget");
    console.log(
      JSON.stringify({
        question,
        answer: result.message.answer,
        tokens: result.message.usage.totalTokens,
        pasonEvidence: result.message.evidence.filter(
          (e) => e.source === "Pason extraction",
        ).length,
      }),
    );
    return result.message;
  };
  const first = await ask(
    "From Pason, what are average and maximum torque between MD 100 and 102 metres?",
  );
  assert.match(first.answer, /5/);
  assert.match(first.answer, /9/);
  assert.ok(first.evidence.some((e) => e.source === "Pason extraction"));
  const second = await ask(
    "What exact time did that maximum happen, and on which leg?",
  );
  assert.match(
    second.answer,
    /cannot|can't|not available|does not|doesn't|not.*(record|contain|retain)|no exact/i,
  );
  const dataset = emptyDataset();
  dataset.records = [
    {
      id: "report",
      kind: "report",
      label: "Report A",
      report: null,
      product: null,
      branch: null,
      facts: {
        density: {
          value: "1090",
          unit: "kg/m3",
          status: "reported",
          sources: ["density"],
        },
      },
    },
  ];
  dataset.sources = [
    {
      id: "density",
      file: "report.csv",
      sheet: "Report A",
      cell: "A1",
      display: "1090 kg/m3",
      raw: 1090,
      formula: null,
      row: 1,
      column: 1,
    },
  ];
  await storage.bucket().file(path).save(JSON.stringify(dataset));
  await well.collection("versions").doc("reports").set({ path });
  await well.update({ version: "reports" });
  const third = await ask(
    "What mud density is recorded in Report A?",
    "reports",
  );
  assert.match(third.answer, /1,?090/);
  assert.equal(
    third.evidence.filter((e) => e.source === "Pason extraction").length,
    0,
  );
  assert.equal((await getFluidChat.run(req({}, other))).messages.length, 0);
  console.log(JSON.stringify({ passed: true, totalTokens: total }));
} finally {
  await db.recursiveDelete(well);
  await storage.bucket().file(path).delete({ ignoreNotFound: true });
  for (const user of [uid, other]) await db.doc(`users/${user}`).delete();
}
