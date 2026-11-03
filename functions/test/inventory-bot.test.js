import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { addIssue, appCitesTicket, checksRequestChanged, configFromMain, DEFAULT_IGNORE_STOCK_NAMES, inTicketTypes, isIgnoredStockItem, isInactiveStatus, isTicketPdfPath, isTicketType, kindFromAppTicketId, lsdNorm, matchLoggedApp, matchProduct, matchWell, indexProducts, normalizeAppTicket, parseAppDescription, rigIdentity, rigNorm, runChecks, stockEffect, stockItemKey, ticketLookupId, ticketNorm, ticketsMatch } from "../inventoryBot/engine.js";
import { TOOLS, completeInventoryChat } from "../inventoryBot/chat.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const product = { id: "elixir", name: "Elixir", xpressCodes: ["ELX"], mimCodes: ["M-ELX"], appNames: ["Elixir 100"], unit: "pail", price: 250, cost: 180, confirmed: true };
const fusion = { id: "fusion", name: "Fusion", xpressCodes: ["FUS"], mimCodes: [], appNames: ["Fusion"], unit: "pail", price: 100, cost: 70, confirmed: true };
const products = [product, fusion];

const well = (fields) => ({ id: "w1", name: "North Pad", lsd: "104/9-26-55-4W4", lsdNorm: "9-26-55-4W4", rig: "245", status: "active", lastReportDate: "2026-10-28", spudDate: "2026-10-01", remaining: [], received: [], returned: [], used: [], ...fields });
const ticket = (fields) => ({ id: "xpress_WBFS-DT-1", source: "xpress", company: "uniqenergy", type: "DT", warehouseCode: "XV-AB", rig: "245", lsd: "104/9-26-55-4W4", postedAt: "2026-10-20", lines: [{ code: "ELX", name: "Elixir", qty: 4 }], charges: [], ...fields });

test("LSD normalization strips event prefixes and matches app UWI forms", () => {
  assert.equal(lsdNorm("104/9-26-55-4W4"), "9-26-55-4W4");
  assert.equal(lsdNorm("100/09-26-055-04W4/00"), "9-26-55-4W4");
  assert.equal(lsdNorm("102/16-1-1-1w5/2"), "16-1-1-1W5");
  assert.equal(lsdNorm("9-26-55-4 W4"), "9-26-55-4W4");
  assert.equal(lsdNorm(""), "");
  assert.equal(rigNorm("Rig 0245"), "245");
});

test("products match on warehouse codes and fall back to a normalized name", () => {
  const index = indexProducts(products);
  assert.equal(matchProduct(index, "m-elx", "").id, "elixir");
  assert.equal(matchProduct(index, "", "elixir 100").id, "elixir");
  assert.equal(matchProduct(index, "", "Elixir").name, "Elixir");
  assert.equal(matchProduct(index, "NOPE", "Something Else"), null);
});

test("a shared LSD uses the rig number to pick the well", () => {
  const wells = [well({ id: "a", rig: "100", name: "A" }), well({ id: "b", rig: "245", name: "B" })];
  assert.equal(matchWell(ticket({ rig: "Rig 245" }), wells).id, "b");
  assert.equal(matchWell(ticket({ lsd: "", lsdNorm: "", rig: "100" }), [well({ id: "only", lsd: "", rig: "100" })]).id, "only");
});

test("delivery older than the grace period with no app receipt is flagged and priced", () => {
  const result = runChecks({
    date: "2026-11-02",
    products,
    wells: [well({})],
    tickets: [ticket({}), ticket({ id: "xpress_recent", postedAt: "2026-11-01", lines: [{ code: "ELX", name: "Elixir", qty: 1 }] })],
  });
  const flagged = result.issues.filter((issue) => issue.rule === "delivered_not_logged");
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].severity, "high");
  assert.equal(flagged[0].dollarValue, 1000);
  assert.deepEqual(flagged[0].ticketIds, ["xpress_WBFS-DT-1"]);
  assert.match(result.summary.text, /1 open issue/);
  assert.equal(result.summary.dollarsAtRisk, 1000);
});

test("a logged receipt, or a report that predates the ticket, is not a missing delivery", () => {
  const logged = runChecks({ date: "2026-11-02", products, wells: [well({ received: [{ product: "Elixir", qty: 4, date: "2026-10-20" }] })], tickets: [ticket({})] });
  assert.equal(logged.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
  const tooSoon = runChecks({ date: "2026-11-02", products, wells: [well({ lastReportDate: "2026-10-01" })], tickets: [ticket({ postedAt: "2026-10-20" })] });
  assert.equal(tooSoon.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
});

test("an app receipt with no nearby ticket is logged_no_ticket, and a quantity gap is qty_mismatch", () => {
  const reports = [
    { date: "2026-10-20", received: [{ product: "Fusion", qty: 0 }], returned: [{ product: "Elixir", qty: 0 }] },
    { date: "2026-10-28", received: [{ product: "Fusion", qty: 2 }], returned: [] },
  ];
  const missing = runChecks({
    date: "2026-11-02", products,
    wells: [well({ reports })],
    tickets: [],
  });
  assert.equal(missing.issues.some((issue) => issue.rule === "logged_no_ticket"), true);
  const cumulative = runChecks({
    date: "2026-11-02", products,
    wells: [well({ received: [{ product: "Fusion", qty: 80, date: "2026-10-28" }] })],
    tickets: [ticket({ id: "xpress_fus", postedAt: "2026-10-27", lines: [{ code: "FUS", name: "Fusion", qty: 2 }] })],
  });
  assert.equal(cumulative.issues.some((issue) => issue.rule === "logged_no_ticket" || issue.rule === "qty_mismatch"), false);
  const nearby = runChecks({
    date: "2026-11-02", products,
    wells: [well({ reports: [
      { date: "2026-10-20", received: [{ product: "Fusion", qty: 0 }] },
      { date: "2026-10-28", received: [{ product: "Fusion", qty: 10 }] },
    ] })],
    tickets: [ticket({ id: "xpress_other", postedAt: "2026-10-27", lines: [{ code: "FUS", name: "Fusion", qty: 1 }] })],
  });
  assert.equal(nearby.issues.some((issue) => issue.rule === "qty_mismatch"), false);
  const gap = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "w1" })],
    tickets: [
      ticket({ id: "xpress_WBFS-DT-10", postedAt: "2026-10-28", lines: [{ code: "FUS", name: "Fusion", qty: 6 }] }),
      ticket({ id: "xpress_WBFS-SR-2", type: "SR", postedAt: "2026-10-28", lines: [{ code: "ELX", name: "Elixir", qty: 2 }] }),
    ],
    appTickets: [
      { id: "w1_a", wellId: "w1", rawTicket: "WBFS-DT-10", date: "2026-10-28", lines: [{ code: "FUS", name: "Fusion", qty: 10 }] },
      { id: "w1_b", wellId: "w1", kind: "returned", rawTicket: "WBFS-SR-2", date: "2026-10-28", lines: [{ code: "ELX", name: "Elixir", qty: 5 }] },
    ],
  });
  const mismatches = gap.issues.filter((issue) => issue.rule === "qty_mismatch");
  assert.equal(mismatches.length, 2);
  assert.equal(mismatches.some((issue) => /received/.test(issue.title)), true);
  assert.equal(mismatches.some((issue) => /returned/.test(issue.title)), true);
});

