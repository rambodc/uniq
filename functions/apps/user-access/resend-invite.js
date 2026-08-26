import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { docId } from "../../core/values.js";
import { EMAIL_SECRETS, sendInvitationEmail } from "../../services/email.js";
import { INVITE_TTL_MS, invitations, invitationToken, inviteUrl, publicInvitation, tokenHash } from "./helpers.js";
export const adminResendInvite = onCall({ ...callable, secrets: EMAIL_SECRETS }, async (request) => { const admin = await requireAdmin(request), id = docId(request.data?.invitationId, "invitation"), ref = invitations().doc(id), snap = await ref.get(); if (!snap.exists || !["pending", "expired"].includes(publicInvitation(id, snap.data()).status)) throw new HttpsError("failed-precondition", "This invitation cannot be resent."); const token = invitationToken(), patch = { status: "pending", tokenHash: tokenHash(token), expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_MS), resentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }; await ref.update(patch); try { const data = snap.data(); await sendInvitationEmail({ to: data.email, name: data.firstName, inviteUrl: inviteUrl(token) }); } catch { throw new HttpsError("unavailable", "The invitation email could not be sent."); } return { invitation: publicInvitation(id, (await ref.get()).data()) }; });
