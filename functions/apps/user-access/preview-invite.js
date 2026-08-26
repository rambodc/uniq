import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { loadInvitation, publicInvitation } from "./helpers.js";
export const previewInvite = onCall(callable, async (request) => { const { doc, data } = await loadInvitation(request.data?.token); return { invitation: publicInvitation(doc.id, data) }; });