test("chemicals that do not follow a rig move are priced from the pricelist", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Elixir", qty: 8 }] }),
      well({ id: "new", name: "New Hole", spudDate: "2026-10-01", lastReportDate: "2026-10-28", remaining: [], received: [{ product: "Elixir", qty: 3, date: "2026-10-02" }] }),
    ],
    tickets: [],
  });
  const lost = result.issues.find((issue) => issue.rule === "lost_on_rig_move");
  assert.ok(lost);
  assert.equal(lost.products[0].qty, 5);
  assert.equal(lost.dollarValue, 1250);
  const covered = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", spudDate: "2026-09-01", remaining: [{ product: "Elixir", qty: 8 }] }),
      well({ id: "new", spudDate: "2026-10-01", received: [{ product: "Elixir", qty: 8 }] }),
    ],
  });
  assert.equal(covered.issues.some((issue) => issue.rule === "lost_on_rig_move"), false);
});

test("paused or stale wells with remaining product should be returned unless a transfer exists", () => {
  const paused = runChecks({
    date: "2026-11-02", products,
    wells: [well({ status: "paused", remaining: [{ product: "Elixir", qty: 3, price: 250 }] })],
  });
  const issue = paused.issues.find((item) => item.rule === "should_be_returned");
  assert.equal(issue.dollarValue, 750);
  const moved = runChecks({
    date: "2026-11-02", products,
    wells: [well({ status: "inactive", lastReportDate: "2026-10-01", remaining: [{ product: "Elixir", qty: 3 }] })],
    tickets: [ticket({ type: "ST", postedAt: "2026-10-15", lines: [{ code: "ELX", name: "Elixir", qty: 3 }] })],
  });
  assert.equal(moved.issues.some((item) => item.rule === "should_be_returned"), false);
  const fresh = runChecks({ date: "2026-11-02", products, wells: [well({ status: "active", lastReportDate: "2026-11-01", remaining: [{ product: "Elixir", qty: 3 }] })] });
  assert.equal(fresh.issues.some((item) => item.rule === "should_be_returned"), false);
});

test("warehouse drift and negative stock compare snapshots with ticket movement", () => {
  const stock = [
    { id: "2026-11-01_xpress_XV-AB", date: "2026-11-01", source: "xpress", warehouseCode: "XV-AB", warehouseName: "Xpress Alberta", items: [{ code: "ELX", name: "Elixir", onHand: 10, available: 10 }] },
    { id: "2026-11-02_xpress_XV-AB", date: "2026-11-02", source: "xpress", warehouseCode: "XV-AB", warehouseName: "Xpress Alberta", items: [{ code: "ELX", name: "Elixir", onHand: 4, available: 4 }] },
  ];
  const unexplained = runChecks({ date: "2026-11-02", products, stock, tickets: [] });
  const drift = unexplained.issues.find((issue) => issue.rule === "warehouse_drift" && issue.severity === "medium");
  assert.match(drift.detail, /Tickets explain 0/);
  const explained = runChecks({
    date: "2026-11-02", products, stock,
    tickets: [ticket({ postedAt: "2026-11-02", warehouseCode: "XV-AB", source: "xpress", lines: [{ code: "ELX", name: "Elixir", qty: 6 }] })],
  });
  assert.equal(explained.issues.some((issue) => issue.rule === "warehouse_drift" && issue.severity === "medium"), false);
  const negative = runChecks({
    date: "2026-11-02", products,
    stock: [{ date: "2026-11-02", source: "mim", warehouseCode: "MIM-SK", items: [{ code: "FUS", name: "Fusion", onHand: -2, available: -2 }] }],
  });
  assert.equal(negative.issues.find((issue) => /negative/.test(issue.title)).severity, "high");
});

test("today's unpriced deliveries and MIM truck-ticket charges are reported", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    tickets: [
      ticket({ id: "xpress_custom", postedAt: "2026-11-02", lines: [{ code: "CUSTOM", name: "Shop blend", qty: 2 }] }),
      ticket({ id: "mim_tt", source: "mim", type: "TT", postedAt: "2026-11-02", lines: [], charges: [{ service: "haul", qty: 1, billingMethod: "flat", price: 80, total: 80 }, { service: "wait", qty: 1, billingMethod: "hour", price: 20, total: 20 }] }),
      ticket({ id: "mim_old", source: "mim", type: "TT", postedAt: "2026-11-01", charges: [{ total: 999 }] }),
    ],
    sources: { xpress: { ok: true, counts: { tickets: 1 }, error: "" }, mim: { ok: false, counts: {}, error: "timeout" }, mirror: { ok: true, counts: {}, error: "" } },
  });
  assert.equal(result.issues.some((issue) => issue.rule === "missing_price"), true);
  assert.equal(result.summary.mimTtCharges, 100);
  assert.match(result.summary.text, /MIM truck-ticket charges/);
  assert.match(result.summary.text, /mim/);
});

test("expected rig inventory adds deliveries and subtracts returns since the last report", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [well({ remaining: [{ product: "Elixir", qty: 10, price: 250 }] })],
    tickets: [
      ticket({ id: "after", postedAt: "2026-11-01", lines: [{ code: "ELX", name: "Elixir", qty: 4 }] }),
      ticket({ id: "back", type: "SR", postedAt: "2026-11-01", lines: [{ code: "ELX", name: "Elixir", qty: 1 }] }),
      ticket({ id: "before", postedAt: "2026-10-01", lines: [{ code: "ELX", name: "Elixir", qty: 99 }] }),
    ],
  });
  const row = result.rigInventory[0];
  assert.equal(row.expected.find((item) => item.product === "Elixir").qty, 13);
  assert.equal(row.appRemaining[0].qty, 10);
  assert.equal(row.diff.find((item) => item.product === "Elixir").qty, 3);
  assert.deepEqual(row.ticketIds.sort(), ["after", "back"]);
});

test("grace days come from config and PDF paths stay inside the ticket folder", () => {
  const strict = runChecks({
    date: "2026-11-02", config: { graceDays: 0 }, products,
    wells: [well({ lastReportDate: "2026-11-02" })],
    tickets: [ticket({ postedAt: "2026-11-01" })],
  });
  assert.equal(strict.issues.some((issue) => issue.rule === "delivered_not_logged"), true);
  assert.equal(isTicketPdfPath("inventoryBot/tickets/xpress/WBFS-DT-000529.pdf"), true);
  assert.equal(isTicketPdfPath("profile-photos/uid/avatar.jpg"), false);
  assert.equal(isTicketPdfPath("inventoryBot/tickets/../secrets.txt"), false);
});

