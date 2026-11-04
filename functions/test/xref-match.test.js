import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildXref, canon, productOverlap } from "../inventoryBot/xrefMatch.js";

const TODAY = "2026-11-04";

function line(fields) {
  return { id: "a", wellId: "w", reportId: "r", index: "0", date: "2026-10-24", rawTicket: "TBAR-DT-001220", kind: "received", products: [], ...fields };
}
function ticket(fields) {
  return { id: fields.ticketNumber || "t", source: "xpress", type: "DT", rig: "PD 156", customer: "Baytex", date: "2026-10-24", lines: [], hasLines: true, ...fields };
}
function well(fields) {
  return { id: "w", name: "Well", operator: "Baytex", rig: "156", status: "active", lastReportDate: "2026-11-01", ...fields };
}

test("typed numbers normalise, including CREDITTICKET and the WBS alias", () => {
  assert.deepEqual(canon("TBAR-CT-0000"), { prefix: "TBAR", type: "CT", digits: "0000", number: null });
  assert.deepEqual(canon("BRKS-DT-000538"), { prefix: "BRKS", type: "DT", digits: "000538", number: 538 });
  assert.deepEqual(canon("CREDITTICKETWBS-CT-000117"), { prefix: "WBFS", type: "CT", digits: "000117", number: 117 });
  assert.equal(canon("BRKS-000538").number, 538);
  assert.equal(canon("11636"), null);
});

test("the spec examples land in the right buckets", () => {
  const wells = [
    well(),
    well({ id: "kent", rig: "19", operator: "CNRL", name: "CNRL 15A Ft Kent" }),
    well({ id: "forsyth", rig: "531", operator: "CNRL" }),
    well({ id: "bantry", rig: "11", operator: "Cardinal" }),
    well({ id: "meota", rig: "55", operator: "Strathcona" }),
    well({ id: "killam", rig: "420", operator: "Westgate" }),
    well({ id: "mahikan", rig: "2", operator: "Mahikan" }),
  ];
  const tickets = [
    ticket({ ticketNumber: "TBAR-DT-001246", rig: "PD 156", date: "2026-11-03" }),
    ticket({ ticketNumber: "WBFS-CT-000113", type: "CT", rig: "Horizon 19", date: "2026-10-20" }),
    ticket({ ticketNumber: "WBFS-CT-000117", type: "CT", rig: "Ensign 531", date: "2026-10-20" }),
    ticket({ ticketNumber: "BRKS-000538", rig: "Bonanza 11", date: "2026-10-31" }),
    ticket({ ticketNumber: "TBAR-DT-001196", rig: "Horizon 55", date: "2026-10-14", lines: [{ productId: "barite", name: "Barite", qty: 84 }] }),
    ticket({ ticketNumber: "TBAR-DT-001197", rig: "Horizon 55", date: "2026-10-14" }),
    ticket({ ticketNumber: "TBAR-DT-001198", rig: "Horizon 55", date: "2026-10-14" }),
  ];
  const appLines = [
    line({ id: "exact", wellId: "w", rawTicket: "TBAR-DT-001246", date: "2026-11-03" }),
    line({ id: "wbfs", wellId: "kent", rawTicket: "WBFS-CT-000113", date: "2026-10-20" }),
    line({ id: "credit", wellId: "forsyth", rawTicket: "CREDITTICKETWBS-CT-000117", date: "2026-10-20" }),
    line({ id: "brks", wellId: "bantry", rawTicket: "BRKS-DT-000538", date: "2026-10-31" }),
    line({ id: "digits", wellId: "meota", rawTicket: "001196", date: "2026-10-14", products: [{ productId: "barite", name: "Barite", qty: 84 }] }),
    line({ id: "zero", wellId: "w", rawTicket: "TBAR-CT-0000", kind: "returned", date: "2026-11-03" }),
    line({ id: "missing", wellId: "killam", rawTicket: "TBAR-DT-001238", date: "2026-10-31" }),
    line({ id: "mud", wellId: "mahikan", rawTicket: "MudMan", date: "2026-11-01" }),
    line({ id: "other", wellId: "w", rawTicket: "11636", date: "2026-10-20" }),
    line({ id: "kh", wellId: "w", rawTicket: "KH2680", date: "2026-10-20" }),
    line({ id: "move", wellId: "w", rawTicket: "2026-10-26_07-07-27_transferTo_by-person", kind: "transferIn", date: "2026-10-26" }),
    line({ id: "early", wellId: "w", rawTicket: "TBAR-DT-001111", date: "2026-09-20" }),
  ];
  const board = buildXref({ today: TODAY, wells, tickets, appLines });
  const how = Object.fromEntries(board.rigs.flatMap((rig) => rig.pairs.map((row) => [row.app.number, row.how])));
  assert.equal(how["TBAR-DT-001246"], "exact");
  assert.equal(how["WBFS-CT-000113"], "exact");
  assert.equal(how["CREDITTICKETWBS-CT-000117"], "exact");
  assert.equal(how["BRKS-DT-000538"], "exact");
  assert.equal(how["001196"], "digits");
  assert.equal(board.stats["156"].noTicket, 1);
  assert.equal(board.stats["420"].onlyApp, 1);
  assert.equal(board.stats["2"].noTicket, 1);
  assert.equal(board.stats["156"].hidden, 2);
  assert.equal(board.stats["156"].expected, 1);
  assert.equal(board.stats["156"].appBeforeXpress, 1);
  assert.equal(board.rigs.find((rig) => rig.key === "156").needs.some((row) => row.date < "2026-10-01"), false);
  assert.equal(board.rigs.find((rig) => rig.key === "156").pending.some((row) => row.number === "TBAR-DT-001111"), false);
});

