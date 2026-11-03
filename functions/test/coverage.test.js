import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFlag, buildCoverage, compactStockItems, isLegacyReviewId, looseTicket, movedReviewFlag, reconcileCoverage, reviewDocuments, sequenceGaps } from "../inventoryBot/coverage.js";
import { DEFAULT_IGNORE_STOCK_NAMES, indexProducts, isIgnoredStockItem, resolveLine, ticketsMatch } from "../inventoryBot/engine.js";

const well = (fields) => ({ id: "w1", name: "North Pad", lsd: "9-26-55-4W4", lsdNorm: "9-26-55-4W4", rig: "245", contractor: "Ensign", status: "active", ...fields });
const ticket = (fields) => ({ id: "xpress_NK-DT-004806", source: "xpress", company: "uniqenergy", type: "DT", warehouseCode: "NK", rig: "245", lsd: "9-26-55-4W4", postedAt: "2026-11-01", lines: [{ code: "ELX", name: "Elixir", qty: 4 }], ...fields });

test("a missing dash still matches the warehouse ticket number", () => {
  assert.equal(ticketsMatch(looseTicket("NK4806"), looseTicket("NK-DT-004806")), "fuzzy");
  assert.equal(ticketsMatch(looseTicket("BRKS-000537"), looseTicket("BRKS-DT-000537")), "fuzzy");
  const result = buildCoverage({
    date: "2026-11-02",
    config: { graceDays: 3 },
    wells: [well({})],
    tickets: [ticket({})],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK4806", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  const row = result.ticketStatus[0];
  assert.equal(row.status, "logged");
  assert.equal(row.match, "typo");
  assert.equal(row.lagDays, 1);
  assert.equal(row.wellId, "w1");
});

test("an Alchem bare number matches only when the well location agrees", () => {
  const alchem = ticket({ id: "mim_DTAWEY011648", source: "mim", company: "alchem", type: "DT", warehouseCode: "AWEY", postedAt: "2026-11-02", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12" });
  const logged = buildCoverage({
    date: "2026-11-02",
    wells: [well({ id: "tundra", name: "Tundra", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12" })],
    tickets: [alchem],
    appTickets: [{ id: "tundra_r", wellId: "tundra", kind: "received", rawTicket: "11648", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(logged.ticketStatus[0].status, "logged");
  assert.equal(logged.ticketStatus[0].match, "alchem");
  const elsewhere = buildCoverage({
    date: "2026-11-02",
    wells: [well({ id: "other", lsd: "1-1-1-1W4", lsdNorm: "1-1-1-1W4", rig: "99" })],
    tickets: [alchem],
    appTickets: [{ id: "other_r", wellId: "other", kind: "received", rawTicket: "11648", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(elsewhere.ticketStatus[0].status, "pending");
  assert.equal(elsewhere.ticketStatus[0].match, "none");
});

test("a delivery older than the grace period is overdue and escalates at seven days", () => {
  const fresh = buildCoverage({ date: "2026-11-02", config: { graceDays: 3 }, wells: [well({})], tickets: [ticket({ postedAt: "2026-11-02" })] });
  assert.equal(fresh.ticketStatus[0].status, "pending");
  assert.equal(fresh.ticketStatus[0].escalate, false);
  const late = buildCoverage({ date: "2026-11-02", config: { graceDays: 3 }, wells: [well({})], tickets: [ticket({ postedAt: "2026-10-20" })] });
  assert.equal(late.ticketStatus[0].status, "overdue");
  assert.equal(late.ticketStatus[0].escalate, true);
  assert.equal(late.ticketStatus[0].wellId, "w1");
});

test("receipts, adjustments, transfers, and handling charges are not well-bound", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    tickets: [
      ticket({ id: "xpress_WBFS-MR-1", type: "MR" }),
      ticket({ id: "mim_ATAWEY1", type: "AT", source: "mim" }),
      ticket({ id: "xpress_WBFS-ST-1", type: "ST" }),
      ticket({ id: "mim_TTPROS1", type: "TT", source: "mim" }),
      ticket({ id: "xpress_NK-DT-004804", type: "DT", wellName: "Warehouse Sale" }),
    ],
  });
  assert.deepEqual(result.ticketStatus.map((row) => row.reason), [
    "Receipt into the warehouse",
    "Adjustment or blend",
    "Warehouse transfer",
    "Handling charge",
    "Warehouse sale",
  ]);
  assert.equal(result.counts.not_well_bound, 5);
});

test("a quantity or location difference is a mismatch", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({ lsdNorm: "1-1-1-1W5", lsd: "1-1-1-1W5" })],
    tickets: [ticket({ lsd: "9-26-55-4W4", lsdNorm: "9-26-55-4W4", lines: [{ name: "Elixir", qty: 4 }] })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-01", lines: [{ name: "Elixir", qty: 9 }] }],
  });
  assert.equal(result.ticketStatus[0].status, "mismatch");
});

test("app tickets without a warehouse ticket are categorized", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({})],
    tickets: [ticket({ id: "xpress_TBAR-DT-001232" })],
    appTickets: [
      { id: "move", wellId: "w1", kind: "transferIn", rawTicket: "173_transferTo", date: "2026-11-01", lines: [] },
      { id: "gap", wellId: "w1", kind: "received", rawTicket: "TBAR-DT-001238", date: "2026-11-01", lines: [{ name: "Elixir", qty: 1 }] },
      { id: "mud", wellId: "w1", kind: "received", rawTicket: "MudMan", date: "2026-11-01", lines: [] },
      { id: "other", wellId: "w1", kind: "received", rawTicket: "BA-00002", date: "2026-11-01", lines: [] },
    ],
  });
  const categories = Object.fromEntries(result.reviews.filter((item) => item.kind === "app_only").map((item) => [item.rawTicket, item.category]));
  assert.equal(categories["173_transferTo"], "transfer");
  assert.equal(categories["TBAR-DT-001238"], "missing_from_pull");
  assert.equal(categories.MudMan, "no_ticket_number");
  assert.equal(categories["BA-00002"], "unknown_prefix");
  assert.equal(result.reviews.find((item) => item.category === "transfer").auto, true);
});

test("matched lines use the product link and only the quantity that differs", () => {
  const bleach = { id: "bleach-tote", name: "Bleach (Tote)", xpressCodes: ["BLT"], xpressNames: ["Bleach (Tote)"], aliases: ["Bleach tote"], mimCodes: [], appNames: [], unit: "1000L", price: 500, confirmed: true };
  const elixir = { id: "elixir", name: "Elixir", xpressCodes: ["ELX"], mimNames: ["Elixir MIM"], mimCodes: [], appNames: [], unit: "pail", price: 100, confirmed: true };
  const result = buildCoverage({
    date: "2026-11-02",
    products: [bleach, elixir],
    wells: [well({})],
    tickets: [ticket({
      id: "xpress_NK-DT-1",
      lines: [{ code: "BLT", name: "Bleach (Tote)", unit: "1000L", qty: 2 }, { code: "ELX", name: "Elixir", unit: "20 L", qty: 10, price: 100 }],
    })],
    appTickets: [{
      id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-1", date: "2026-11-02", reportDate: "2026-11-02",
      lines: [{ name: "Bleach", unit: "1000 L", qty: 2, price: 400 }, { name: "Elixir", unit: "19L", qty: 8, price: 100 }],
    }],
  });
  assert.equal(result.ticketStatus[0].status, "mismatch");
  assert.equal(result.ticketStatus[0].dollarValue, 200);
  const mim = buildCoverage({
    date: "2026-11-02",
    products: [elixir],
    wells: [well({})],
    tickets: [ticket({ id: "mim_DTAWEY1", source: "mim", lines: [{ code: "ELX", name: "Elixir MIM", qty: 4 }] })],
    appTickets: [{ id: "w1_m", wellId: "w1", kind: "received", rawTicket: "DTAWEY1", date: "2026-11-02", lines: [{ name: "Elixir", unit: "pail", qty: 4, price: 100 }] }],
  });
  assert.equal(mim.ticketStatus[0].status, "logged");
});

test("lag uses the report date and the shipped date, and ignores a typed year error", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({ id: "meota", name: "Meota", lsd: "9-7-46-17W3", lsdNorm: "9-7-46-17W3", rig: "55", lastReportId: "report-1", lastReportDate: "2026-10-29" })],
    tickets: [ticket({ id: "xpress_TBAR-DT-001234", shippedAt: "2026-10-29", postedAt: "2026-10-30T00:00:00-06:00", lsd: "9-7-46-17W3", lsdNorm: "9-7-46-17W3", rig: "55" })],
    appTickets: [{ id: "meota_r", wellId: "meota", kind: "received", rawTicket: "TBAR-DT-001234", date: "2025-10-29", reportId: "report-1", reportDate: "2026-10-29", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(result.ticketStatus[0].ticketDate, "2026-10-29");
  assert.equal(result.ticketStatus[0].lagDays, 0);
  assert.equal(result.ticketStatus[0].status, "logged");
});

test("an adjacent section and the same rig still link an Alchem bare number", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({ id: "anova", name: "Anova Bryant", lsd: "13-4-5-7W2", lsdNorm: "13-4-5-7W2", rig: "Betts 3", contractor: "Anova" })],
    tickets: [ticket({ id: "mim_DTAWEY011649", source: "mim", company: "alchem", type: "DT", postedAt: "2026-11-01", shippedAt: "2026-10-31", lsd: "13-03-005-07 W2M", rig: "BETTS 3", customer: "ANOVA RESOURCES", lines: [{ name: "Bleach", qty: 4 }] })],
    appTickets: [{ id: "anova_r", wellId: "anova", kind: "received", rawTicket: "11649", date: "2026-11-01", reportDate: "2026-11-01", lines: [{ name: "Bleach", qty: 4 }] }],
  });
  assert.equal(result.ticketStatus[0].status, "logged");
  assert.equal(result.ticketStatus[0].match, "alchem");
  assert.equal(result.ticketStatus[0].wellName, "Anova Bryant");
  assert.equal(result.ticketStatus[0].lagDays, 1);
});

test("a warehouse sale in the ship-to text is not well-bound", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    tickets: [ticket({ id: "xpress_NK-DT-004804", type: "DT", shipTo: "Warehouse Sale", wellName: "Wozniak" })],
  });
  assert.equal(result.ticketStatus[0].status, "not_well_bound");
  assert.equal(result.ticketStatus[0].reason, "Warehouse sale");
});

