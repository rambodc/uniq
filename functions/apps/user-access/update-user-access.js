import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  normalizeMiniApps,
  publicUser,
  requireAdmin,
} from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db, auth } from "../../core/firebase.js";
import { docId, role, status } from "../../core/values.js";
export const adminUpdateUserAccess = onCall(callable, async (request) => {
  const admin = await requireAdmin(request),
    uid = docId(request.data?.uid),
    ref = db.doc(`users/${uid}`),
    nextRole = role(request.data?.role),
    nextStatus = status(request.data?.status);
  await db.runTransaction(async (tx) => {
    const [snap, actor, admins] = await Promise.all([
      tx.get(ref),
      tx.get(admin.ref),
      tx.get(
        db
          .collection("users")
          .where("role", "==", "admin")
          .where("status", "==", "active"),
      ),
    ]);
    if (actor.data()?.role !== "admin" || actor.data()?.status !== "active")
      throw new HttpsError(
        "permission-denied",
        "Administrator access was removed.",
      );
    if (!snap.exists) throw new HttpsError("not-found", "User not found.");
    if (
      snap.data().role === "admin" &&
      snap.data().status === "active" &&
      (nextRole !== "admin" || nextStatus !== "active") &&
      admins.size <= 1
    )
      throw new HttpsError(
        "failed-precondition",
        "Keep at least one active administrator.",
      );
    tx.update(ref, {
      role: nextRole,
      status: nextStatus,
      enabledMiniApps:
        nextRole === "employee"
          ? normalizeMiniApps(request.data?.enabledMiniApps)
          : [],
      ...(nextStatus === "disabled"
        ? { sessionsRevokedBefore: Math.floor(Date.now() / 1000) }
        : {}),
      updatedBy: admin.uid,
    });
  });
  if (nextStatus === "disabled") await auth.revokeRefreshTokens(uid);
  return { user: publicUser(uid, (await ref.get()).data()) };
});
