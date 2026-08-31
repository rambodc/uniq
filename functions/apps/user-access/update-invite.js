import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { normalizeMiniApps, requireAdmin } from "../../core/auth.js";
import { callable, MANAGED_MINI_APPS } from "../../core/config.js";
import { docId, email, role, text } from "../../core/values.js";
import { invitations, publicInvitation } from "./helpers.js";
export const adminUpdateInvite = onCall(callable, async (request) => { const admin = await requireAdmin(request), id = docId(request.data?.invitationId, "invitation"), ref = invitations().doc(id), snap = await ref.get(), state = snap.exists ? publicInvitation(id, snap.data()).status : null; if (!snap.exists || !["pending", "expired"].includes(state)) throw new HttpsError("failed-precondition", "This invitation cannot be edited."); const selectedRole = role(request.data?.role); await ref.update({ email: email(request.data?.email), firstName: text(request.data?.firstName, "first name", 80), lastName: text(request.data?.lastName, "last name", 80), role: selectedRole, enabledMiniApps: selectedRole === "admin" ? [...MANAGED_MINI_APPS] : normalizeMiniApps(request.data?.enabledMiniApps), updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }); return { invitation: publicInvitation(id, (await ref.get()).data()) }; });
