import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { normalizeMiniApps, publicUser, requireAdmin } from "../../core/auth.js";
import { callable, MANAGED_MINI_APPS } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { docId, role, status } from "../../core/values.js";
export const adminUpdateUserAccess = onCall(callable, async (request) => { const admin = await requireAdmin(request), uid = docId(request.data?.uid, "user"), ref = db.collection("users").doc(uid), snap = await ref.get(); if (!snap.exists) throw new HttpsError("not-found", "User not found."); const selectedRole = role(request.data?.role), selectedStatus = status(request.data?.status); if (uid === admin.uid && (selectedRole !== "admin" || selectedStatus !== "active")) throw new HttpsError("failed-precondition", "You cannot remove your own active administrator access."); await ref.update({ role: selectedRole, status: selectedStatus, enabledMiniApps: selectedRole === "admin" ? [...MANAGED_MINI_APPS] : normalizeMiniApps(request.data?.enabledMiniApps), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }); return { user: publicUser(uid, (await ref.get()).data()) }; });