test("app ticket numbers ignore newlines and match a missing type or warehouse prefix", () => {
  const elk = parseAppDescription("Ticket:WBFS-DT-000488,Delivery from Elk Point Warehouse");
  assert.equal(elk.kind, "received");
  assert.equal(elk.rawTicket, "WBFS-DT-000488");
  const broken = parseAppDescription("Ticket:WBFS-DT-000472\n,note");
  assert.equal(broken.rawTicket, "WBFS-DT-000472");
  const omitted = ticketNorm("NK-004764");
  const full = ticketNorm("NK-DT-004764");
  assert.equal(ticketsMatch(omitted, full), "fuzzy");
  assert.equal(ticketsMatch(ticketNorm("NK-DT-004764"), ticketNorm("CANNK-DT-004764")), "fuzzy");
  assert.equal(ticketsMatch(ticketNorm("BRKS-CT-000174"), ticketNorm("SBBRK-CT-174")), "fuzzy");
  assert.equal(ticketsMatch(full, full), "exact");
  const supplier = parseAppDescription("Ticket:191562,Tiger Calcium Delivery of Heavy Brine");
  assert.equal(ticketNorm(supplier.rawTicket).thirdParty, true);
  const inbound = parseAppDescription("Transfer-To Ticket: 1730000_transferTo_by-ann@uniqenergy.com,Transferring from FromWell (Old Hole at 100/09-26-055-04W4/00)");
  assert.equal(inbound.kind, "transferIn");
  assert.equal(inbound.rawTicket, "1730000_transferTo_by-ann@uniqenergy.com");
  assert.equal(inbound.otherWellUWI, "9-26-55-4W4");
  const outbound = parseAppDescription("Transfer-From Ticket: 1730000_transferFrom_by-ann@uniqenergy.com,Transferred inventory from the well: Old Hole,100/09-26-055-04W4/00, to the ImportedToWell: North Pad", "returned");
  assert.equal(outbound.kind, "transferOut");
  assert.equal(parseAppDescription("Ticket:BRKS-CT-000174,Products returned to Whse via Smithbrook", "returned").kind, "returned");
});

test("a fuzzy ticket number is a typo, an exact number is logged, and a supplier ticket is not missing", () => {
  const fuzzy = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "north-pad" })],
    tickets: [ticket({ id: "xpress_NK-DT-004764", postedAt: "2026-10-20", lines: [{ code: "ELX", name: "Elixir", qty: 4 }] })],
    appTickets: [{ id: "north-pad_r1_0", wellId: "north-pad", reportId: "r1", kind: "received", rawTicket: "NK-004764", date: "2026-10-20", lines: [{ name: "Elixir", qty: 4, price: 250 }] }],
  });
  assert.equal(fuzzy.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
  assert.equal(fuzzy.issues.some((issue) => issue.rule === "logged_no_ticket"), false);
  assert.equal(fuzzy.issues.filter((issue) => issue.rule === "ticket_typo").length, 1);
  const exact = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "north-pad", lastReportDate: "2026-11-02", costs: { dailyProductCost: 1000, dailyServiceCost: 80, dailyTotalCost: 1080 } })],
    tickets: [ticket({ id: "xpress_WBFS-DT-000488", postedAt: "2026-11-02", lines: [{ code: "ELX", name: "Elixir", qty: 2 }] })],
    appTickets: [{ id: "north-pad_r2_0", wellId: "north-pad", description: "Ticket:WBFS-DT-000488,Delivery from Elk Point Warehouse", date: "2026-11-02", lines: [{ name: "Elixir", qty: 4, price: 20 }] }],
  });
  const mismatch = exact.issues.find((issue) => issue.rule === "qty_mismatch");
  assert.ok(mismatch);
  assert.equal(mismatch.dollarValue, 40);
  assert.equal(exact.summary.appProductCost, 1000);
  assert.match(exact.summary.text, /product cost/);
  const supplier = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "north-pad" })],
    appTickets: [{ id: "north-pad_r3_0", wellId: "north-pad", description: "Ticket:191562,Tiger Calcium Delivery of Heavy Brine", date: "2026-10-28", lines: [{ name: "Heavy brine", qty: 1, price: 500 }] }],
  });
  assert.equal(supplier.issues.some((issue) => issue.rule === "logged_no_ticket"), false);
});

test("transfer-to and transfer-from quantities have to agree", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", lsd: "100/09-26-055-04W4/00", lsdNorm: "9-26-55-4W4" }),
      well({ id: "new", name: "North Pad", lsd: "16-1-1-1W5", lsdNorm: "16-1-1-1W5" }),
    ],
    appTickets: [
      { id: "new_r_0", wellId: "new", description: "Transfer-To Ticket: 1730000_transferTo_by-ann@uniqenergy.com,Transferring from FromWell (Old Hole at 100/09-26-055-04W4/00)", date: "2026-10-20", lines: [{ name: "Elixir", qty: 4, price: 250 }] },
      { id: "old_r_0", wellId: "old", description: "Transfer-From Ticket: 1730000_transferFrom_by-ann@uniqenergy.com,Transferred inventory from the well: Old Hole,100/09-26-055-04W4/00, to the ImportedToWell: North Pad", date: "2026-10-20", lines: [{ name: "Elixir", qty: 1, price: 250 }] },
    ],
  });
  const mismatch = result.issues.find((issue) => issue.rule === "transfer_mismatch");
  assert.ok(mismatch);
  assert.equal(mismatch.products[0].qty, 3);
  assert.equal(mismatch.dollarValue, 750);
});

