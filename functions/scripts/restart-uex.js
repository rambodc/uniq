// Temporary, CI-only release operation. Remove after completion is verified.
import { pathToFileURL } from "node:url";
import { db, storage } from "../core/firebase.js";
const marker = () => db.doc("operations/uexRestart20260920");
export const collections = [
  "uexParties",
  "uexInvitationTokens",
  "uexLimits",
  "loginRequests",
  "invitations",
  "passwordResetRequests",
];
export async function beginRestart() {
  return db.runTransaction(async (tx) => {
    const state = (await tx.get(marker())).data();
    if (state?.completedAt) return { skipped: true };
    tx.set(
      marker(),
      {
        blocked: true,
        startedAt: state?.startedAt || new Date().toISOString(),
      },
      { merge: true },
    );
    return { skipped: false };
  });
}
export async function finishRestart({
  now = Date.now(),
  allowDrain = false,
} = {}) {
  let state = (await marker().get()).data();
  if (state?.completedAt) return { skipped: true };
  if (!state?.blocked) throw new Error("UEX must be blocked before cleanup.");
  if (!state.drainUntil) {
    await marker().update({ drainUntil: now + 360000 });
    state = (await marker().get()).data();
  }
  if (now < state.drainUntil) {
    if (!allowDrain) throw new Error("UEX requests have not drained.");
    while (Date.now() < state.drainUntil) {
      console.log("Waiting for pre-restart UEX requests to finish.");
      await new Promise((r) =>
        setTimeout(r, Math.min(30000, state.drainUntil - Date.now())),
      );
    }
  }
  const counts = {};
  for (const name of collections) {
    const refs = await db.collection(name).listDocuments();
    counts[name] = refs.length;
    for (const ref of refs) await db.recursiveDelete(ref);
  }
  const [files] = await storage.bucket().getFiles({ prefix: "uex/" });
  counts.files = files.length;
  for (const file of files) await file.delete({ ignoreNotFound: true });
  await db.doc("platform/accountCutover").delete();
  for (const name of collections)
    if ((await db.collection(name).listDocuments()).length)
      throw new Error(`Cleanup incomplete: ${name}`);
  if ((await storage.bucket().getFiles({ prefix: "uex/" }))[0].length)
    throw new Error("UEX files remain.");
  await marker().update({
    completedAt: new Date().toISOString(),
    blocked: false,
    deleted: counts,
  });
  console.log(
    "UEX restart verified: all targeted collections and files are empty.",
    JSON.stringify(counts),
  );
  return { skipped: false, counts };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.UEX_RESTART !== "CLEAN_UEX_20260920" ||
    process.env.GCLOUD_PROJECT !== "uniqenergy-de71c"
  )
    throw new Error(
      "Run only through the authorized production Actions restart step.",
    );
  if (process.argv[2] === "begin") console.log(await beginRestart());
  else if (process.argv[2] === "finish")
    console.log(await finishRestart({ allowDrain: true }));
  else throw new Error("Expected begin or finish.");
}
