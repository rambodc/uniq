import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRigBoard, lsdClose, parseXpressRig, rigKeyOf } from "../inventoryBot/rigMatch.js";

const TODAY = "2026-11-04";

function well(fields) {
  return {
    id: "w", name: "Well", operator: "Strathcona", rig: "55", status: "active",
    lsd: "4-5-46-17W3", lastReportDate: "2026-11-01", firstReportDate: "2026-10-20", ...fields,
  };
}

function ticket(fields) {
  return { id: "t", source: "xpress", type: "DT", rig: "Horizon 55", lsd: "4-5-46-17W3", customer: "Strathcona Resources", date: "2026-11-01", lines: [{ name: "Barite", qty: 1 }], ...fields };
}

test("xpress rig names normalise PD to Precision and split the number", () => {
  assert.deepEqual(parseXpressRig("PD 156"), { number: "156", contractor: "Precision", display: "Precision 156" });
  assert.equal(parseXpressRig("Pd156").display, "Precision 156");
  assert.equal(parseXpressRig("Ensign531").display, "Ensign 531");
  assert.equal(parseXpressRig("Bonanza8").display, "Bonanza 8");
  assert.equal(parseXpressRig("Excalibur10").display, "Excalibur 10");
  assert.equal(parseXpressRig("Horizon19").display, "Horizon 19");
  assert.equal(parseXpressRig("Savanna437").display, "Savanna 437");
  assert.equal(parseXpressRig("BONANZA 11").display, "Bonanza 11");
  assert.equal(parseXpressRig("CC-Rig 4").number, "");
  assert.equal(rigKeyOf("055", "Strathcona Resources Ltd"), "55~strathcona");
});

test("meridian typos match and neighbouring sections do not", () => {
  assert.equal(lsdClose("100/04-09-022-14W0", "4-9-22-14W4"), true);
  assert.equal(lsdClose("4-9-22-14W4", "5-9-22-14W4"), false);
  assert.equal(lsdClose("4-9-22-14W4", "4-10-22-14W4"), false);
  assert.equal(lsdClose("9-7-46-17W3", "4-5-46-17W3"), false);
});

test("a unique rig number matches, including a W0 versus W4 LSD", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "verger", rig: "7", operator: "North 40", lsd: "100/04-09-022-14W0", name: "North 40 4B" })],
    tickets: [ticket({ id: "brks", rig: "Bonanza 7", lsd: "4-9-22-14W4", customer: "North 40 Resources", number: "BRKS-000539" })],
  });
  assert.equal(board.rigs.length, 1);
  assert.equal(board.rigs[0].name, "Bonanza 7");
  assert.equal(board.rigs[0].tickets[0].matchReason, "rig-number");
  assert.equal(board.rigs[0].tickets[0].matchConfidence, "green");
  assert.equal(board.rigs[0].status.tone, "green");
});

test("shared rig numbers are split by operator and then by LSD", () => {
  const wells = [
    well({ id: "caltex", rig: "4", operator: "Caltex Energy", name: "Caltex pad", lsd: "1-1-1-1W4" }),
    well({ id: "spur", rig: "4", operator: "Spur Petroleum", name: "Spur pad", lsd: "2-2-2-2W4" }),
  ];
  const board = buildRigBoard({
    today: TODAY,
    wells,
    tickets: [
      ticket({ id: "a", rig: "Caltex 4", customer: "Caltex Energy", lsd: "1-1-1-1W4" }),
      ticket({ id: "b", rig: "Spur 4", customer: "Someone Else", lsd: "2-2-2-2W4" }),
    ],
  });
  const caltex = board.rigs.find((rig) => rig.key === "4~caltex");
  const spur = board.rigs.find((rig) => rig.key === "4~spur");
  assert.equal(caltex.tickets[0].matchReason, "rig-number-operator");
  assert.equal(spur.tickets[0].matchReason, "rig-number-lsd");
  assert.equal(caltex.tickets[0].matchConfidence, "amber");
  assert.equal(spur.tickets[0].matchConfidence, "amber");
  assert.match(caltex.tickets[0].note, /Rig 4 is shared/);
});

test("rig 254 stays amber and a contractor tie is named Rig 254", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "beacon", rig: "254", operator: "Cenovus", name: "Beacon Hill", lsd: "6-6-6-6W4" })],
    tickets: [
      ticket({ id: "pd", rig: "PD 254", customer: "Cenovus Energy", lsd: "6-6-6-6W4" }),
      ticket({ id: "en", rig: "Ensign 254", customer: "Cenovus Energy", lsd: "6-6-6-6W4" }),
    ],
  });
  assert.equal(board.rigs[0].name, "Rig 254");
  assert.equal(board.rigs[0].status.tone, "amber");
  assert.ok(board.rigs[0].tickets.every((row) => row.matchConfidence === "amber"));
  assert.match(board.rigs[0].note, /Precision and Ensign/);
});

