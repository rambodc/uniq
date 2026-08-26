import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { projectCollection, publicProject } from "../../core/projects.js";
export const listFluidLabProjects = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluidlab"), collection = await projectCollection(user.uid, "fluidlab"), snap = await collection.orderBy("updatedAt", "desc").limit(200).get(); return { projects: snap.docs.map((doc) => publicProject(doc, "fluidlab", false)) }; });
