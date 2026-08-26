import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { projectCollection, publicProject } from "../../core/projects.js";
export const listFluidProgramsProjects = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluid-programs"), collection = await projectCollection(user.uid, "fluid-programs"), snap = await collection.orderBy("updatedAt", "desc").limit(200).get(); return { projects: snap.docs.map((doc) => publicProject(doc, "fluid-programs", false)) }; });
