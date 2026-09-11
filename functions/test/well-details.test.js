import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataset } from "../apps/fluidlab/model.js";
import {
  integrateWellDetails,
  wellDetails,
  locationInput,
} from "../apps/fluidlab/well-details.js";
import { prepareWellLocation } from "../apps/fluidlab/well-location.js";
const rows = [
  ["Well Name", "SRL Druid 5D2 Hz 5-19-34-20W3"],
  ["Location", "101/05-19-034-20W3/00"],
  ["Province", "SK"],
  ["Formation", "Lloydminster"],
  ["Field Name", "Druid"],
  ["AFE", "25D41571"],
  ["Total Depth", "1901"],
  ["License", "0359098"],
  ["Well File Creation Date", "2025-03-14_13-53-24"],
  ["Spud Date", "Wed Mar 12 2025 08:00:00 GMT-0600 (Central Standard Time)"],
  [
    "Released Date",
    "Mon Mar 17 2025 10:45:51 GMT-0600 (Central Standard Time)",
  ],
  ["Operator", "Strathcona Resources"],
  ["Contractor", "AKITA Drilling"],
  ["Contractor Report For", ""],
  ["Rig Name", "35"],
  ["Well Notes", "Single leg HZ<br>No issues while drilling"],
];
function fixture(input = rows) {
  const d = emptyDataset();
  d.sources = input.flatMap((row, i) =>
    row.map((raw, c) => ({
      id: `s${i}-${c}`,
      file: "report.xlsx",
      sheet: "Well info",
      row: i + 1,
      column: c + 1,
      raw,
      display: raw,
    })),
  );
  return integrateWellDetails(d);
}
function refMock(well) {
  const writes = [];
  return {
    id: "well",
    writes,
    firestore: {
      runTransaction: async (fn) =>
        fn({
          get: async () => ({ exists: !!well, data: () => well }),
          update: (_, data) => writes.push(data),
        }),
    },
  };
}
test("spreadsheet block retains SK metadata, zeros, offset, notes and unknown depth units", async () => {
  const d = fixture(),
    details = wellDetails(d),
    well = { version: "v", revision: 2 };
  assert.equal(Object.keys(details.facts).length, 15);
  assert.equal(details.facts.license.value, "0359098");
  assert.equal(details.facts.reportedTotalDepth.unit, null);
  assert.match(details.facts.spudDate.value, /GMT-0600/);
  assert.equal(
    details.facts.wellNotes.value,
    "Single leg HZ\nNo issues while drilling",
  );
  assert.deepEqual(details.facts.operator.sources, ["s11-1"]);
  const ref = refMock(well);
  const result = await prepareWellLocation(ref, well, d, () => {
    throw Error("must not geocode SK");
  });
  assert.equal(result.location.status, "unsupported");
  assert.equal("updatedAt" in ref.writes[0], false);
});
test("deterministic Alberta normalization, missing province and unsupported/invalid inputs", () => {
  for (const province of ["AB", "Alberta", ""]) {
    const d = fixture([
      ["Well Name", "W"],
      ["Location", "100/10-02-062-04W4/00"],
      ["Province", province],
    ]);
    assert.equal(
      locationInput(wellDetails(d)).parsed.canonical,
      "10-02-062-04-W4M",
    );
  }
  for (const province of ["BC", "SK", "MB"])
    assert.equal(
      locationInput(
        wellDetails(
          fixture([
            ["Well Name", "W"],
            ["Location", "10-02-062-04W4"],
            ["Province", province],
          ]),
        ),
      ).status,
      "unsupported",
    );
  assert.equal(
    locationInput(
      wellDetails(
        fixture([
          ["Well Name", "W"],
          ["Location", "nonsense"],
        ]),
      ),
    ).status,
    "invalid",
  );
  assert.equal(locationInput({ facts: {}, conflicts: [] }).status, "missing");
});
test("conflicting locations prohibit pins; explicit corrections and clearing remain authoritative", () => {
  const d = fixture([
    ["Well Name", "W"],
    ["Location", "10-02-062-04W4"],
    ["Location", "11-02-062-04W4"],
  ]);
  assert.equal(locationInput(wellDetails(d)).status, "conflict");
  const r = d.records[0];
  r.facts.location = {
    ...r.facts.location,
    value: "12-02-062-04W4",
    status: "edited",
  };
  integrateWellDetails(d);
  assert.equal(locationInput(wellDetails(d)).parsed.lsd, 12);
  r.facts.location.value = null;
  integrateWellDetails(d);
  assert.equal(locationInput(wellDetails(d)).status, "missing");
});
const geometry = {
  canonical: "10-02-062-04-W4M",
  latitude: 54.3,
  longitude: -110.4,
  boundary: [
    [
      [-110.4, 54.3],
      [-110.3, 54.3],
      [-110.3, 54.4],
      [-110.4, 54.3],
    ],
  ],
  source: "official",
  version: "grid-v1",
};
test("location cache survives unrelated revisions; changed input invalidates pin; failures retry", async () => {
  const d = fixture([
      ["Well Name", "W"],
      ["Location", "10-02-062-04W4"],
    ]),
    well = { version: "v", revision: 1 };
  let calls = 0;
  const lookup = async () => {
    calls++;
    return geometry;
  };
  const a = await prepareWellLocation(refMock(well), well, d, lookup);
  assert.equal(a.location.status, "ready");
  assert.equal(typeof a.location.boundary, "string");
  const already = { ...well, ...a };
  assert.equal(
    (await prepareWellLocation(refMock(already), already, d, lookup))
      .detailsVersion,
    "v",
  );
  const next = { ...well, ...a, version: "v2", revision: 2 };
  await prepareWellLocation(refMock(next), next, d, lookup);
  assert.equal(calls, 1);
  d.records[0].facts.location.value = "11-02-062-04W4";
  const b = await prepareWellLocation(refMock(next), next, d, async () => {
    throw Object.assign(Error(), { code: "unavailable" });
  });
  assert.equal(b.location.status, "unavailable");
  assert.equal(b.location.latitude, undefined);
  const retry = { ...next, ...b };
  await prepareWellLocation(refMock(retry), retry, d, lookup);
  assert.equal(calls, 2);
  const missing = await prepareWellLocation(
    refMock(well),
    well,
    d,
    async () => {
      throw Object.assign(Error(), { code: "not-found" });
    },
  );
  assert.equal(missing.location.status, "unmatched");
});
test("changed revisions and deleted wells reject preparation writes", async () => {
  const d = fixture(),
    well = { version: "v", revision: 1 };
  for (const actual of [
    null,
    { ...well, revision: 2 },
    { ...well, status: "deleting" },
  ]) {
    const ref = refMock(actual);
    await assert.rejects(prepareWellLocation(ref, well, d), /changed/);
    assert.equal(ref.writes.length, 0);
  }
});

