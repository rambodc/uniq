import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { requireUser } from "../../core/auth.js";
import { callable } from "../../core/config.js";
export const getCurrentUser = onCall(callable, async (request) => { const current = await requireUser(request); await current.ref.update({ lastLoginAt: FieldValue.serverTimestamp() }); return { user: current.user }; });
