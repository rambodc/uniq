import assert from "node:assert/strict";
import { test } from "node:test";
import sample from "../../src/inventory/invXpressSample.json" with { type: "json" };
import { demoInput } from "./fixtures/inv-xpress-demo.js";
import { assembleInvXpress, buildInvXpress, isPackagingOrFee, packInvXpress, parsePack, stockInHand } from "../inventoryBot/invXpress.js";

const barite = { id: "app_barite", name: "Barite", appNames: ["Barite"], xpressNames: ["BARITE"] };
const sawdust = { id: "app_sawdust", name: "Sawdust", appNames: ["Sawdust"], xpressNames: ["SAWDUST"] };
const oil = { id: "app_oil", name: "Mineral Oil", appNames: ["Mineral Oil"], xpressNames: ["MINERAL OIL"] };
const products = [barite, sawdust, oil];

function stock(items, extra = {}) {
  return { date: "2026-11-05", source: "xpress", warehouseCode: "CANNK", warehouseName: "Cannk", collectedAt: "2026-11-05T15:15:00.000Z", items, ...extra };
}

function well(fields) {
  return { status: "active", operator: "Strathcona", rig: "Horizon 55", firstReportDate: "2026-10-01", lastReportDate: "2026-10-20", ...fields };
}

function line(kind, ticket, date, rows) {
  return { kind, ticket, date, products: rows.map(([name, qty, pack]) => ({ name, qty, pack })) };
}

test("in stock is committed plus available, and packaging is not a chemical", () => {
  assert.equal(stockInHand({ committed: 4, available: 6, onHand: 99 }), 10);
  assert.equal(stockInHand({ onHand: 8 }), 8);
  assert.equal(isPackagingOrFee("Empty Drums"), true);
  assert.equal(isPackagingOrFee("Pallet Recycling"), true);
  assert.equal(isPackagingOrFee("MSDS Book"), true);
  assert.equal(isPackagingOrFee("Stretch Wrap"), true);
  assert.equal(isPackagingOrFee("C-U Charge"), true);
  assert.equal(isPackagingOrFee("Envirobags"), true);
  assert.equal(isPackagingOrFee("Tote Recycling"), true);
  assert.equal(isPackagingOrFee("ATP Test Kit"), true);
  assert.equal(isPackagingOrFee("CAL CHLORIDE HT POWDER (40kg) 40/PALLET"), false);
  assert.equal(parsePack("40 kg").label, "40 kg");
  assert.equal(parsePack("", "BARITE (25 KG)").label, "25 kg");
  assert.equal(parsePack("1 L").litre, true);
  assert.equal(parsePack("19 L").litre, false);
  assert.equal(parsePack("18 L").label, "19 L");
  assert.equal(parsePack("18 L").litre, false);
  assert.equal(parsePack("18 kg").label, "18 kg");
  assert.equal(parsePack("20 L").label, "20 L");
  assert.equal(parsePack("18.93 L").label, "18.93 L");
});

test("warehouse count ignores transit, MIM, packaging, and keeps pack sizes apart", () => {
  const result = buildInvXpress({
    products,
    stock: [
      stock([
        { name: "BARITE", unit: "40 kg", committed: 20, available: 80, inTransit: 5 },
        { name: "BARITE", unit: "25 kg", committed: 1, available: 9, inTransit: 0 },
        { name: "Empty Drums", unit: "unit", committed: 0, available: 500, inTransit: 0 },
        { name: "Pallets", unit: "unit", onHand: 40, committed: 0, available: 40 },
        { name: "SAWDUST", unit: "7.3 kg", committed: 0, available: 12, inTransit: 2 },
      ]),
      stock([{ name: "BARITE", unit: "40 kg", committed: 3, available: 7 }], { warehouseCode: "TBAR", warehouseName: "Taber" }),
      { date: "2026-11-04", source: "xpress", warehouseCode: "CANNK", items: [{ name: "BARITE", unit: "40 kg", committed: 0, available: 999 }] },
      { date: "2026-11-05", source: "mim", warehouseCode: "ALCHEM", items: [{ name: "BARITE", unit: "40 kg", committed: 0, available: 999 }] },
    ],
    wells: [],
    reports: [],
  });
  assert.equal(result.summary.warehouses.units, 20 + 80 + 1 + 9 + 12 + 3 + 7);
  assert.equal(result.summary.warehouses.committed, 24);
  assert.equal(result.summary.warehouses.available, result.summary.warehouses.units - 24);
  assert.equal(result.summary.warehouses.inTransit, 7);
  assert.equal(result.summary.warehouses.warehouseCount, 2);
  assert.equal(result.summary.total.units, result.summary.warehouses.units);
  const forty = result.products.find((row) => row.name === "Barite" && row.pack === "40 kg");
  const twenty = result.products.find((row) => row.name === "Barite" && row.pack === "25 kg");
  assert.equal(forty.warehouses, 110);
  assert.equal(forty.byWarehouse.find((row) => row.code === "CANNK").units, 100);
  assert.equal(twenty.warehouses, 10);
  assert.equal(result.products.some((row) => /drum|pallet/i.test(row.name)), false);
  assert.equal(result.unlinked.length, 0);
});