test(
  "emulator: Fluid Labs alone permits shared preparation without creating personal pins",
  {
    skip:
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  },
  async () => {
    const { db, storage } = await import("../core/firebase.js");
    const { prepareFluidWellDetails } =
      await import("../apps/fluidlab/service.js");
    const { randomUUID } = await import("node:crypto");
    const { GRID_VERSION } = await import("../shared/locations/grid.js");
    const uid = "details-" + randomUUID(),
      other = "details-" + randomUUID(),
      wellId = randomUUID();
    const ref = db.doc("fluidWells/" + wellId),
      path = `fluidlab/${wellId}/versions/v.json`,
      cache = db.doc(`lsdGridCache/${GRID_VERSION}-11-02-062-04-W4M`);
    const request = (id) => ({
      auth: { uid: id, token: { email: id + "@example.com" } },
      data: { wellId, uid: "ignored" },
    });
    try {
      for (const id of [uid, other])
        await db.doc("users/" + id).set({
          schemaVersion: 1,
          status: "active",
          email: id + "@example.com",
          enabledMiniApps: ["fluidlab"],
        });
      const dataset = fixture([
        ["Well Name", "Reported name"],
        ["Location", "11-02-062-04W4"],
        ["Province", "AB"],
      ]);
      await ref.set({
        name: "User renamed title",
        revision: 1,
        version: "v",
        status: "ready",
        updatedAt: "2025-01-01",
      });
      await ref.collection("versions").doc("v").set({ path });
      await storage.bucket().file(path).save(JSON.stringify(dataset));
      await cache.set({
        ...geometry,
        canonical: "11-02-062-04-W4M",
        boundary: JSON.stringify(geometry.boundary),
      });
      const first = await prepareFluidWellDetails.run(request(uid)),
        second = await prepareFluidWellDetails.run(request(other));
      assert.equal(first.location.status, "ready");
      assert.equal(second.details.facts.name.value, "Reported name");
      const saved = (await ref.get()).data();
      assert.equal(saved.name, "User renamed title");
      assert.equal(saved.updatedAt, "2025-01-01");
      assert.equal(saved.revision, 1);
      for (const id of [uid, other])
        assert.equal(
          (await db.collection(`users/${id}/lsdLocations`).get()).size,
          0,
        );
      await db
        .doc("users/" + other)
        .update({ enabledMiniApps: ["lsd-finder"] });
      await assert.rejects(
        prepareFluidWellDetails.run(request(other)),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        prepareFluidWellDetails.run({ data: { wellId } }),
        (e) => e.code === "unauthenticated",
      );
    } finally {
      await Promise.all([
        db.recursiveDelete(ref),
        db.recursiveDelete(db.doc("users/" + uid)),
        db.recursiveDelete(db.doc("users/" + other)),
        cache.delete(),
        storage.bucket().file(path).delete({ ignoreNotFound: true }),
      ]);
    }
  },
);

test("metadata review decisions survive repeat preparation and equivalent Alberta formatting", () => {
  const d = fixture([
    ["Well Name", "W"],
    ["Location", "10-02-062-04W4"],
    ["Location", "11-02-062-04W4"],
  ]);
  const issue = d.issues.find((i) => i.code === "well-metadata-conflict");
  d.reviews = {
    [issue.fingerprint]: { status: "kept", reviewedBy: "reviewer" },
  };
  integrateWellDetails(d);
  assert.equal(d.issues[0].status, "kept");
  assert.equal(locationInput(wellDetails(d)).status, "pending");
  const equivalent = fixture([
    ["Well Name", "W"],
    ["Location", "10-2-62-4-W4"],
    ["Province", "AB"],
    ["Location", "100/10-02-062-04W4/00"],
    ["Province", "Alberta"],
  ]);
  assert.equal(equivalent.issues.length, 0);
  assert.equal(
    locationInput(wellDetails(equivalent)).parsed.canonical,
    "10-02-062-04-W4M",
  );
});
