import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { publicUser, requireUser } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { text } from "../../core/values.js";
export const updateCurrentUser = onCall(callable, async (request) => { const current = await requireUser(request), firstName = text(request.data?.firstName, "first name", 80), lastName = text(request.data?.lastName, "last name", 80); await current.ref.update({ firstName, lastName, updatedAt: FieldValue.serverTimestamp(), updatedBy: current.uid }); return { user: publicUser(current.uid, (await current.ref.get()).data()) }; });
