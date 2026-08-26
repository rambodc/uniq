import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { docId } from "../../core/values.js";
import { invitations } from "./helpers.js";
export const adminCancelInvite = onCall(callable, async (request) => { const admin = await requireAdmin(request), ref = invitations().doc(docId(request.data?.invitationId, "invitation")), snap = await ref.get(); if (!snap.exists || snap.data()?.status === "accepted") throw new HttpsError("failed-precondition", "This invitation cannot be cancelled."); await ref.update({ status: "cancelled", cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }); return {}; });