test("a manual pair and an unpair are applied before the number rules", () => {
  const wells = [well()];
  const tickets = [ticket({ ticketNumber: "NK-004900", lines: [{ productId: "gel", name: "Gel", qty: 1 }] })];
  const appLines = [line({ rawTicket: "TBAR-DT-009999", products: [{ productId: "barite", name: "Barite", qty: 4 }] })];
  const paired = buildXref({
    today: TODAY, wells, tickets, appLines,
    corrections: [{ type: "pair", appLine: { wellId: "w", reportId: "r", index: "0" }, xpress: "NK-004900" }],
  });
  assert.equal(paired.rigs[0].pairs[0].how, "manual");
  const blocked = buildXref({
    today: TODAY,
    wells,
    tickets: [ticket({ ticketNumber: "TBAR-DT-001220" })],
    appLines: [line({ rawTicket: "TBAR-DT-001220" })],
    corrections: [{ type: "unpair", appLine: { wellId: "w", reportId: "r", index: "0" }, xpress: "TBAR-DT-001220" }],
  });
  assert.equal(blocked.rigs[0].matched, 0);
  assert.equal(blocked.rigs[0].onlyApp, 1);
  assert.equal(blocked.rigs[0].onlyXpress, 1);
});

test("a rig override moves an Xpress ticket, and a close number needs product overlap", () => {
  const moved = buildXref({
    today: TODAY,
    wells: [well(), well({ id: "other", rig: "19", operator: "CNRL" })],
    tickets: [ticket({ id: "t", ticketNumber: "NK-000605", rig: "PD 156" })],
    appLines: [],
    corrections: [{ type: "rig", xpress: "NK-000605", rig: "19" }],
  });
  assert.equal(moved.rigs.find((rig) => rig.key === "19").onlyXpress, 1);
  assert.equal(productOverlap([{ productId: "barite", name: "Barite", qty: 40 }], [{ productId: "barite", name: "Barite", qty: 42 }]).overlap, 1);
  const typo = buildXref({
    today: TODAY,
    wells: [well()],
    tickets: [ticket({ ticketNumber: "TBAR-DT-001220", date: "2026-10-24", lines: [{ productId: "barite", name: "Barite", qty: 40 }] })],
    appLines: [line({ rawTicket: "TBAR-DT-001221", date: "2026-10-24", products: [{ productId: "barite", name: "Barite", qty: 40 }] })],
  });
  assert.equal(typo.rigs[0].pairs[0].how, "typo");
  assert.equal(typo.rigs[0].pairs[0].typoFixed, true);
});