test("a warehouse sale in the grid location or LSD field is not well-bound", () => {
  const grid = buildCoverage({
    date: "2026-11-02",
    tickets: [ticket({ id: "xpress_NK-DT-004804", type: "DT", lsdGrid: "Warehouse Sale", wellName: "Wozniak", lsd: "9-26-55-4W4" })],
  });
  assert.equal(grid.ticketStatus[0].status, "not_well_bound");
  assert.equal(grid.ticketStatus[0].reason, "Warehouse sale");
  const location = buildCoverage({
    date: "2026-11-02",
    tickets: [ticket({ id: "xpress_NK-DT-004804", type: "DT", gridLocation: "Warehouse Sale", destination: "Yard" })],
  });
  assert.equal(location.ticketStatus[0].reason, "Warehouse sale");
});

test("a pack count of 40 per pallet is not an ignored pallet", () => {
  assert.equal(isIgnoredStockItem({ name: "CAL CHLORIDE HT POWDER (40kg) 40/PALLET" }, DEFAULT_IGNORE_STOCK_NAMES), false);
  assert.equal(isIgnoredStockItem({ name: "Pallet Recycling" }), true);
  assert.equal(isIgnoredStockItem({ name: "PALLETS" }), true);
  assert.equal(isIgnoredStockItem({ name: "STRETCHWRAPS" }), true);
  assert.equal(DEFAULT_IGNORE_STOCK_NAMES.includes("Stretch Wrap"), true);
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({})],
    tickets: [ticket({ lines: [{ name: "CAL CHLORIDE HT POWDER (40kg) 40/PALLET", unit: "40kg", qty: 10, price: 20 }, { name: "Stretch Wrap", qty: 4 }] })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-02", lines: [{ name: "CAL CHLORIDE HT POWDER (40kg) 40/PALLET", unit: "40kg", qty: 4, price: 20 }] }],
  });
  assert.equal(result.ticketStatus[0].status, "mismatch");
  assert.equal(result.ticketStatus[0].dollarValue, 120);
});

