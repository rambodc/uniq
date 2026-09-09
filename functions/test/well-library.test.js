import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { db, storage } from "../core/firebase.js";
import { beginUpload, completeUpload, ownedWell, renameWell, removeWell, validUpload, validId, MAX_ZIP_BYTES } from "../apps/well-viewer/library.js";

const input = { uploadId: "upload-1", name: "My well", originalName: "well.zip", sizeBytes: 50, detail: "balanced" };
function setup(t) {
  const records = new Map(), objects = new Map(), metadataUpdates = []; let failDelete = false;
  const doc = (path) => ({ id: path.split("/").at(-1), path,
    get: async () => ({ id: path.split("/").at(-1), exists: records.has(path), data: () => records.get(path) }),
    delete: async () => records.delete(path),
  });
  t.mock.method(db, "collection", (path) => ({ doc: (id) => doc(`${path}/${id}`) }));
  t.mock.method(db, "runTransaction", async (fn) => fn({
    get: (ref) => ref.get(), create: (ref, data) => records.set(ref.path, data),
    update: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data }),
  }));
  t.mock.method(storage, "bucket", () => ({ file: (path) => ({
    getMetadata: async () => { if (!objects.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [objects.get(path)]; },
    setMetadata: async (metadata, options) => { metadataUpdates.push({ metadata, options }); }, delete: async () => { if (failDelete) throw new Error("offline"); objects.delete(path); },
  }) }));
  return { records, objects, metadataUpdates, failDelete: (value) => { failDelete = value; } };
}

test("upload input enforces size, ZIP, name, detail, and safe IDs", () => {
  assert.equal(validUpload({ ...input, sizeBytes: MAX_ZIP_BYTES }).sizeBytes, MAX_ZIP_BYTES);
  for (const values of [{ sizeBytes: 0 }, { sizeBytes: MAX_ZIP_BYTES + 1 }, { sizeBytes: 1.5 }, { originalName: "a.txt" }, { originalName: "../a.zip" }, { detail: "bad" }, { name: "" }]) assert.throws(() => validUpload({ ...input, ...values }));
  for (const id of ["../other", ".", "a/b", ""]) assert.throws(() => validId(id));
});

test("reservations and completion are idempotent; ownership is never taken from request data", async (t) => {
  const { records, objects, metadataUpdates } = setup(t);
  const reservation = await beginUpload("owner", { ...input, owner: "victim", path: "elsewhere" });
  assert.equal(reservation.path, "users/owner/well-viewer/upload-1/original.zip");
  await beginUpload("owner", input);
  assert.equal(records.size, 1);
  await assert.rejects(completeUpload("owner", "upload-1"), { code: "failed-precondition" });
  objects.set(reservation.path, { size: "50", contentType: "application/zip", generation: "7", metadata: { owner: "owner", wellId: "upload-1" } });
  const first = await completeUpload("owner", "upload-1"), retry = await completeUpload("owner", "upload-1");
  assert.deepEqual(first, retry);
  assert.equal(first.well.generation, "7");
  assert.deepEqual(metadataUpdates, [{ metadata: { metadata: { firebaseStorageDownloadTokens: null } }, options: { ifGenerationMatch: "7" } }]);
  await assert.rejects(ownedWell("other-admin", "upload-1"), { code: "not-found" });
  await assert.rejects(renameWell("other-admin", "upload-1", "stolen"), { code: "not-found" });
  await removeWell("other-admin", "upload-1");
  assert.equal(objects.size, 1);
  assert.equal((await renameWell("owner", "upload-1", "Renamed")).well.name, "Renamed");
});

test("mismatched files and expired reservations cannot complete", async (t) => {
  const { objects, records } = setup(t), { path } = await beginUpload("owner", input);
  objects.set(path, { size: "51", contentType: "application/zip", metadata: { owner: "owner", wellId: "upload-1" } });
  await assert.rejects(completeUpload("owner", "upload-1"), { code: "failed-precondition" });
  const record = records.get("users/owner/miniApps/well-viewer/wells/upload-1"); record.cleanupAt = Timestamp.fromMillis(0);
  await assert.rejects(completeUpload("owner", "upload-1"), { code: "failed-precondition" });
});

test("failed deletions stay inaccessible and can be retried", async (t) => {
  const state = setup(t), { path } = await beginUpload("owner", input);
  state.objects.set(path, {}); state.failDelete(true);
  await assert.rejects(removeWell("owner", "upload-1"), /offline/);
  assert.equal(state.records.get("users/owner/miniApps/well-viewer/wells/upload-1").status, "deleting");
  await assert.rejects(ownedWell("owner", "upload-1"), { code: "failed-precondition" });
  state.failDelete(false); await removeWell("owner", "upload-1"); await removeWell("owner", "upload-1");
  assert.equal(state.records.size, 0); assert.equal(state.objects.size, 0);
});