test("a rig group counts deliveries once when pad wells transfer between themselves", () => {
  const oldWell = well({ id: "old", name: "Meota S3", firstReportDate: "2026-10-01", lastReportDate: "2026-10-19" });
  const mid = well({ id: "mid", name: "Meota S4", firstReportDate: "2026-10-20", lastReportDate: "2026-10-28" });
  const current = well({ id: "new", name: "Meota P4", firstReportDate: "2026-10-29", lastReportDate: "2026-11-05" });
  const result = buildInvXpress({
    products,
    stock: [],
    wells: [oldWell, mid, current, well({ id: "test", name: "Horizon Test", rig: "Horizon 55" }), well({ id: "done", name: "Old Pad", status: "completed", rig: "Horizon 55" })],
    reports: [
      { id: "r1", wellId: "old", date: "2026-10-19", received: [line("received", "NK-1", "2026-10-02", [["Barite", 100, "40 kg"], ["Sawdust", 50, "7.3 kg"]])], returned: [line("transferOut", "T-OLD", "2026-10-19", [["Barite", 60, "40 kg"], ["Sawdust", 50, "7.3 kg"]])] },
      { id: "r2", wellId: "mid", date: "2026-10-28", received: [line("transferIn", "T-OLD", "2026-10-19", [["Barite", 60, "40 kg"], ["Sawdust", 50, "7.3 kg"]]), line("received", "NK-2", "2026-10-21", [["Barite", 30, "40 kg"]])], returned: [line("transferOut", "T-MID", "2026-10-28", [["Barite", 70, "40 kg"], ["Sawdust", 40, "7.3 kg"]])] },
      { id: "r3", wellId: "new", date: "2026-11-05", received: [line("transferIn", "T-MID", "2026-10-28", [["Barite", 70, "40 kg"], ["Sawdust", 40, "7.3 kg"]]), line("received", "NK-3", "2026-11-01", [["Barite", 20, "40 kg"], ["Mineral Oil", 500, "1 L"]])], returned: [], remaining: [{ product: "Barite", qty: 12, unit: "40 kg" }] },
      { id: "r4", wellId: "test", date: "2026-11-01", received: [line("received", "NK-9", "2026-11-01", [["Barite", 999, "40 kg"]])], returned: [] },
    ],
  });
  const bariteRow = result.products.find((row) => row.name === "Barite" && row.pack === "40 kg");
  assert.equal(bariteRow.wells, 150);
  assert.equal(bariteRow.byWell.length, 1);
  assert.equal(bariteRow.byWell[0].name, "Meota P4");
  const saw = result.products.find((row) => row.name === "Sawdust");
  assert.equal(saw.wells, 50);
  assert.equal(result.summary.wells.units, 200);
  assert.equal(result.summary.litres.wellUnits, 500);
  assert.equal(result.summary.litres.total, 500);
  assert.equal(result.summary.total.units, 200);
  assert.equal(result.summary.wells.wellCount, 3);
  const shown = result.wells.find((row) => row.id === "new");
  assert.equal(shown.role, "current");
  assert.equal(shown.counted, 200);
  assert.equal(shown.products.find((row) => row.name === "Barite").left, 12);
  assert.equal(result.wells.find((row) => row.id === "old").role, "finished");
  assert.match(result.wells.find((row) => row.id === "old").reason, /Product moved to Meota S4 on 2026-10-19/);
  assert.equal(result.wells.find((row) => row.id === "old").counted, 0);
  assert.equal(result.wells.some((row) => row.id === "test"), false);
});