test("Horizon 55 keeps the pad LSD note and stays amber", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "pad", lsd: "4-5-46-17W3" })],
    tickets: [ticket({ id: "tbar", number: "TBAR-DT-001242", lsd: "9-7-46-17W3", rig: "Horizon 55" })],
  });
  const row = board.rigs[0].tickets[0];
  assert.equal(row.rigKey, "55~strathcona");
  assert.equal(row.matchReason, "rig-number");
  assert.equal(row.matchConfidence, "amber");
  assert.equal(row.note, "Ticket LSD 9-7-46-17W3 differs from pad LSD 4-5-46-17W3 — amber until confirmed.");
});

test("LSD alone, then operator and ship date, then unassigned", () => {
  const wells = [well({ id: "pad", rig: "55", operator: "Strathcona", lsd: "4-5-46-17W3", firstReportDate: "2026-10-01", lastReportDate: "2026-11-02" })];
  const byLsd = buildRigBoard({
    today: TODAY,
    wells,
    tickets: [ticket({ id: "lsd", rig: "Nabors 99", lsd: "4-5-46-17W3", customer: "Other Oil" })],
  });
  assert.equal(byLsd.rigs[0].tickets[0].matchReason, "lsd");
  const byDate = buildRigBoard({
    today: TODAY,
    wells,
    tickets: [ticket({ id: "span", rig: "Nabors 99", lsd: "8-8-8-8W4", customer: "Strathcona Resources", date: "2026-10-28" })],
  });
  assert.equal(byDate.rigs[0].tickets[0].matchReason, "operator-span");
  assert.equal(byDate.rigs[0].tickets[0].matchConfidence, "amber");
  const loose = buildRigBoard({
    today: TODAY,
    wells,
    tickets: [ticket({ id: "loose", rig: "Nabors 99", lsd: "8-8-8-8W4", customer: "Other Oil" })],
  });
  assert.equal(loose.unassigned[0].matchReason, "unassigned");
  assert.equal(loose.rigs.length, 0);
  assert.equal(loose.quietRigs[0].key, "55~strathcona");
});

test("a disagreeing LSD on a unique rig is red, and a missing LSD stays green", () => {
  const red = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "pad", rig: "19", operator: "Baytex", lsd: "1-2-3-4W4" })],
    tickets: [ticket({ id: "bad", rig: "Horizon 19", lsd: "9-9-9-9W4", customer: "Baytex Energy" })],
  });
  assert.equal(red.rigs[0].tickets[0].matchConfidence, "red");
  assert.equal(red.rigs[0].status.tone, "red");
  const open = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "pad", rig: "19", operator: "Baytex", lsd: "1-2-3-4W4" })],
    tickets: [ticket({ id: "open", rig: "Horizon 19", lsd: "", customer: "Baytex Energy" })],
  });
  assert.equal(open.rigs[0].tickets[0].matchConfidence, "green");
});

test("warehouse moves without a rig or LSD are counted, not listed as unassigned", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "pad" })],
    tickets: [
      ticket({ id: "mr", type: "MR", rig: "", lsd: "" }),
      ticket({ id: "st", type: "ST", rig: "", lsd: "" }),
      ticket({ id: "at", type: "AT", rig: "", lsd: "" }),
      ticket({ id: "stx", type: "STx", rig: "", lsd: "" }),
      ticket({ id: "field", type: "MR", rig: "Horizon 55", lsd: "4-5-46-17W3" }),
    ],
  });
  assert.deepEqual(board.warehouse.map((row) => row.id).sort(), ["at", "mr", "st", "stx"]);
  assert.equal(board.unassigned.length, 0);
  assert.equal(board.rigs[0].tickets[0].id, "field");
});

test("test wells and reports older than 15 days are not targets", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [
      well({ id: "test", name: "Test well", isTest: true }),
      well({ id: "old", status: "completed", lastReportDate: "2026-10-19", name: "Old" }),
      well({ id: "pause", status: "active-pause", lastReportDate: "2026-11-01", name: "Paused" }),
      well({ id: "done", status: "completed", lastReportDate: "2026-10-25", name: "Done", rig: "8", operator: "Baytex" }),
    ],
    tickets: [
      ticket({ id: "on-pause", rig: "Horizon 55", lsd: "4-5-46-17W3" }),
      ticket({ id: "on-done", rig: "Bonanza 8", lsd: "4-5-46-17W3", customer: "Baytex" }),
    ],
  });
  assert.deepEqual(board.rigs.map((rig) => rig.key).sort(), ["55~strathcona", "8~baytex"]);
  assert.equal(board.rigs.find((rig) => rig.key === "55~strathcona").currentWell.name, "Paused");
});

