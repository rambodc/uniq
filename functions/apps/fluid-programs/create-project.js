import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { projectCollection, publicProject } from "../../core/projects.js";
import { text } from "../../core/values.js";
export const createFluidProgramsProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluid-programs"), name = text(request.data?.name, "project name"), collection = await projectCollection(user.uid, "fluid-programs"), ref = collection.doc(), now = FieldValue.serverTimestamp(); await ref.set({ schemaVersion: 1, owner: user.uid, name, currentData: { version: 1, messages: [] }, revision: 1, lastMutationId: null, createdAt: now, updatedAt: now }); return { project: publicProject(await ref.get(), "fluid-programs") }; });