test("same rig keeps a location difference logged with a note", () => {
  const logged = buildCoverage({
    date: "2026-11-02",
    wells: [well({ lsd: "9-26-55-4W0", lsdNorm: "9-26-55-4W0", rig: "245", contractor: "Ensign" })],
    tickets: [ticket({ lsd: "9-26-55-4W4", lsdNorm: "9-26-55-4W4", rig: "245", customer: "Ensign", lines: [{ name: "Elixir", qty: 4 }] })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(logged.ticketStatus[0].status, "logged");
  assert.equal(logged.ticketStatus[0].locationNote.severity, "low");
  assert.match(logged.ticketStatus[0].locationNote.text, /W0 vs W4|typo/);
  const split = buildCoverage({
    date: "2026-11-02",
    wells: [well({ lsd: "1-1-1-1W5", lsdNorm: "1-1-1-1W5", rig: "99", contractor: "Other" })],
    tickets: [ticket({ lsd: "9-26-55-4W4", rig: "245", customer: "Ensign", lines: [{ name: "Elixir", qty: 4 }] })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(split.ticketStatus[0].status, "mismatch");
  assert.equal(split.ticketStatus[0].locationNote, null);
});

test("ignored stock and service lines are left out of the quantity comparison", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({})],
    tickets: [ticket({
      lines: [
        { name: "Elixir", unit: "20 L", qty: 4, price: 100 },
        { name: "Pallet Recycling", qty: 8 },
        { name: "PALLETS", qty: 2 },
        { name: "CU After Hours Callout", qty: 1, price: 750 },
        { name: "Fuel Surcharge", qty: 1, price: 40 },
        { name: "Delivery Charge", qty: 1 },
        { name: "TT Charges", qty: 1 },
      ],
    })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-02", lines: [{ name: "Elixir", unit: "19L", qty: 4, price: 100 }] }],
  });
  assert.equal(result.ticketStatus[0].status, "logged");
  assert.equal(result.reviews.some((item) => item.status === "mismatch"), false);
});

test("ticket comparison uses the same product resolver as the issue checks", () => {
  const bleach = { id: "bleach-tote", name: "Bleach (Tote)", xpressCodes: ["BLT"], aliases: ["Bleach tote"], appNames: [], unit: "1000L", price: 500, confirmed: true };
  const index = indexProducts([bleach]);
  assert.equal(resolveLine(index, { name: "Bleach", unit: "~1000 L" }).product.id, "bleach-tote");
  const result = buildCoverage({
    date: "2026-11-02",
    products: [bleach],
    wells: [well({})],
    tickets: [ticket({ lines: [{ code: "BLT", name: "Bleach (Tote)", unit: "1000L", qty: 1, price: 500 }] })],
    appTickets: [{ id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-02", lines: [{ name: "Bleach", unit: "~1000 L", qty: 1, price: 400 }] }],
  });
  assert.equal(result.ticketStatus[0].status, "logged");
});

test("every app line that cites a linked Alchem number stays out of the review queue", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({ id: "anova", name: "Anova Bryant", lsd: "13-4-5-7W2", lsdNorm: "13-4-5-7W2", rig: "Betts 3", contractor: "Anova" })],
    tickets: [ticket({
      id: "mim_DTAWEY011649", source: "mim", company: "alchem", type: "DT", postedAt: "2026-11-01", shippedAt: "2026-10-31",
      lsd: "13-03-005-07 W2M", rig: "BETTS 3", customer: "ANOVA RESOURCES",
      lines: [{ name: "Bleach", qty: 2 }, { name: "Elixir", qty: 4 }],
    })],
    appTickets: [
      { id: "anova_r1_received-0", wellId: "anova", kind: "received", rawTicket: "11649", date: "2026-11-01", reportDate: "2026-11-01", lines: [{ name: "Bleach", qty: 2 }] },
      { id: "anova_r1_received-1", wellId: "anova", kind: "received", rawTicket: "11649", date: "2026-11-01", reportDate: "2026-11-01", lines: [{ name: "Elixir", qty: 4 }] },
      { id: "anova_copy", wellId: "elsewhere", kind: "received", rawTicket: "11649", date: "2026-11-01", lines: [] },
    ],
  });
  assert.equal(result.ticketStatus[0].status, "logged");
  assert.equal(result.ticketStatus[0].match, "alchem");
  assert.equal(result.ticketStatus[0].appTicketId, "anova_r1_received-0");
  assert.equal(result.reviews.some((item) => item.category === "no_ticket_number"), false);
  assert.equal(result.reviews.some((item) => item.rawTicket === "11649"), false);
});

test("the review count is the number of review docs and does not include mismatches", () => {
  const stem = "w".repeat(90);
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({ lsd: "1-1-1-1W5", lsdNorm: "1-1-1-1W5" })],
    tickets: [ticket({ lsd: "9-26-55-4W4", lines: [{ name: "Elixir", qty: 4 }] })],
    appTickets: [
      { id: "w1_r", wellId: "w1", kind: "received", rawTicket: "NK-DT-004806", date: "2026-11-01", lines: [{ name: "Elixir", qty: 9 }] },
      { id: `${stem}A`, wellId: "w1", kind: "received", rawTicket: "ZZ-DT-000010", date: "2026-11-02", lines: [] },
      { id: `${stem}B`, wellId: "w1", kind: "received", rawTicket: "ZZ-DT-000011", date: "2026-11-02", lines: [] },
    ],
  });
  assert.equal(result.ticketStatus[0].status, "mismatch");
  assert.equal(result.reviews.some((item) => item.status === "mismatch" || item.ticketId), false);
  assert.equal(new Set(result.reviews.map((item) => item.id)).size, result.reviews.length);
  assert.equal(result.reviewCount, result.reviews.length);
  assert.equal(reviewDocuments(result.reviews).length, result.reviewCount);
  assert.equal(result.reviews.filter((item) => item.category === "unknown_prefix").length, 2);
  assert.equal(result.reviews.some((item) => /_2$/.test(item.id)), false);
});

