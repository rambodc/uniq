import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { ownedProject } from "../../core/projects.js";
export const deleteFluidProgramsProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluid-programs"), { ref } = await ownedProject(user.uid, "fluid-programs", request.data?.projectId); await db.recursiveDelete(ref); return {}; });
