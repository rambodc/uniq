import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { beginUpload } from "./library.js";
export const beginWellUpload = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return beginUpload(user.uid, request.data); });
