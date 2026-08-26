import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requireMiniApp } from "../../core/auth.js";
import { callable } from "../../core/config.js";
import { db } from "../../core/firebase.js";
import { text as requiredText } from "../../core/values.js";
import { answerFluidPrograms } from "../../services/openai.js";
import { recoverStaleMutations, usageRef } from "./helpers.js";
import { validSessionMessages } from "./validation.js";

export const sendFluidProgramsMessage = onCall({ ...callable, secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 }, async (request) => {
  const user = await requireMiniApp(request, "fluid-programs"), messageText = requiredText(request.data?.text, "message", 4000), mutationId = requiredText(request.data?.mutationId, "mutation ID"), priorMessages = validSessionMessages(request.data?.messages), day = new Date().toISOString().slice(0, 10), dailyRef = usageRef(user.uid, day);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(dailyRef), data = snap.data() || {}, completed = Array.isArray(data.completedMutationIds) ? data.completedMutationIds : [], recovered = recoverStaleMutations(data.pendingMutations, data.count), pending = recovered.pending;
    if (completed.includes(mutationId)) throw new HttpsError("already-exists", "This message was already answered.");
    const count = recovered.count;
    if (pending[mutationId]) throw new HttpsError("resource-exhausted", "This message is still being answered.");
    if (count >= 50) throw new HttpsError("resource-exhausted", "Your daily Fluid Programs limit has been reached.");
    pending[mutationId] = Timestamp.now();
    transaction.set(dailyRef, { schemaVersion: 1, date: day, count: count + 1, pendingMutations: pending, completedMutationIds: completed.slice(-49), createdAt: data.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  try {
    const answer = await answerFluidPrograms(priorMessages, messageText);
    const remaining = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(dailyRef), data = snap.data() || {}, pending = { ...(data.pendingMutations || {}) }, completed = Array.isArray(data.completedMutationIds) ? data.completedMutationIds : [];
      if (!pending[mutationId]) throw new HttpsError("aborted", "This request reservation expired. Try again.");
      delete pending[mutationId];
      transaction.update(dailyRef, { pendingMutations: pending, completedMutationIds: [...completed.filter((id) => id !== mutationId), mutationId].slice(-50), updatedAt: FieldValue.serverTimestamp() });
      return Math.max(0, 50 - (data.count || 0));
    });
    return { answer, remaining };
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(dailyRef), data = snap.data() || {}, pending = { ...(data.pendingMutations || {}) };
      if (!pending[mutationId]) return;
      delete pending[mutationId];
      transaction.update(dailyRef, { count: Math.max(0, (data.count || 1) - 1), pendingMutations: pending, updatedAt: FieldValue.serverTimestamp() });
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "Fluid Programs could not answer. Try again.");
  }
});
