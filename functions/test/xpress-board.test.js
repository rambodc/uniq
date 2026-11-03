import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGrokLink, parseGrokLinks, parseGrokSort } from "../inventoryBot/grokSort.js";
import { chooseFields, directoryQuery, filterWellIds, listNewWellIds, readSlimWell, reportTickets, slimWell, wellWindowStart } from "../inventoryBot/mirrorWells.js";
import { acceptGrokMove, buildXpressBoard, cardsNeedingGrok, lsdNear, ticketValue, ticketsNeedingGrok } from "../inventoryBot/xpressBoard.js";

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

test("the app well directory lists only new ids, and operator_name is the operator", async () => {
  assert.equal(wellWindowStart("2026-11-03"), "2026-08-03");
  const first = directoryQuery("2026-11-03", "");
  assert.equal(first.reads, 1);
  assert.equal(first.startAfter, "2026-08-03");
  const next = directoryQuery("2026-11-03", "2026-11-02_aa");
  assert.equal(next.startAfter, "2026-11-02_aa");
  const ids = filterWellIds(["2026-08-01_old", "2026-11-02_aa", "2026-11-03_bb", "2026-12-01_future"], { after: next.startAfter, windowStart: next.windowStart, end: next.end });
  assert.deepEqual(ids, ["2026-11-03_bb"]);
  const fields = chooseFields(["name", "uwi", "rig_name", "operator_name", "reports", "inventory"]);
  assert.equal(fields.operator, "operator_name");
  assert.equal(fields.rig, "rig_name");
  assert.equal(fields.lsd, "uwi");
  const slim = slimWell("2026-10-11_15-20-54_jchristensen", { name: "ISH", uwi: "1-21-63-24W4", rig_name: "Horizon 14", operator_name: "Ish Energy", contractor: "Horizon", status: "Completed" });
  assert.equal(slim.lsdNorm, "1-21-63-24W4");
  assert.equal(slim.rig, "Horizon 14");
  assert.equal(slim.operator, "Ish Energy");
  const calls = [];
  const listed = await listNewWellIds(async (path, params) => {
    calls.push({ path, params });
    return { "2026-11-02_aa": true, "2026-11-03_bb": true };
  }, next);
  assert.deepEqual(listed, ["2026-11-03_bb"]);
  assert.equal(calls[0].params.shallow, "true");
  assert.equal(calls[0].params.limitToFirst, "80");
  const paths = [];
  const read = await readSlimWell(async (path) => {
    paths.push(path);
    if (path.endsWith("operator_name")) return "Ish Energy";
    if (path.endsWith("/name")) return "ISH";
    return "";
  }, "2026-11-03_bb", { name: "name", lsd: "uwi", rig: "", contractor: "", operator: "operator_name", status: "" });
  assert.equal(read.well.operator, "Ish Energy");
  assert.equal(paths.includes("data/wells/2026-11-03_bb"), false);
  assert.equal(paths.includes("data/wells/2026-11-03_bb/operator_name"), true);
  const rows = reportTickets({
    report1: { date: "2026-10-15", inventory: { received: { 0: { description: "Ticket:NK-004774,Delivery", receiveddate: "2026-10-15", receiveddetail: { a: { product: "Elixir" }, b: { product: "Salt" } } } }, returned: { 0: { description: "Transfer-From Ticket: TR-2210,Transferred", returneddate: "2026-10-12" } } } },
  });
  assert.equal(rows.find((row) => row.rawTicket === "NK-004774").warehouse, true);
  assert.equal(rows.find((row) => row.rawTicket === "NK-004774").products, 2);
  assert.equal(rows.find((row) => /TR-2210/.test(row.rawTicket)).warehouse, false);
});

test("unlinked cards explain the gap, and warehouse receipts stay off the board", () => {
  assert.equal(lsdNear("1-21-63-24W4", "1-21-63-24W0"), true);
  assert.equal(lsdNear("1-21-63-24W4", "1-21-63-24W4"), false);
  const board = buildXpressBoard({
    tickets: [
      ticket({ id: "xpress_shared", lsd: "1-2-3-4W4", lsdNorm: "1-2-3-4W4", rig: "9", wellName: "Pad A" }),
      ticket({ id: "xpress_typo", lsd: "1-21-63-24W4", lsdNorm: "1-21-63-24W4", rig: "14", wellName: "ISH" }),
      ticket({ id: "xpress_mr", type: "MR", lsd: "", lsdNorm: "", rig: "", wellName: "" }),
      ticket({ id: "xpress_st", type: "ST", lsd: "9-9-9-9W4", lsdNorm: "9-9-9-9W4", rig: "2", wellName: "Transfer" }),
      ticket({ id: "xpress_place", lsd: "", lsdNorm: "", rig: "4", wellName: "Di-Corp CC-Rig 4", shipTo: "" }),
      ticket({ id: "xpress_sav", lsd: "", lsdNorm: "", rig: "Savanna 420", wellName: "Unnamed well", shipTo: "Savanna 420" }),
    ],
    appWells: [
      { id: "w1", name: "Pad A north", lsd: "1-2-3-4W4", lsdNorm: "1-2-3-4W4", rig: "1" },
      { id: "w2", name: "Pad A south", lsd: "1-2-3-4W4", lsdNorm: "1-2-3-4W4", rig: "2" },
      { id: "w3", name: "ISH meridian", lsd: "1-21-63-24W0", lsdNorm: "1-21-63-24W0", rig: "Horizon 14" },
    ],
  });
  const shared = board.cards.find((card) => card.name === "Pad A");
  assert.equal(shared.link.reason, "multiple app wells share this LSD");
  assert.equal(shared.status.label, "multiple app wells share this LSD");
  assert.deepEqual(shared.link.candidates.map((well) => well.id), ["w1", "w2"]);
  const typo = board.cards.find((card) => card.name === "ISH");
  assert.equal(typo.link.reason, "location differs from app");
  assert.equal(typo.link.candidates[0].id, "w3");
  const sav = board.cards.find((card) => card.rig === "Savanna 420");
  assert.equal(sav.name, "Savanna 420");
  assert.equal(board.cards.some((card) => /di-corp/i.test(card.name)), false);
  assert.equal(board.unassigned.some((row) => row.id === "xpress_place"), true);
  assert.equal(board.unassigned.some((row) => row.id === "xpress_mr" || row.id === "xpress_st"), false);
  assert.equal(board.warehouseOnly, 2);
  assert.equal(cardsNeedingGrok(board.cards).length, 3);
  const parsed = parseGrokLinks("{\"links\":[{\"cardId\":\"auto\",\"appWellId\":\"w3\",\"confidence\":\"high\",\"reason\":\"W4 versus W0\"}]}");
  assert.equal(acceptGrokLink(parsed[0], typo.link.candidates), true);
  assert.equal(acceptGrokLink({ appWellId: "not-a-candidate", cardId: "auto" }, typo.link.candidates), false);
  const asked = buildXpressBoard({ tickets: [], savedCards: [{ id: "auto-1", name: "Kept", lsdNorm: "1-1-1-1W4", grokTried: true, manual: true }] });
  assert.equal(cardsNeedingGrok(asked.cards).length, 0);
});
