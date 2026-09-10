import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDataset,
  reconcile,
  mergeDatasets,
  summarize,
} from "../apps/fluidlab/model.js";
import { buildSchematic } from "../apps/fluidlab/schematic.js";
import { applyReview } from "../apps/fluidlab/review.js";
import { extractFiles } from "../apps/fluidlab/extraction.js";
const fact = (value) => ({
  value: String(value),
  unit: null,
  status: "reported",
  sources: [],
});
const rec = (kind, label, facts = {}) => ({
  id: label,
  kind,
  label,
  report: null,
  product: null,
  branch: null,
  facts: Object.fromEntries(
    Object.entries(facts).map(([k, v]) => [k, fact(v)]),
  ),
});
for (const [label, records, expected] of [
  ["partial single leg", [rec("branch", "Leg 1")], 1],
  [
    "multiple partial legs",
    [
      rec("branch", "Leg 1", { startM: 100 }),
      rec("branch", "Leg 2", { endM: 900 }),
    ],
    2,
  ],
  ["depth-only well", [rec("report", "R1", { mdM: 500 })], 1],
  ["count-only well", [rec("well", "Well", { legCount: 4 })], 4],
  ["no geometry clues", [rec("product", "Clay", { unitPrice: 3 })], 0],
  [
    "conflicting dimensions",
    [rec("branch", "Leg 1", { startM: 500, endM: 100, diameterMm: -1 })],
    1,
  ],
])
  test(`schematic: ${label}`, () => {
    const data = { ...emptyDataset(), records };
    const before = JSON.stringify(records.map((r) => r.facts));
    const result = reconcile(buildSchematic(data));
    assert.equal(result.geometry.length, expected);
    assert.equal(JSON.stringify(records.map((r) => r.facts)), before);
    for (const b of result.geometry) {
      assert.ok(b.endM > b.startM);
      assert.ok(b.diameterMm > 0);
    }
    assert.ok(result.issues.length);
  });
test("accepted estimates remain estimates and review persists until evidence changes", () => {
  let d = reconcile(
    buildSchematic({
      ...emptyDataset(),
      records: [rec("branch", "Leg 1", { startM: 100 })],
    }),
  );
  const estimate = d.issues.find((i) => i.field === "endM");
  d = applyReview(
    d,
    { review: { issueId: estimate.id, action: "accepted" } },
    "alice",
  );
  d = reconcile(buildSchematic(d));
  assert.equal(d.issues.find((i) => i.id === estimate.id).status, "accepted");
  assert.equal(d.records[0].facts.endM, undefined);
  d.records[0].facts.startM = fact(200);
  d = reconcile(buildSchematic(d));
  assert.equal(d.issues.find((i) => i.field === "endM").status, "unresolved");
});
test("missing dimensions can be added and corrections rebuild the schematic", () => {
  let d = applyReview(
    emptyDataset(),
    {
      correction: {
        recordId: "well-settings",
        field: "legCount",
        value: "3",
        unit: null,
      },
    },
    "alice",
  );
  assert.equal(d.geometry.length, 3);
  d = applyReview(
    d,
    {
      correction: {
        recordId: "well-settings",
        field: "legCount",
        value: "2",
        unit: null,
      },
    },
    "bob",
  );
  assert.equal(d.geometry.length, 2);
  d = applyReview(
    d,
    {
      correction: {
        recordId: d.geometry[0].id,
        field: "endM",
        value: "700",
        unit: "m",
      },
    },
    "bob",
  );
  assert.equal(d.geometry[0].endM, 700);
  assert.equal(
    d.records.find((r) => r.id === d.geometry[0].id).facts.endM.status,
    "edited",
  );
  assert.throws(
    () =>
      applyReview(
        d,
        {
          correction: {
            recordId: "well-settings",
            field: "totalDepthM",
            value: "invalid",
            unit: "m",
          },
        },
        "alice",
      ),
    /valid number/,
  );
  assert.throws(
    () =>
      applyReview(
        d,
        {
          correction: {
            recordId: "well-settings",
            field: "totalDepthM",
            value: "30",
            unit: "ft",
          },
        },
        "alice",
      ),
    /metres/,
  );
});
test("cost corrections recalculate and conflicts reopen when candidate evidence changes", () => {
  let d = {
    ...emptyDataset(),
    records: [
      rec("product", "Clay", { unitPrice: 2 }),
      { ...rec("usage", "Use", { quantity: 5 }), product: "Clay" },
    ],
  };
  d = applyReview(
    d,
    {
      correction: {
        recordId: "Clay",
        field: "unitPrice",
        value: "4",
        unit: "CAD",
      },
    },
    "alice",
  );
  assert.equal(summarize(d).totalCost, "20.00");
  let incoming = {
    ...emptyDataset(),
    records: [rec("product", "Clay", { unitPrice: 6 })],
  };
  d = mergeDatasets(d, incoming);
  const conflict = d.issues.find((i) => i.code === "conflict");
  d = applyReview(
    d,
    { review: { issueId: conflict.id, action: "kept" } },
    "alice",
  );
  assert.equal(
    reconcile(d).issues.find((i) => i.id === conflict.id).status,
    "kept",
  );
  incoming.records[0].facts.unitPrice = fact(7);
  d = mergeDatasets(d, incoming);
  assert.ok(
    d.issues.some((i) => i.code === "conflict" && i.status === "unresolved"),
  );
});
test("readable but unmapped input remains available for review and chat", async () => {
  const { dataset } = await extractFiles(
    [
      {
        id: "f",
        name: "notes.csv",
        buffer: Buffer.from("Notes\nNothing structured\n"),
      },
    ],
    {
      client: {
        responses: {
          parse: async () => ({
            output_parsed: { sheets: [] },
            usage: { total_tokens: 1 },
          }),
        },
      },
    },
  );
  assert.equal(dataset.records.length, 0);
  assert.ok(dataset.sources.length > 0);
  assert.ok(dataset.issues.some((i) => i.code === "mapping:empty"));
});
