import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { renameWell } from "./library.js";
export const renameSavedWell = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return renameWell(user.uid, request.data?.wellId, request.data?.name); });
