import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db, storage } from "../../core/firebase.js";
import { callable } from "../../core/config.js";
import { requireMiniApp } from "../../core/auth.js";
import { validUpload, validId } from "./pason-validation.js";
const invoke = (handler) =>
  onCall(callable, async (r) => {
    const { uid } = await requireMiniApp(r, "fluidlab");
    return handler(uid, r.data || {});
  });
const wellRef = (id) => db.doc(`fluidWells/${validId(id)}`);
const attachmentPath = (wellId, id) =>
  `fluidlab/${wellId}/pason/${id}/original.zip`;
const available = (s) => {
  if (!s.exists || s.data().status === "deleting")
    throw new HttpsError("not-found", "Well not found.");
};
export const beginFluidPason = invoke(async (uid, d) => {
  const w = wellRef(d.wellId),
    id = validId(d.uploadId),
    r = w.collection("pasonUploads").doc(id),
    values = validUpload({ ...d, name: "Pason attachment" });
  await db.runTransaction(async (tx) => {
    const [well, old] = await Promise.all([tx.get(w), tx.get(r)]);
    available(well);
    if (old.exists) {
      if (old.data().owner !== uid || old.data().status !== "uploading")
        throw new HttpsError("failed-precondition", "Start a new ZIP upload.");
      return;
    }
    tx.create(r, {
      ...values,
      owner: uid,
      wellId: d.wellId,
      path: attachmentPath(d.wellId, id),
      status: "uploading",
      baseAttachment: well.data().pason?.id || null,
      createdAt: new Date().toISOString(),
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600000),
    });
  });
  return { id, path: attachmentPath(d.wellId, id) };
});
export const completeFluidPason = invoke(async (uid, d) => {
  const w = wellRef(d.wellId),
    r = w.collection("pasonUploads").doc(validId(d.uploadId)),
    old = await r.get();
  if (!old.exists || old.data().owner !== uid)
    throw new HttpsError("not-found", "Upload not found.");
  if (old.data().status === "ready") {
    const current = await w.get();
    available(current);
    if (current.data().pason?.id === r.id)
      return { attachment: current.data().pason };
    throw new HttpsError("aborted", "This ZIP has been replaced.");
  }
  if (
    old.data().status !== "uploading" ||
    old.data().expiresAt.toMillis() < Date.now()
  )
    throw new HttpsError("failed-precondition", "Upload expired or cancelled.");
  const file = storage.bucket().file(old.data().path),
    [meta] = await file.getMetadata();
  if (
    Number(meta.size) !== old.data().sizeBytes ||
    meta.contentType !== "application/zip" ||
    meta.metadata?.owner !== uid ||
    meta.metadata?.wellId !== d.wellId
  )
    throw new HttpsError(
      "failed-precondition",
      "ZIP does not match the reserved upload.",
    );
  await file.setMetadata(
    { metadata: { firebaseStorageDownloadTokens: null } },
    { ifGenerationMatch: meta.generation },
  );
  const warnings = Array.isArray(d.warnings)
    ? d.warnings
        .filter((s) => typeof s === "string")
        .slice(0, 100)
        .map((s) => s.slice(0, 600))
    : [];
  const attachment = {
    id: r.id,
    path: old.data().path,
    originalName: old.data().originalName,
    sizeBytes: Number(meta.size),
    detail: old.data().detail,
    generation: String(meta.generation),
    uploadedBy: uid,
    uploadedAt: new Date().toISOString(),
    warnings,
  };
  let previous;
  await db.runTransaction(async (tx) => {
    const [well, reservation] = await Promise.all([tx.get(w), tx.get(r)]);
    available(well);
    const pending = reservation.data();
    if (
      pending?.status !== "uploading" ||
      pending.expiresAt.toMillis() <= Date.now()
    )
      throw new HttpsError("aborted", "Upload cancelled or already finished.");
    previous = well.data().pason;
    if ((previous?.id || null) !== pending.baseAttachment)
      throw new HttpsError(
        "aborted",
        "Another person changed the ZIP. Upload again to replace it.",
      );
    if (previous?.id)
      tx.set(
        w.collection("pasonUploads").doc(previous.id),
        {
          status: "cancelled",
          path: previous.path,
          expiresAt: Timestamp.now(),
        },
        { merge: true },
      );
    tx.update(w, {
      pason: attachment,
      updatedBy: uid,
      updatedAt: new Date().toISOString(),
    });
    tx.update(r, { status: "ready", expiresAt: FieldValue.delete() });
  });
  if (previous?.path)
    await storage
      .bucket()
      .file(previous.path)
      .delete({ ignoreNotFound: true })
      .catch(() => {});
  return { attachment };
});
export const getFluidPason = invoke(async (_uid, d) => {
  const w = await wellRef(d.wellId).get();
  available(w);
  return { attachment: w.data().pason || null };
});
export const cancelFluidPason = invoke(async (_uid, d) => {
  const w = wellRef(d.wellId),
    r = w.collection("pasonUploads").doc(validId(d.uploadId));
  const path = await db.runTransaction(async (tx) => {
    const [well, upload] = await Promise.all([tx.get(w), tx.get(r)]);
    available(well);
    if (!upload.exists || upload.data().status !== "uploading") return null;
    tx.update(r, { status: "cancelled", expiresAt: Timestamp.now() });
    return upload.data().path;
  });
  if (path) await storage.bucket().file(path).delete({ ignoreNotFound: true });
  return { ok: true };
});
export const removeFluidPason = invoke(async (uid, d) => {
  const w = wellRef(d.wellId);
  const path = await db.runTransaction(async (tx) => {
    const well = await tx.get(w);
    available(well);
    const a = well.data().pason;
    if (!a) return null;
    if (a.id !== d.attachmentId)
      throw new HttpsError(
        "aborted",
        "The ZIP changed. Refresh before removing it.",
      );
    tx.set(
      w.collection("pasonUploads").doc(a.id),
      { status: "cancelled", path: a.path, expiresAt: Timestamp.now() },
      { merge: true },
    );
    tx.update(w, {
      pason: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    });
    return a.path;
  });
  if (path) await storage.bucket().file(path).delete({ ignoreNotFound: true });
  return { ok: true };
});
export async function cleanupPasonUploads() {
  const expired = await db
    .collectionGroup("pasonUploads")
    .where("expiresAt", "<=", Timestamp.now())
    .limit(100)
    .get();
  for (const doc of expired.docs) {
    if (!/^fluidWells\/[^/]+\/pasonUploads\/[^/]+$/.test(doc.ref.path))
      continue;
    const path = await db.runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      if (
        !s.exists ||
        !["uploading", "cancelled"].includes(s.data().status) ||
        s.data().expiresAt.toMillis() > Date.now()
      )
        return null;
      tx.update(doc.ref, { status: "cancelled" });
      return s.data().path;
    });
    if (path) {
      await storage.bucket().file(path).delete({ ignoreNotFound: true });
      await doc.ref.delete();
    }
  }
}

// Called after the well is marked deleting, so no new reservations can be created.
// Revoke byte-upload permission before any artifact deletion, including on retries.
export async function revokePasonUploads(well) {
  while (true) {
    const pending = await well
      .collection("pasonUploads")
      .where("status", "==", "uploading")
      .limit(400)
      .get();
    if (pending.empty) return;
    const batch = db.batch();
    for (const doc of pending.docs)
      batch.update(doc.ref, {
        status: "cancelled",
        expiresAt: Timestamp.now(),
      });
    await batch.commit();
  }
}
