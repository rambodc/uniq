import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import OpenAI, { toFile } from "openai";
import { DAILY_ANALYSIS_LIMIT, DAILY_REFINEMENT_LIMIT, GUEST_ANALYSIS_LIMIT, GUEST_REFINEMENT_LIMIT, quotaStatus, utcDay } from "./access.js";
import { extractionSchema, instructions, normalizeDraft } from "./extraction.js";

initializeApp();
const db = getFirestore();
const supported = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/csv", "text/tab-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";
const callableBase = { region: "us-central1", secrets: ["OPENAI_API_KEY"], maxInstances: 2, cors: true, enforceAppCheck };
const profileBase = { region: "us-central1", maxInstances: 2, cors: true, enforceAppCheck };

function authenticated(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Start a FluidLab session to continue.");
  if (!request.app) console.warn("FluidLab callable received without an App Check token", { uid: request.auth.uid });
  return { uid: request.auth.uid, email: request.auth.token?.email ? String(request.auth.token.email).trim().toLowerCase() : null, anonymous: !request.auth.token?.email };
}
function cleanName(value, label) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 60) throw new HttpsError("invalid-argument", `Enter a valid ${label}.`);
  return name;
}
async function authorized(request) {
  const account = authenticated(request);
  if (account.anonymous) throw new HttpsError("unauthenticated", "Create an account or sign in to save projects.");
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
async function reserveGuestQuota(uid, kind) {
  const reference = db.collection("fluidlabGuestUsage").doc(uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference), current = snapshot.data() || {};
    const field = kind === "analysis" ? "analyses" : "refinements";
    const limit = kind === "analysis" ? GUEST_ANALYSIS_LIMIT : GUEST_REFINEMENT_LIMIT;
    if (Number(current[field] || 0) >= limit) throw new HttpsError("resource-exhausted", `The guest ${kind} trial has been used. Sign in to continue.`);
    const next = { ...current, [field]: Number(current[field] || 0) + 1, updatedAt: FieldValue.serverTimestamp() };
    transaction.set(reference, next, { merge: true });
    return { analysesRemaining: Math.max(0, GUEST_ANALYSIS_LIMIT - Number(next.analyses || 0)), refinementsRemaining: Math.max(0, GUEST_REFINEMENT_LIMIT - Number(next.refinements || 0)), resetsAt: "" };
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
  const account = authenticated(request);
  if (!account.anonymous) await authorized(request);
  const file = request.data?.file;
  if (!file?.name || !file?.mimeType || !file?.base64) throw new HttpsError("invalid-argument", "Choose one supported well-program file.");
  if (!supported.has(file.mimeType)) throw new HttpsError("invalid-argument", "This file type is not supported.");
  const bytes = Buffer.from(file.base64, "base64");
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new HttpsError("invalid-argument", "Files must be between 1 byte and 15 MB.");
  const quota = account.anonymous ? await reserveGuestQuota(account.uid, "analysis") : await reserveQuota(account.uid, "analysis");
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
  const account = authenticated(request);
  if (!account.anonymous) await authorized(request);
  const { draft, message } = request.data ?? {};
  if (!draft || typeof message !== "string" || !message.trim() || message.length > 2000) throw new HttpsError("invalid-argument", "Enter a short correction or answer.");
  const quota = account.anonymous ? await reserveGuestQuota(account.uid, "refinement") : await reserveQuota(account.uid, "refinement");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({ model: "gpt-5.5", store: false, reasoning: { effort: "low" }, max_output_tokens: 3500, instructions: `${instructions}\nUpdate the supplied draft only from the user's explicit correction. Retain prior source citations for unchanged values and mark user-provided changes with source location "User confirmation".`, input: `CURRENT DRAFT:\n${JSON.stringify(draft)}\n\nUSER MESSAGE:\n${message}`, text: { format: { type: "json_schema", name: "well_refinement", strict: true, schema: extractionSchema } } });
    return { ...normalizeDraft(JSON.parse(response.output_text)), quota };
  } catch (error) {
    console.error("Well refinement failed", error instanceof Error ? error.message : error);
    throw new HttpsError("internal", "The correction could not be applied. Please edit the fields manually.");
  }
});