test("checks ignore tickets and app entries before checksStartDate", () => {
  const config = configFromMain({ checksStartDate: "2026-10-30", config: { graceDays: 3 } });
  assert.equal(config.checksStartDate, "2026-10-30");
  assert.equal(config.graceDays, 3);
  assert.equal(configFromMain({ config: { checksStartDate: "2026-11-01" } }).checksStartDate, "2026-11-01");
  assert.equal(configFromMain({ config: { checksStartDate: "October" } }).checksStartDate, "");
  const early = runChecks({
    date: "2026-11-02", config,
    products,
    wells: [well({})],
    tickets: [ticket({ postedAt: "2026-10-20" })],
    appTickets: [{ id: "w1_r_received-0", wellId: "w1", rawTicket: "WBFS-DT-1", date: "2026-10-20", lines: [{ name: "Elixir", qty: 9, price: 10 }] }],
    stock: [
      { date: "2026-10-01", source: "xpress", warehouseCode: "XV-AB", items: [{ code: "ELX", name: "Elixir", onHand: 10, available: 10 }] },
      { date: "2026-10-15", source: "xpress", warehouseCode: "XV-AB", items: [{ code: "ELX", name: "Elixir", onHand: 1, available: 1 }] },
    ],
  });
  assert.equal(early.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
  assert.equal(early.issues.some((issue) => issue.rule === "ticket_typo" || issue.rule === "qty_mismatch" || issue.rule === "logged_no_ticket"), false);
  assert.equal(early.issues.some((issue) => issue.rule === "warehouse_drift"), false);
  const loggedEarly = runChecks({
    date: "2026-11-03", config,
    products,
    wells: [well({ lastReportDate: "2026-11-02" })],
    tickets: [ticket({ id: "xpress_TBAR-DT-001232", postedAt: "2026-10-30", shippedAt: "2026-10-30" })],
    appTickets: [{ id: "w1_old", wellId: "w1", kind: "received", rawTicket: "TBAR-DT-001232", date: "2026-10-29", lines: [{ name: "Elixir", qty: 4 }] }],
  });
  assert.equal(loggedEarly.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
  const wells = [
    well({ id: "a04", name: "Tundra A04", lsd: "1-1-1-1W4", lsdNorm: "1-1-1-1W4", rig: "10" }),
    well({ id: "b04", name: "Tundra B04", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12", contractor: "Tundra" }),
  ];
  const alchemTicket = ticket({ id: "mim_DTAWEY011648", source: "mim", type: "DT", warehouseCode: "AWEY", postedAt: "2026-10-30", shippedAt: "2026-10-30", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12", customer: "Tundra" });
  const alchemApps = [{ id: "b04_r", wellId: "b04", kind: "received", rawTicket: "11648", date: "2026-10-30", lines: [{ name: "Elixir", qty: 4 }] }];
  const alchem = runChecks({ date: "2026-11-03", config, products, wells, tickets: [alchemTicket], appTickets: alchemApps });
  assert.equal(alchem.issues.some((issue) => issue.rule === "delivered_not_logged"), false);
  assert.equal(matchLoggedApp(alchemTicket, alchemApps, wells).well.id, "b04");
  assert.equal(appCitesTicket(alchemApps[0], alchemTicket), true);
  const later = runChecks({
    date: "2026-11-02", config,
    products,
    wells: [well({ status: "completed-reviewed", lastReportDate: "2026-11-01", remaining: [{ product: "Elixir", qty: 2, price: 250 }] })],
  });
  assert.equal(later.issues.some((issue) => issue.rule === "should_be_returned"), true);
  assert.equal(isInactiveStatus("completed-other"), true);
  assert.equal(isInactiveStatus("active"), false);
});

test("mirror well fields, app_ product ids, and app ticket id suffixes are accepted", () => {
  const parsed = normalizeAppTicket({ id: "north_pad_report9_returned-2", description: "Ticket:BRKS-CT-000174,Products returned", date: "2026-11-01", lines: [{ name: "Elixir", qty: 1, price: 5 }] });
  assert.equal(kindFromAppTicketId(parsed.id), "returned");
  assert.equal(parsed.kind, "returned");
  const result = runChecks({
    date: "2026-11-02",
    products: [{ id: "app_elixir", name: "Elixir", xpressCodes: ["ELX"], mimCodes: [], appNames: ["Elixir"], price: 250, cost: 100, confirmed: true }],
    wells: [well({ remaining: [], remainingSource: "opening", openingRemaining: [{ product: "Elixir", qty: 6, price: 250 }], newestReportId: "report-9", status: "completed-reviewed", lastReportDate: "2026-11-01" })],
  });
  const issue = result.issues.find((item) => item.rule === "should_be_returned");
  assert.equal(issue.products[0].qty, 6);
  assert.equal(issue.dollarValue, 1500);
});

test("a run write requests checks only when checksRequestedAt changes", () => {
  assert.equal(checksRequestChanged(undefined, "2026-11-02T12:00:00.000Z"), true);
  assert.equal(checksRequestChanged("2026-11-02T12:00:00.000Z", "2026-11-02T12:00:00.000Z"), false);
  assert.equal(checksRequestChanged("2026-11-02T12:00:00.000Z", "2026-11-02T13:00:00.000Z"), true);
  assert.equal(checksRequestChanged(undefined, undefined), false);
  assert.equal(checksRequestChanged({ seconds: 1, nanoseconds: 0 }, { seconds: 1, nanoseconds: 0 }), false);
  assert.equal(checksRequestChanged({ toDate: () => new Date("2026-11-02T12:00:00.000Z") }, { toDate: () => new Date("2026-11-02T12:00:00.000Z") }), false);
});

test("blank stock codes match on product id or name, and drums and pallets are not stock issues", () => {
  assert.equal(stockItemKey({ code: "", productId: "app_elixir", name: "Elixir" }), stockItemKey({ productId: "app_Elixir" }));
  assert.equal(stockItemKey({ code: " ", name: "Elixir 100" }), "elixir 100");
  assert.deepEqual(configFromMain({}).ignoreStockNames, DEFAULT_IGNORE_STOCK_NAMES);
  assert.equal(isIgnoredStockItem({ name: "Used Empty Drums" }, DEFAULT_IGNORE_STOCK_NAMES), true);
  assert.equal(isIgnoredStockItem({ name: "SHRINK WRAP" }), true);
  assert.equal(isIgnoredStockItem({ name: "STRETCHWRAPS" }), true);
  assert.equal(isIgnoredStockItem({ name: "CAL CHLORIDE HT POWDER (40kg) 40/PALLET" }), false);
  const result = runChecks({
    date: "2026-11-02", products,
    stock: [
      { date: "2026-11-01", source: "xpress", warehouseCode: "WBFS", items: [
        { code: "", productId: "app_elixir", name: "Elixir", onHand: 10, available: 10 },
        { code: "", name: "Fusion", onHand: 8, available: 8 },
        { code: "", name: "Empty Drums", onHand: 4, available: 4 },
      ] },
      { date: "2026-11-02", source: "xpress", warehouseCode: "WBFS", items: [
        { code: "", productId: "app_elixir", name: "Elixir", onHand: 10, available: 10 },
        { code: "", name: "Fusion", onHand: 1, available: 1 },
        { code: "", name: "Empty Drums", onHand: -5, available: -5 },
        { code: "", name: "Wood Pallets", onHand: -1, available: -1 },
      ] },
    ],
  });
  const drift = result.issues.filter((issue) => issue.rule === "warehouse_drift");
  assert.equal(drift.length, 1);
  assert.match(drift[0].title, /Fusion/);
  const custom = runChecks({
    date: "2026-11-02",
    config: { ignoreStockNames: ["Sample Kit"] },
    stock: [{ date: "2026-11-02", source: "xpress", warehouseCode: "WBFS", items: [{ code: "", name: "Sample Kit", onHand: -2, available: -2 }, { code: "", name: "Empty Drums", onHand: -3, available: -3 }] }],
  });
  assert.equal(custom.issues.some((issue) => /Sample Kit/.test(issue.title)), false);
  assert.equal(custom.issues.some((issue) => /Empty Drums/.test(issue.title)), true);
});

test("credit tickets add warehouse stock and pack sizes stay separate", () => {
  const credit = runChecks({
    date: "2026-11-02", products,
    stock: [
      { date: "2026-11-01", source: "xpress", warehouseCode: "CANNK", items: [{ code: "ELX", name: "Elixir", onHand: 10, available: 10 }] },
      { date: "2026-11-02", source: "xpress", warehouseCode: "CANNK", items: [{ code: "ELX", name: "Elixir", onHand: 14, available: 14 }] },
    ],
    tickets: [ticket({ id: "xpress_NK-000888", type: "CT", postedAt: "2026-11-02", warehouseCode: "CANNK", source: "xpress", lines: [{ code: "ELX", name: "Elixir", qty: 4 }] })],
  });
  assert.equal(credit.issues.some((issue) => issue.rule === "warehouse_drift" && issue.severity === "medium"), false);
  const clay = { id: "clay", name: "Clay-Control", xpressCodes: ["CLAY"], mimCodes: [], appNames: [], unit: "1000L", price: 10, confirmed: true };
  const packs = runChecks({
    date: "2026-11-02", products: [clay],
    stock: [
      { date: "2026-11-01", source: "xpress", warehouseCode: "TBAR", items: [{ code: "CLAY", name: "Clay-Control", unit: "18 L", onHand: 10 }, { code: "CLAY", name: "Clay-Control", unit: "1000 L", onHand: 2 }] },
      { date: "2026-11-02", source: "xpress", warehouseCode: "TBAR", items: [{ code: "CLAY", name: "Clay-Control", unit: "18 L", onHand: 8 }, { code: "CLAY", name: "Clay-Control", unit: "1000 L", onHand: 2 }] },
    ],
    tickets: [ticket({ id: "xpress_TBAR-DT-9", postedAt: "2026-11-02", warehouseCode: "TBAR", source: "xpress", lines: [{ code: "CLAY", name: "Clay-Control", unit: "18 L", qty: 2 }] })],
  });
  assert.equal(packs.issues.some((issue) => issue.rule === "warehouse_drift" && issue.severity === "medium"), false);
});

test("STx transfers count toward warehouse stock in any case", () => {
  assert.equal(stockEffect("STx", 4), -4);
  assert.equal(stockEffect("CT", 4), 4);
  assert.equal(stockEffect("SR", 2), 2);
  assert.equal(stockEffect("DT", 4), -4);
  assert.equal(stockEffect("ST", 4), -4);
  assert.equal(stockEffect("AT", -3), -3);
  assert.equal(stockEffect("TT", 4), 0);
  assert.equal(stockEffect("TT", 4, { direction: "in" }), 4);
  assert.equal(stockEffect("ST", 4, { direction: "in" }), 4);
  assert.equal(stockEffect("stx", 4), -4);
  assert.equal(stockEffect("STX", 4), -4);
  assert.equal(inTicketTypes("STx", ["ST", "STx"]), true);
  assert.equal(isTicketType("STx", "stx"), true);
  assert.equal(ticketLookupId("xpress_TBAR-DT-001232"), "xpress_TBAR-DT-001232");
  assert.equal(ticketLookupId("xpress_TBAR-DT-001232".toLowerCase()), "xpress_tbar-dt-001232");
  const result = runChecks({
    date: "2026-11-02", products,
    stock: [
      { date: "2026-11-01", source: "xpress", warehouseCode: "WBFS", warehouseName: "Xpress", items: [{ code: "ELX", name: "Elixir", onHand: 10, available: 10 }] },
      { date: "2026-11-02", source: "xpress", warehouseCode: "WBFS", warehouseName: "Xpress", items: [{ code: "ELX", name: "Elixir", onHand: 6, available: 6 }] },
    ],
    tickets: [ticket({ id: "xpress_WBFS-ST-000053", type: "STx", postedAt: "2026-11-02", warehouseCode: "WBFS", lsd: "", rig: "", lines: [{ code: "ELX", name: "Elixir", qty: 4 }] })],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "warehouse_drift" && issue.severity === "medium"), false);
});

test("supplier references and cross-source numbers are not fuzzy ticket matches", () => {
  assert.equal(ticketNorm("DW2632").thirdParty, true);
  assert.equal(ticketsMatch(ticketNorm("DW2632"), ticketNorm("NK-000891")), "none");
  assert.equal(ticketsMatch(ticketNorm("DW2632"), ticketNorm("CTAWEY001777")), "none");
  assert.equal(ticketsMatch(ticketNorm("NK-DT-004764"), ticketNorm("CANNK-DT-004764")), "fuzzy");
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "north-pad" })],
    tickets: [
      ticket({ id: "xpress_NK-000891", postedAt: "2026-10-28", lines: [{ code: "ELX", name: "Elixir", qty: 1 }] }),
      ticket({ id: "mim_CTAWEY001777", source: "mim", postedAt: "2026-10-28", lines: [{ code: "ELX", name: "Elixir", qty: 1 }] }),
    ],
    appTickets: [{ id: "north-pad_r_0", wellId: "north-pad", rawTicket: "DW2632", date: "2026-10-28", lines: [{ name: "Heavy brine", qty: 1, price: 10 }] }],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "ticket_typo"), false);
});

test("equal transfer quantities a day apart are a pair even when the LSD text differs", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "from", name: "From", lsd: "1-14-74-25W5", lsdNorm: "1-14-74-25W5" }),
      well({ id: "to", name: "To", lsd: "1-10-74-25W5", lsdNorm: "1-10-74-25W5" }),
    ],
    appTickets: [
      { id: "to_r_0", wellId: "to", kind: "transferIn", rawTicket: "move-a", date: "2026-10-21", otherWellUWI: "1-14-74-25W5", lines: [{ name: "Elixir", qty: 4, price: 250 }] },
      { id: "from_r_0", wellId: "from", kind: "transferOut", rawTicket: "move-b", date: "2026-10-20", otherWellUWI: "1-10-74-25W5", lines: [{ name: "Elixir", qty: 4, price: 250 }] },
    ],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "transfer_mismatch"), false);
});

