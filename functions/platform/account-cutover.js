import { pathToFileURL } from "node:url";
import { auth, db, storage } from "../core/firebase.js";
export const RESET_COLLECTIONS = [
  "users",
  "invitations",
  "passwordResetRequests",
  "loginChallenges",
  "loginLimits",
  "fluidWells",
  "fluidlabUsage",
  "contactInquiries",
  "invoiceQbQueue",
  "invoiceQbClaims",
  "invoiceQbOauth",
  "uexParties",
];
const marker = () => db.doc("platform/accountCutover");
export async function startCutover() {
  const state = (await marker().get()).data();
  if (state?.completedAt) return false;
  await marker().set(
    {
      maintenance: true,
      startedAt: state?.startedAt || new Date().toISOString(),
    },
    { merge: true },
  );
  // Disabling old identities closes direct Storage access while replacement rules roll out.
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const user of page.users) {
      await auth.updateUser(user.uid, { disabled: true });
      await auth.revokeRefreshTokens(user.uid);
      const profile = db.doc(`users/${user.uid}`);
      if ((await profile.get()).exists)
        await profile.update({ status: "disabled" });
    }
    token = page.pageToken;
  } while (token);
  const running = await db.collectionGroup("imports").where("status", "==", "processing").limit(1).get();
  // Old authenticated requests last at most 300s; an already-running import can last 1800s.
  // New workers cannot pass the disabled profile check after this point.
  if (!state?.drainUntil) await marker().update({ drainUntil: Date.now() + (running.empty ? 360000 : 1850000) });
  return true;
}
export async function resetAndBootstrap() {
  const state = (await marker().get()).data();
  if (state?.completedAt) return { skipped: true };
  if (!state?.maintenance)
    throw new Error("Maintenance must be enabled before reset.");
  if (!process.env.FIRESTORE_EMULATOR_HOST && Date.now() < state.drainUntil) throw new Error("Pre-cutover requests have not drained yet.");
  if (!state.resetAt) {
    for (const name of RESET_COLLECTIONS) {
      const docs = await db.collection(name).listDocuments();
      for (const doc of docs) await db.recursiveDelete(doc);
    }
    for (const prefix of ["fluidlab/", "invoice-qb/", "uex/"])
      await storage.bucket().deleteFiles({ prefix, force: true });
    let page;
    do {
      page = await auth.listUsers(1000);
      if (page.users.length) {
        const result = await auth.deleteUsers(page.users.map((u) => u.uid));
        if (result.failureCount)
          throw new Error("Could not reset all identities.");
      }
    } while (page.users.length);
    await marker().update({ resetAt: new Date().toISOString() });
  }
  const address = "rambodr@uniquem.ca";
  let admin;
  try {
    admin = await auth.getUserByEmail(address);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    admin = await auth.createUser({ email: address, emailVerified: false });
  }
  await auth.updateUser(admin.uid, { disabled: false });
  await db
    .doc(`users/${admin.uid}`)
    .set({
      schemaVersion: 2,
      email: address,
      firstName: "",
      lastName: "",
      role: "admin",
      status: "active",
      enabledMiniApps: [],
      createdAt: new Date().toISOString(),
    });
  await marker().update({
    completedAt: new Date().toISOString(),
    maintenance: true,
  });
  return { skipped: false };
}
export async function finishCutover() {
  if (!(await marker().get()).data()?.completedAt)
    throw new Error("Reset/bootstrap must complete before opening accounts.");
  await marker().update({ maintenance: false });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.ACCOUNT_CUTOVER !== "RESET_UNIQACCOUNT_V2"
  )
    throw new Error(
      "Run only through the authorized production Actions workflow.",
    );
  const phase = process.argv[2];
  if (phase === "start") await startCutover();
  else if (phase === "reset") await resetAndBootstrap();
  else if (phase === "finish") await finishCutover();
  else throw new Error("Expected start, reset, or finish.");
  console.log(`Account cutover ${phase} completed.`);
}
