import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { projectCollection, publicProject } from "../../core/projects.js";
import { text } from "../../core/values.js";
import { validFluidLabData } from "./validation.js";
export const createFluidLabProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluidlab"), name = text(request.data?.name, "project name"), data = validFluidLabData(request.data?.data), collection = await projectCollection(user.uid, "fluidlab"), ref = collection.doc(), now = FieldValue.serverTimestamp(); await ref.set({ schemaVersion: 1, owner: user.uid, name, currentData: { ...data, name }, revision: 1, lastMutationId: null, createdAt: now, updatedAt: now }); return { project: publicProject(await ref.get(), "fluidlab") }; });
