import { db, storage } from "../core/firebase.js";
const marker = db.doc("operations/uexRestart20260922");
const collections = ["uexParties", "uexInvitationTokens", "uexLimits", "invitations"];
const run = async () => {
  const state = (await marker.get()).data();
  if (state?.completedAt) return console.log("UEX cleanup already completed.");
  await marker.set({ blocked: true, startedAt: state?.startedAt || new Date().toISOString() }, { merge: true });
  const deleted = {};
  for (const name of collections) {
    const refs = await db.collection(name).listDocuments();
    deleted[name] = refs.length;
    for (const ref of refs) await db.recursiveDelete(ref);
  }
  const [files] = await storage.bucket().getFiles({ prefix: "uex/" });
  deleted.files = files.length;
  for (const file of files) await file.delete({ ignoreNotFound: true });
  await marker.set({ completedAt: new Date().toISOString(), blocked: false, deleted }, { merge: true });
  console.log(JSON.stringify({ deleted }));
};
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GCLOUD_PROJECT !== "uniqenergy-de71c") throw new Error("UEX cleanup is CI-only.");
await run();
