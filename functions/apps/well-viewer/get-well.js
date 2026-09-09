import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { publicWell, ownedWell, objectPath, validId } from "./library.js";
export const getSavedWell = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return ({ well: publicWell((await ownedWell(user.uid, request.data?.wellId)).snap), path: objectPath(user.uid, validId(request.data?.wellId)) }); });