test("review ids stay the same when app lines are reordered", () => {
  const lines = [
    { id: "pad_r_received-0", wellId: "pad", reportId: "r", kind: "received", rawTicket: "ZZ-DT-000010", date: "2026-11-02", lines: [{ name: "Elixir", qty: 1 }] },
    { id: "pad_r_received-1", wellId: "pad", reportId: "r", kind: "received", rawTicket: "ZZ-DT-000011", date: "2026-11-02", lines: [{ name: "Bleach", qty: 2 }] },
  ];
  const first = buildCoverage({ date: "2026-11-02", appTickets: lines });
  const second = buildCoverage({ date: "2026-11-02", appTickets: [...lines].reverse() });
  assert.deepEqual(first.reviews.map((item) => item.id).sort(), second.reviews.map((item) => item.id).sort());
  assert.equal(first.reviewCount, reviewDocuments(first.reviews).length);
  const moved = movedReviewFlag([{ entityType: "review", entityId: first.flagMoves[0].fromId, status: "watching", notes: [{ at: "t", by: "a", text: "keep" }], forGrokBot: false, grokBotReply: "" }], first.flagMoves[0].fromId, first.flagMoves[0].toId);
  assert.equal(moved.entityId, first.flagMoves[0].toId);
  assert.equal(moved.status, "watching");
  assert.equal(moved.notes[0].text, "keep");
  assert.equal(movedReviewFlag([], "missing", "other"), null);
});

