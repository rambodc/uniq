import { onCall } from "firebase-functions/v2/https";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { listWells } from "./library.js";
export const listSavedWells = onCall(callable, async (request) => { const user = await requireMiniApp(request, "well-viewer"); return listWells(user.uid, request.data?.cursor); });