test("a rig move compares contractor and rig number", () => {
  assert.equal(rigIdentity({ contractor: "Ensign", rig: "Rig 245" }), rigIdentity({ contractor: "ensign", rig: "245" }));
  assert.notEqual(rigIdentity({ contractor: "Ensign", rig: "245" }), rigIdentity({ contractor: "Precision", rig: "245" }));
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", contractor: "Ensign", spudDate: "2026-09-01", remaining: [{ product: "Elixir", qty: 8 }] }),
      well({ id: "new", contractor: "Precision", spudDate: "2026-10-01", received: [] }),
    ],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "lost_on_rig_move"), false);
});

test("unlinked delivery lines share one unpriced-items issue", () => {
  const result = runChecks({
    date: "2026-11-02",
    products: [...products, { id: "nox", name: "No Price", xpressCodes: ["NOX"], mimCodes: [], appNames: [], price: undefined, confirmed: false }],
    tickets: [ticket({ id: "xpress_custom", postedAt: "2026-11-02", lsd: "", rig: "", lines: [{ code: "CUSTOM", name: "Shop blend", qty: 2 }, { code: "WAIT", name: "Wait time", qty: 1 }, { code: "NOX", name: "No Price", qty: 1 }] })],
  });
  const priced = result.issues.filter((issue) => issue.rule === "missing_price");
  assert.equal(priced.length, 2);
  assert.equal(priced.filter((issue) => issue.title === "Unpriced items").length, 1);
  assert.match(priced.find((issue) => issue.title === "Unpriced items").detail, /Shop blend/);
  assert.match(priced.find((issue) => issue.title === "Unpriced items").detail, /Wait time/);
});

test("a supplier ticket is not line-compared with warehouse tickets on the same pad", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "north-pad", lsd: "104/9-26-55-4W4", lsdNorm: "9-26-55-4W4", rig: "245" })],
    tickets: [
      ticket({ id: "xpress_NK-000891", postedAt: "2026-11-01", lines: [{ code: "TERM", name: "Terminox", qty: 20 }] }),
      ticket({ id: "mim_CTAWEY001777", source: "mim", postedAt: "2026-11-01", lines: [{ code: "TERM", name: "Terminox", qty: 5 }] }),
    ],
    appTickets: [{ id: "north-pad_r_0", wellId: "north-pad", rawTicket: "DW2632", date: "2026-10-28", lines: [{ name: "Terminox", qty: 1, price: 40 }] }],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "qty_mismatch"), false);
  assert.equal(result.issues.some((issue) => issue.ticketIds?.includes("mim_CTAWEY001777") || issue.ticketIds?.includes("xpress_NK-000891")), false);
});

test("a transfer that stays on one well is not a mismatch", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "same", name: "Same Pad" })],
    appTickets: [
      { id: "same_in", wellId: "same", kind: "transferIn", rawTicket: "self-a", date: "2026-10-20", lines: [{ name: "Elixir", qty: 4, price: 250 }] },
      { id: "same_out", wellId: "same", kind: "transferOut", rawTicket: "self-b", date: "2026-10-20", lines: [{ name: "Elixir", qty: 1, price: 250 }] },
    ],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "transfer_mismatch"), false);
});

