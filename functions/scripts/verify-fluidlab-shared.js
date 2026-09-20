// Bounded live-AI check against emulator data only: one geometry request and one chat question.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { db, storage } from "../core/firebase.js";
import { generateGeometry } from "../apps/fluidlab/geometry.js";
import { emptyDataset } from "../apps/fluidlab/model.js";
import { askFluidChat, getFluidChat } from "../apps/fluidlab/service.js";
if (
  !process.argv.includes("--live") ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.STORAGE_EMULATOR_HOST
)
  throw new Error("Use --live with Firestore and Storage emulators.");
process.env.OPENAI_API_KEY ||= execFileSync(
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
const id = `verify-${randomUUID()}`,
  uid = `user-${id}`,
  other = `other-${id}`;
const fact = (value, unit = null) => ({
  value: String(value),
  unit,
  status: "reported",
  sources: ["a".repeat(32)],
});
const data = emptyDataset();
data.records = [
  {
    id: "clay",
    kind: "product",
    label: "Clay",
    report: null,
    product: null,
    branch: null,
    facts: { unitPrice: fact(4, "CAD") },
  },
  {
    id: "usage",
    kind: "usage",
    label: "Clay usage",
    report: "R1",
    product: "Clay",
    branch: null,
    facts: { quantity: fact(5) },
  },
];
data.sources = [
  {
    id: "a".repeat(32),
    file: "test.csv",
    sheet: "Sheet1",
    cell: "A2",
    row: 2,
    column: 1,
    raw: "Leg 1 reaches 500 m. Start depth is not recorded.",
    display: "Leg 1 reaches 500 m. Start depth is not recorded.",
    formula: null,
  },
];
const generated = await generateGeometry(data, {
  apiKey: process.env.OPENAI_API_KEY,
});
assert.equal(generated.dataset.geometry.length, 1);
assert.equal(generated.dataset.geometry[0].endM, 500);
assert.ok(generated.dataset.issues.some((i) => i.field === "startM"));
assert.equal(generated.usage.calls, 1);
const path = `fluidlab/${id}/versions/v1.json`,
  well = db.doc(`fluidWells/${id}`);
try {
  for (const user of [uid, other])
    await db
      .doc(`users/${user}`)
      .set({
        schemaVersion: 2,
        email: `${user}@example.com`,
        status: "active",
        role: "employee",
        enabledMiniApps: ["fluidlab"],
      });
  await well.set({
    createdBy: uid,
    name: "Verification well",
    version: "v1",
    revision: 1,
    status: "ready",
    updatedAt: new Date().toISOString(),
  });
  await well.collection("versions").doc("v1").set({ path });
  await storage.bucket().file(path).save(JSON.stringify(generated.dataset));
  const request = (user, d) => ({
    auth: { uid: user, token: { email_verified: true, auth_time: Math.floor(Date.now()/1000), email: `${user}@example.com` } },
    data: { wellId: id, ...d },
  });
  const result = await askFluidChat.run(
    request(uid, {
      version: "v1",
      question: "What is the total product cost? Keep it brief.",
      mutationId: randomUUID(),
    }),
  );
  assert.match(result.message.answer, /20/);
  assert.doesNotMatch(result.message.answer, /\[[a-f0-9]{32}\]/);
  assert.ok(result.message.answer.length < 1500);
  assert.equal((await getFluidChat.run(request(other, {}))).messages.length, 0);
  console.log(
    JSON.stringify({
      geometryCalls: generated.usage.calls,
      geometryBranches: generated.dataset.geometry.length,
      chatTokens: result.message.usage.totalTokens,
      answer: result.message.answer,
      personalChatIsolation: true,
    }),
  );
} finally {
  await db.recursiveDelete(well);
  for (const user of [uid, other])
    await db.recursiveDelete(db.doc(`users/${user}`));
  await storage.bucket().deleteFiles({ prefix: `fluidlab/${id}/` });
}
