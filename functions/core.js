import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { MINI_APP_IDS, SUPER_ADMIN, USER_TYPES, miniAppsFor } from "./miniApps.js";
import { hasNames, profileView } from "./profile.js";

/** Key for the Resend email API (inquiry notifications and user invites). Never logged. */
export const resendApiKey = defineSecret("RESEND_API_KEY");
/** Inbox that receives a notification for each new contact form submission. */
export const contactNotifyEmail = defineString("CONTACT_NOTIFY_EMAIL", { default: "rambodr@uniquem.ca" });
export const db = getFirestore(getApps().length ? getApps()[0] : initializeApp());
export const callable = { region: "us-central1", maxInstances: 2, cors: true, enforceAppCheck: globalThis.process?.env?.FUNCTIONS_EMULATOR !== "true" };

export function text(value, field, max) {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", `Enter a valid ${field}.`);
  const result = value.trim();
  if (!result || result.length > max) throw new HttpsError("invalid-argument", `Enter a valid ${field}.`);
  return result;
}
export function optional(value, field, max) {
  if (value == null || value === "") return undefined;
  return text(value, field, max);
}
export function email(value) {
  const result = text(value, "email", 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(result)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  return result;
}

// Access for the private workspace. There is no hardcoded owner: every account needs a verified email and an active
// record at users/{Firebase Auth uid} = { email, firstName, lastName, type: "super_admin" | "staff", miniApps: string[],
// photo: null | { path, thumb }, invite (see invite.js), disabled, createdAt, createdBy, updatedAt, updatedBy }.
// A super admin can open every mini app in miniApps.js; staff can open the mini apps everyone has (Profile) plus the ones listed on their record.
// A record that is missing, for another email, without both names, disabled, or with an unknown type means no access: nothing is guessed or defaulted.
export async function resolveAccess(request, database = db) {
  const token = request.auth?.token;
  if (!token?.email || token.email_verified !== true) return null;
  const address = token.email.toLowerCase();
  const snapshot = await database.collection("users").doc(request.auth.uid).get();
  if (!snapshot.exists) return null;
  const record = snapshot.data();
  if (record.email !== address || record.disabled === true || !USER_TYPES.includes(record.type) || !hasNames(record)) return null;
  return { uid: request.auth.uid, email: address, type: record.type, miniApps: miniAppsFor(record.type, record.miniApps), profile: profileView(record) };
}
/** Throws "not authorized" unless the signed-in, verified account may open the mini app `appId`. */
export async function requireMiniApp(request, appId, database = db) {
  if (!MINI_APP_IDS.includes(appId)) throw new Error(`Unknown mini app: ${appId}`);
  const access = await resolveAccess(request, database);
  if (!access || !access.miniApps.includes(appId)) throw new HttpsError("permission-denied", "This account is not authorized.");
  return access;
}
/** Throws "not authorized" unless the signed-in, verified account is an active super admin. */
export async function requireSuperAdmin(request, database = db) {
  const access = await resolveAccess(request, database);
  if (!access || access.type !== SUPER_ADMIN) throw new HttpsError("permission-denied", "This account is not authorized.");
  return access;
}
/** Throws "not authorized" unless the account is an active signed-in staff member or super admin. */
export async function requireSignedIn(request, database = db) {
  const access = await resolveAccess(request, database);
  if (!access) throw new HttpsError("permission-denied", "This account is not authorized.");
  return access;
}
