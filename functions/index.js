import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import OpenAI, { toFile } from "openai";
import { DAILY_ANALYSIS_LIMIT, DAILY_REFINEMENT_LIMIT, quotaStatus, utcDay } from "./access.js";
import { extractionSchema, instructions, normalizeDraft } from "./extraction.js";

initializeApp();
const db = getFirestore();
const supported = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv", "text/tab-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const callableBase = { region: "us-central1", secrets: ["OPENAI_API_KEY"], maxInstances: 2, cors: true, enforceAppCheck: false };
const profileBase = { region: "us-central1", maxInstances: 2, cors: true, enforceAppCheck: false };

function authenticated(request) {
  if (!request.auth?.uid || !request.auth.token?.email) throw new HttpsError("unauthenticated", "Sign in to use FluidLab.");
  if (!request.app) console.warn("FluidLab callable received without an App Check token", { uid: request.auth.uid });
  return { uid: request.auth.uid, email: String(request.auth.token.email).trim().toLowerCase() };
}
function cleanName(value, label) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 60) throw new HttpsError("invalid-argument", `Enter a valid ${label}.`);
  return name;
}
async function authorized(request) {
  const account = authenticated(request);
  const snapshot = await db.collection("fluidlabUsers").doc(account.uid).get();
  if (!snapshot.exists) throw new HttpsError("failed-precondition", "Finish your FluidLab profile before continuing.");
  const profile = snapshot.data();
  if (profile?.status !== "active") throw new HttpsError("permission-denied", "This FluidLab account is disabled.");
  return { ...account, profile };
}
function publicProfile(data) { return { firstName: data.firstName, lastName: data.lastName, email: data.email, status: data.status }; }
async function readQuota(uid, now = new Date()) {
  const snapshot = await db.collection("fluidlabUsage").doc(uid).collection("days").doc(utcDay(now)).get();
  return quotaStatus(snapshot.data(), now);
}
async function reserveQuota(uid, kind, now = new Date()) {
  const reference = db.collection("fluidlabUsage").doc(uid).collection("days").doc(utcDay(now));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() || {};
    const field = kind === "analysis" ? "analyses" : "refinements";
    const limit = kind === "analysis" ? DAILY_ANALYSIS_LIMIT : DAILY_REFINEMENT_LIMIT;
    if (Number(current[field] || 0) >= limit) throw new HttpsError("resource-exhausted", `The daily ${kind} limit has been reached.`);
    const next = { ...current, [field]: Number(current[field] || 0) + 1, updatedAt: FieldValue.serverTimestamp() };
    transaction.set(reference, next, { merge: true });
    return quotaStatus(next, now);
  });
}

export const registerFluidLabUser = onCall(profileBase, async (request) => {
  const account = authenticated(request);
  const firstName = cleanName(request.data?.firstName, "first name");
  const lastName = cleanName(request.data?.lastName, "last name");
  const reference = db.collection("fluidlabUsers").doc(account.uid);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    const prior = existing.data();
    transaction.set(reference, { firstName, lastName, email: account.email, status: prior?.status === "disabled" ? "disabled" : "active", createdAt: prior?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastLoginAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  const snapshot = await reference.get();
  return { profile: publicProfile(snapshot.data()), quota: await readQuota(account.uid) };
});

export const getFluidLabProfile = onCall(profileBase, async (request) => {
  const account = await authorized(request);
  await db.collection("fluidlabUsers").doc(account.uid).update({ lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { profile: publicProfile(account.profile), quota: await readQuota(account.uid) };
});

export const analyzeWell = onCall({ ...callableBase, timeoutSeconds: 120, memory: "1GiB" }, async (request) => {
  const account = await authorized(request);
  const file = request.data?.file;
  if (!file?.name || !file?.mimeType || !file?.base64) throw new HttpsError("invalid-argument", "Choose one supported well-program file.");
  if (!supported.has(file.mimeType)) throw new HttpsError("invalid-argument", "This file type is not supported.");
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new HttpsError("invalid-argument", "Files must be between 1 byte and 15 MB.");
  const quota = await reserveQuota(account.uid, "analysis");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let uploaded;
  try {
    uploaded = await client.files.create({ file: await toFile(bytes, file.name, { type: file.mimeType }), purpose: "user_data" });
    const response = await client.responses.create({ model: "gpt-5.5", store: false, reasoning: { effort: "medium" }, max_output_tokens: 5000, instructions, input: [{ role: "user", content: [{ type: "input_text", text: `Extract a supported well draft from ${file.name}. Return missing and conflicting values explicitly.` }, { type: "input_file", file_id: uploaded.id }] }], text: { format: { type: "json_schema", name: "well_extraction", strict: true, schema: extractionSchema } } });
    return { ...normalizeDraft(JSON.parse(response.output_text)), quota };
  } catch (error) {
    console.error("Well extraction failed", error instanceof Error ? error.message : error);
    throw new HttpsError("internal", "The document could not be analyzed. Please try again or enter the well manually.");
  } finally { if (uploaded?.id) await client.files.delete(uploaded.id).catch((error) => console.error("Temporary file cleanup failed", error)); }
});

export const refineWell = onCall({ ...callableBase, timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
  const account = await authorized(request);
  const { draft, message } = request.data ?? {};
  if (!draft || typeof message !== "string" || !message.trim() || message.length > 2000) throw new HttpsError("invalid-argument", "Enter a short correction or answer.");
  const quota = await reserveQuota(account.uid, "refinement");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({ model: "gpt-5.5", store: false, reasoning: { effort: "low" }, max_output_tokens: 3500, instructions: `${instructions}\nUpdate the supplied draft only from the user's explicit correction. Retain prior source citations for unchanged values and mark user-provided changes with source location "User confirmation".`, input: `CURRENT DRAFT:\n${JSON.stringify(draft)}\n\nUSER MESSAGE:\n${message}`, text: { format: { type: "json_schema", name: "well_refinement", strict: true, schema: extractionSchema } } });
    return { ...normalizeDraft(JSON.parse(response.output_text)), quota };
  } catch (error) {
    console.error("Well refinement failed", error instanceof Error ? error.message : error);
    throw new HttpsError("internal", "The correction could not be applied. Please edit the fields manually.");
  }
});