test("usage on an older well still counts, and a negative product line floors at zero", () => {
  const result = buildInvXpress({
    products,
    wells: [well({ id: "old", name: "Old", lastReportDate: "2026-10-10" }), well({ id: "new", name: "New", firstReportDate: "2026-10-11", lastReportDate: "2026-11-05" })],
    reports: [
      { id: "a", wellId: "old", date: "2026-10-10", received: [line("received", "NK-1", "2026-10-02", [["Barite", 100, "40 kg"], ["Sawdust", 10, "7.3 kg"]])], returned: [line("transferOut", "T1", "2026-10-10", [["Barite", 40, "40 kg"]]), line("returned", "CT-1", "2026-10-10", [["Sawdust", 25, "7.3 kg"]])] },
      { id: "b", wellId: "new", date: "2026-11-05", received: [line("transferIn", "T1", "2026-10-10", [["Barite", 40, "40 kg"]])], returned: [] },
    ],
  });
  assert.equal(result.products.find((row) => row.name === "Barite").wells, 100);
  assert.equal(result.products.find((row) => row.name === "Sawdust"), undefined);
  assert.equal(result.summary.wells.units, 100);
  assert.equal(result.wells.find((row) => row.role === "current").products.find((row) => row.name === "Sawdust").counted, 0);
});

test("different operators on one rig number stay split unless a transfer links them", () => {
  const shared = {
    products,
    stock: [],
    wells: [
      well({ id: "a", name: "Alpha 1", operator: "Cardinal", rig: "Rig 7", firstReportDate: "2026-10-01", lastReportDate: "2026-11-02" }),
      well({ id: "b", name: "Beta 1", operator: "CNRL", rig: "7", firstReportDate: "2026-10-15", lastReportDate: "2026-11-03" }),
    ],
  };
  const apart = buildInvXpress({
    ...shared,
    reports: [
      { id: "a", wellId: "a", date: "2026-11-02", received: [line("received", "NK-1", "2026-10-20", [["Barite", 40, "40 kg"]])], returned: [] },
      { id: "b", wellId: "b", date: "2026-11-03", received: [line("received", "NK-2", "2026-10-22", [["Barite", 15, "40 kg"]])], returned: [] },
    ],
  });
  assert.equal(apart.groups.length, 2);
  assert.equal(apart.summary.wells.units, 55);
  assert.equal(apart.splits.length, 1);
  assert.equal(apart.wells.filter((row) => row.role === "current").length, 2);

  const linked = buildInvXpress({
    ...shared,
    reports: [
      { id: "a", wellId: "a", date: "2026-11-02", received: [line("received", "NK-1", "2026-10-20", [["Barite", 40, "40 kg"]])], returned: [line("transferOut", "T-X", "2026-10-28", [["Barite", 10, "40 kg"]])] },
      { id: "b", wellId: "b", date: "2026-11-03", received: [line("transferIn", "T-X", "2026-10-28", [["Barite", 10, "40 kg"]]), line("received", "NK-2", "2026-10-22", [["Barite", 15, "40 kg"]])], returned: [] },
    ],
  });
  assert.equal(linked.groups.length, 1);
  assert.equal(linked.summary.wells.units, 55);
  assert.equal(linked.wells.filter((row) => row.role === "current").length, 1);
});

test("the same rig number on different rig names is not one group", () => {
  const result = buildInvXpress({
    products,
    wells: [
      well({ id: "h", name: "Horizon hole", operator: "CNRL", rig: "Horizon 55", lastReportDate: "2026-11-02" }),
      well({ id: "p", name: "Precision hole", operator: "CNRL", rig: "Precision 55", lastReportDate: "2026-11-02" }),
    ],
    reports: [
      { id: "h", wellId: "h", date: "2026-11-02", received: [line("received", "NK-1", "2026-11-01", [["Barite", 10, "40 kg"]])], returned: [line("transferOut", "T-RIG", "2026-11-02", [["Barite", 4, "40 kg"]])] },
      { id: "p", wellId: "p", date: "2026-11-02", received: [line("transferIn", "T-RIG", "2026-11-02", [["Barite", 4, "40 kg"]])], returned: [] },
    ],
  });
  assert.equal(result.groups.length, 2);
  assert.equal(result.summary.wells.units, 10);
  assert.equal(result.summary.wells.movedOut, 4);
  assert.equal(result.summary.wells.transferredIn, 4);
});