test("a stale well whose rig moved does not also bill should_be_returned", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", contractor: "Ensign", rig: "245", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Elixir", qty: 8, price: 250 }] }),
      well({ id: "new", name: "New Hole", contractor: "Ensign", rig: "245", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
  });
  assert.equal(result.issues.filter((issue) => issue.rule === "lost_on_rig_move").length, 1);
  assert.equal(result.issues.some((issue) => issue.rule === "should_be_returned"), false);
  assert.equal(result.summary.dollarsAtRisk, 2000);
});

test("negative available is described as available", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    stock: [{ date: "2026-11-02", source: "xpress", warehouseCode: "WBFS", items: [{ code: "ELX", name: "Elixir", onHand: 2, available: -3 }] }],
  });
  const issue = result.issues.find((item) => /negative/.test(item.title));
  assert.match(issue.detail, /available/);
  assert.doesNotMatch(issue.detail, /on hand/);
});

test("every product left on the old well is flagged unless that product was carried", () => {
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "spl-14-3", name: "SPL 14-3", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Chrome Free Desco II", qty: 4, price: 100 }, { product: "Elixir", qty: 28, price: 250 }] }),
      well({ id: "spl-5-22", name: "SPL 5-22", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
    tickets: [ticket({ id: "xpress_NK-DT-9", postedAt: "2026-10-15", rig: "361", lsd: "", lines: [{ code: "ELX", name: "Elixir", qty: 28 }] })],
    appTickets: [
      { id: "spl-5-22_in", wellId: "spl-5-22", kind: "transferIn", rawTicket: "1730000000000_transferTo_by-ops", date: "2026-10-02", lines: [{ name: "Chrome Free Desco II", qty: 4, price: 100 }] },
      { id: "spl-14-3_out", wellId: "spl-14-3", kind: "transferOut", rawTicket: "1730000000000_transferFrom_by-ops", date: "2026-10-02", lines: [{ name: "Chrome Free Desco II", qty: 4, price: 100 }] },
    ],
  });
  const lost = result.issues.filter((issue) => issue.rule === "lost_on_rig_move");
  assert.deepEqual(lost.map((issue) => issue.products[0].name), ["Elixir"]);
  assert.equal(lost[0].products[0].qty, 28);
  assert.equal(lost[0].dollarValue, 7000);
  assert.equal(result.issues.some((issue) => issue.rule === "should_be_returned"), false);
  assert.equal(result.summary.dollarsAtRisk, 7000);

  const partial = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Chrome Free Desco II", qty: 10, price: 100 }, { product: "Elixir", qty: 8, price: 250 }, { product: "Fusion", qty: 2, price: 40 }] }),
      well({ id: "new", name: "New Hole", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [{ product: "Elixir", qty: 8, date: "2026-10-05" }], reports: [{ date: "2026-10-02", remaining: [{ product: "Fusion", qty: 2 }], received: [] }] }),
    ],
    appTickets: [{ id: "new_in", wellId: "new", kind: "transferIn", rawTicket: "1730000000000_transferTo_by-ops", date: "2026-10-02", lines: [{ name: "Chrome Free Desco II", qty: 4, price: 100 }] }],
  });
  const gaps = Object.fromEntries(partial.issues.filter((issue) => issue.rule === "lost_on_rig_move").map((issue) => [issue.products[0].name, issue.products[0].qty]));
  assert.deepEqual(gaps, { "Chrome Free Desco II": 6, Elixir: 8 });
  assert.equal(partial.issues.some((issue) => issue.rule === "should_be_returned"), false);
});

test("long well ids keep a separate lost_on_rig_move issue per product", () => {
  const oldId = `mirror_${"a".repeat(40)}`;
  const newId = `mirror_${"b".repeat(40)}`;
  const longName = `Specialty Chemical ${"Z".repeat(90)}`;
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: oldId, name: "SPL 14-3", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Chrome Free Desco II", qty: 4, price: 100 }, { product: "Elixir", qty: 28, price: 250 }, { product: longName, qty: 2, price: 15 }, { product: "Pallets", qty: 6, price: 20 }] }),
      well({ id: newId, name: "SPL 5-22", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
  });
  const lost = result.issues.filter((issue) => issue.rule === "lost_on_rig_move");
  assert.equal(lost.length, 3);
  assert.equal(new Set(lost.map((issue) => issue.id)).size, 3);
  assert.match(lost.find((issue) => issue.products[0].name === "Elixir").id, /^2026-11-02_lost_on_rig_move_[0-9a-f]{12}_elixir$/);
  assert.match(lost.find((issue) => issue.products[0].name === "Chrome Free Desco II").id, /^2026-11-02_lost_on_rig_move_[0-9a-f]{12}_chrome-free-desco-ii$/);
  const longIssue = lost.find((issue) => issue.products[0].name === longName);
  assert.equal(longIssue.id.endsWith("z".repeat(90)), true);
  assert.equal(longIssue.id.length > 80, true);
  assert.equal(lost.some((issue) => /pallet/i.test(issue.products[0].name)), false);
  assert.equal(result.issues.some((issue) => issue.rule === "should_be_returned"), false);
  assert.equal(result.summary.dollarsAtRisk, 7430);
});

test("a repeated issue id with a different payload keeps both", () => {
  const issues = new Map();
  const first = { id: "2026-11-02_lost_on_rig_move_abc123abc123_elixir", date: "2026-11-02", rule: "lost_on_rig_move", severity: "high", title: "Elixir", detail: "left behind", wellId: "old", rig: "361", lsd: "", ticketIds: [], products: [{ name: "Elixir", qty: 4, value: 1000 }], dollarValue: 1000, status: "open", note: "", resolvedBy: "", resolvedAt: null };
  addIssue(issues, first);
  addIssue(issues, { ...first, detail: "a different chemical", products: [{ name: "Fusion", qty: 2, value: 200 }], dollarValue: 200 });
  addIssue(issues, first);
  assert.equal(issues.size, 2);
  assert.equal(issues.get(first.id).dollarValue, 1000);
  assert.equal(issues.get(`${first.id}_2`).products[0].name, "Fusion");
});

test("a rig move waits until the old well is outside grace and the new well has a report", () => {
  const durham = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "creek", name: "DURHAM CREEK", contractor: "Ensign", rig: "419", spudDate: "2026-10-01", lastReportDate: "2026-11-02", status: "active", remaining: [{ product: "Elixir", qty: 31, price: 250 }] }),
      well({ id: "hz", name: "DURHAM 6HZ", contractor: "Ensign", rig: "419", spudDate: "2026-11-02", lastReportDate: "", status: "active", remaining: [] }),
    ],
  });
  assert.equal(durham.issues.some((issue) => issue.rule === "lost_on_rig_move"), false);
  const noReport = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", contractor: "Ensign", rig: "419", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Elixir", qty: 4, price: 250 }] }),
      well({ id: "new", name: "New Hole", contractor: "Ensign", rig: "419", spudDate: "2026-11-02", lastReportDate: null, remaining: [], received: [] }),
    ],
  });
  assert.equal(noReport.issues.some((issue) => issue.rule === "lost_on_rig_move"), false);
  const recent = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", contractor: "Ensign", rig: "419", spudDate: "2026-09-01", lastReportDate: "2026-11-01", status: "active", remaining: [{ product: "Elixir", qty: 4 }] }),
      well({ id: "new", contractor: "Ensign", rig: "419", spudDate: "2026-11-02", lastReportDate: "2026-11-02", status: "active", remaining: [], received: [] }),
    ],
  });
  assert.equal(recent.issues.some((issue) => issue.rule === "lost_on_rig_move"), false);
});