test("an unloaded series before the window is outside, and a loaded-series hole stays missing", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    config: { checksStartDate: "2026-10-30" },
    wells: [well({})],
    tickets: [
      ticket({ id: "xpress_WBFS-DT-000520", type: "DT", postedAt: "2026-10-30", shippedAt: "2026-10-30" }),
      ticket({ id: "xpress_WBFS-DT-000540", type: "DT", postedAt: "2026-10-31", shippedAt: "2026-10-31" }),
    ],
    appTickets: [
      { id: "ct", wellId: "w1", kind: "returned", rawTicket: "TBAR-CT-000338", date: "2026-10-29", lines: [] },
      { id: "hole", wellId: "w1", kind: "received", rawTicket: "WBFS-DT-000530", date: "2026-10-29", lines: [] },
      { id: "later", wellId: "w1", kind: "returned", rawTicket: "TBAR-CT-000400", date: "2026-11-02", lines: [] },
    ],
  });
  const categories = Object.fromEntries(result.reviews.filter((item) => item.kind === "app_only").map((item) => [item.rawTicket, item.category]));
  assert.equal(categories["TBAR-CT-000338"], "outside_window");
  assert.equal(result.reviews.find((item) => item.rawTicket === "TBAR-CT-000338").auto, true);
  assert.equal(categories["WBFS-DT-000530"], "missing_from_pull");
  assert.equal(categories["TBAR-CT-000400"], "unknown_prefix");
  const covered = buildCoverage({
    date: "2026-11-02",
    config: { checksStartDate: "2026-10-30" },
    wells: [well({})],
    tickets: [ticket({ id: "xpress_NK-CT-000891", type: "CT", postedAt: "2026-11-01", shippedAt: "2026-11-01" })],
    appTickets: [{ id: "later", wellId: "w1", kind: "returned", rawTicket: "TBAR-CT-000400", date: "2026-11-02", lines: [] }],
  });
  assert.equal(covered.reviews.find((item) => item.rawTicket === "TBAR-CT-000400").category, "missing_from_pull");
});