test("names link on a normalised match or an override, never a fuzzy pair", () => {
  const result = buildInvXpress({
    products: [{ id: "app_lvd", name: "UniPAC LVD", appNames: ["UniPAC LVD"], xpressNames: ["UNIPAC LVD", "UNIPAC LVD (22.7 KG)"] }],
    links: { xpress: { "SUPER GEL 25KG": "app_lvd" } },
    stock: [stock([
      { name: "UNIPAC LVD (22.7 KG)", unit: "22.7 kg", committed: 0, available: 8 },
      { name: "SUPER GEL 25KG", unit: "25 kg", committed: 0, available: 3 },
      { name: "MYSTERY POLYMER 25KG", unit: "25 kg", committed: 1, available: 4 },
      { name: "Unipac-LVD", unit: "22.7 kg", committed: 0, available: 2 },
    ])],
    wells: [well({ id: "w", name: "Hole", lastReportDate: "2026-11-01" })],
    reports: [{ id: "r", wellId: "w", date: "2026-11-01", received: [line("received", "NK-1", "2026-11-01", [["UniPAC LVD", 6, "22.7 kg"], ["Mystery Polymer", 9, "25 kg"]])], returned: [] }],
  });
  const linked = result.products.find((row) => row.productId === "app_lvd" && row.pack === "22.7 kg");
  assert.equal(linked.warehouses, 10);
  assert.equal(linked.wells, 6);
  assert.equal(linked.linked, true);
  const overridden = result.products.find((row) => row.pack === "25 kg" && row.productId === "app_lvd");
  assert.equal(overridden.warehouses, 3);
  assert.equal(overridden.link, "override");
  const loose = result.products.find((row) => row.name === "MYSTERY POLYMER" && row.pack === "25 kg");
  assert.equal(loose.linked, false);
  assert.equal(loose.warehouses, 5);
  assert.equal(loose.wells, 9);
  assert.equal(result.products.filter((row) => /mystery/i.test(row.name)).length, 1);
  assert.deepEqual(result.unlinked.map((row) => row.name), ["MYSTERY POLYMER 25KG"]);
});

test("active-pause counts, a transfer out of the active set is removed, and duplicate report lines count once", () => {
  const result = buildInvXpress({
    products,
    wells: [
      well({ id: "p", name: "Paused hole", status: "active-pause", operator: "Headwater", rig: "Ensign 859", lastReportDate: "2026-11-04" }),
      well({ id: "quiet", name: "No report yet", operator: "Headwater", rig: "Ensign 100", firstReportDate: "", lastReportDate: "", spudDate: "" }),
    ],
    reports: [
      { id: "p1", wellId: "p", date: "2026-11-03", received: [line("received", "NK-1", "2026-11-01", [["Barite", 20, "40 kg"]])], returned: [line("transferOut", "T-GONE", "2026-11-03", [["Barite", 5, "40 kg"]])] },
      { id: "p2", wellId: "p", date: "2026-11-04", received: [line("received", "NK-1", "2026-11-01", [["Barite", 20, "40 kg"]])], returned: [line("transferOut", "T-GONE", "2026-11-03", [["Barite", 5, "40 kg"]])] },
    ],
  });
  assert.equal(result.summary.wells.paused, 1);
  assert.equal(result.summary.wells.active, 1);
  assert.equal(result.summary.wells.noReports, 1);
  assert.equal(result.products.find((row) => row.name === "Barite").wells, 15);
  assert.equal(result.summary.wells.movedOut, 5);
});

