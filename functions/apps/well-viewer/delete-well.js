import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { removeWell } from "./library.js";
export const deleteSavedWell = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return removeWell(user.uid, request.data?.wellId); });
