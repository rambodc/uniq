import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  applyMapping,
  readSpreadsheet,
  hasNumericEvidence,
} from "../apps/fluidlab/extraction.js";
import {
  allocations,
  emptyDataset,
  idFor,
  mergeDatasets,
  reconcile,
  summarize,
  validateGeometry,
} from "../apps/fluidlab/model.js";
const f = (value, unit = null) => ({
  value: String(value),
  unit,
  sources: ["source"],
  status: "reported",
});
const record = (kind, label, facts = {}, links = {}) => ({
  id: idFor(kind, label),
  kind,
  label,
  report: null,
  product: null,
  branch: null,
  facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, f(v)])),
  ...links,
});
const fixture = () => ({
  ...emptyDataset(),
  sources: [{ id: "source", display: "source" }],
  records: [
    record("well", "Sample", { totalCost: "106761.50" }),
    record("report", "R1", { serviceCost: 7000 }),
    record("product", "Clay", {
      unitPrice: "5900",
      totalUsed: "5.05",
      totalReceived: "13.05",
      totalReturned: "8",
      totalRemaining: "5.05",
      totalCost: "29795",
    }),
    record(
      "usage",
      "u1",
      { quantity: "5.05", unitPrice: "5900" },
      { report: "R1", product: "Clay" },
    ),
    record(
      "usage",
      "u2",
      { quantity: "1", unitPrice: "69992.10" },
      { report: "R1", product: "Other" },
    ),
  ],
});
test("decimal costs reconcile, preserving unknown currency and balance discrepancies", () => {
  const d = reconcile(fixture()),
    s = summarize(d);
  assert.equal(s.productCost, "99787.10");
  assert.equal(s.serviceCost, "7000.00");
  assert.equal(s.totalCost, "106787.10");
  assert.equal(s.currencies[0].currency, "unspecified");
  assert.ok(
    d.issues.some(
      (i) => i.code === "check:balance" && i.message.includes("calculated 0"),
    ),
  );
  assert.ok(
    d.issues.some(
      (i) => i.code === "check:well-cost" && i.message.includes("25.60"),
    ),
  );
});
test("different currencies are never summed into a grand total", () => {
  const d = fixture();
  d.records[3].facts.currency = f("CAD");
  d.records[4].facts.currency = f("USD");
  assert.equal(summarize(d).totalCost, null);
  assert.equal(summarize(d).currencies.length, 3);
});
test("negative usage remains signed and is flagged", () => {
  const d = fixture();
  d.records.push(
    record(
      "usage",
      "credit",
      { quantity: "-5", unitPrice: "250" },
      { report: "R1", product: "TKPP" },
    ),
  );
  const checked = reconcile(d);
  assert.equal(summarize(checked).productCost, "98537.10");
  assert.ok(checked.issues.some((i) => i.code === "check:negative"));
});
test("version merge preserves accepted values, user geometry, and source conflicts", () => {
  const old = fixture();
  old.geometry = [{ id: "custom" }];
  old.records[2].facts.unitPrice = { ...f(6000), status: "edited" };
  const merged = mergeDatasets(old, fixture());
  assert.equal(merged.records.length, old.records.length);
  assert.equal(merged.records[2].facts.unitPrice.value, "6000");
  assert.equal(merged.geometry[0].id, "custom");
  assert.ok(
    merged.issues.some((i) => i.code === "conflict" && i.field === "unitPrice"),
  );
});
test("new-drilled-length allocation removes overlaps, ignores reaming, and conserves total", () => {
  const d = fixture();
  d.records.push(
    record("branch", "Leg 1", { startM: 100, endM: 300 }),
    record("branch", "Leg 2", { startM: 200, endM: 400 }),
    record(
      "event",
      "first",
      { type: "drilling", startM: 100, endM: 300, date: "2025-01-01" },
      { report: "R1", branch: "Leg 1" },
    ),
    record(
      "event",
      "overlap",
      { type: "drilling", startM: 200, endM: 300, date: "2025-01-01" },
      { report: "R1", branch: "Leg 1" },
    ),
    record(
      "event",
      "second",
      { type: "drilling", startM: 200, endM: 400, date: "2025-01-01" },
      { report: "R1", branch: "Leg 2" },
    ),
    record(
      "event",
      "ream",
      { type: "reaming", startM: 200, endM: 400, date: "2025-01-01" },
      { report: "R1", branch: "Leg 2" },
    ),
  );
  const a = allocations(d);
  assert.equal(
    a.filter((x) => x.branch).reduce((s, x) => s + x.length, 0),
    400,
  );
  assert.equal(a.find((x) => x.branch === "Leg 1").cost, "49893.55");
  assert.equal(a.find((x) => x.branch === null).cost, "7000.00");
  assert.equal(
    a.reduce((s, x) => s + Math.round(Number(x.cost) * 100), 0),
    10678710,
  );
});
test("geometry rejects cycles and kickoff outside parent", () => {
  const b = {
    id: "a",
    label: "A",
    startM: 0,
    endM: 100,
    diameterMm: 200,
    azimuth: 0,
    inclination: 90,
    visible: true,
    parent: null,
  };
  assert.deepEqual(validateGeometry([b]), [b]);
  assert.throws(() => validateGeometry([{ ...b, parent: "a" }]), /cycle/);
  assert.throws(
    () =>
      validateGeometry([
        b,
        { ...b, id: "b", parent: "a", startM: 120, endM: 200 },
      ]),
    /Kickoff/,
  );
  assert.throws(() => validateGeometry([{ ...b, endM: 0 }]), /Invalid/);
});
for (const format of ["xlsx", "biff8", "csv", "txt"])
  test(`reads ${format} without executing formulas, preserving arbitrary layout`, () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["ignored", "ignored"],
      ["Metric", "R1", "R2"],
      ["Depth ft", 100, 200],
      ["Cost", 12.34, -5],
    ]);
    sheet.B5 = { t: "n", v: 42, f: "6*7" };
    sheet["!ref"] = "A1:C5";
    const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(w, sheet, "Renamed tab");
    const buffer = XLSX.write(w, { type: "buffer", bookType: format });
    const parsed = readSpreadsheet(
      buffer,
      format === "biff8"
        ? "data.xls"
        : format === "txt"
          ? "data.tsv"
          : `data.${format}`,
      "f",
    );
    assert.ok(parsed.sources.length > 0);
    if (format === "xlsx") {
      const formula = parsed.sources.find((s) => s.cell === "B5");
      assert.equal(formula.formula, "6*7");
      assert.equal(formula.raw, 42);
    }
    const result = applyMapping(parsed.sheets[0], {
      tables: [
        {
          kind: "report",
          orientation: "columns",
          indices: [2, 3],
          labelIndex: 2,
          fields: [
            { name: "mdM", index: 3, unit: "ft" },
            { name: "serviceCost", index: 4, unit: null },
          ],
        },
      ],
      matrices: [],
    });
    assert.equal(result.records[0].facts.mdM.value, "30.48");
    assert.equal(result.records[1].facts.serviceCost.value, "-5");
  });
