import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { ownedProject } from "../../core/projects.js";
export const deleteFluidLabProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluidlab"), { ref } = await ownedProject(user.uid, "fluidlab", request.data?.projectId); await db.recursiveDelete(ref); return {}; });
