import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, storage } from "../core/firebase.js";
import {
  beginFluidPason,
  completeFluidPason,
  getFluidPason,
  cancelFluidPason,
  removeFluidPason,
} from "../apps/fluidlab/pason.js";
import { createFluidWell, deleteFluidWell } from "../apps/fluidlab/service.js";
import { nameSearch, searchWells } from "../apps/fluidlab/search.js";
const enabled =
  !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.STORAGE_EMULATOR_HOST;
const req = (uid, data) => ({
  auth: { uid, token: { email: `${uid}@test.com` } },
  data,
});
test(
  "emulator: shared Pason completion, failed replacement, cancellation and deletion",
  { skip: !enabled },
  async () => {
    const owner = randomUUID(),
      other = randomUUID(),
      denied = randomUUID(),
      wellId = randomUUID();
    for (const uid of [owner, other, denied])
      await db
        .doc(`users/${uid}`)
        .set({
          schemaVersion: 1,
          email: `${uid}@test.com`,
          status: "active",
          enabledMiniApps: uid === denied ? [] : ["fluidlab"],
        });
    try {
      await createFluidWell.run(
        req(owner, { name: "Shared Pason", mutationId: wellId }),
      );
      const begin = (uid, id) =>
        beginFluidPason.run(
          req(uid, {
            wellId,
            uploadId: id,
            originalName: "well.zip",
            sizeBytes: 3,
            detail: "balanced",
          }),
        );
      const write = async (path, uid, size = 3) =>
        storage
          .bucket()
          .file(path)
          .save(Buffer.alloc(size), {
            resumable: false,
            metadata: {
              contentType: "application/zip",
              metadata: { owner: uid, wellId },
            },
          });
      await assert.rejects(begin(denied, "denied"));
      const a = await begin(owner, "first");
      await write(a.path, owner);
      await assert.rejects(
        completeFluidPason.run(req(other, { wellId, uploadId: "first" })),
      );
      await completeFluidPason.run(
        req(owner, { wellId, uploadId: "first", warnings: ["Survey notice"] }),
      );
      assert.equal(
        (await getFluidPason.run(req(other, { wellId }))).attachment.id,
        "first",
      );
      await assert.rejects(getFluidPason.run(req(denied, { wellId })));
      const bad = await begin(other, "bad");
      await write(bad.path, other, 2);
      await assert.rejects(
        completeFluidPason.run(req(other, { wellId, uploadId: "bad" })),
      );
      assert.equal(
        (await getFluidPason.run(req(owner, { wellId }))).attachment.id,
        "first",
      );
      await cancelFluidPason.run(req(owner, { wellId, uploadId: "bad" }));
      assert.equal((await storage.bucket().file(bad.path).exists())[0], false);
      const b = await begin(other, "second"),
        c = await begin(owner, "third");
      await write(b.path, other);
      await write(c.path, owner);
      await completeFluidPason.run(req(other, { wellId, uploadId: "second" }));
      await assert.rejects(
        completeFluidPason.run(req(owner, { wellId, uploadId: "third" })),
        /Another person/,
      );
      await assert.rejects(
        removeFluidPason.run(req(owner, { wellId, attachmentId: "first" })),
      );
      await cancelFluidPason.run(req(owner, { wellId, uploadId: "third" }));
      await removeFluidPason.run(
        req(owner, { wellId, attachmentId: "second" }),
      );
      assert.equal(
        (await getFluidPason.run(req(other, { wellId }))).attachment,
        null,
      );
      const last = await begin(owner, "last");
      await write(last.path, owner);
      await completeFluidPason.run(req(owner, { wellId, uploadId: "last" }));
      await deleteFluidWell.run(
        req(other, { wellId, mutationId: randomUUID() }),
      );
      assert.equal((await storage.bucket().file(last.path).exists())[0], false);
    } finally {
      await storage.bucket().deleteFiles({ prefix: `fluidlab/${wellId}/` });
      await db.recursiveDelete(db.doc(`fluidWells/${wellId}`));
      for (const uid of [owner, other, denied])
        await db.doc(`users/${uid}`).delete();
    }
  },
);
test(
  "emulator: ten-well pages, full-library prefix search and stable ID ordering",
  { skip: !enabled },
  async () => {
    const col = db.collection(`search-test-${randomUUID()}`);
    try {
      for (let i = 0; i < 23; i++)
        await col
          .doc(`well-${String(i).padStart(2, "0")}`)
          .set({
            name: i === 0 ? "Northern Target" : "Northern Alpha",
            ...nameSearch(i === 0 ? "Northern Target" : "Northern Alpha"),
            updatedAt: "2026-09-01T00:00:00.000Z",
            listed: true,
          });
      const a = await searchWells(col),
        b = await searchWells(col, { cursor: a.cursor }),
        c = await searchWells(col, { cursor: b.cursor });
      assert.deepEqual(
        [a.wells.length, b.wells.length, c.wells.length],
        [10, 10, 3],
      );
      assert.equal(
        new Set([...a.wells, ...b.wells, ...c.wells].map((w) => w.id)).size,
        23,
      );
      assert.equal(a.wells[0].id, "well-22");
      assert.equal(
        (await searchWells(col, { search: "TaR" })).wells[0].id,
        "well-00",
      );
      assert.equal(
        (await searchWells(col, { search: " northern t" })).wells.length,
        1,
      );
      await assert.rejects(
        searchWells(col, { search: "different", cursor: a.cursor }),
        /Search changed/,
      );
    } finally {
      await db.recursiveDelete(col);
    }
  },
);
