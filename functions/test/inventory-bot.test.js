import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { isTicketPdfPath, lsdNorm, matchProduct, matchWell, indexProducts, rigNorm, runChecks } from "../inventoryBot/engine.js";
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
  const missing = runChecks({
    date: "2026-11-02", products,
    wells: [well({ received: [{ product: "Fusion", qty: 2, date: "2026-10-28" }] })],
    tickets: [],
  });
  assert.equal(missing.issues.some((issue) => issue.rule === "logged_no_ticket"), true);
  const gap = runChecks({
    date: "2026-11-02", products,
    wells: [well({ received: [{ product: "Fusion", qty: 10, date: "2026-10-28" }], returned: [{ product: "Elixir", qty: 5, date: "2026-10-28" }] })],
    tickets: [
      ticket({ id: "xpress_fus", postedAt: "2026-10-27", lines: [{ code: "FUS", name: "Fusion", qty: 6 }] }),
      ticket({ id: "xpress_sr", type: "SR", postedAt: "2026-10-27", lines: [{ code: "ELX", name: "Elixir", qty: 2 }] }),
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
      well({ id: "old", name: "Old Hole", spudDate: "2026-09-01", lastReportDate: "2026-09-20", status: "released", remaining: [{ product: "Elixir", qty: 8, price: 10 }] }),
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

test("the chatbot calls one targeted tool and cites the tool result", async () => {
  assert.deepEqual(TOOLS.map((tool) => tool.function.name), ["search_tickets", "get_ticket", "get_well_inventory", "list_issues", "get_warehouse_stock", "find_product"]);
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
  assert.match(read("../inventory-functions.js"), /requireSuperAdmin\(request\)/);
  assert.match(read("../inventory-functions.js"), /requireMiniApp\(request, "inventoryBot"\)/);
});
