import test from "node:test";
import assert from "node:assert/strict";
import {
  recordedVolumeChanges,
  chemicalTotals,
  queryFluidRecords,
} from "../apps/fluidlab/fluid-records.js";
const row = (id, time, amount, extra = {}) => ({
  id,
  time,
  at: Date.parse(time),
  category: "tank",
  tank: "Combined PVT",
  name: "Combined PVT",
  event: "volume",
  amount,
  unit: "m³",
  uncertain: false,
  values: [],
  ...extra,
});
test("volume changes remain signed and stop across tank switches or unknown scope", () => {
  const rows = [
    row("a", "2025-01-01T00:00:00Z", 40),
    row("b", "2025-01-01T01:00:00Z", 38),
    row("c", "2025-01-01T02:00:00Z", 45),
  ];
  assert.deepEqual(
    recordedVolumeChanges(rows).map((r) => r.change),
    [null, -2, 7],
  );
  rows.push(
    row("switch", "2025-01-01T01:30:00Z", null, {
      event: "included",
      tank: "Tank 1",
    }),
  );
  assert.deepEqual(
    recordedVolumeChanges(rows).map((r) => r.change),
    [null, -2, null],
  );
  rows.push({ ...rows.at(-1), id: "unknown", at: null, time: null });
  assert.ok(recordedVolumeChanges(rows).every((r) => r.change === null));
  assert.equal(
    queryFluidRecords(rows, { category: "tank", mode: "summary" }).readings
      .length,
    3,
  );
});
test("chemical totals preserve signed quantities and incompatible units and exclude unresolved inputs", () => {
  const r = (extra) => ({
    ...row("x", "2025-01-01T00:00:00Z", 1),
    category: "chemical",
    name: "CLAY",
    ...extra,
  });
  const rows = [
    r({ amount: 1.1, unit: "SX" }),
    r({ amount: -0.1, unit: "SX" }),
    r({ amount: 25, unit: "kg" }),
    r({ amount: 20, unit: null }),
    r({ amount: 200, unit: "SX", uncertain: true }),
  ];
  assert.deepEqual(
    chemicalTotals(rows).map((r) => [r.unit, r.amount]),
    [
      ["kg", 25],
      ["SX", 1],
    ],
  );
  const result = queryFluidRecords(rows, {
    category: "chemical",
    mode: "summary",
  });
  assert.equal(result.excluded, 2);
  assert.throws(
    () =>
      queryFluidRecords(rows, { fromDate: "2025-02-01", toDate: "2025-01-01" }),
    /Start date/,
  );
});
