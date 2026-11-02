import type { InventoryPreviewData } from "../auth/preview";

const date = "2026-11-02";
const ticket = {
  id: "xpress_WBFS-DT-000529", source: "xpress", company: "uniqenergy", type: "DT",
  warehouseCode: "XV-AB", warehouseName: "Xpress Vendor Alberta", rig: "245", lsd: "104/9-26-55-4W4", lsdNorm: "9-26-55-4W4",
  customer: "Northline Energy", wellName: "North Pad", shippedAt: "2026-10-20", postedAt: "2026-10-20", total: 1000, hasPdf: true,
};
const well = {
  id: "north-pad", name: "North Pad", lsd: "104/9-26-55-4W4", lsdNorm: "9-26-55-4W4", rig: "245",
  contractor: "Foothills", operator: "Northline Energy", province: "AB", status: "active", spudDate: "2026-10-01",
  pricelist: "2026-q4", lastReportId: "mr-88", lastReportDate: "2026-10-28",
  remaining: [{ product: "Elixir", qty: 6, price: 250 }],
  received: [{ product: "Fusion", qty: 2, date: "2026-10-27" }],
  returned: [], used: [{ product: "Elixir", qty: 1 }], updatedAt: "2026-11-02T12:00:00.000Z",
};

export const inventoryPreview: InventoryPreviewData = {
  today: {
    date,
    config: { graceDays: 3, valuation: "pricelist", receivedWindowDays: 5, staleReportDays: 7 },
    run: {
      date, startedAt: "2026-11-02T12:00:00.000Z", finishedAt: "2026-11-02T12:04:00.000Z", checkedAt: "2026-11-02T12:05:00.000Z",
      sources: { xpress: { ok: true, counts: { tickets: 2 } }, mim: { ok: true, counts: { tickets: 1 } }, mirror: { ok: false, counts: {}, error: "Report feed timed out" } },
      summary: { text: "Checks for 2026-11-02: 1 open issue (1 high). $1,000.00 at risk. 1 delivery ticket was not logged in the company app. The collector reported a problem for mirror.", issueCounts: { high: 1, medium: 0, low: 0, open: 1 }, dollarsAtRisk: 1000, mimTtCharges: 80 },
    },
    issues: [{
      id: "2026-11-02_delivered_not_logged_north-pad_elixir", date, rule: "delivered_not_logged", severity: "high",
      title: "Elixir delivered to North Pad was not logged",
      detail: "4 Elixir left on a delivery ticket more than 3 days ago, and the latest app report does not show it as received.",
      wellId: "north-pad", rig: "245", lsd: "104/9-26-55-4W4", ticketIds: [ticket.id],
      products: [{ name: "Elixir", qty: 4, value: 1000 }], dollarValue: 1000, status: "open", note: "", resolvedBy: "", resolvedAt: null,
    }],
  },
  wells: [{ id: well.id, name: well.name, lsd: well.lsd, rig: well.rig, status: well.status, operator: well.operator, lastReportDate: well.lastReportDate, remainingCount: 1 }],
  wellDetails: {
    [well.id]: {
      well,
      rigInventory: { id: `${date}_north-pad`, date, wellId: well.id, rig: well.rig, name: well.name, expected: [{ product: "Elixir", qty: 10 }], appRemaining: [{ product: "Elixir", qty: 6 }], diff: [{ product: "Elixir", qty: 4 }], ticketIds: [ticket.id] },
      tickets: [ticket],
    },
  },
  tickets: [ticket, { ...ticket, id: "mim_TT-100", source: "mim", company: "alchem", type: "TT", warehouseCode: "MIM-SK", warehouseName: "MIM Central", postedAt: "2026-11-02", shippedAt: "2026-11-02", total: 80, hasPdf: false, wellName: "North Pad" }],
  ticketDetails: {
    [ticket.id]: { ...ticket, orderedBy: "Dana Cole", carrier: "Bandit", poAfe: "AFE-19", refTicket: "", lsdGrid: "9-26-55-4W4", pdfPath: "inventoryBot/tickets/xpress/WBFS-DT-000529.pdf", relatedTickets: ["xpress_WBFS-ST-000053"], lines: [{ code: "ELX", name: "Elixir", qty: 4, unit: "pail", unitWeight: 18, weight: 72, description: "Elixir pail", productId: "app_elixir" }], charges: [], collectedAt: "2026-11-02T12:01:00.000Z", runId: date, total: null },
  },
  warehouses: [{
    id: "2026-11-02_xpress_XV-AB", date, source: "xpress", company: "uniqenergy", warehouseCode: "XV-AB", warehouseName: "Xpress Vendor Alberta", previousDate: "2026-11-01",
    items: [
      { key: "app elixir", code: "", productId: "app_elixir", name: "Elixir", unit: "pail", unitWeight: 18, onHand: 40, committed: 4, inTransit: 0, available: 36, previousOnHand: 44, delta: -4, variants: [{ unit: "pail", qty: 30 }, { unit: "tote", qty: 10 }] },
      { key: "fusion", code: "", productId: "app_fusion", name: "Fusion", unit: "pail", unitWeight: 20, onHand: 12, committed: 0, inTransit: 0, available: 12, previousOnHand: 12, delta: 0, variants: [] },
    ],
  }],
  messages: [],
};
