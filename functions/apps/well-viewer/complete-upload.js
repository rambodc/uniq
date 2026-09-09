import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { completeUpload } from "./library.js";
export const completeWellUpload = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return completeUpload(user.uid, request.data?.wellId); });