test("stale review and ticket rows are closed when flagged and deleted otherwise", () => {
  assert.equal(isLegacyReviewId("app_pad-r-received-0_2"), true);
  assert.equal(isLegacyReviewId("app_0123456789ab"), false);
  const at = "2026-11-02T12:00:00.000Z";
  const plan = reconcileCoverage({
    date: "2026-11-02",
    reviews: [{ id: "app_0123456789ab", kind: "app_only" }],
    ticketStatus: [{ id: "xpress_NK-DT-1" }],
    existingReviews: [
      { id: "app_0123456789ab", date: "2026-11-02" },
      { id: "app_old-well_2", date: "2026-10-26" },
      { id: "app_old-well_3", date: "2026-10-27" },
      { id: "sequence_nk-dt", date: "2026-11-02" },
      { id: "sequence_other", date: "2026-11-01" },
      { id: "app_kept", date: "2026-11-02", state: "resolved_auto", staleSince: "2026-11-01T00:00:00.000Z" },
    ],
    existingStatuses: [
      { id: "xpress_NK-DT-1" },
      { id: "xpress_gone" },
      { id: "xpress_noted" },
    ],
    flags: [
      { entityType: "review", entityId: "app_old-well_3", status: "watching", notes: [{ text: "look" }] },
      { entityType: "ticket", entityId: "xpress_noted", status: "seen", notes: [] },
    ],
    at,
  });
  assert.deepEqual(plan.reviewDeletes.sort(), ["app_old-well_2", "sequence_nk-dt"]);
  assert.deepEqual(plan.reviewStale, [{ id: "app_old-well_3", state: "resolved_auto", staleSince: at }]);
  assert.deepEqual(plan.statusDeletes, ["xpress_gone"]);
  assert.deepEqual(plan.statusStale, [{ id: "xpress_noted", state: "resolved_auto", staleSince: at }]);
});

