import { FieldValue, FieldPath, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db, storage } from "../../core/firebase.js";
import { docId, text, iso } from "../../core/values.js";

export const MAX_ZIP_BYTES = 1_000_000_000;
export const wells = (uid) => db.collection(`users/${uid}/miniApps/well-viewer/wells`);
export const objectPath = (uid, id) => `users/${uid}/well-viewer/${id}/original.zip`;
export function validId(value) { const id = docId(value, "well"); if (!/^[\w-]+$/.test(id)) throw new HttpsError("invalid-argument", "Choose a valid well."); return id; }
export function validUpload(data) {
  const name = text(data?.name, "well name", 120), originalName = text(data?.originalName, "ZIP filename", 240);
  if (!/\.zip$/i.test(originalName) || /[/\\]/.test(originalName) || !Number.isSafeInteger(data?.sizeBytes) || data.sizeBytes < 1 || data.sizeBytes > MAX_ZIP_BYTES || !["detailed", "balanced", "compact"].includes(data?.detail)) throw new HttpsError("invalid-argument", "Choose a well ZIP up to 1 GB and a valid detail level.");
  return { name, originalName, sizeBytes: data.sizeBytes, detail: data.detail };
}
export const publicWell = (snap) => { const d = snap.data(); return { id: snap.id, name: d.name, originalName: d.originalName, sizeBytes: d.sizeBytes, detail: d.detail, createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt), generation: d.generation || null }; };
export async function ownedWell(uid, id, ready = true) {
  const ref = wells(uid).doc(validId(id)), snap = await ref.get();
  if (!snap.exists || snap.data().owner !== uid) throw new HttpsError("not-found", "Well not found.");
  if (ready && snap.data().status !== "ready") throw new HttpsError("failed-precondition", "This well is not ready to open.");
  return { ref, snap };
}
export async function beginUpload(uid, data) {
  const values = validUpload(data), id = validId(data.uploadId), ref = wells(uid).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const old = snap.data();
      if (old.owner !== uid || old.status !== "uploading" || old.cleanupAt.toMillis() <= Date.now() || Object.keys(values).some((key) => old[key] !== values[key])) throw new HttpsError("already-exists", "This upload cannot be reused. Start a new upload.");
      return;
    }
    tx.create(ref, { schemaVersion: 1, owner: uid, ...values, status: "uploading", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), cleanupAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
  });
  return { wellId: id, path: objectPath(uid, id) };
}
export async function completeUpload(uid, id) {
  const { ref, snap } = await ownedWell(uid, id, false);
  if (snap.data().status === "ready") return { well: publicWell(snap) };
  if (snap.data().status !== "uploading" || snap.data().cleanupAt.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "This upload has expired.");
  const file = storage.bucket().file(objectPath(uid, snap.id));
  let meta;
  try { [meta] = await file.getMetadata(); } catch (error) { if (error.code === 404) throw new HttpsError("failed-precondition", "Upload the ZIP before finishing."); throw error; }
  if (Number(meta.size) !== snap.data().sizeBytes || meta.contentType !== "application/zip" || meta.metadata?.owner !== uid || meta.metadata?.wellId !== snap.id) throw new HttpsError("failed-precondition", "Uploaded file does not match this well.");
  // Never persist bearer download tokens. Reads must go through Storage Rules.
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } }, { ifGenerationMatch: meta.generation });
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(ref);
    if (!latest.exists || !["uploading", "ready"].includes(latest.data().status)) throw new HttpsError("failed-precondition", "This upload was removed.");
    if (latest.data().status === "ready") return;
    tx.update(ref, { status: "ready", generation: meta.generation, sizeBytes: Number(meta.size), updatedAt: FieldValue.serverTimestamp(), cleanupAt: FieldValue.delete() });
  });
  return { well: publicWell(await ref.get()) };
}
export async function listWells(uid, cursor) {
  let query = wells(uid).where("status", "==", "ready").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor != null) {
    if (!Number.isSafeInteger(cursor.seconds) || !Number.isInteger(cursor.nanoseconds) || cursor.nanoseconds < 0 || cursor.nanoseconds >= 1e9) throw new HttpsError("invalid-argument", "Invalid library cursor.");
    query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), validId(cursor.id));
  }
  const result = await query.limit(51).get(), page = result.docs.slice(0, 50), last = page.at(-1), time = last?.data().createdAt;
  return { wells: page.map(publicWell), cursor: result.size > 50 ? { id: last.id, seconds: time.seconds, nanoseconds: time.nanoseconds } : null };
}
export async function renameWell(uid, id, name) {
  const { ref } = await ownedWell(uid, id);
  await db.runTransaction(async (tx) => { const snap = await tx.get(ref); if (!snap.exists || snap.data().status !== "ready") throw new HttpsError("not-found", "Well not found."); tx.update(ref, { name: text(name, "well name", 120), updatedAt: FieldValue.serverTimestamp() }); });
  return { well: publicWell(await ref.get()) };
}
export async function removeWell(uid, id) {
  const ref = wells(uid).doc(validId(id));
  const exists = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) return false;
    if (snap.data().owner !== uid) throw new HttpsError("not-found", "Well not found.");
    tx.update(ref, { status: "deleting", cleanupAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() }); return true;
  });
  if (!exists) return {};
  await storage.bucket().file(objectPath(uid, id)).delete({ ignoreNotFound: true });
  await ref.delete(); return {};
}
export async function cleanupWells() {
  const expired = await db.collectionGroup("wells").where("cleanupAt", "<=", Timestamp.now()).limit(200).get();
  for (const snap of expired.docs) {
    if (!/^users\/[^/]+\/miniApps\/well-viewer\/wells\/[^/]+$/.test(snap.ref.path)) continue;
    const uid = snap.ref.path.split("/")[1];
    // Recheck inside a transaction so a completed upload cannot be removed.
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(snap.ref), d = current.data();
      if (!d || d.owner !== uid || !["uploading", "deleting"].includes(d.status) || d.cleanupAt.toMillis() > Date.now()) return false;
      tx.update(snap.ref, { status: "deleting", cleanupAt: Timestamp.now() }); return true;
    });
    if (claimed) { try { await removeWell(uid, snap.id); } catch (error) { console.error("Well cleanup failed", snap.ref.path, error.message); } }
  }
}
