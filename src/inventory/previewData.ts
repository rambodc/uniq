import type { OpenXpressWell, XpressBoard } from "../core/api";

export const inventoryPreview: { xpress: XpressBoard; openWell?: OpenXpressWell } = {
  xpress: {
    pulledAt: "2026-11-03T12:02:00.000Z",
    directory: { reads: 1, added: 2, error: "" },
    appWells: [{ id: "2026-10-11_15-20-54_jchristensen", name: "ISH 8HZ 102 ROCHSTR 1-21-63-24", lsd: "1-21-63-24 W4", lsdNorm: "1-21-63-24W4", rig: "Horizon 14", operator: "Ish Energy", status: "Completed" }],
    cards: [{
      id: "auto-ish", name: "ISH 8HZ 102 ROCHSTR", operator: "Ish Energy", lsd: "1-21-63-24", lsdNorm: "1-21-63-24W4", rig: "Horizon 14",
      ticketCount: 3, totalValue: 38420,
      status: { tone: "green", label: "3 of 3 in app" },
      link: { state: "linked", appWellId: "2026-10-11_15-20-54_jchristensen", reason: "Same LSD and rig.", source: "auto" },
      match: { matched: 3, waiting: 0, missing: 0, compared: true },
      tickets: [
        { id: "xpress_NK-004774", number: "NK-004774", type: "DT", date: "2026-10-15", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 17960, return: false, suggestion: null, lines: [{ name: "Elixir", qty: 9, unit: "20 L", price: 1995 }] },
        { id: "xpress_NK-004783", number: "NK-004783", type: "DT", date: "2026-10-21", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 12540, return: false, suggestion: null, lines: [{ name: "Elixir", qty: 6, unit: "20 L", price: 2090 }] },
        { id: "xpress_NK-004796", number: "NK-004796", type: "SR", date: "2026-10-26", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 7920, return: true, suggestion: null, lines: [{ name: "Elixir", qty: 4, unit: "20 L", price: 1980 }] },
      ],
    }, {
      id: "auto-pad", name: "Pad A", operator: "Northline", lsd: "1-2-3-4W4", lsdNorm: "1-2-3-4W4", rig: "9",
      ticketCount: 1, totalValue: 2100,
      status: { tone: "grey", label: "multiple app wells share this LSD" },
      link: { state: "suggested", appWellId: "", reason: "multiple app wells share this LSD", source: "", candidates: [{ id: "well-a", name: "Pad A north", lsd: "1-2-3-4W4", rig: "1" }, { id: "well-b", name: "Pad A south", lsd: "1-2-3-4W4", rig: "2" }] },
      match: { matched: 0, waiting: 0, missing: 0, compared: false },
      tickets: [{ id: "xpress_NK-000221", number: "NK-000221", type: "DT", date: "2026-10-18", customer: "Northline", shipTo: "Pad A", rig: "9", lsd: "1-2-3-4W4", value: 2100, return: false, suggestion: null, lines: [{ name: "Salt", qty: 2, unit: "bag", price: 1050 }] }],
    }],
    unassigned: [{ id: "xpress_NK-004804", number: "NK-004804", type: "DT", date: "2026-10-31", customer: "Wozniak Bulk Fuel", shipTo: "", rig: "", lsd: "", value: 3210, return: false, suggestion: null, lines: [{ name: "Diesel", qty: 1, unit: "", price: 3210 }] }],
    warehouseOnly: 4,
  },
  openWell: {
    appWell: { id: "2026-10-11_15-20-54_jchristensen", name: "ISH 8HZ 102 ROCHSTR 1-21-63-24", lsd: "1-21-63-24 W4", lsdNorm: "1-21-63-24W4", rig: "Horizon 14", operator: "Ish Energy", status: "Completed" },
    reads: { well: 1, reports: 1, reportCount: 4 },
    match: { matched: 3, missing: 0, waiting: 0 },
    tickets: [
      { id: "xpress_NK-004774", number: "NK-004774", type: "DT", date: "2026-10-15", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 17960, return: false, suggestion: null, lines: [{ name: "Elixir", qty: 9, unit: "20 L", price: 1995 }], inApp: "matched" },
      { id: "xpress_NK-004783", number: "NK-004783", type: "DT", date: "2026-10-21", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 12540, return: false, suggestion: null, lines: [{ name: "Elixir", qty: 6, unit: "20 L", price: 2090 }], inApp: "matched" },
      { id: "xpress_NK-004796", number: "NK-004796", type: "SR", date: "2026-10-26", customer: "Ish Energy", shipTo: "ISH 8HZ", rig: "Horizon 14", lsd: "1-21-63-24", value: 7920, return: true, suggestion: null, lines: [{ name: "Elixir", qty: 4, unit: "20 L", price: 1980 }], inApp: "matched" },
    ],
    appTickets: [
      { reportId: "r1", index: "0", date: "2026-10-15", rawTicket: "NK-004774", kind: "received", products: 9, warehouse: true, description: "Ticket:NK-004774,Delivery from warehouse" },
      { reportId: "r2", index: "0", date: "2026-10-12", rawTicket: "TR-2210", kind: "transferOut", products: 5, warehouse: false, description: "Transfer-From Ticket:TR-2210,Transferred" },
    ],
  },
};
