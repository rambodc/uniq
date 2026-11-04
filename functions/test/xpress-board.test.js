import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGrokLink, parseGrokLinks, parseGrokSort } from "../inventoryBot/grokSort.js";
import { copiedReportRows, isTestWell } from "../inventoryBot/copiedReports.js";
import { reportTickets } from "../inventoryBot/mirrorWells.js";
import { acceptGrokMove, applyCitation, buildXpressBoard, cardsNeedingCitation, cardsNeedingGrok, citedWellIds, fieldRig, lsdNear, ticketPdf, ticketValue, ticketsNeedingGrok } from "../inventoryBot/xpressBoard.js";

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

test("a ticket pdf is offered only when hasPdf and the xpress storage path agree", () => {
  assert.equal(ticketPdf({ hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/NK-004804.pdf" }), "inventoryBot/tickets/xpress/NK-004804.pdf");
  assert.equal(ticketPdf({ hasPdf: false, pdfPath: "inventoryBot/tickets/xpress/NK-004804.pdf" }), "");
  assert.equal(ticketPdf({ hasPdf: true, pdfPath: "inventoryBot/tickets/mim/MBFS-1.pdf" }), "");
  assert.equal(ticketPdf({ hasPdf: true, pdfPath: "https://example.com/a.pdf" }), "");
  assert.equal(ticketPdf({ source: "mim", hasPdf: false, pdfPath: "inventoryBot/tickets/mim/DTAWEY011649.pdf" }), "");
  assert.equal(ticketPdf({ source: "mim", hasPdf: true, pdfPath: "inventoryBot/tickets/mim/DTAWEY011649.pdf" }), "inventoryBot/tickets/mim/DTAWEY011649.pdf");
  assert.equal(ticketPdf({ source: "xpress", hasPdf: true, pdfPath: "inventoryBot/tickets/mim/DTAWEY011649.pdf" }), "");
  const board = buildXpressBoard({
    tickets: [
      ticket({ id: "xpress_NK-1", ticketNumber: "NK-1", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/NK-1.pdf", lsd: "", lsdNorm: "", rig: "", wellName: "", customer: "" }),
      ticket({ id: "xpress_NK-2", ticketNumber: "NK-2", hasPdf: false, pdfPath: "inventoryBot/tickets/xpress/NK-2.pdf", lsd: "", lsdNorm: "", rig: "", wellName: "", customer: "" }),
    ],
  });
  assert.equal(board.unassigned[0].hasPdf, true);
  assert.equal(board.unassigned[0].pdfPath, "inventoryBot/tickets/xpress/NK-1.pdf");
  assert.equal(board.unassigned[1].hasPdf, false);
  assert.equal(board.unassigned[1].pdfPath, "");
});

test("mim tickets group like the xpress board and keep trucking charges", () => {
  const board = buildXpressBoard({
    source: "mim",
    tickets: [
      ticket({ id: "mim_DTAWEY011649", source: "mim", type: "DT", ticketNumber: "DTAWEY011649", hasPdf: false, lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12", customer: "Tundra", wellName: "Tundra 13-26", warehouseName: "ALCHEM" }),
      ticket({ id: "mim_TTPROS1", source: "mim", type: "TT", ticketNumber: "TTPROS1", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12", lines: [], charges: [{ service: "Haul", qty: 1, billingMethod: "flat", price: 80, total: 80 }], warehouseName: "PR PREMIUM" }),
      ticket({ id: "xpress_NK-1", source: "xpress", ticketNumber: "NK-1", lsd: "", lsdNorm: "", rig: "", wellName: "", customer: "" }),
      ticket({ id: "mim_loose", source: "mim", type: "DT", ticketNumber: "LOOSE", lsd: "", lsdNorm: "", rig: "", wellName: "", customer: "" }),
    ],
  });
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].ticketCount, 2);
  const trucking = board.cards[0].tickets.find((row) => row.type === "TT");
  assert.equal(trucking.charges[0].service, "Haul");
  assert.equal(trucking.charges[0].total, 80);
  assert.equal(trucking.value, 80);
  assert.equal(trucking.hasPdf, false);
  assert.equal(board.unassigned.map((row) => row.number).join(), "LOOSE");
  assert.equal(board.cards[0].tickets.some((row) => row.number === "NK-1"), false);
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

test("copied reports keep the ticket and products, and test wells stay out of suggestions", () => {
  assert.equal(isTestWell({ name: "Test well", isTest: false }), true);
  assert.equal(isTestWell({ name: "Bantry", isTest: true }), true);
  assert.equal(isTestWell({ name: "Cardinal 103 HZ Bantry" }), false);
  const rows = copiedReportRows("r7", {
    reportNo: 7,
    reportDate: "2026-11-02",
    receivedLines: [{ ticketNumber: "BRKS-000540", kind: "received", date: "2026-11-02", products: [{ product: "Caustic Soda", quantity: 20, pack: "22.68 kg" }] }],
    returned: [{ ticket: "TBAR-CT-000338", products: [{ name: "Elixir", qty: 2, unit: "200 L" }] }],
  });
  assert.equal(rows.find((row) => row.rawTicket === "BRKS-000540").lines[0].name, "Caustic Soda");
  assert.equal(rows.find((row) => row.rawTicket === "BRKS-000540").lines[0].unit, "22.68 kg");
  assert.equal(rows.find((row) => row.rawTicket === "TBAR-CT-000338").kind, "returned");
  assert.equal(rows[0].reportNumber, "7");
  const board = buildXpressBoard({
    tickets: [ticket({ id: "xpress_shared", lsd: "1-2-3-4W4", lsdNorm: "1-2-3-4W4", rig: "9", wellName: "Pad A" })],
    appWells: [
      { id: "real", name: "Pad A north", lsdNorm: "1-2-3-4W4", rig: "1" },
      { id: "fake", name: "Pad A test", lsdNorm: "1-2-3-4W4", rig: "9", isTest: false },
      { id: "flagged", name: "Pad A south", lsdNorm: "1-2-3-4W4", rig: "9", isTest: true },
    ],
  });
  assert.deepEqual(board.cards[0].link.candidates.map((well) => well.id), ["real"]);
  const legacy = reportTickets({
    report1: { date: "2026-10-15", inventory: { received: { 0: { description: "Ticket:NK-004774,Delivery", receiveddate: "2026-10-15", receiveddetail: { a: { product: "Elixir" }, b: { product: "Salt" } } } }, returned: { 0: { description: "Transfer-From Ticket: TR-2210,Transferred", returneddate: "2026-10-12" } } } },
  });
  assert.equal(legacy.find((row) => row.rawTicket === "NK-004774").warehouse, true);
  assert.equal(legacy.find((row) => row.rawTicket === "NK-004774").products, 2);
  assert.equal(legacy.find((row) => /TR-2210/.test(row.rawTicket)).warehouse, false);
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

test("candidates stay near the LSD and a CC-Rig label is not a rig", () => {
  assert.equal(fieldRig("CC-Rig 4"), "");
  assert.equal(fieldRig("Di-Corp CC-Rig 4"), "");
  assert.equal(fieldRig("Horizon 55"), "Horizon 55");
  const board = buildXpressBoard({
    tickets: [
      ticket({ id: "xpress_h55", lsd: "1-2-40-10W4", lsdNorm: "1-2-40-10W4", rig: "Horizon 55", wellName: "Meota", customer: "Cardinal" }),
      ticket({ id: "xpress_cc", lsd: "5-5-5-5W4", lsdNorm: "5-5-5-5W4", rig: "CC-Rig 4", wellName: "Pad C", customer: "Di-Corp" }),
    ],
    appWells: [
      { id: "near-rig", name: "Meota A", lsdNorm: "1-3-40-10W4", rig: "Horizon 55", operator: "Cardinal" },
      { id: "near", name: "Meota B", lsdNorm: "2-2-40-10W4", rig: "Other 1", operator: "Cardinal" },
      { id: "meridian", name: "Meota typo", lsdNorm: "1-2-40-10W0", rig: "Horizon 55", operator: "Other" },
      { id: "farther", name: "Meota D", lsdNorm: "1-1-39-10W4", rig: "Other 2", operator: "Cardinal" },
      { id: "pad-c", name: "Pad C far", lsdNorm: "6-6-40-10W4", rig: "Horizon 55", operator: "Cardinal" },
      { id: "old", name: "Old Horizon well", lsdNorm: "8-8-1-1W4", rig: "Horizon 55", operator: "Cardinal" },
      { id: "cardinal", name: "Unrelated Cardinal", lsdNorm: "9-9-2-2W4", rig: "Savanna 1", operator: "Cardinal" },
      { id: "rig4", name: "Horizon 4", lsdNorm: "1-1-1-1W4", rig: "Horizon 4", operator: "Di-Corp" },
      { id: "cc-near", name: "Pad C meridian", lsdNorm: "5-5-5-5W0", rig: "Savanna 12", operator: "Someone" },
    ],
  });
  const meota = board.cards.find((card) => card.name === "Meota");
  assert.equal(meota.link.state, "suggested");
  assert.deepEqual(meota.link.candidates.map((well) => well.id), ["meridian", "near-rig", "near"]);
  assert.equal(meota.link.candidates.some((well) => well.id === "cardinal" || well.id === "old"), false);
  const pad = board.cards.find((card) => card.name === "Pad C");
  assert.equal(pad.rig, "");
  assert.deepEqual(pad.link.candidates.map((well) => well.id), ["cc-near"]);
  assert.equal(pad.link.candidates.some((well) => well.id === "rig4"), false);
});

test("the well whose reports cite the warehouse ticket is linked, and a tie stays alphabetical", () => {
  const reportsFor = (raw) => ({ r1: { inventory: { received: { 0: { description: `Ticket:${raw},Delivery`, receiveddate: "2026-11-01", receiveddetail: { a: { product: "Elixir" } } } }, returned: {} } } });
  const card = {
    ticketCount: 1,
    citationChecked: false,
    match: { compared: false },
    link: {
      state: "suggested",
      reason: "multiple app wells share this LSD",
      source: "",
      candidates: [
        { id: "other", name: "Other Pad", lsd: "1-1-1-1W4", rig: "11" },
        { id: "bantry", name: "Cardinal Bantry", lsd: "1-1-1-1W4", rig: "11" },
        { id: "zeta", name: "Zeta", lsd: "1-1-1-1W4", rig: "11" },
      ],
    },
  };
  const cases = [
    ["bantry", "BRKS-000540", "Cardinal Bantry"],
    ["beaver", "TBAR-DT-001232", "S515 Beaverdam"],
    ["plover", "TBAR-CT-000338", "SRL Plover Lake 3D8-36"],
  ];
  for (const [id, number, name] of cases) {
    const candidates = [{ id: "aaa", name: "Aaa Pad" }, { id, name }, { id: "zzz", name: "Zzz Pad" }];
    const cited = citedWellIds(candidates, { [id]: reportsFor(number), aaa: reportsFor("NK-000001") }, [{ number }]);
    const linked = applyCitation({ ...card, link: { ...card.link, candidates } }, cited);
    assert.equal(linked.link.appWellId, id);
    assert.equal(linked.link.state, "linked");
    assert.equal(linked.link.candidates[0].name, name);
  }
  const tied = applyCitation(card, ["zeta", "other"]);
  assert.equal(tied.link.state, "suggested");
  assert.deepEqual(tied.link.candidates.map((well) => well.name), ["Other Pad", "Zeta", "Cardinal Bantry"]);
  const none = applyCitation(card, []);
  assert.deepEqual(none.link.candidates.map((well) => well.name), ["Cardinal Bantry", "Other Pad", "Zeta"]);
  assert.equal(cardsNeedingCitation([card, { ...card, citationChecked: true }, { ...card, link: { ...card.link, state: "linked", candidates: card.link.candidates } }]).length, 1);
});