test("transposed and reordered tables map using AI-provided positions", () => {
  const sheet = {
    cells: [
      { id: "a", row: 3, column: 2, raw: "R7" },
      { id: "b", row: 3, column: 5, raw: 600 },
      { id: "c", row: 3, column: 1, raw: 42 },
    ],
  };
  const result = applyMapping(sheet, {
    tables: [
      {
        kind: "report",
        orientation: "rows",
        indices: [3],
        labelIndex: 2,
        fields: [
          { name: "mdM", index: 5, unit: "m" },
          { name: "density", index: 1, unit: null },
        ],
      },
    ],
    matrices: [],
  });
  assert.equal(result.records[0].label, "R7");
  assert.equal(result.records[0].facts.mdM.value, "600");
  assert.deepEqual(result.records[0].facts.density.sources, ["c"]);
});

test("numeric grounding distinguishes depth ranges, signed usage, and invented numbers", () => {
  assert.equal(
    hasNumericEvidence("594m-1091m; return -50 sacks", "1091"),
    true,
  );
  assert.equal(hasNumericEvidence("return -50 sacks", "50"), false);
  assert.equal(hasNumericEvidence("return -50 sacks", "-50"), true);
  assert.equal(hasNumericEvidence("Cost 99,787.10", "99787.10"), true);
  assert.equal(hasNumericEvidence("Losses 30m3", "300"), false);
});
test("unpriced usage remains available and flags incomplete calculated spend", () => {
  const d = fixture();
  d.records.push(
    record("usage", "unknown", { quantity: 5 }, { product: "No price" }),
  );
  assert.ok(reconcile(d).issues.some((i) => i.code === "check:unpriced"));
  assert.equal(summarize(d).productCost, "99787.10");
});
test("header-derived currency stays separate from numeric costs and retains unit provenance", () => {
  const sheet = {
    cells: [
      { id: "header", cell: "A1", row: 1, column: 1, raw: "Service fee USD" },
      { id: "name", cell: "A2", row: 2, column: 1, raw: "R1" },
      { id: "cost", cell: "B2", row: 2, column: 2, raw: 30 },
      { id: "depth", cell: "C2", row: 2, column: 3, raw: 100 },
    ],
  };
  const result = applyMapping(sheet, {
    tables: [
      {
        kind: "report",
        orientation: "rows",
        indices: [2],
        labelIndex: 1,
        fields: [
          { name: "serviceCost", index: 2, unit: "USD" },
          {
            name: "currency",
            index: 1,
            literal: "USD",
            literalSource: "A1",
            unit: null,
          },
          { name: "mdM", index: 3, unit: "ft" },
        ],
      },
    ],
    matrices: [],
  });
  assert.equal(result.records[0].facts.serviceCost.value, "30");
  assert.equal(result.records[0].facts.currency.value, "USD");
  assert.equal(result.records[0].facts.mdM.value, "30.48");
  assert.equal(result.records[0].facts.mdM.originalUnit, "ft");
  assert.equal(result.records[0].facts.mdM.originalValue, "100");
});

test("updates add newly documented branches without reviving manually removed branches", () => {
  const before = fixture();
  const removed = record("branch", "Leg 1", { startM: 0, endM: 100 });
  before.records.push(removed);
  before.geometry = [];
  const incoming = fixture();
  const added = record("branch", "Leg 2", { startM: 100, endM: 300 });
  incoming.records.push(removed, added);
  incoming.geometry = [
    { id: removed.id, label: removed.label },
    { id: added.id, label: added.label },
  ];
  const updated = mergeDatasets(before, incoming);
  assert.deepEqual(
    updated.geometry.map((b) => b.label),
    ["Leg 2"],
  );
});
