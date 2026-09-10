import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { db, storage } from "../core/firebase.js";
import { askFluidChat, chatTool } from "../apps/fluidlab/service.js";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST)
  throw new Error("Run only against local emulators.");
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
const { dataset } = JSON.parse(
  await readFile("/tmp/fluidlab-check/result.json", "utf8"),
);
const uid = "fluid-live-check",
  wellId = "sample",
  version = "initial",
  path = `fluidlab/${wellId}/versions/${version}.json`;
const user = db.doc(`users/${uid}`),
  well = db.collection("fluidWells").doc(wellId);
await user.set({
  schemaVersion: 1,
  email: "fluid-live-check@example.com",
  status: "active",
  enabledMiniApps: ["fluidlab"],
});
await well.set({
  owner: uid,
  name: "Sample well",
  version,
  revision: 1,
  status: "ready",
});
await well.collection("versions").doc(version).set({ path });
await storage.bucket().file(path).save(JSON.stringify(dataset));
try {
  const result = await askFluidChat.run({
    auth: { uid, token: { email: "fluid-live-check@example.com" } },
    data: {
      wellId,
      version,
      mutationId: randomUUID(),
      question:
        "What are the total product and service costs? Do they agree with the final narrative cost total? Cite the evidence and state any currency uncertainty.",
    },
  });
  await writeFile("/tmp/fluidlab-chat-check.json", JSON.stringify(result));
  console.log(
    JSON.stringify({
      answer: result.message.answer,
      citations: result.message.citations.length,
      highlights: result.message.highlights.length,
      usage: result.message.usage,
    }),
  );
  console.log(
    "Read-only tools reject mutation:",
    (() => {
      try {
        chatTool(dataset, "delete", {});
        return false;
      } catch {
        return true;
      }
    })(),
  );
} finally {
  await db.recursiveDelete(well);
  await db.recursiveDelete(user);
  await storage.bucket().deleteFiles({ prefix: `fluidlab/${wellId}/` });
}
