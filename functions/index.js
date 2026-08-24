import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
initializeApp();
const db = getFirestore(),
  enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true",
  base = {
    region: "us-central1",
    maxInstances: 2,
    cors: true,
    enforceAppCheck,
  };
function authenticated(request) {
  if (!request.auth?.uid)
    throw new HttpsError(
      "unauthenticated",
      "Start a FluidLab session to continue.",
    );
  return {
    uid: request.auth.uid,
    email: request.auth.token?.email
      ? String(request.auth.token.email).trim().toLowerCase()
      : null,
    anonymous: !request.auth.token?.email,
  };
}
function cleanName(value, label, max = 100) {
  const name =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > max)
    throw new HttpsError("invalid-argument", `Enter a valid ${label}.`);
  return name;
}
async function authorized(request) {
  const account = authenticated(request);
  if (account.anonymous)
    throw new HttpsError(
      "unauthenticated",
      "Create an account or sign in to save projects.",
    );
  const snapshot = await db.collection("fluidlabUsers").doc(account.uid).get();
  if (!snapshot.exists)
    throw new HttpsError(
      "failed-precondition",
      "Finish your FluidLab profile before continuing.",
    );
  if (snapshot.data()?.status !== "active")
    throw new HttpsError(
      "permission-denied",
      "This FluidLab account is disabled.",
    );
  return { ...account, profile: snapshot.data() };
}
const publicProfile = (data) => ({
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  status: data.status,
});
export const registerFluidLabUser = onCall(base, async (request) => {
  const account = authenticated(request),
    firstName = cleanName(request.data?.firstName, "first name", 60),
    lastName = cleanName(request.data?.lastName, "last name", 60),
    reference = db.collection("fluidlabUsers").doc(account.uid);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference),
      prior = existing.data();
    transaction.set(
      reference,
      {
        firstName,
        lastName,
        email: account.email,
        status: prior?.status === "disabled" ? "disabled" : "active",
        createdAt: prior?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  return { profile: publicProfile((await reference.get()).data()) };
});
export const getFluidLabProfile = onCall(base, async (request) => {
  const account = await authorized(request);
  await db
    .collection("fluidlabUsers")
    .doc(account.uid)
    .update({
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { profile: publicProfile(account.profile) };
});
const projectCollection = (uid) =>
    db.collection("fluidlabUsers").doc(uid).collection("projects"),
  timestamp = (value) => (value?.toDate ? value.toDate().toISOString() : null);
function validDesign(value) {
  if (
    !value ||
    value.version !== 4 ||
    typeof value.name !== "string" ||
    !["metric", "imperial"].includes(value.unitSystem) ||
    !Array.isArray(value.sections) ||
    value.sections.length < 1 ||
    value.sections.length > 50 ||
    !value.trajectory ||
    !value.display ||
    Object.hasOwn(value, "surveyStations") ||
    Object.hasOwn(value, "holeSections")
  )
    throw new HttpsError(
      "invalid-argument",
      "The sequential KOP/EOC project is invalid or unsupported.",
    );
  const ids = new Set();
  let priorMd = 0;
  for (const section of value.sections) {
    if (
      !section ||
      typeof section.id !== "string" ||
      ids.has(section.id) ||
      typeof section.name !== "string" ||
      section.name.length > 80 ||
      !Number.isFinite(section.endMdM) ||
      section.endMdM <= priorMd ||
      !Number.isFinite(section.diameterMm) ||
      section.diameterMm <= 0 ||
      typeof section.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(section.color) ||
      typeof section.visible !== "boolean"
    )
      throw new HttpsError(
        "invalid-argument",
        "A sequential well section is malformed.",
      );
    ids.add(section.id);
    priorMd = section.endMdM;
  }
  const trajectory = value.trajectory;
  if (typeof trajectory.enabled !== "boolean")
    throw new HttpsError("invalid-argument", "The trajectory is malformed.");
  if (
    trajectory.enabled &&
    (!Number.isFinite(trajectory.kopMdM) ||
      trajectory.kopMdM < 0 ||
      !Number.isFinite(trajectory.endCurveMdM) ||
      trajectory.endCurveMdM <= trajectory.kopMdM ||
      trajectory.endCurveMdM > priorMd)
  )
    throw new HttpsError(
      "invalid-argument",
      "KOP and End of Curve are invalid.",
    );
  if (
    !trajectory.enabled &&
    (trajectory.kopMdM !== null || trajectory.endCurveMdM !== null)
  )
    throw new HttpsError(
      "invalid-argument",
      "A vertical well cannot retain curve values.",
    );
  if (Buffer.byteLength(JSON.stringify(value)) > 128 * 1024)
    throw new HttpsError(
      "invalid-argument",
      "The FluidLab design is too large.",
    );
  return JSON.parse(JSON.stringify(value));
}
function publicProject(snapshot, includeDesign = true) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    ...(includeDesign ? { design: data.currentDesign } : {}),
    revision: data.revision,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
}
async function ownedProject(account, id) {
  if (typeof id !== "string" || !id)
    throw new HttpsError("invalid-argument", "Choose a project.");
  const ref = projectCollection(account.uid).doc(id),
    snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
  return { ref, snap };
}
export const listFluidLabProjects = onCall(base, async (request) => {
  const account = await authorized(request),
    snapshots = await projectCollection(account.uid)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();
  return { projects: snapshots.docs.map((doc) => publicProject(doc, false)) };
});
export const getFluidLabProject = onCall(base, async (request) => {
  const account = await authorized(request),
    { snap } = await ownedProject(account, request.data?.projectId);
  if (snap.data().schemaVersion !== 4)
    throw new HttpsError(
      "failed-precondition",
      "This project uses an unsupported schema.",
    );
  return { project: publicProject(snap) };
});
export const createFluidLabProject = onCall(base, async (request) => {
  const account = await authorized(request),
    design = validDesign(request.data?.design),
    ref = projectCollection(account.uid).doc(),
    now = FieldValue.serverTimestamp();
  await ref.set({
    owner: account.uid,
    name: cleanName(design.name, "project name"),
    currentDesign: design,
    schemaVersion: 4,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  return { project: publicProject(await ref.get()) };
});
export const updateFluidLabProject = onCall(base, async (request) => {
  const account = await authorized(request),
    design = validDesign(request.data?.design),
    { ref } = await ownedProject(account, request.data?.projectId),
    expected = Number(request.data?.baseRevision),
    mutationId = cleanName(request.data?.mutationId, "mutation ID");
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref),
      data = snap.data();
    if (data.lastMutationId === mutationId) return;
    if (data.schemaVersion !== 4)
      throw new HttpsError(
        "failed-precondition",
        "This project uses an unsupported schema.",
      );
    if (data.revision !== expected)
      throw new HttpsError(
        "aborted",
        "This project was changed in another session.",
      );
    transaction.update(ref, {
      name: cleanName(design.name, "project name"),
      currentDesign: design,
      revision: expected + 1,
      lastMutationId: mutationId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { project: publicProject(await ref.get()) };
});
export const deleteFluidLabProject = onCall(base, async (request) => {
  const account = await authorized(request),
    { ref } = await ownedProject(account, request.data?.projectId);
  await ref.delete();
  return {};
});
