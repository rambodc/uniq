import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { ownedProject, publicProject } from "../../core/projects.js";
import { text } from "../../core/values.js";
import { validFluidLabData } from "./validation.js";
export const saveFluidLabProject = onCall(callable, async (request) => { const user = await requireMiniApp(request, "fluidlab"), name = text(request.data?.name, "project name"), mutationId = text(request.data?.mutationId, "mutation ID"), expected = Number(request.data?.baseRevision), { ref } = await ownedProject(user.uid, "fluidlab", request.data?.projectId); await db.runTransaction(async (transaction) => { const snap = await transaction.get(ref), stored = snap.data(), data = validFluidLabData(request.data?.data); if (stored.lastMutationId === mutationId) return; if (!Number.isInteger(expected) || stored.revision !== expected) throw new HttpsError("aborted", "This project changed in another session. Reload it before continuing."); transaction.update(ref, { name, currentData: { ...data, name }, revision: expected + 1, lastMutationId: mutationId, updatedAt: FieldValue.serverTimestamp() }); }); return { project: publicProject(await ref.get(), "fluidlab") }; });
