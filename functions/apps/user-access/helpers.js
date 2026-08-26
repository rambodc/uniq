import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../core/firebase.js";
import { iso } from "../../core/values.js";
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const invitations = () => db.collection("invitations");
export const invitationToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value) => createHash("sha256").update(String(value)).digest("hex");
export const invitationId = () => randomUUID();
export const inviteUrl = (token) => `${String(process.env.PUBLIC_APP_URL || "https://uniqenergy-de71c.web.app").replace(/\/$/, "")}/invite/${token}`;
export function publicInvitation(id, data) { const expired = data.status === "pending" && data.expiresAt?.toMillis?.() <= Date.now(); return { id, schemaVersion: 1, email: data.email, firstName: data.firstName || "", lastName: data.lastName || "", role: data.role === "admin" ? "admin" : "user", enabledMiniApps: Array.isArray(data.enabledMiniApps) ? data.enabledMiniApps : [], status: expired ? "expired" : data.status, expiresAt: iso(data.expiresAt), createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; }
export async function loadInvitation(token) { if (typeof token !== "string" || token.length < 30) throw new HttpsError("invalid-argument", "Invitation token is invalid."); const snap = await invitations().where("tokenHash", "==", tokenHash(token)).limit(1).get(); if (snap.empty) throw new HttpsError("not-found", "Invitation not found."); const doc = snap.docs[0], data = doc.data(); if (data.schemaVersion !== 1 || data.status !== "pending" || !data.expiresAt?.toMillis || data.expiresAt.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Invitation is expired or unavailable."); return { doc, data }; }