test("entries before the collection window are auto-explained", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    config: { checksStartDate: "2026-10-30" },
    wells: [well({})],
    tickets: [ticket({ postedAt: "2026-11-01", shippedAt: "2026-11-01" })],
    appTickets: [
      { id: "ev1", wellId: "w1", kind: "received", rawTicket: "DTEVPR002022", date: "2026-10-26", lines: [] },
      { id: "ev2", wellId: "w1", kind: "received", rawTicket: "DTEVPR002023", date: "2026-10-27", lines: [] },
      { id: "ct", wellId: "w1", kind: "returned", rawTicket: "CTEVPR000744", date: "2026-10-26", lines: [] },
      { id: "kh", wellId: "w1", kind: "received", rawTicket: "KH2680", date: "2026-10-27", lines: [] },
      { id: "bare", wellId: "w1", kind: "received", rawTicket: "11643", date: "2026-10-26", lines: [] },
      { id: "mud", wellId: "w1", kind: "received", rawTicket: "MudMan", date: "2026-10-26", lines: [] },
      { id: "none", wellId: "w1", kind: "received", rawTicket: "NoTicket", date: "2026-10-27", lines: [] },
      { id: "later", wellId: "w1", kind: "received", rawTicket: "KH9999", date: "2026-11-02", lines: [] },
    ],
  });
  const categories = Object.fromEntries(result.reviews.filter((item) => item.kind === "app_only").map((item) => [item.rawTicket, item.category]));
  for (const raw of ["DTEVPR002022", "DTEVPR002023", "CTEVPR000744", "KH2680", "11643", "MudMan", "NoTicket"]) {
    assert.equal(categories[raw], "outside_window");
    assert.equal(result.reviews.find((item) => item.rawTicket === raw).auto, true);
  }
  assert.equal(categories.KH9999, "unknown_prefix");
  assert.equal(result.windowStart, "2026-11-01");
  assert.equal(result.reviewCount, result.reviews.length);
});

test("a hole in a ticket series becomes a review item", () => {
  const tickets = [1232, 1234, 1235, 1237].map((number) => ticket({ id: `xpress_TBAR-DT-${String(number).padStart(6, "0")}` }));
  const gaps = sequenceGaps(tickets, [{ kind: "received", rawTicket: "TBAR-DT-001233" }]);
  assert.deepEqual(gaps[0].numbers, [1233, 1236]);
  assert.match(gaps[0].title, /TBAR-DT/);
  const mixed = sequenceGaps([
    ticket({ id: "xpress_BRKS-000537", type: "DT" }),
    ticket({ id: "xpress_BRKS-000539", type: "DT" }),
    ticket({ id: "xpress_BRKS-000716", type: "MR" }),
    ticket({ id: "xpress_NK-DT-004804", type: "DT" }),
    ticket({ id: "xpress_NK-DT-004806", type: "DT" }),
    ticket({ id: "xpress_NK-DT-004807", type: "DT" }),
    ticket({ id: "xpress_NK-DT-004808", type: "DT" }),
  ], [{ kind: "received", rawTicket: "BRKS-DT-000540" }]);
  assert.deepEqual(mixed.find((item) => item.series === "BRKS-DT").numbers, [538]);
  assert.equal(mixed.some((item) => (item.numbers || []).includes(579)), false);
  assert.deepEqual(mixed.find((item) => item.series === "NK-DT").numbers, [4805]);
});

