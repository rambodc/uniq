import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { db, storage } from "../core/firebase.js";
import {
  beginRestart,
  finishRestart,
  collections,
} from "../scripts/restart-uex.js";
import { requireUexReady } from "../apps/uex/restart-guard.js";
test(
  "one-time UEX cleanup drains requests, preserves accounts/apps, and cannot erase new events on retries",
  { skip: process.env.UEX_INTEGRATION !== "1" },
  async () => {
    const marker = db.doc("operations/uexRestart20260920");
    await marker.delete();
    await assert.rejects(finishRestart(), /blocked/);
    const profile = {
      schemaVersion: 2,
      role: "admin",
      email: "keep@example.com",
      status: "active",
    };
    await db.doc("users/restart-preserved").set(profile);
    await db
      .doc("invoiceQbPrivate/connection")
      .set({ refreshToken: "preserve-test" });
    await db.doc("fluidWells/restart-preserved").set({ name: "Keep" });
    await storage.bucket().file("fluidlab/restart-preserved").save("keep");
    for (const name of collections)
      await db.collection(name).doc("old").set({ old: true });
    await db.doc("uexParties/old/guests/guest").set({ ticket: "OLD" });
    await db.doc("uexParties/old/revisions/1").set({ old: true });
    await storage.bucket().file("uex/old/photo").save("old");
    await beginRestart();
    await assert.rejects(requireUexReady(), /refreshed/);
    await assert.rejects(finishRestart(), /drained/);
    const remove = db.recursiveDelete.bind(db);
    const interrupted = mock.method(db, "recursiveDelete", async (ref) => {
      await remove(ref);
      throw new Error("interrupted cleanup");
    });
    await assert.rejects(
      finishRestart({ now: Date.now() + 400000 }),
      /interrupted cleanup/,
    );
    interrupted.mock.restore();
    await assert.rejects(requireUexReady(), /refreshed/);
    await beginRestart();
    await finishRestart({ now: Date.now() + 400000 });
    await requireUexReady();
    for (const name of collections)
      assert.equal((await db.collection(name).listDocuments()).length, 0);
    assert.equal(
      (await db.doc("uexParties/old/guests/guest").get()).exists,
      false,
    );
    assert.equal(
      (await storage.bucket().file("uex/old/photo").exists())[0],
      false,
    );
    assert.deepEqual(
      (await db.doc("users/restart-preserved").get()).data(),
      profile,
    );
    assert.equal(
      (await db.doc("invoiceQbPrivate/connection").get()).data().refreshToken,
      "preserve-test",
    );
    assert.equal(
      (await db.doc("fluidWells/restart-preserved").get()).data().name,
      "Keep",
    );
    assert.equal(
      (await storage.bucket().file("fluidlab/restart-preserved").exists())[0],
      true,
    );
    await db.doc("uexParties/new").set({ new: true });
    await storage.bucket().file("uex/new/photo").save("new");
    assert.deepEqual(await beginRestart(), { skipped: true });
    assert.deepEqual(await finishRestart(), { skipped: true });
    assert.equal((await db.doc("uexParties/new").get()).exists, true);
    assert.equal(
      (await storage.bucket().file("uex/new/photo").exists())[0],
      true,
    );
  },
);
