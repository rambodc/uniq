#!/usr/bin/env node
// One-off wipe of the old UniqEnergy portal. Dry-run unless --execute is passed.
// On execute, the first step is a complete Firestore export. If that export fails, nothing is revoked or deleted.
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { exportDatabase } from "./maintenance/firestore-export.mjs";
import { writeVerifiedExport } from "./maintenance/write-export.mjs";
import { buildRevokeRequest, decryptToken } from "./maintenance/quickbooks.mjs";
import { executeWipe } from "./maintenance/wipe.mjs";
import { deliverInvite } from "../functions/invite.js";
import { sendInviteEmail } from "../functions/mailer.js";

const PROJECT = "uniqenergy-de71c";
const BUCKET = "uniqenergy-de71c.firebasestorage.app";
const ADMIN_EMAIL = "rambodr@uniquem.ca";

if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error("Refusing to run while a Firebase emulator host is set.");
  process.exit(1);
}

const execute = process.argv.includes("--execute");
const outFlag = process.argv.indexOf("--out");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = outFlag >= 0 && process.argv[outFlag + 1] ? resolve(process.argv[outFlag + 1]) : resolve(process.cwd(), `uniqenergy-firestore-export-${stamp}.json`);

initializeApp({ credential: applicationDefault(), projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const auth = getAuth();

async function accessToken() {
  const { access_token: token } = await applicationDefault().getAccessToken();
  if (!token) throw new Error("Application default credentials did not return an access token.");
  return token;
}
async function readSecret(name, token) {
  const response = await fetch(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Could not read secret ${name} (${response.status}).`);
  const body = await response.json();
  if (typeof body?.payload?.data !== "string") throw new Error(`Secret ${name} had no payload.`);
  return Buffer.from(body.payload.data, "base64").toString("utf8");
}
async function countAuthUsers() {
  let count = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    count += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return count;
}
async function deleteAuthUsers() {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) await auth.deleteUser(user.uid);
    pageToken = page.pageToken;
  } while (pageToken);
}
async function revokeQuickBooks(token) {
  const snap = await db.doc("invoiceQbPrivate/connection").get();
  const saved = snap.data();
  if (!saved?.refreshToken) {
    console.log("No QuickBooks refresh token stored.");
    return;
  }
  let config;
  try { config = JSON.parse(await readSecret("INVOICE_QB_CONFIG", token)); } catch (error) {
    throw new Error(`A QuickBooks refresh token is stored, but INVOICE_QB_CONFIG could not be read (${error instanceof Error ? error.message : "invalid secret"}).`);
  }
  if (!config.clientId || !config.clientSecret || !config.encryptionKey) throw new Error("INVOICE_QB_CONFIG is missing the QuickBooks client id, secret, or encryption key.");
  let refresh;
  try { refresh = decryptToken(saved.refreshToken, config.encryptionKey); } catch { throw new Error("The stored QuickBooks refresh token could not be decrypted. Nothing was deleted."); }
  const request = buildRevokeRequest({ clientId: config.clientId, clientSecret: config.clientSecret, token: refresh });
  const response = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(20_000) });
  if (response.status !== 200 && response.status !== 400) throw new Error(`Intuit revoke failed with status ${response.status}. Nothing was deleted.`);
  console.log(`Intuit revoke returned ${response.status}.`);
}
async function createSuperAdmin(apiKey) {
  const firstName = "Rambod";
  const lastName = "Admin";
  const account = await auth.createUser({ email: ADMIN_EMAIL, password: randomBytes(32).toString("base64url"), displayName: `${firstName} ${lastName}`, emailVerified: true, disabled: false });
  const now = FieldValue.serverTimestamp();
  await db.collection("users").doc(account.uid).create({ email: ADMIN_EMAIL, firstName, lastName, type: "super_admin", miniApps: [], photo: null, disabled: false, invite: null, createdAt: now, createdBy: "wipe-script", updatedAt: now, updatedBy: "wipe-script" });
  const result = await deliverInvite({ uid: account.uid, record: { email: ADMIN_EMAIL, firstName, lastName }, invitedBy: "wipe-script" }, {
    makeLink: (address) => auth.generatePasswordResetLink(address, { url: "https://uniqenergy.com/signin" }),
    send: (invite, idempotencyKey) => sendInviteEmail(invite, apiKey, { idempotencyKey }),
    save: (invite) => db.collection("users").doc(account.uid).update({ invite }),
    newKey: randomUUID,
    now: () => new Date(),
    log: (message) => console.error(message),
  });
  if (!result.sent) throw new Error(`Super admin ${ADMIN_EMAIL} was created, but the invite email was not sent. ${result.reason}`);
  console.log(`Created super admin ${ADMIN_EMAIL} and sent the set-password invite.`);
}

if (!execute) {
  const names = (await db.listCollections()).map((collection) => collection.id);
  const inquiries = (await db.collection("contactInquiries").get()).size;
  const connection = await db.doc("invoiceQbPrivate/connection").get();
  const [files] = await getStorage().bucket().getFiles({ prefix: "fluidlab/" });
  console.log("Dry run. No export was written and nothing will be revoked or deleted.");
  console.log(`Top-level collections: ${names.join(", ") || "(none)"}`);
  console.log(`contactInquiries kept: ${inquiries}`);
  console.log(connection.data()?.refreshToken ? "A QuickBooks refresh token is stored and would be revoked at Intuit." : "No QuickBooks refresh token is stored.");
  console.log(`Auth users that would be deleted: ${await countAuthUsers()}`);
  console.log(`Storage files under fluidlab/ that would be deleted: ${files.length}`);
  console.log(`Execute would first write ${outPath} and abort if that export cannot be verified.`);
  process.exit(0);
}

const token = await accessToken();
let exportPath = "";
try {
  exportPath = await executeWipe({
    exportAll: async () => {
      const payload = await exportDatabase(db, PROJECT);
      const path = await writeVerifiedExport(payload, outPath);
      exportPath = path;
      console.log(`Exported ${payload.documentCount} documents to ${path}`);
      return { path };
    },
    revokeQuickBooks: () => revokeQuickBooks(token),
    deleteOtherCollections: async () => {
      for (const collection of await db.listCollections()) {
        if (collection.id === "contactInquiries") continue;
        await db.recursiveDelete(collection);
        console.log(`Deleted collection ${collection.id}`);
      }
    },
    deleteFluidlabStorage: async () => {
      await getStorage().bucket().deleteFiles({ prefix: "fluidlab/" });
      console.log("Deleted storage files under fluidlab/.");
    },
    deleteAuthUsers: async () => {
      await deleteAuthUsers();
      console.log("Deleted Firebase Auth users.");
    },
    createSuperAdmin: async () => createSuperAdmin((await readSecret("RESEND_API_KEY", token)).trim()),
  });
} catch (error) {
  console.error(exportPath ? `Stopped after the export at ${exportPath}.` : "Stopped before any revoke or delete.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
console.log(`Wipe finished. Export kept at ${exportPath}.`);
