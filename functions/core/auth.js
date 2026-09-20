import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";
import { MANAGED_MINI_APPS } from "./config.js";
export const SESSION_SECONDS = 365 * 86400;
export function normalizeMiniApps(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => MANAGED_MINI_APPS.includes(item)))]
    : [];
}
export function publicUser(uid, data) {
  return {
    schemaVersion: 2,
    uid,
    email: data.email || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    role: ["admin", "employee"].includes(data.role) ? data.role : "member",
    status: data.status === "active" ? "active" : "disabled",
    enabledMiniApps: normalizeMiniApps(data.enabledMiniApps),
  };
}
export function validSession(data, token, now = Date.now()) {
  return (
    data.schemaVersion === 2 &&
    data.status === "active" &&
    Number.isFinite(token.auth_time) &&
    token.auth_time <= now / 1000 + 60 &&
    token.auth_time > (data.sessionsRevokedBefore || 0) &&
    now / 1000 - token.auth_time < SESSION_SECONDS
  );
}
export async function requireUser(request) {
  const uid = request.auth?.uid,
    token = request.auth?.token;
  if (!uid || !token?.email || token.email_verified !== true)
    throw new HttpsError("unauthenticated", "Verify your email to continue.");
  const ref = db.collection("users").doc(uid),
    snap = await ref.get(),
    data = snap.data();
  if (
    !data ||
    !validSession(data, token) ||
    data.email !== String(token.email).toLowerCase()
  )
    throw new HttpsError(
      "permission-denied",
      "Your session is unavailable. Please sign in again.",
    );
  return { uid, ref, data, user: publicUser(uid, data) };
}
export async function requireAdmin(request) {
  const current = await requireUser(request);
  if (current.data.role !== "admin")
    throw new HttpsError(
      "permission-denied",
      "Administrator access is required.",
    );
  return current;
}
export async function requireMiniApp(request, appId) {
  const current = await requireUser(request);
  if (appId === "lsd-finder") return current;
  if (
    current.data.role !== "admin" &&
    !(
      current.data.role === "employee" &&
      normalizeMiniApps(current.data.enabledMiniApps).includes(appId)
    )
  )
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this app.",
    );
  return current;
}
