import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../core/firebase.js";
import { wells, beginUpload, listWells, cleanupWells } from "../apps/well-viewer/library.js";

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