test("possible matches stay suggestions and are limited to two within three days", () => {
  const wells = [well()];
  const tickets = [
    ticket({ id: "near", ticketNumber: "NK-004901", date: "2026-10-11", lines: [{ productId: "barite", name: "Barite", qty: 10 }, { productId: "gel", name: "Gel", qty: 4 }] }),
    ticket({ id: "mid", ticketNumber: "NK-004902", date: "2026-10-14", lines: [{ productId: "barite", name: "Barite", qty: 10 }] }),
    ticket({ id: "far", ticketNumber: "NK-004903", date: "2026-10-20", lines: [{ productId: "barite", name: "Barite", qty: 10 }, { productId: "gel", name: "Gel", qty: 4 }] }),
    ticket({ id: "third", ticketNumber: "NK-004904", date: "2026-10-12", lines: [{ productId: "soda", name: "Soda", qty: 1 }] }),
  ];
  const appLines = [line({ rawTicket: "TBAR-DT-009999", date: "2026-10-12", products: [{ productId: "barite", name: "Barite", qty: 10 }, { productId: "gel", name: "Gel", qty: 4 }] })];
  const board = buildXref({ today: TODAY, wells, tickets, appLines });
  const row = board.rigs[0].needs.find((item) => item.side === "app");
  assert.deepEqual(row.suggestions.map((item) => item.number), ["NK-004901", "NK-004902"]);
  assert.equal(row.suggestions[0].shared, 2);
  assert.equal(row.suggestions[0].compared, 2);
  assert.equal(board.rigs[0].matched, 0);
  assert.equal(board.rigs[0].suggestions.find((item) => item.side === "app").matches.length, 2);
  const xpress = board.rigs[0].needs.find((item) => item.number === "NK-004901");
  assert.equal(xpress.suggestions[0].xpress, "NK-004901");
  assert.equal(xpress.suggestions[0].wellId, "w");
});

test("a received line and a returned line in one report stay distinct, and an old correction still resolves", () => {
  const wells = [well({ id: "w", name: "Pad" })];
  const shared = { wellId: "w", reportId: "2026-11-02_22-40-05", index: "n1", date: "2026-10-20" };
  const appLines = [
    line({ ...shared, id: "", side: "received", kind: "received", rawTicket: "TBAR-DT-001246" }),
    line({ ...shared, id: "", side: "returned", kind: "returned", rawTicket: "TBAR-CT-000331" }),
  ];
  const tickets = [
    ticket({ ticketNumber: "TBAR-DT-001246", date: "2026-10-20" }),
    ticket({ ticketNumber: "TBAR-CT-000331", type: "CT", date: "2026-10-20" }),
  ];
  const board = buildXref({
    today: TODAY, wells, tickets, appLines,
    corrections: [{ type: "unpair", appLine: { wellId: "w", reportId: "2026-11-02_22-40-05", index: "n1" }, xpress: "TBAR-CT-000331" }],
  });
  const ids = board.rigs[0].pairs.map((row) => row.appId);
  assert.equal(ids.length, 1);
  assert.match(ids[0], /~received~n1$/);
  assert.match(board.rigs[0].needs.find((row) => row.number === "TBAR-CT-000331") ? "returned-open" : board.rigs[0].needs.map((row) => row.appId).join(" "), /returned~n1|returned-open/);
  assert.equal(board.rigs[0].needs.some((row) => row.appId.endsWith("~returned~n1")), true);
});

test("a transfer across two wells on one rig is a single expected row", () => {
  const stamp = "2026-11-03_01-16-13_transferTo_by-mud";
  const wells = [well({ id: "from", name: "Horizon 55 From" }), well({ id: "to", name: "Horizon 55 To", rig: "156" })];
  const appLines = [
    line({ id: "", wellId: "from", side: "received", kind: "transferOut", rawTicket: stamp, date: "2026-11-03", products: [{ name: "Gel", qty: 4, pack: "20 L" }] }),
    line({ id: "", wellId: "to", side: "received", kind: "transferIn", rawTicket: stamp, date: "2026-11-03", products: [{ name: "Gel", qty: 4, pack: "20 L" }] }),
  ];
  const board = buildXref({ today: TODAY, wells, tickets: [], appLines });
  assert.equal(board.stats["156"].expected, 1);
  assert.equal(board.rigs[0].transfers.length, 1);
  assert.equal(board.rigs[0].transfers[0].number, "Transfer");
  assert.equal(board.rigs[0].transfers[0].fromWell, "Horizon 55 From");
  assert.equal(board.rigs[0].transfers[0].toWell, "Horizon 55 To");
});