test("a number below the lowest loaded ticket in that series is outside the window", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    wells: [well({})],
    tickets: [
      ticket({ id: "xpress_NK-DT-004810", type: "DT", postedAt: "2026-09-15", shippedAt: "2026-09-15" }),
      ticket({ id: "xpress_NK-DT-004806", type: "DT", postedAt: "2026-11-01", shippedAt: "2026-10-30" }),
      ticket({ id: "xpress_BRKS-000537", type: "DT", postedAt: "2026-10-30", shippedAt: "2026-10-30" }),
    ],
    appTickets: [
      { id: "old", wellId: "w1", kind: "received", rawTicket: "NK-DT-004700", date: "2026-09-01", reportDate: "2026-09-01", lines: [] },
      { id: "nk", wellId: "w1", kind: "received", rawTicket: "NK4788", date: "2026-10-31", reportDate: "2026-11-01", lines: [] },
      { id: "hole", wellId: "w1", kind: "received", rawTicket: "NK-DT-004807", date: "2026-09-01", reportDate: "2026-09-01", lines: [] },
      { id: "brks", wellId: "w1", kind: "received", rawTicket: "BRKS-DT-000540", date: "2026-11-02", lines: [] },
      { id: "blank", wellId: "w1", kind: "received", rawTicket: "TBAR-DT-00", date: "2026-11-02", lines: [] },
      { id: "glued", wellId: "w1", kind: "received", rawTicket: "TBAR-CT00", date: "2026-11-02", lines: [] },
    ],
  });
  const categories = Object.fromEntries(result.reviews.filter((item) => item.kind === "app_only").map((item) => [item.rawTicket, item.category]));
  assert.equal(categories["NK-DT-004700"], "outside_window");
  assert.equal(result.reviews.find((item) => item.rawTicket === "NK-DT-004700").auto, true);
  assert.equal(categories.NK4788, "outside_window");
  assert.match(result.reviews.find((item) => item.rawTicket === "NK4788").reason, /NK-DT starts at 4806 on 2026-10-30/);
  assert.equal(categories["NK-DT-004807"], "missing_from_pull");
  assert.equal(categories["BRKS-DT-000540"], "missing_from_pull");
  assert.equal(categories["TBAR-DT-00"], "no_ticket_number");
  assert.equal(categories["TBAR-CT00"], "no_ticket_number");
});

test("zero stock lines are dropped except the row that records a run-out", () => {
  const previous = [{ code: "ELX", name: "Elixir", onHand: 4 }, { code: "OLD", name: "Gone", onHand: 2 }];
  const current = [
    { code: "ELX", name: "Elixir", onHand: 0, available: 0, committed: 0, inTransit: 0 },
    { code: "ELX", name: "Elixir", onHand: 0 },
    { code: "NEW", name: "Never", onHand: 0 },
    { code: "FUS", name: "Fusion", onHand: 3 },
  ];
  const kept = compactStockItems(current, previous);
  assert.deepEqual(kept.map((item) => item.code), ["ELX", "FUS"]);
});

test("stock exceptions cover negative, committed, in transit, and an unexplained change", () => {
  const result = buildCoverage({
    date: "2026-11-02",
    config: { ignoreStockNames: ["Pallets"] },
    stock: [
      { id: "2026-11-01_xpress_TBAR", date: "2026-11-01", source: "xpress", warehouseCode: "TBAR", items: [{ code: "ELX", name: "Elixir", onHand: 10, committed: 0, inTransit: 0 }] },
      { id: "2026-11-02_xpress_TBAR", date: "2026-11-02", source: "xpress", warehouseCode: "TBAR", items: [
        { code: "ELX", name: "Elixir", onHand: 2, committed: 0, inTransit: 0 },
        { code: "NEG", name: "Megasol", onHand: -1, committed: 0, inTransit: 4 },
        { code: "PAL", name: "Pallets", onHand: -5, committed: 0, inTransit: 0 },
        { code: "COM", name: "Sawdust", onHand: 1, committed: 3, inTransit: 0 },
      ] },
    ],
    tickets: [],
  });
  const kinds = result.reviews.map((item) => item.kind).sort();
  assert.equal(kinds.includes("stock_negative"), true);
  assert.equal(kinds.includes("stock_committed"), true);
  assert.equal(kinds.includes("stock_transit"), true);
  assert.equal(kinds.includes("stock_drift"), true);
  assert.equal(result.reviews.some((item) => /Pallets/.test(item.title)), false);
});

test("a flag keeps its note thread and is never rebuilt empty", () => {
  const first = applyFlag(null, { entityType: "ticket", entityId: "xpress_NK-DT-1", status: "seen", note: "Checked the LSD", by: "rambod@uniqenergy.com", at: "2026-11-02T12:00:00.000Z" });
  const second = applyFlag(first, { status: "watching", forGrokBot: true, note: "Ask tomorrow", by: "rambod@uniqenergy.com", at: "2026-11-02T13:00:00.000Z" });
  assert.equal(second.status, "watching");
  assert.equal(second.forGrokBot, true);
  assert.equal(second.notes.length, 2);
  assert.equal(second.notes[0].text, "Checked the LSD");
  assert.equal(second.grokBotReply, "");
});