const projectCollection = (uid) => db.collection("fluidlabUsers").doc(uid).collection("projects");
const timestamp = (value) => value?.toDate ? value.toDate().toISOString() : null;
function cleanText(value, label, max = 100) { const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; if (!text || text.length > max) throw new HttpsError("invalid-argument", `Enter a valid ${label}.`); return text; }
function validDesign(value) {
  if (!value || value.version !== 1 || typeof value.name !== "string" || !["vertical","directional","horizontal","multilateral"].includes(value.type) || !["metric","imperial"].includes(value.units) || !value.main || !value.display || !Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 3 || !Array.isArray(value.branches) || value.branches.length > 3) throw new HttpsError("invalid-argument", "The FluidLab design is invalid or unsupported.");
  const numbers=["surfaceNorthing","surfaceEasting","verticalSection","kickoffMd","buildRate","targetInclination","azimuth","holdLength","lateralLength"];
  if(numbers.some(key=>!Number.isFinite(value.main[key]))||value.sections.some(section=>typeof section.id!=="string"||typeof section.name!=="string"||!Number.isFinite(section.diameterMm)||!Number.isFinite(section.startMd)||!Number.isFinite(section.endMd)||!/^#[0-9a-f]{6}$/i.test(section.color)||typeof section.visible!=="boolean")||value.branches.some(branch=>typeof branch.id!=="string"||typeof branch.name!=="string"||![branch.tieInMd,branch.buildRate,branch.targetInclination,branch.azimuth,branch.lateralLength].every(Number.isFinite)||!/^#[0-9a-f]{6}$/i.test(branch.color)||typeof branch.visible!=="boolean"))throw new HttpsError("invalid-argument","The FluidLab design contains invalid values.");
  const encoded = Buffer.byteLength(JSON.stringify(value)); if (encoded > 1024 * 1024) throw new HttpsError("invalid-argument", "The FluidLab design is too large.");
  return JSON.parse(JSON.stringify(value));
}
function publicProject(snapshot, includeDesign = true) { const data=snapshot.data(); return { id:snapshot.id,name:data.name, ...(includeDesign?{design:data.currentDesign}:{}), revision:data.revision,archivedAt:timestamp(data.archivedAt),createdAt:timestamp(data.createdAt),updatedAt:timestamp(data.updatedAt) }; }
async function ownedProject(account, id) { if(typeof id!=="string"||!id) throw new HttpsError("invalid-argument","Choose a project."); const ref=projectCollection(account.uid).doc(id), snap=await ref.get(); if(!snap.exists) throw new HttpsError("not-found","Project not found."); return {ref,snap}; }

export const listFluidLabProjects = onCall(profileBase, async (request) => { const account=await authorized(request), archived=Boolean(request.data?.archived); const snapshots=await projectCollection(account.uid).orderBy("updatedAt","desc").limit(200).get(); return {projects:snapshots.docs.filter((doc)=>Boolean(doc.data().archivedAt)===archived).map((doc)=>publicProject(doc,false))}; });
export const getFluidLabProject = onCall(profileBase, async (request) => { const account=await authorized(request), {ref,snap}=await ownedProject(account,request.data?.projectId); const versions=await ref.collection("versions").orderBy("createdAt","desc").limit(100).get(); return {project:publicProject(snap),versions:versions.docs.map((doc)=>({id:doc.id,name:doc.data().name,note:doc.data().note||"",design:doc.data().design,createdAt:timestamp(doc.data().createdAt)}))}; });
export const createFluidLabProject = onCall(profileBase, async (request) => { const account=await authorized(request), design=validDesign(request.data?.design), ref=projectCollection(account.uid).doc(), now=FieldValue.serverTimestamp(); await ref.set({owner:account.uid,name:cleanText(design.name,"project name"),currentDesign:design,schemaVersion:1,revision:1,archivedAt:null,createdAt:now,updatedAt:now}); return {project:publicProject(await ref.get())}; });
export const updateFluidLabProject = onCall(profileBase, async (request) => { const account=await authorized(request), design=validDesign(request.data?.design), {ref}=await ownedProject(account,request.data?.projectId), expected=Number(request.data?.revision); await db.runTransaction(async(tx)=>{const snap=await tx.get(ref);if(snap.data().revision!==expected)throw new HttpsError("aborted","This project was changed in another session.");tx.update(ref,{name:cleanText(design.name,"project name"),currentDesign:design,revision:expected+1,updatedAt:FieldValue.serverTimestamp()});}); return {project:publicProject(await ref.get())}; });
export const manageFluidLabProject = onCall(profileBase, async (request) => { const account=await authorized(request), action=request.data?.action, {ref,snap}=await ownedProject(account,request.data?.projectId); if(action==="duplicate"){const design=JSON.parse(JSON.stringify(snap.data().currentDesign));design.name=`${design.name} copy`;const copy=projectCollection(account.uid).doc(),now=FieldValue.serverTimestamp();await copy.set({owner:account.uid,name:design.name,currentDesign:design,schemaVersion:1,revision:1,archivedAt:null,createdAt:now,updatedAt:now});return {project:publicProject(await copy.get())};} if(action==="archive"||action==="restore"){await ref.update({archivedAt:action==="archive"?FieldValue.serverTimestamp():null,updatedAt:FieldValue.serverTimestamp()});return {project:publicProject(await ref.get())};} if(action==="delete"){const versions=await ref.collection("versions").get(),writer=db.bulkWriter();versions.docs.forEach(doc=>writer.delete(doc.ref));writer.delete(ref);await writer.close();return {};} throw new HttpsError("invalid-argument","Unsupported project action."); });
export const createFluidLabVersion = onCall(profileBase, async (request) => { const account=await authorized(request), {ref,snap}=await ownedProject(account,request.data?.projectId), version=ref.collection("versions").doc(), now=FieldValue.serverTimestamp(), name=cleanText(request.data?.name,"version name",80), note=typeof request.data?.note==="string"?request.data.note.trim().slice(0,500):""; await version.set({name,note,design:snap.data().currentDesign,creator:account.uid,createdAt:now});const saved=await version.get();return {version:{id:saved.id,name,note,design:saved.data().design,createdAt:timestamp(saved.data().createdAt)}}; });
export const manageFluidLabVersion = onCall(profileBase, async (request) => { const account=await authorized(request), {ref}=await ownedProject(account,request.data?.projectId), version=ref.collection("versions").doc(String(request.data?.versionId||"")), snap=await version.get();if(!snap.exists)throw new HttpsError("not-found","Version not found.");if(request.data?.action==="delete"){await version.delete();return {};}if(request.data?.action==="restore"){const expected=Number(request.data?.revision);await db.runTransaction(async tx=>{const project=await tx.get(ref);if(project.data().revision!==expected)throw new HttpsError("aborted","This project was changed in another session.");tx.update(ref,{name:snap.data().design.name,currentDesign:snap.data().design,revision:expected+1,updatedAt:FieldValue.serverTimestamp()});});return {project:publicProject(await ref.get())};}throw new HttpsError("invalid-argument","Unsupported version action."); });
