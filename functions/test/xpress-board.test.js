import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptGrokLink, parseGrokLinks, parseGrokSort } from "../inventoryBot/grokSort.js";
import { chooseFields, directoryQuery, filterWellIds, listNewWellIds, readSlimReports, readSlimWell, reportTickets, slimWell, wellWindowStart } from "../inventoryBot/mirrorWells.js";
import { acceptGrokMove, applyCitation, buildXpressBoard, cardsNeedingCitation, cardsNeedingGrok, citedWellIds, fieldRig, lsdNear, ticketValue, ticketsNeedingGrok } from "../inventoryBot/xpressBoard.js";

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

test("opening a well reads report keys and the inventory buckets, not the whole report", async () => {
  const calls = [];
  const result = await readSlimReports(async (path) => {
    calls.push(path);
    if (path === "data/wellReports/well-1") return { r1: true, r2: true, r3: true };
    if (path.endsWith("/date")) return "2026-11-01";
    if (path.endsWith("/reportNumber")) return "12";
    if (path.endsWith("/inventory/received")) return { 0: { description: "Ticket:NK-1,Delivery", receiveddate: "2026-11-01", receiveddetail: { a: { product: "Elixir" } } } };
    if (path.endsWith("/inventory/returned")) return {};
    throw new Error(`unexpected ${path}`);
  }, "well-1", 2);
  assert.deepEqual(calls[0], "data/wellReports/well-1");
  assert.equal(calls.some((path) => path === "data/wellReports/well-1/r1"), false);
  assert.equal(calls.filter((path) => path.endsWith("/inventory/received")).length, 2);
  assert.equal(result.reads, 1 + 2 * 4);
  const rows = reportTickets(result.reports);
  assert.equal(rows.find((row) => row.rawTicket === "NK-1").products, 1);
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
