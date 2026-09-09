import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { db, storage } from "../core/firebase.js";
import { wells, beginUpload, completeUpload, ownedWell, renameWell, removeWell, listWells, cleanupWells } from "../apps/well-viewer/library.js";

test("emulator: pagination is stable for duplicate dates and cleanup leaves ready wells intact", { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const uid = "library-integration", collection = wells(uid), now = Timestamp.now(), past = Timestamp.fromMillis(1);
  try {
    const batch = db.batch();
    for (let i = 0; i < 53; i++) batch.set(collection.doc(`well-${String(i).padStart(3, "0")}`), { owner: uid, status: "ready", name: "Duplicate name", originalName: "same.zip", detail: "balanced", sizeBytes: 3, createdAt: now, updatedAt: now });
    batch.set(collection.doc("expired"), { owner: uid, status: "uploading", cleanupAt: past });
    batch.set(collection.doc("deleting"), { owner: uid, status: "deleting", cleanupAt: past });
    batch.set(collection.doc("ready-stale-cleanup"), { owner: uid, status: "ready", cleanupAt: past, createdAt: now });
    await batch.commit();
    const page1 = await listWells(uid), page2 = await listWells(uid, page1.cursor);
    assert.equal(page1.wells.length, 50); assert.equal(page2.wells.length, 4); assert.equal(page2.cursor, null);
    assert.equal(new Set([...page1.wells, ...page2.wells].map((well) => well.id)).size, 54);
    assert.equal((await listWells("other-library-user")).wells.length, 0);
    await beginUpload(uid, { uploadId: "fresh", name: "Fresh", originalName: "fresh.zip", sizeBytes: 3, detail: "balanced" });
    await cleanupWells();
    assert.equal((await collection.doc("expired").get()).exists, false);
    assert.equal((await collection.doc("deleting").get()).exists, false);
    assert.equal((await collection.doc("fresh").get()).exists, true);
    assert.equal((await collection.doc("ready-stale-cleanup").get()).exists, true);
  } finally { await db.recursiveDelete(collection); }
});


test("emulator: saved original survives completion, reopening, rename and deletion", { skip: !process.env.STORAGE_EMULATOR_HOST }, async () => {
  const uid = "transfer-integration", id = "original", content = Buffer.from("PK-test-original"), collection = wells(uid);
  try {
    const { path } = await beginUpload(uid, { uploadId: id, name: "Well", originalName: "well.zip", sizeBytes: content.length, detail: "compact" });
    const file = storage.bucket().file(path);
    await file.save(content, { resumable: false, metadata: { contentType: "application/zip", metadata: { owner: uid, wellId: id, firebaseStorageDownloadTokens: "should-be-removed" } } });
    const first = await completeUpload(uid, id), retry = await completeUpload(uid, id);
    assert.deepEqual(first, retry); assert.equal(first.well.sizeBytes, content.length);
    // Storage Emulator 14 stores download tokens separately and does not revoke them
    // on metadata=null. The unit test verifies the production revocation request.
    assert.equal(Object.hasOwn(first.well, "downloadUrl"), false);
    assert.deepEqual((await file.download())[0], content);
    assert.equal((await ownedWell(uid, id)).snap.data().detail, "compact");
    await assert.rejects(ownedWell("another-user", id), { code: "not-found" });
    assert.equal((await renameWell(uid, id, "Renamed well")).well.name, "Renamed well");
    assert.equal((await listWells(uid)).wells[0].name, "Renamed well");
    await removeWell(uid, id); await removeWell(uid, id);
    assert.equal((await file.exists())[0], false); assert.equal((await collection.doc(id).get()).exists, false);
  } finally { await db.recursiveDelete(collection); }
});
