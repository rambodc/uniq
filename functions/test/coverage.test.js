import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFlag, buildCoverage, compactStockItems, looseTicket, sequenceGaps } from "../inventoryBot/coverage.js";
import { ticketsMatch } from "../inventoryBot/engine.js";

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
  const categories = Object.fromEntries(result.reviews.filter((item) => item.kind === "app_only").map((item) => [item.id, item.category]));
  assert.equal(categories.app_move, "transfer");
  assert.equal(categories.app_gap, "missing_from_pull");
  assert.equal(categories.app_mud, "no_ticket_number");
  assert.equal(categories.app_other, "unknown_prefix");
  assert.equal(result.reviews.find((item) => item.category === "transfer").auto, true);
});

test("a hole in a ticket series becomes a review item", () => {
  const tickets = [1232, 1234, 1235, 1237].map((number) => ticket({ id: `xpress_TBAR-DT-${String(number).padStart(6, "0")}` }));
  const gaps = sequenceGaps(tickets, [{ kind: "received", rawTicket: "TBAR-DT-001233" }]);
  assert.deepEqual(gaps[0].numbers, [1233, 1236]);
  assert.match(gaps[0].title, /TBAR-DT/);
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
