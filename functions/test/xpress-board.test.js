import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGrokSort } from "../inventoryBot/grokSort.js";
import { directoryRange, reportTickets, slimWell, wellWindowStart } from "../inventoryBot/mirrorWells.js";
import { acceptGrokMove, buildXpressBoard, ticketValue, ticketsNeedingGrok } from "../inventoryBot/xpressBoard.js";

const ticket = (fields) => ({ id: "xpress_NK-DT-1", source: "xpress", type: "DT", rig: "14", lsd: "1-21-63-24W4", lsdNorm: "1-21-63-24W4", customer: "Ish Energy", wellName: "ISH 8HZ", postedAt: "2026-10-15", lines: [{ name: "Elixir", qty: 2, price: 100 }], ...fields });

test("xpress cards group by LSD and rig, and returns are negative", () => {
  assert.equal(ticketValue(ticket({ type: "SR", lines: [{ qty: 2, price: 50 }] })), -100);
  const board = buildXpressBoard({
    tickets: [
      ticket({ id: "xpress_NK-004774", wellName: "ISH 8HZ 102 ROCHSTR" }),
      ticket({ id: "xpress_NK-004783", postedAt: "2026-10-21", lines: [{ qty: 1, price: 40 }] }),
      ticket({ id: "xpress_NK-000888", type: "CT", postedAt: "2026-10-28", lines: [{ qty: 1, price: 10 }] }),
      ticket({ id: "xpress_NK-004804", rig: "", lsd: "", lsdNorm: "", wellName: "", customer: "Wozniak", postedAt: "2026-10-31", lines: [{ qty: 1, price: 20 }] }),
    ],
    appWells: [{ id: "2026-10-11_well", name: "ISH 8HZ 102 ROCHSTR 1-21-63-24", lsdNorm: "1-21-63-24W4", rig: "Horizon 14" }],
    appTickets: [
      { wellId: "2026-10-11_well", kind: "received", rawTicket: "NK-004774" },
      { wellId: "2026-10-11_well", kind: "received", rawTicket: "NK-DT-004783" },
    ],
  });
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].ticketCount, 3);
  assert.equal(board.cards[0].totalValue, 230);
  assert.equal(board.cards[0].link.state, "linked");
  assert.equal(board.cards[0].status.tone, "red");
  assert.equal(board.unassigned.length, 1);
  assert.equal(board.unassigned[0].number, "NK-004804");
});

test("a manual move wins over LSD placement", () => {
  const board = buildXpressBoard({
    tickets: [ticket({ id: "xpress_NK-000605", lsd: "1-21-36-24W4", lsdNorm: "1-21-36-24W4" })],
    placements: [{ ticketId: "xpress_NK-000605", cardId: "auto-1-21-63-24w4-14", manual: true, suggestion: { reason: "LSD typo 63 versus 36", confidence: "low" } }],
    savedCards: [{ id: "auto-1-21-63-24w4-14", name: "ISH 8HZ", lsd: "1-21-63-24W4", lsdNorm: "1-21-63-24W4", rig: "14" }],
  });
  assert.equal(board.unassigned.length, 0);
  assert.equal(board.cards[0].tickets[0].number, "NK-000605");
});

test("Grok can file a ticket only when the LSD is exactly the card", () => {
  const card = { id: "auto-1", lsdNorm: "1-21-63-24W4" };
  assert.equal(acceptGrokMove({ confidence: "high", cardId: "auto-1" }, { lsdNorm: "1-21-63-24W4" }, card), true);
  assert.equal(acceptGrokMove({ confidence: "high", cardId: "auto-1" }, { lsdNorm: "1-21-36-24W4" }, card), false);
  assert.equal(acceptGrokMove({ confidence: "low", cardId: "auto-1" }, { lsdNorm: "1-21-63-24W4" }, card), false);
  const pending = ticketsNeedingGrok([{ id: "a", suggestion: null }, { id: "b", suggestion: { cardId: "auto-1", reason: "cached", confidence: "low" } }]);
  assert.deepEqual(pending.map((ticket) => ticket.id), ["a"]);
  const parsed = parseGrokSort("```json\n{\"suggestions\":[{\"ticketId\":\"xpress_NK-1\",\"cardId\":\"auto-1\",\"confidence\":\"high\",\"reason\":\"same pad\"}]}\n```");
  assert.equal(parsed[0].confidence, "high");
});

test("the app well directory reads a date range, and one well's reports parse ticket text", () => {
  assert.equal(wellWindowStart("2026-11-03"), "2026-08-03");
  const first = directoryRange("2026-11-03", "");
  assert.equal(first.reads, 1);
  assert.equal(first.start, "2026-08-03");
  const next = directoryRange("2026-11-03", "2026-11-02_aa");
  assert.equal(next.start, "2026-11-02_aa\0");
  assert.equal(next.reads, 1);
  const slim = slimWell("2026-10-11_15-20-54_jchristensen", { name: "ISH", uwi: "1-21-63-24W4", rig_name: "Horizon 14", contractor: "Horizon", status: "Completed" });
  assert.equal(slim.lsdNorm, "1-21-63-24W4");
  assert.equal(slim.rig, "Horizon 14");
  const rows = reportTickets({
    report1: { date: "2026-10-15", inventory: { received: { 0: { description: "Ticket:NK-004774,Delivery", receiveddate: "2026-10-15", receiveddetail: { a: { product: "Elixir" }, b: { product: "Salt" } } } }, returned: { 0: { description: "Transfer-From Ticket: TR-2210,Transferred", returneddate: "2026-10-12" } } } },
  });
  assert.equal(rows.find((row) => row.rawTicket === "NK-004774").warehouse, true);
  assert.equal(rows.find((row) => row.rawTicket === "NK-004774").products, 2);
  assert.equal(rows.find((row) => /TR-2210/.test(row.rawTicket)).warehouse, false);
});