test("an exact 18 L pail joins the 19 L row of the same product", () => {
  const result = buildInvXpress({
    products: [
      { id: "app_g15", name: "UniCide G15", appNames: ["UniCide G15"], xpressNames: ["UNICIDE G15 (18 L)", "UNICIDE G15 (19 L)"] },
      { id: "app_break", name: "UniBreak 1", appNames: ["UniBreak 1"], xpressNames: ["UNIBREAK 1 (18 L)"] },
      { id: "app_barite", name: "Barite", appNames: ["Barite"], xpressNames: ["BARITE"] },
      oil,
    ],
    stock: [stock([
      { name: "UNICIDE G15 (18 L)", unit: "18 L", committed: 15, available: 105, inTransit: 4 },
      { name: "UNICIDE G15 (19 L)", unit: "19 L", committed: 5, available: 35, inTransit: 0 },
      { name: "UNIBREAK 1 (18 L)", unit: "18 L", committed: 3, available: 9, inTransit: 0 },
      { name: "BARITE", unit: "18 kg", committed: 0, available: 7, inTransit: 0 },
      { name: "MINERAL OIL", unit: "1 L", committed: 0, available: 6, inTransit: 0 },
      { name: "UNICIDE G15", unit: "20 L", committed: 0, available: 2, inTransit: 0 },
    ])],
    wells: [well({ id: "w", name: "Kent", lastReportDate: "2026-11-01" })],
    reports: [{
      id: "r", wellId: "w", date: "2026-11-01",
      received: [line("received", "NK-1", "2026-11-01", [["UniCide G15", 30, "18 L"], ["UniCide G15", 10, "19 L"], ["UniBreak 1", 8, "18 L"], ["Mineral Oil", 20, "1 L"]])],
      returned: [],
    }],
  });
  const g15 = result.products.filter((row) => row.name === "UniCide G15");
  const pail = g15.find((row) => row.pack === "19 L");
  assert.equal(g15.some((row) => row.pack === "18 L"), false);
  assert.equal(pail.warehouses, 160);
  assert.equal(pail.wells, 40);
  assert.equal(pail.total, 200);
  assert.equal(pail.committed, 20);
  assert.equal(pail.inTransit, 4);
  assert.deepEqual(pail.xpressNames, ["UNICIDE G15 (18 L)", "UNICIDE G15 (19 L)"]);
  const unibreak = result.products.find((row) => row.name === "UniBreak 1");
  assert.equal(unibreak.pack, "19 L");
  assert.equal(unibreak.warehouses, 12);
  assert.equal(unibreak.wells, 8);
  assert.notEqual(unibreak.key, pail.key);
  assert.equal(result.products.find((row) => row.name === "Barite").pack, "18 kg");
  assert.equal(result.products.find((row) => row.name === "UniCide G15" && row.pack === "20 L").warehouses, 2);
  const mineral = result.products.find((row) => row.name === "Mineral Oil");
  assert.equal(mineral.pack, "1 L");
  assert.equal(mineral.litre, true);
  const unitLines = 160 + 12 + 7 + 2;
  const unitWells = 40 + 8;
  assert.equal(result.summary.warehouses.units, unitLines);
  assert.equal(result.summary.wells.units, unitWells);
  assert.equal(result.summary.total.units, unitLines + unitWells);
  assert.equal(result.summary.litres.total, 26);
});

test("packed documents round-trip under the size limit", () => {
  const products = Array.from({ length: 40 }, (_, index) => ({ id: `p${index}`, name: `Product ${index}`, appNames: [`Product ${index}`] }));
  const stockItems = products.map((product, index) => ({ name: product.name, unit: "25 kg", committed: 1, available: index + 1 }));
  const result = buildInvXpress({ products, stock: [stock(stockItems)], wells: [], reports: [] });
  const packed = packInvXpress(result, 8_000);
  assert.ok(packed.parts.length > 1);
  assert.ok(Buffer.byteLength(JSON.stringify(packed.header)) < 8_000);
  for (const part of packed.parts) assert.ok(Buffer.byteLength(JSON.stringify(part)) < 12_000);
  const back = assembleInvXpress(packed.header, packed.parts);
  assert.equal(back.products.length, result.products.length);
  assert.equal(back.summary.warehouses.units, result.summary.warehouses.units);
  const small = packInvXpress(result, 5_000_000);
  assert.equal(small.parts.length, 0);
  assert.equal(assembleInvXpress(small.header).products.length, result.products.length);
});

test("the preview sample is the rig-group count", () => {
  const result = buildInvXpress(demoInput());
  assert.equal(result.summary.warehouses.inTransit, 2555);
  assert.equal(result.summary.wells.units, sample.summary.wells.units);
  assert.equal(result.groups.find((group) => group.rig === "Horizon 55").counted, 3246);
  assert.equal(result.wells.some((well) => /test/i.test(well.name)), false);
  assert.equal(result.products.some((row) => /drum|pallet|envirobag|atp test|c-u/i.test(row.name)), false);
  assert.equal(result.summary.total.units, result.summary.warehouses.units + result.summary.wells.units);
  assert.equal(result.summary.litres.total > 0 && result.summary.total.units !== result.summary.total.units + result.summary.litres.total, true);
});
