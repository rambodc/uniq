import assert from "node:assert/strict";
import test from "node:test";
import { collectMirrorLines, createCoverage, gcloudAccessToken, mirrorAccount, MIRROR_ACCOUNT, pacedPool, stripPrices, wellOverlapsMirror } from "../inventoryBot/mirrorUsage.js";
import { applyHistory, buildProductUsage, containerOf, reportInWindow, usageWindow, usedLines, usedLinesFromReport } from "../inventoryBot/productUsage.js";
import { matchUniquem, productStem } from "../inventoryBot/uniquem.js";

const NOW = "2026-11-09T18:00:00.000Z";

function line(date, name, qty, unit, extra = {}) {
  return { wellId: "w", reportId: date, date, name, qty, unit, ...extra };
}

test("the window is twelve Edmonton months and the current month is partial", () => {
  const window = usageWindow(new Date(NOW));
  assert.equal(window.today, "2026-11-09");
  assert.equal(window.partial, true);
  assert.deepEqual(window.months, ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(window.recent.start, "2026-09-11");
  assert.equal(window.season30.start, "2025-11-10");
  assert.equal(window.season30.end, "2025-12-09");
  assert.equal(window.season60.end, "2026-01-08");
  assert.equal(reportInWindow("2025-11-09_report", window), false);
  assert.equal(reportInWindow("2025-11-10_report", window), true);
  assert.equal(reportInWindow("2026-11-09_report", window), true);
  assert.equal(reportInWindow("2026-11-10_report", window), false);
});

test("used lines keep the used quantity and ignore receipts and zeros", () => {
  const lines = usedLines({
    lines: [
      { productname: "Fusion", unit: "22.68 kg", used: 13, price: 90, remaining: 4 },
      { productname: "Targone", unit: "19 L", used: 0, price: 10 },
      { productname: "Sawdust", unit: "7.3 kg", received: 40 },
    ],
  });
  assert.deepEqual(lines.map((row) => row.name), ["Fusion"]);
  assert.equal(lines[0].qty, 13);
  assert.equal("price" in lines[0], false);
  const report = usedLinesFromReport({
    used: [{ productname: "Elixir", unit: "19 L", used: 2 }],
    inventory: { used: { lines: [{ productname: "Elixir", unit: "19 L", used: 2 }, { productname: "Helix", unit: "200 L", used: 1 }] } },
  });
  assert.deepEqual(report.map((row) => row.name), ["Elixir", "Helix"]);
});

test("18 L and 19 L pails add, litres stay separate, and packaging is dropped", () => {
  const result = buildProductUsage({
    now: NOW,
    products: [{ id: "app_targone", name: "Targone", appNames: ["Targone"] }, { id: "app_oil", name: "Mineral Oil" }],
    lines: [
      line("2026-10-02", "Targone", 2, "18 L"),
      line("2026-10-03", "Targone", 3, "19 L"),
      line("2026-10-04", "Mineral Oil", 40, "1 L"),
      line("2026-10-04", "Empty Drums", 6, "Each"),
    ],
    stock: [
      { key: "app_targone|19 L", name: "Targone", pack: "19 L", litre: false, total: 4 },
      { key: "app_oil|1 L", name: "Mineral Oil", pack: "1 L", litre: true, total: 100 },
    ],
  });
  const pail = result.products.find((row) => row.name === "Targone");
  assert.equal(pail.pack, "19 L");
  assert.equal(pail.total, 5);
  assert.equal(pail.container, "pail");
  assert.equal(pail.litre, false);
  assert.equal(pail.onHand, 4);
  const oil = result.products.find((row) => row.name === "Mineral Oil");
  assert.equal(oil.litre, true);
  assert.equal(oil.container, "");
  assert.equal(result.products.some((row) => row.name === "Empty Drums"), false);
  assert.equal(JSON.stringify(result).includes("\"price\""), false);
  assert.equal(result.summary.productCount, result.products.filter((row) => !row.litre).length);
  assert.equal(result.summary.litreCount, 1);
});

test("the forecast blends the last 60 days with the same dates last year", () => {
  const result = buildProductUsage({
    now: NOW,
    lines: [
      line("2026-10-01", "Barite", 60, "40 kg"),
      line("2025-11-15", "Barite", 30, "40 kg"),
    ],
    stock: [{ key: "name:barite|40 kg", name: "Barite", pack: "40 kg", litre: false, total: 16 }],
  });
  const row = result.products.find((item) => item.name === "Barite");
  assert.equal(row.months[10], 60);
  assert.equal(row.months[11], 0);
  assert.equal(row.total, 60);
  assert.equal(row.average, 5);
  assert.equal(row.forecast30, 30);
  assert.equal(row.forecast60, 48);
  assert.equal(row.days, 20);
  assert.equal(row.status, "order");
  assert.equal(row.container, "bag");
  assert.equal(row.uniquem, false);
});

test("cover bands are order, soon, healthy, overstock, and no usage", () => {
  const bands = buildProductUsage({
    now: NOW,
    lines: [
      line("2026-10-01", "Soon", 60, "19 L"),
      line("2025-11-15", "Soon", 30, "19 L"),
      line("2026-10-01", "Healthy", 60, "25 kg"),
      line("2025-11-15", "Healthy", 30, "25 kg"),
      line("2026-10-01", "Heavy", 60, "22.7 kg"),
    ],
    stock: [
      { key: "name:soon|19 L", name: "Soon", pack: "19 L", total: 40 },
      { key: "name:healthy|25 kg", name: "Healthy", pack: "25 kg", total: 90 },
      { key: "name:heavy|22.7 kg", name: "Heavy", pack: "22.7 kg", total: 1000 },
      { key: "name:idle salt|25 kg", name: "Idle Salt", pack: "25 kg", total: 12 },
    ],
  });
  const status = (name) => bands.products.find((row) => row.name === name).status;
  assert.equal(status("Soon"), "soon");
  assert.equal(status("Healthy"), "ok");
  assert.equal(status("Heavy"), "over");
  assert.equal(status("Idle Salt"), "idle");
  assert.equal(bands.summary.orderNow, 0);
  assert.equal(bands.summary.orderSoon, 1);
  assert.equal(bands.summary.healthy, 1);
  assert.equal(bands.summary.overstock, 1);
  assert.equal(bands.summary.noUsage, 1);
});

test("Uniq-PAC LV and UniPAC LVD share a row and a badge, and HV stays separate", () => {
  const result = buildProductUsage({
    now: NOW,
    lines: [
      line("2026-10-05", "Uniq-PAC LV", 4, "22.7 kg"),
      line("2026-10-06", "UniPAC LVD", 6, "22.7 kg"),
      line("2026-10-06", "UniPAC HVD", 2, "22.7 kg"),
    ],
    stock: [{ key: "app_lv|22.7 kg", name: "UniPAC LVD", pack: "22.7 kg", productId: "app_lv", total: 8 }],
    products: [{ id: "app_lv", name: "UniPAC LVD", appNames: ["UniPAC LVD"] }],
  });
  const lv = result.products.filter((row) => row.uniquemLabel === "UniPAC LV");
  assert.equal(lv.length, 1);
  assert.equal(lv[0].total, 10);
  assert.equal(lv[0].onHand, 8);
  assert.equal(lv[0].name, "UniPAC LVD");
  const hv = result.products.find((row) => row.uniquemLabel === "UniPAC HV");
  assert.equal(hv.total, 2);
  assert.equal(hv.key === lv[0].key, false);
});

test("container icons follow the pack", () => {
  assert.equal(containerOf("Targone", { label: "19 L", family: "L", amount: 19 }), "pail");
  assert.equal(containerOf("Elixir", { label: "200 L", family: "L", amount: 200 }), "drum");
  assert.equal(containerOf("Terminox", { label: "1000 L", family: "L", amount: 1000 }), "tote");
  assert.equal(containerOf("Fusion", { label: "22.68 kg", family: "kg", amount: 22.68 }), "bag");
  assert.equal(containerOf("Sawdust sack", { label: "unit", family: "", amount: 0 }), "bag");
  assert.equal(containerOf("Mineral Oil", { label: "1 L", family: "L", amount: 1 }), "");
  assert.equal(containerOf("Mystery", { label: "Each", family: "", amount: 0 }), "");
});

test("Uniquem matching ignores packaging and does not badge generic lines", () => {
  assert.equal(matchUniquem("Uniq-PAC LV Bag (22.7kg/bag) (40 bags/pallet)").id, "unipac-lv");
  assert.equal(matchUniquem("Pallet of Uniq-Pac LV").id, "unipac-lv");
  assert.equal(matchUniquem("UniPAC LVD").id, "unipac-lv");
  assert.equal(matchUniquem("UniPAC HVD").id, "unipac-hv");
  assert.equal(matchUniquem("U-Scav").id, "u-scav");
  assert.equal(matchUniquem("U Scav").id, "u-scav");
  assert.equal(matchUniquem("UniCorr Clear").id, "unicorr-clear");
  assert.equal(matchUniquem("UniCorr P").id, "unicorr-p");
  assert.equal(matchUniquem("UniCorr"), null);
  assert.equal(matchUniquem("Terminox").id, "terminox");
  assert.equal(matchUniquem("Terminox S").id, "terminox-s");
  assert.equal(matchUniquem("Terminox Pails (19L/pail)").id, "terminox");
  assert.equal(matchUniquem("ZAN HD").id, "zan-hd");
  assert.equal(matchUniquem("SoluBlok").id, "solublok");
  assert.equal(matchUniquem("Elixir").id, "elixir");
  assert.equal(matchUniquem("EZ-Slide L").id, "ez-slide");
  assert.equal(matchUniquem("Barite"), null);
  assert.equal(matchUniquem("Clay"), null);
  assert.equal(matchUniquem("Polymer"), null);
  assert.equal(matchUniquem("Polymer Base"), null);
  assert.equal(matchUniquem("Fiber"), null);
  assert.equal(matchUniquem("DT"), null);
  assert.equal(matchUniquem("GE"), null);
  assert.equal(matchUniquem("SUC"), null);
  assert.equal(matchUniquem("GST"), null);
  assert.equal(matchUniquem("22.7kg Bag"), null);
  assert.equal(matchUniquem("Misc."), null);
  assert.equal(productStem("Uniq-RM"), productStem("Uniq RM"));
});

test("price fields are dropped before a used node is kept", () => {
  const cleaned = stripPrices({ 0: { productname: "Elixir", unit: "19 L", used: 2, price: 90, remaining: 1 }, price: 10 });
  assert.equal(JSON.stringify(cleaned).includes("price"), false);
  assert.equal(cleaned[0].used, 2);
  assert.equal(cleaned[0].remaining, 1);
});

test("months before the first mirror report are blank instead of zero", () => {
  const built = buildProductUsage({
    now: NOW,
    lines: [line("2026-10-01", "Elixir", 12, "19 L"), line("2026-08-15", "Elixir", 6, "19 L")],
    stock: [{ key: "name:elixir|19 L", name: "Elixir", pack: "19 L", total: 4 }],
  });
  const result = applyHistory(built, "2026-08", built.months.map((month) => ({ month, listed: month >= "2026-08" ? 1 : 0, reports: month >= "2026-08" ? 1 : 0, wells: month >= "2026-08" ? 1 : 0 })));
  const row = result.products.find((item) => item.name === "Elixir");
  assert.equal(result.historyStart, "2026-08");
  assert.equal(row.months[0], null);
  assert.equal(row.months[7], null);
  assert.equal(row.months[8], 6);
  assert.equal(row.months[10], 12);
  assert.equal(row.total, 18);
  assert.equal(row.average, 4.5);
});

async function pool(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

test("the mirror reader lists only wells that can overlap the window and skips archive duplicates", async () => {
  const window = usageWindow(new Date(NOW));
  assert.equal(wellOverlapsMirror("2026-12-01_future", window), false);
  assert.equal(wellOverlapsMirror("2024-01-01_old", window), false);
  assert.equal(wellOverlapsMirror("2026-08-01_well", window), true);
  assert.equal(wellOverlapsMirror("2025-11-01_edge", window), true);
  const calls = [];
  const get = async (path, options = {}) => {
    calls.push(`${options.shallow ? "shallow " : ""}${path}`);
    if (path === "data/wellReports") return { "2026-08-01_well": true, "2026-12-01_future": true, "2024-01-01_old": true, "2026-09-01_test": true };
    if (path.endsWith("2026-08-01_well")) return { "2026-08-02_kept": true, "2026-07-01_new": true, "2025-01-01_early": true };
    if (path.endsWith("inventory/used")) return { 0: { productname: "Elixir", unit: "19 L", used: 2, price: 90 } };
    return null;
  };
  const coverage = createCoverage(window.months);
  const seen = new Set(["2026-08-01_well/2026-08-02_kept"]);
  const found = await collectMirrorLines({ get, window, seen, seenListed: new Set(["2026-08-01_well/2026-08-02_kept"]), coverage, pool, pace: false });
  assert.equal(found.reads.wells, 1);
  assert.equal(found.reads.reportLists, 1);
  assert.equal(found.reads.skippedWells, 2);
  assert.equal(found.reads.used, 1);
  assert.equal(found.reads.skippedDuplicate, 1);
  assert.equal(found.lines.length, 1);
  assert.equal(found.lines[0].reportId, "2026-07-01_new");
  assert.equal(found.lines[0].qty, 2);
  assert.equal(JSON.stringify(found.lines).includes("price"), false);
  assert.equal(calls.some((call) => call.includes("2026-12-01_future")), false);
  assert.equal(calls.some((call) => call.includes("2024-01-01_old")), false);
  assert.equal(calls.some((call) => call.includes("2026-08-02_kept/inventory/used")), false);
  assert.equal(calls.some((call) => call.includes("2025-01-01_early/inventory/used")), false);
  assert.equal(coverage.historyStart(), "2025-01");
  const july = coverage.snapshot().find((row) => row.month === "2026-07");
  assert.equal(july.reports, 1);
  assert.equal(july.wells, 1);
});

test("mirror auth is the gcloud user token, with MIRROR_ACCOUNT as the override", async () => {
  assert.equal(MIRROR_ACCOUNT, "rambodr@uniquem.ca");
  assert.equal(mirrorAccount({}), "rambodr@uniquem.ca");
  assert.equal(mirrorAccount({ MIRROR_ACCOUNT: " other@uniquem.ca " }), "other@uniquem.ca");
  const calls = [];
  const token = await gcloudAccessToken("rambodr@uniquem.ca", async (command, args) => {
    calls.push([command, ...args]);
    return { stdout: "ya29.token\n" };
  });
  assert.equal(token, "ya29.token");
  assert.deepEqual(calls, [["gcloud", "auth", "print-access-token", "rambodr@uniquem.ca"]]);
  const seen = [];
  await pacedPool([1, 2, 3], { concurrency: 2, perSecond: 1000 }, async (item) => { seen.push(item); });
  assert.deepEqual(seen.sort(), [1, 2, 3]);
});
