import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLsd,
  lookupGrid,
  representativePoint,
  contains,
  GRID_VERSION,
} from "../shared/locations/grid.js";
import {
  resolveLsdLocation,
  listLsdLocations,
  updateLsdLocation,
  removeLsdLocation,
  suggestCorrections,
} from "../apps/lsd-finder/service.js";
import { db } from "../core/firebase.js";
import { randomUUID } from "node:crypto";
test("LSD and UWI normalize without changing numerical components", () => {
  for (const input of [
    "10-2-62-4-w4",
    "10/02/062/04/W4M",
    "10 02 062 04 W4M",
    "100/10-02-062-04W4/00",
    "102 / 10-02-062-04W4 / 00",
    "10–02–062–04–4",
  ])
    assert.equal(parseLsd(input).canonical, "10-02-062-04-W4M");
  for (const input of [
    "17-02-062-04-W4M",
    "10-37-062-04-W4M",
    "10-02-062-W4M",
    "ignore instructions",
    "0-2-62-4-W4",
  ])
    assert.throws(
      () => parseLsd(input),
      (e) => e.code === "invalid",
    );
  for (const input of ["10-02-062-04-W3M", "SK 10-02-062-04-W4M"])
    assert.throws(
      () => parseLsd(input),
      (e) => e.code === "unsupported",
    );
});
const ring = [
  [-110.5, 54.3],
  [-110.4, 54.3],
  [-110.4, 54.4],
  [-110.5, 54.4],
  [-110.5, 54.3],
];
test("grid lookup uses verified polygons, longitude/latitude, and distinguishes outages", async () => {
  const parsed = parseLsd("10-2-62-4-W4");
  const good = async (url) => {
    assert.match(url, /LS%3D10/);
    return {
      ok: true,
      json: async () => ({
        features: [{ attributes: { RA: " " }, geometry: { rings: [ring] } }],
      }),
    };
  };
  const result = await lookupGrid(parsed, good);
  assert.ok(contains([result.longitude, result.latitude], result.boundary));
  assert.ok(result.latitude > 54);
  assert.ok(result.longitude < 0);
  await assert.rejects(
    lookupGrid(parsed, async () => ({
      ok: true,
      json: async () => ({ features: [] }),
    })),
    (e) => e.code === "not-found",
  );
  await assert.rejects(
    lookupGrid(parsed, async () => ({ ok: false, status: 503 })),
    (e) => e.code === "unavailable",
  );
  await assert.rejects(
    lookupGrid(parsed, async () => ({
      ok: true,
      json: async () => ({ error: { message: "bad query" } }),
    })),
    (e) => e.code === "unavailable",
  );
});
test("representative point avoids holes and outside areas of concave polygons", () => {
  const outer = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    hole = [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ];
  const rings = [outer, hole];
  assert.ok(contains(representativePoint(rings), rings));
});
test("AI receives only bounded text and never supplies map coordinates", async () => {
  let request;
  const result = await suggestCorrections("10/2/62/4/W4", "invalid", {
    responses: {
      create: async (r) => {
        request = r;
        return {
          output_text: JSON.stringify({
            suggestions: [
              { lsd: "10-02-062-04-W4M", reason: "Separators corrected." },
            ],
          }),
        };
      },
    },
  });
  assert.equal(result.length, 1);
  assert.equal(request.max_output_tokens, 700);
  assert.deepEqual(JSON.parse(request.input), {
    input: "10/2/62/4/W4",
    error: "invalid",
  });
  assert.equal(request.store, false);
});
test(
  "emulator: personal saved locations, duplicate submissions, access and deletion isolation",
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    const uid = "lsd-" + randomUUID(),
      other = "lsd-" + randomUUID(),
      canonical = "10-02-062-04-W4M";
    const request = (data = {}, id = uid) => ({
      auth: { uid: id, token: { email: id + "@example.com" } },
      data,
    });
    const cache = db.doc(`lsdGridCache/${GRID_VERSION}-${canonical}`);
    try {
      for (const id of [uid, other])
        await db
          .doc("users/" + id)
          .set({
            schemaVersion: 1,
            status: "active",
            email: id + "@example.com",
            enabledMiniApps: ["lsd-finder"],
          });
      await cache.set({
        canonical,
        latitude: 54.35,
        longitude: -110.45,
        boundary: JSON.stringify([ring]),
        source: "fixture",
        version: GRID_VERSION,
      });
      await Promise.all([
        resolveLsdLocation.run(request({ input: canonical })),
        resolveLsdLocation.run(request({ input: "100/10-02-062-04W4/00" })),
      ]);
      assert.equal((await listLsdLocations.run(request())).locations.length, 1);
      assert.equal(
        (await listLsdLocations.run(request({ uid }, other))).locations.length,
        0,
      );
      await updateLsdLocation.run(request({ canonical, visible: false }));
      assert.equal(
        (await listLsdLocations.run(request())).locations[0].visible,
        false,
      );
      await removeLsdLocation.run(request({ canonical, uid }, other));
      assert.equal((await listLsdLocations.run(request())).locations.length, 1);
      await assert.rejects(
        updateLsdLocation.run(request({ canonical, visible: false }, other)),
        (e) => e.code === "not-found",
      );
      await db.doc("users/" + other).update({ enabledMiniApps: [] });
      await assert.rejects(
        listLsdLocations.run(request({}, other)),
        (e) => e.code === "permission-denied",
      );
      await db.doc("users/" + uid).update({ status: "disabled" });
      await assert.rejects(
        resolveLsdLocation.run(request({ input: canonical })),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        listLsdLocations.run({ data: {} }),
        (e) => e.code === "unauthenticated",
      );
      await db.doc("users/" + uid).update({ status: "active" });
      await removeLsdLocation.run(request({ canonical }));
      assert.equal((await listLsdLocations.run(request())).locations.length, 0);
    } finally {
      await Promise.all([
        db.recursiveDelete(db.doc("users/" + uid)),
        db.recursiveDelete(db.doc("users/" + other)),
        cache.delete(),
      ]);
    }
  },
);