test("the current well prefers an active well over a newer completed one", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [
      well({ id: "done", status: "completed", lastReportDate: "2026-11-03", name: "Done" }),
      well({ id: "live", status: "active", lastReportDate: "2026-10-21", name: "Live" }),
    ],
    tickets: [ticket({ id: "t" })],
  });
  assert.equal(board.rigs[0].currentWell.name, "Live");
  assert.equal(board.rigs[0].wellCount, 2);
});

test("merges, well moves, and ticket moves apply before the automatic rules", () => {
  const wells = [
    well({ id: "h55", rig: "55", operator: "Strathcona", lsd: "4-5-46-17W3" }),
    well({ id: "h19", rig: "19", operator: "Strathcona", name: "Other pad", lsd: "1-1-1-1W4" }),
    well({ id: "north", rig: "7", operator: "North 40", name: "Verger", lsd: "4-9-22-14W4" }),
    well({ id: "extra", rig: "8", operator: "Baytex", name: "Extra", lsd: "3-3-3-3W4" }),
  ];
  const tickets = [
    ticket({ id: "stay", rig: "Horizon 55", lsd: "4-5-46-17W3" }),
    ticket({ id: "also", rig: "Horizon 19", lsd: "1-1-1-1W4" }),
    ticket({ id: "moved", rig: "Horizon 55", lsd: "4-5-46-17W3" }),
  ];
  const merged = buildRigBoard({
    today: TODAY,
    wells,
    tickets,
    corrections: [
      { id: "merge__19~strathcona", type: "merge", rigKey: "19~strathcona", into: "55~strathcona" },
      { id: "ticket__moved", type: "ticketRig", ticketId: "moved", rigKey: "7~north" },
      { id: "well__extra", type: "wellRig", wellId: "extra", rigKey: "7~north" },
    ],
  });
  const horizon = merged.rigs.find((rig) => rig.key === "55~strathcona");
  const north = merged.rigs.find((rig) => rig.key === "7~north");
  assert.equal(horizon.merged, true);
  assert.equal(horizon.aliases[0].key, "19~strathcona");
  assert.ok(horizon.tickets.some((row) => row.id === "also"));
  assert.ok(horizon.wells.some((row) => row.id === "h19"));
  assert.equal(north.tickets[0].id, "moved");
  assert.equal(north.tickets[0].moved, true);
  assert.equal(north.tickets[0].matchReason, "correction");
  assert.equal(north.wells.find((row) => row.id === "extra").moved, true);
  assert.equal(merged.rigs.some((rig) => rig.key === "8~baytex"), false);

  const undone = buildRigBoard({
    today: TODAY,
    wells: [well({ id: "h55" }), well({ id: "h19", rig: "19", name: "Other pad", lsd: "1-1-1-1W4" })],
    tickets: [ticket({ id: "also", rig: "Horizon 19", lsd: "1-1-1-1W4" })],
    corrections: [{ type: "merge", rigKey: "19~strathcona", into: "55~strathcona", undone: true }],
  });
  assert.equal(undone.rigs.find((rig) => rig.key === "19~strathcona").tickets[0].id, "also");
  assert.equal(undone.quietRigs.find((rig) => rig.key === "55~strathcona").ticketCount, 0);
});

test("rigs sort by ticket count and then the newest ticket", () => {
  const board = buildRigBoard({
    today: TODAY,
    wells: [
      well({ id: "a", rig: "1", operator: "Alpha", lsd: "1-1-1-1W4" }),
      well({ id: "b", rig: "2", operator: "Beta", lsd: "2-2-2-2W4" }),
    ],
    tickets: [
      ticket({ id: "old", rig: "Bonanza 1", lsd: "1-1-1-1W4", customer: "Alpha", date: "2026-10-21" }),
      ticket({ id: "new", rig: "Bonanza 2", lsd: "2-2-2-2W4", customer: "Beta", date: "2026-11-03" }),
      ticket({ id: "new2", rig: "Bonanza 2", lsd: "2-2-2-2W4", customer: "Beta", date: "2026-11-02" }),
    ],
  });
  assert.deepEqual(board.rigs.map((rig) => rig.appRig), ["2", "1"]);
  assert.deepEqual(board.matches.map((row) => row.id).sort(), ["new", "new2", "old"]);
});