test("a transfer is one issue, and a missing sender is not dollars at risk", () => {
  const grouped = runChecks({
    date: "2026-11-02", products,
    wells: [
      well({ id: "old", name: "Old Hole", lsd: "100/09-26-055-04W4/00", lsdNorm: "9-26-55-4W4" }),
      well({ id: "new", name: "North Pad", lsd: "16-1-1-1W5", lsdNorm: "16-1-1-1W5" }),
    ],
    appTickets: [
      { id: "new_r_0", wellId: "new", description: "Transfer-To Ticket: 1730000_transferTo_by-ann@uniqenergy.com,Transferring from FromWell (Old Hole at 100/09-26-055-04W4/00)", date: "2026-10-20", lines: [{ name: "Elixir", qty: 4, price: 250 }, { name: "Fusion", qty: 2, price: 100 }] },
      { id: "old_r_0", wellId: "old", description: "Transfer-From Ticket: 1730000_transferFrom_by-ann@uniqenergy.com,Transferred inventory from the well: Old Hole,100/09-26-055-04W4/00, to the ImportedToWell: North Pad", date: "2026-10-20", lines: [{ name: "Elixir", qty: 1, price: 250 }] },
    ],
  });
  const mismatch = grouped.issues.filter((issue) => issue.rule === "transfer_mismatch");
  assert.equal(mismatch.length, 1);
  assert.deepEqual(mismatch[0].products.map((line) => line.name).sort(), ["Elixir", "Fusion"]);
  assert.equal(mismatch[0].dollarValue, 950);
  assert.equal(grouped.summary.dollarsAtRisk, 950);
  const missingSender = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "new", name: "North Pad", lsd: "16-1-1-1W5", lsdNorm: "16-1-1-1W5" })],
    appTickets: [{ id: "new_r_0", wellId: "new", kind: "transferIn", rawTicket: "1730000_transferTo_by-ann", otherWellUWI: "13-20-63-3W4", date: "2026-10-20", lines: [{ name: "Elixir", qty: 4, price: 250 }, { name: "Fusion", qty: 2, price: 100 }] }],
  });
  const unloaded = missingSender.issues.filter((issue) => issue.rule === "transfer_mismatch");
  assert.equal(unloaded.length, 1);
  assert.equal(unloaded[0].severity, "low");
  assert.equal(unloaded[0].title, "Transfer sender not loaded");
  assert.equal(unloaded[0].dollarValue, 0);
  assert.equal(unloaded[0].products.length, 2);
  assert.match(unloaded[0].detail, /13-20-63-3W4/);
  assert.equal(missingSender.summary.dollarsAtRisk, 0);
});

test("an app line price is used instead of a different pack size on the pricelist", () => {
  const clay = { id: "clay", name: "Clay-Control", xpressCodes: ["CLAY"], mimCodes: [], appNames: ["Clay-Control"], unit: "1000L", price: 5629, cost: 4000, confirmed: true };
  const catalog = [...products, clay];
  const transfer = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [
      well({ id: "old", name: "Old Hole", lsd: "9-26-55-4W4", lsdNorm: "9-26-55-4W4" }),
      well({ id: "new", name: "North Pad", lsd: "16-1-1-1W5", lsdNorm: "16-1-1-1W5" }),
    ],
    appTickets: [
      { id: "new_r_0", wellId: "new", kind: "transferIn", rawTicket: "1730000_transferTo_by-ops", date: "2026-10-20", lines: [{ name: "Clay-Control", unit: "pail", qty: 29, price: 190 }] },
      { id: "old_r_0", wellId: "old", kind: "transferOut", rawTicket: "1730000_transferFrom_by-ops", date: "2026-10-20", lines: [{ name: "Clay-Control", unit: "pail", qty: 0, price: 190 }] },
    ],
  });
  const mismatch = transfer.issues.find((issue) => issue.rule === "transfer_mismatch");
  assert.equal(mismatch.products[0].qty, 29);
  assert.equal(mismatch.dollarValue, 5510);
  const lost = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [
      well({ id: "old", name: "Old Hole", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Clay-Control", unit: "pail", qty: 29, price: 190 }] }),
      well({ id: "new", name: "New Hole", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
  });
  assert.equal(lost.issues.find((issue) => issue.rule === "lost_on_rig_move").dollarValue, 5510);
  const returned = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ status: "paused", remaining: [{ product: "Clay-Control", unit: "pail", qty: 29, price: 190 }] })],
  });
  assert.equal(returned.issues.find((issue) => issue.rule === "should_be_returned").dollarValue, 5510);
  const unmatched = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ status: "paused", remaining: [{ product: "Clay-Control", unit: "pail", qty: 29 }] })],
  });
  assert.equal(unmatched.issues.find((issue) => issue.rule === "should_be_returned").dollarValue, 0);
  const samePack = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ status: "paused", remaining: [{ product: "Clay-Control", unit: "1000L", qty: 2 }] })],
  });
  assert.equal(samePack.issues.find((issue) => issue.rule === "should_be_returned").dollarValue, 11258);
});

test("two pack sizes of one product keep their own prices", () => {
  const terminox = { id: "terminox", name: "Terminox", xpressCodes: ["TERM"], mimCodes: [], appNames: [], unit: "20L", price: 160, cost: 100, confirmed: true };
  const barite = { id: "barite", name: "Barite", xpressCodes: ["BAR"], mimCodes: [], appNames: [], unit: "25kg", price: 80, cost: 50, confirmed: true };
  const catalog = [...products, terminox, barite];
  const split = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [
      well({ id: "spl-14-3", name: "SPL 14-3", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Terminox", unit: "1000L", qty: 1, price: 9000 }, { product: "Terminox", unit: "19L", qty: 28, price: 140 }] }),
      well({ id: "spl-5-22", name: "SPL 5-22", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
  });
  const lost = split.issues.filter((issue) => issue.rule === "lost_on_rig_move");
  assert.equal(lost.length, 2);
  assert.equal(lost.find((issue) => issue.products[0].name === "Terminox 1000L").dollarValue, 9000);
  assert.equal(lost.find((issue) => issue.products[0].name === "Terminox 19L").dollarValue, 3920);
  assert.match(lost.find((issue) => issue.products[0].name === "Terminox 1000L").id, /_terminox-1000l$/);
  assert.match(lost.find((issue) => issue.products[0].name === "Terminox 19L").id, /_terminox-20l$/);
  assert.equal(split.summary.dollarsAtRisk, 12920);
  const carried = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [
      well({ id: "spl-14-3", name: "SPL 14-3", contractor: "Ensign", rig: "361", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Terminox", unit: "1000L", qty: 1, price: 9000 }, { product: "Terminox", unit: "19L", qty: 28, price: 140 }] }),
      well({ id: "spl-5-22", name: "SPL 5-22", contractor: "Ensign", rig: "361", spudDate: "2026-10-01", lastReportDate: "2026-11-01", status: "active", remaining: [], received: [] }),
    ],
    appTickets: [{ id: "spl-5-22_in", wellId: "spl-5-22", kind: "transferIn", rawTicket: "1730000000000_transferTo_by-ops", date: "2026-10-02", lines: [{ name: "Terminox", unit: "19L", qty: 28, price: 140 }] }],
  });
  const still = carried.issues.filter((issue) => issue.rule === "lost_on_rig_move");
  assert.deepEqual(still.map((issue) => issue.products[0].name), ["Terminox 1000L"]);
  assert.equal(still[0].dollarValue, 9000);
  const priced = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ id: "packs", rig: "", lsd: "", status: "paused", remaining: [{ product: "Terminox", unit: "19L", qty: 10 }, { product: "Barite", unit: "22.68kg", qty: 4 }, { product: "Terminox", unit: "1000L", qty: 1 }] })],
  });
  const returns = Object.fromEntries(priced.issues.filter((issue) => issue.rule === "should_be_returned").map((issue) => [issue.products[0].name, issue.dollarValue]));
  assert.equal(returns["Terminox 19L"], 1600);
  assert.equal(returns["Barite 22.68kg"], 320);
  assert.equal(returns["Terminox 1000L"], 0);
});