test("one Xpress ticket is matched once, preferring its own rig and then the closer date", () => {
  const ownRig = buildXref({
    today: TODAY,
    wells: [well({ id: "a", rig: "361" }), well({ id: "b", rig: "420" })],
    tickets: [ticket({ ticketNumber: "NK-004741", rig: "Ensign 361", date: "2026-10-01" })],
    appLines: [
      line({ id: "", wellId: "b", rawTicket: "NK-004741", date: "2026-09-30" }),
      line({ id: "", wellId: "a", rawTicket: "NK-004741", date: "2026-10-04" }),
    ],
  });
  assert.equal(ownRig.stats["361"].matched, 1);
  assert.equal(ownRig.stats["420"].onlyApp, 1);
  assert.match(ownRig.rigs.find((rig) => rig.key === "420").needs[0].summary, /Ticket # already used on 361 2026-10-04/);
  assert.equal(ownRig.rigs.find((rig) => rig.key === "420").needs[0].suggestions[0].xpress, "NK-004741");
  const closer = buildXref({
    today: TODAY,
    wells: [well({ id: "early" }), well({ id: "late" })],
    tickets: [ticket({ ticketNumber: "NK-004690", date: "2026-10-08" })],
    appLines: [
      line({ id: "", wellId: "early", rawTicket: "NK-004690", date: "2026-09-10" }),
      line({ id: "", wellId: "late", rawTicket: "NK-004690", date: "2026-10-09" }),
    ],
  });
  assert.equal(closer.stats["156"].matched, 1);
  assert.equal(closer.stats["156"].onlyApp, 1);
  assert.match(closer.rigs[0].needs[0].summary, /Ticket # already used on 156 2026-10-09/);
  assert.equal(closer.rigs[0].pairs[0].app.date, "2026-10-09");
});

test("the reference output totals match on the real-data fixture", () => {
  const data = JSON.parse(readFileSync(new URL("./fixtures/xref-result.json", import.meta.url)));
  const wells = new Map();
  const appLines = [];
  const tickets = new Map();
  const matchedByTicket = new Map();
  for (const [rig, rows] of Object.entries(data)) {
    if (rig === "_norig") {
      for (const ticket of rows.onlyX || []) tickets.set(ticket.no, fromX(ticket));
      continue;
    }
    for (const [bucket, items] of Object.entries(rows)) {
      if (bucket === "onlyX") {
        for (const ticket of items) tickets.set(ticket.no, fromX(ticket));
        continue;
      }
      for (const item of items) {
        const id = `${item.wellId}~${item.reportId}~${item.index}`;
        if (!wells.has(item.wellId)) wells.set(item.wellId, { id: item.wellId, name: item.well, operator: "", rig: item.rig, status: "active", lastReportDate: "2026-11-01" });
        appLines.push({
          id, wellId: item.wellId, reportId: item.reportId, index: item.index, date: item.date, rawTicket: item.tk, kind: item.kind,
          products: Object.entries(item.prods || {}).map(([productId, qty]) => ({ productId, name: productId, qty })),
        });
        if (item.x) {
          if (!matchedByTicket.has(item.x)) matchedByTicket.set(item.x, []);
          matchedByTicket.get(item.x).push(item);
        }
      }
    }
  }
  for (const [number, items] of matchedByTicket) {
    if (tickets.has(number)) continue;
    const typed = items.map((item) => canon(item.tk)?.type).filter(Boolean);
    const unique = [...new Set(typed)];
    const fromNumber = number.match(/-(DT|CT|SR|MR|ST|AT)-/);
    tickets.set(number, {
      id: `xpress_${number}`, source: "xpress", ticketNumber: number, number,
      type: fromNumber?.[1] || unique[0] || "DT",
      date: "2026-10-15", rig: `Rig ${items[0].rig}`, customer: "", lines: [], hasLines: false,
    });
  }
  const board = buildXref({ today: TODAY, wells: [...wells.values()], tickets: [...tickets.values()], appLines });
  const claimed = new Map();
  for (const rig of board.rigs) for (const row of rig.pairs) claimed.set(row.number, (claimed.get(row.number) || 0) + 1);
  assert.deepEqual([...claimed.values()].filter((count) => count > 1), []);
  assert.equal(board.stats["55"].expected, 14);
  assert.equal(board.stats["55"].matched, 8);
  assert.equal(board.stats["859"].expected, 20);
  assert.equal(board.stats["859"].matched, 6);
  assert.equal(board.stats["420"].expected, 3);
  assert.equal(board.stats["420"].matched, 7);
  assert.equal(board.stats["361"].expected, 6);
  assert.equal(board.stats["361"].matched, 9);
  assert.equal(board.stats["361"].onlyApp, 3);
  assert.equal(board.totals.loose, (data._norig.onlyX || []).length);
});

function fromX(ticket) {
  return {
    id: `xpress_${ticket.no}`, source: "xpress", ticketNumber: ticket.no, number: ticket.no, type: ticket.type,
    date: ticket.date, rig: ticket.rig, customer: ticket.cust || "", hasLines: ticket.hasLines === true,
    lines: Object.entries(ticket.prods || {}).map(([productId, qty]) => ({ productId, name: productId, qty })),
  };
}
