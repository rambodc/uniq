import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { ownedProject, publicProject } from "../../core/projects.js";
import { usageRef } from "./helpers.js";
export const getFluidProgramsProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluid-programs"), { snap } = await ownedProject(user.uid, "fluid-programs", request.data?.projectId), day = new Date().toISOString().slice(0, 10), usage = await usageRef(user.uid, day).get(); return { project: publicProject(snap, "fluid-programs"), remaining: Math.max(0, 50 - (usage.data()?.count || 0)) }; });