test("near pack sizes match a warehouse ticket, and 1000 L Bleach is the tote", () => {
  const catalog = [
    { id: "unipac", name: "UniPAC LVD", xpressCodes: ["UP"], mimCodes: [], appNames: [], unit: "25kg", price: 40, confirmed: true },
    { id: "inertia", name: "Inertia", xpressCodes: ["IN"], mimCodes: [], appNames: [], unit: "20L", price: 30, confirmed: true },
    { id: "detergent", name: "Detergent L", xpressCodes: ["DET"], mimCodes: [], appNames: [], unit: "20L", price: 20, confirmed: true },
    { id: "sawdust", name: "Sawdust", xpressCodes: ["SAW"], mimCodes: [], appNames: [], unit: "7kg", price: 10, confirmed: true },
    { id: "bleach-tote", name: "Bleach (Tote)", xpressCodes: ["BLT"], mimCodes: [], appNames: [], unit: "1000L", price: 500, confirmed: true },
  ];
  assert.equal(matchProduct(indexProducts(catalog), "", "Bleach", "1000 L").id, "bleach-tote");
  assert.equal(matchProduct(indexProducts(catalog), "", "Bleach", "20L"), null);
  const matched = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ id: "w1", rig: "", lsd: "" })],
    tickets: [
      ticket({ id: "xpress_BRKS-DT-000537", postedAt: "2026-11-02", lines: [{ code: "UP", name: "UniPAC LVD", unit: "22.7 kg", qty: 4 }, { code: "IN", name: "Inertia", unit: "20 L", qty: 3 }] }),
      ticket({ id: "xpress_WBFS-CT-000122", type: "CT", postedAt: "2026-11-02", lines: [{ code: "DET", name: "Detergent L", unit: "18.93 L", qty: 2 }] }),
      ticket({ id: "xpress_WBFS-DT-000529", postedAt: "2026-11-02", lines: [{ code: "SAW", name: "Sawdust", unit: "7.3 kg", qty: 5 }] }),
      ticket({ id: "xpress_WBFS-DT-000900", postedAt: "2026-11-02", lines: [{ code: "BLT", name: "Bleach (Tote)", unit: "1000L", qty: 1 }] }),
    ],
    appTickets: [
      { id: "w1_a", wellId: "w1", rawTicket: "BRKS-DT-000537", date: "2026-11-02", lines: [{ name: "UniPAC LVD", unit: "22.68 kg", qty: 4, price: 10 }, { name: "Inertia", unit: "19 L", qty: 3, price: 10 }] },
      { id: "w1_b", wellId: "w1", kind: "returned", rawTicket: "WBFS-CT-000122", date: "2026-11-02", lines: [{ name: "Detergent L", unit: "19 L", qty: 2, price: 10 }] },
      { id: "w1_c", wellId: "w1", rawTicket: "WBFS-DT-000529", date: "2026-11-02", lines: [{ name: "Sawdust", unit: "6.8 kg", qty: 5, price: 10 }] },
      { id: "w1_d", wellId: "w1", rawTicket: "WBFS-DT-000900", date: "2026-11-02", lines: [{ name: "Bleach", unit: "1000 L", qty: 1, price: 400 }] },
    ],
  });
  assert.equal(matched.issues.some((issue) => issue.rule === "qty_mismatch"), false);
  const pail = runChecks({
    date: "2026-11-02", products: catalog,
    wells: [well({ id: "w1", rig: "", lsd: "" })],
    tickets: [ticket({ id: "xpress_WBFS-DT-000901", postedAt: "2026-11-02", lines: [{ code: "BLT", name: "Bleach (Tote)", unit: "1000L", qty: 1 }] })],
    appTickets: [{ id: "w1_e", wellId: "w1", rawTicket: "WBFS-DT-000901", date: "2026-11-02", lines: [{ name: "Bleach", unit: "20L", qty: 1, price: 40 }] }],
  });
  assert.equal(pail.issues.some((issue) => issue.rule === "qty_mismatch"), true);
});

test("pallet names are ignored on quantity and price checks", () => {
  assert.equal(isIgnoredStockItem({ name: "Pallet Recycling" }, DEFAULT_IGNORE_STOCK_NAMES), true);
  const result = runChecks({
    date: "2026-11-02", products,
    wells: [well({ id: "w1", lsd: "", rig: "" })],
    tickets: [ticket({ id: "xpress_WBFS-DT-77", postedAt: "2026-11-02", lsd: "", rig: "", lines: [{ code: "PAL", name: "PALLETS", qty: 2 }] })],
    appTickets: [{ id: "w1_p", wellId: "w1", rawTicket: "WBFS-DT-77", date: "2026-11-02", lines: [{ name: "Pallet Recycling", qty: 9 }] }],
  });
  assert.equal(result.issues.some((issue) => issue.rule === "qty_mismatch" || issue.rule === "missing_price"), false);
});

test("the chatbot calls one targeted tool and cites the tool result", async () => {
  assert.deepEqual(TOOLS.map((tool) => tool.function.name), ["searchTickets", "getWellHistory", "getStock", "listFlags", "getIssues", "createFlag", "addNote"]);
  const calls = [];
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    if (seen.length === 1) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_ticket", arguments: "{\"id\":\"xpress_WBFS-DT-000529\"}" } }] } }] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Ticket xpress_WBFS-DT-000529 delivered Elixir to North Pad." } }] }) };
  };
  const result = await completeInventoryChat({
    apiKey: "xai-secret",
    messages: [{ role: "system", content: "Cite ticket ids." }, { role: "user", content: "Where did that delivery go?" }],
    runTool: async (name, args) => { calls.push({ name, args }); return { id: args.id, wellName: "North Pad" }; },
    fetchImpl,
  });
  assert.equal(calls[0].name, "get_ticket");
  assert.equal(calls[0].args.id, "xpress_WBFS-DT-000529");
  assert.equal(seen[0].auth, "Bearer xai-secret");
  assert.equal(seen[0].body.model, "grok-4.3");
  assert.equal(seen[0].url, "https://api.x.ai/v1/chat/completions");
  assert.equal(JSON.stringify(seen[0].body).includes("xai-secret"), false);
  assert.equal(seen[1].body.messages.at(-1).content.includes("North Pad"), true);
  assert.match(result.reply, /xpress_WBFS-DT-000529/);
  assert.match(read("../inventory-functions.js"), /defineSecret\("XAI_API_KEY"\)/);
  assert.match(read("../inventory-functions.js"), /requireMiniApp\(request, "inventoryBot"\)/);
  assert.equal(read("../inventory-functions.js").includes("inventoryBotRunChecks"), false);
  assert.equal(read("../inventory-functions.js").includes("checksRequestedAt"), false);
});
