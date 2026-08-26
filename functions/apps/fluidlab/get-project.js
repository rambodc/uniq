import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { ownedProject, publicProject } from "../../core/projects.js";
export const getFluidLabProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluidlab"), { snap } = await ownedProject(user.uid, "fluidlab", request.data?.projectId); return { project: publicProject(snap, "fluidlab") }; });
