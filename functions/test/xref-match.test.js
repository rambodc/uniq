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
  const expected = { matched: 0, onlyApp: 0, onlyX: 0, noTicket: 0, expected: 0, appBeforeXpress: 0, hidden: 0 };
  for (const [rig, rows] of Object.entries(data)) {
    if (rig === "_norig") continue;
    for (const key of Object.keys(expected)) expected[key] += (rows[key] || []).length;
    const got = board.stats[rig] || { matched: 0, onlyApp: 0, onlyX: 0, noTicket: 0, expected: 0, appBeforeXpress: 0, hidden: 0 };
    for (const key of Object.keys(expected).filter((item) => item !== "loose")) {
      assert.equal(got[key] || 0, (rows[key] || []).length, `${rig} ${key}`);
    }
  }
  assert.deepEqual(board.totals, { ...expected, loose: (data._norig.onlyX || []).length });
  assert.equal(board.rigs.some((rig) => rig.needs.some((row) => row.date < "2026-10-01" && row.side === "app")), false);
});

function fromX(ticket) {
  return {
    id: `xpress_${ticket.no}`, source: "xpress", ticketNumber: ticket.no, number: ticket.no, type: ticket.type,
    date: ticket.date, rig: ticket.rig, customer: ticket.cust || "", hasLines: ticket.hasLines === true,
    lines: Object.entries(ticket.prods || {}).map(([productId, qty]) => ({ productId, name: productId, qty })),
  };
}
