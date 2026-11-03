import type { OpenXpressWell, XpressBoard, XpressTicket } from "../core/api";

const line = (name: string, qty: number, unit: string): XpressTicket["lines"][number] => ({ name, qty, unit, price: 0 });
const ticket = (fields: Partial<XpressTicket> & Pick<XpressTicket, "id" | "number" | "date">): XpressTicket => ({
  type: "DT", customer: "", shipTo: "", rig: "", lsd: "", value: 0, return: false, suggestion: null, lines: [], ...fields,
});

const bonanzaLines = [
  ticket({ id: "xpress_BRKS-000538", number: "BRKS-000538", date: "2026-10-30", customer: "Cardinal Energy Ltd.", lines: [line("UniCide G15", 32, "19 L"), line("Elixir", 24, "200 L"), line("Lime Hydrated", 50, "22.68 kg")] }),
  ticket({ id: "xpress_BRKS-000540", number: "BRKS-000540", date: "2026-11-02", customer: "Cardinal Energy Ltd.", lines: [line("Caustic Soda", 20, "22.68 kg"), line("Soda Ash", 120, "25 kg")] }),
];

export const inventoryPreview: { xpress: XpressBoard; openWell?: OpenXpressWell; openWells?: Record<string, OpenXpressWell> } = {
  xpress: {
    pulledAt: "2026-11-03T16:01:00.000Z",
    directory: { reads: 1, added: 0, error: "" },
    appWells: [
      { id: "bantry", name: "Cardinal 103 HZ Bantry", lsd: "103/08-12-018-13W4", lsdNorm: "8-12-18-13W4", rig: "11", operator: "Cardinal Energy", status: "active" },
      { id: "verger-4b", name: "North 40 4B HZ Verger", lsd: "100/04-09-022-14W0", lsdNorm: "4-9-22-14W0", rig: "7", operator: "North 40", status: "active" },
      { id: "verger-9a", name: "North 40 9A MHZ Verger", lsd: "100/09-15-022-14W4", lsdNorm: "9-15-22-14W4", rig: "7", operator: "North 40", status: "completed-reviewed" },
    ],
    cards: [
      {
        id: "auto-bonanza-11", name: "BONANZA 11", operator: "Cardinal Energy Ltd.", lsd: "103/1-26-16-12W4", lsdNorm: "1-26-16-12W4", rig: "Bonanza 11",
        ticketCount: 2, totalValue: 0, status: { tone: "green", label: "2 of 2 in app" },
        link: { state: "linked", appWellId: "bantry", name: "Cardinal 103 HZ Bantry", reason: "Linked automatically: the app reports cite BRKS-000538 and BRKS-000540. LSD on the Xpress tickets (1-26-16-12W4) differs from the app.", source: "auto" },
        match: { matched: 2, waiting: 0, missing: 0, compared: true },
        tickets: bonanzaLines,
      },
      {
        id: "auto-baytex", name: "Baytex Energy Ltd.", operator: "Baytex Energy Ltd.", lsd: "101/13-35-48-28W3", lsdNorm: "13-35-48-28W3", rig: "PD 156",
        ticketCount: 1, totalValue: 0, status: { tone: "green", label: "1 of 1 in app" },
        link: { state: "linked", appWellId: "baytex", name: "Baytex 13-35", reason: "Same LSD and rig.", source: "auto" },
        match: { matched: 1, waiting: 0, missing: 0, compared: true },
        tickets: [ticket({ id: "xpress_TBAR-DT-001233", number: "TBAR-DT-001233", date: "2026-10-28", customer: "Baytex Energy Ltd.", lines: [line("Elixir", 4, "200 L")] })],
      },
      {
        id: "auto-ensign-535", name: "Ensign 535", operator: "Baytex Energy Ltd.", lsd: "105/11-27-62-3W4", lsdNorm: "11-27-62-3W4", rig: "Ensign 535",
        ticketCount: 1, totalValue: 0, status: { tone: "amber", label: "Not opened yet" },
        link: { state: "linked", appWellId: "ensign", name: "S515 Beaverdam", reason: "App reports cite a warehouse ticket on this card.", source: "auto" },
        match: { matched: 0, waiting: 0, missing: 0, compared: false },
        tickets: [ticket({ id: "xpress_TBAR-DT-001232", number: "TBAR-DT-001232", date: "2026-10-29", customer: "Baytex Energy Ltd.", lines: [line("Barite", 40, "40 kg")] })],
      },
      {
        id: "auto-bonanza-7", name: "Bonanza 7", operator: "North 40 Resources Ltd.", lsd: "100/4-9-22-14W4", lsdNorm: "4-9-22-14W4", rig: "Bonanza 7",
        ticketCount: 2, totalValue: 0, status: { tone: "grey", label: "No app well linked yet" },
        link: {
          state: "suggested", appWellId: "", reason: "location differs from app", source: "",
          candidates: [
            { id: "verger-4b", name: "North 40 4B HZ Verger", lsd: "100/04-09-022-14W0", rig: "7", operator: "North 40", status: "active" },
            { id: "verger-9a", name: "North 40 9A MHZ Verger", lsd: "100/09-15-022-14W4", rig: "7", operator: "North 40", status: "completed-reviewed" },
          ],
        },
        match: { matched: 0, waiting: 0, missing: 0, compared: false },
        tickets: [
          ticket({ id: "xpress_BRKS-000537", number: "BRKS-000537", date: "2026-10-29", customer: "North 40 Resources Ltd.", lines: [line("Can-Break ECA", 16, "16 kg"), line("UniBreak 1", 32, "19 L")] }),
          ticket({ id: "xpress_BRKS-000539", number: "BRKS-000539", date: "2026-11-01", customer: "North 40 Resources Ltd.", lines: [line("Potash", 120, "25 kg"), line("UniSTAR", 105, "22.68 kg")] }),
        ],
      },
      {
        id: "auto-pd-188", name: "PD 188", operator: "Strathcona Resources Ltd.", lsd: "8-36-35-27W3", lsdNorm: "8-36-35-27W3", rig: "PD 188",
        ticketCount: 2, totalValue: 0, status: { tone: "grey", label: "2 app wells cite these" },
        link: { state: "suggested", appWellId: "", reason: "multiple app wells share this LSD", source: "", citedWellIds: ["plover", "other"], candidates: [{ id: "plover", name: "SRL Plover Lake 3D8-36", lsd: "8-36-35-27W3", rig: "188", operator: "Strathcona" }, { id: "other", name: "SRL other pad", lsd: "8-36-35-27W3", rig: "188", operator: "Strathcona" }] },
        match: { matched: 0, waiting: 0, missing: 0, compared: false },
        tickets: [
          ticket({ id: "xpress_TBAR-CT-000338", number: "TBAR-CT-000338", type: "CT", date: "2026-10-29", customer: "Strathcona Resources Ltd.", return: true, lines: [line("Elixir", 2, "200 L")] }),
          ticket({ id: "xpress_TBAR-DT-001235", number: "TBAR-DT-001235", date: "2026-10-29", customer: "Strathcona Resources Ltd.", lines: [line("Barite", 10, "40 kg")] }),
        ],
      },
    ],
    unassigned: [
      ticket({ id: "xpress_NK-004804", number: "NK-004804", date: "2026-10-30", customer: "Wozniak Bulk Fuel Sales Inc.", lines: [line("Caustic Soda", 45, "22.68 kg"), line("Sulphamic Acid", 210, "25 kg"), line("Bentonite - Regular", 120, "40 kg"), line("PALLETS", 1, "22.7 kg")] }),
      ticket({ id: "xpress_NK-004808", number: "NK-004808", date: "2026-11-02", customer: "The Crossing Company", rig: "CC-Rig 4" }),
      ticket({ id: "xpress_NK-000891", number: "NK-000891", type: "CT", date: "2026-11-02", customer: "The Crossing Company", rig: "CC-Rig 4", return: true }),
      ticket({ id: "xpress_NK-000604", number: "NK-000604", type: "SR", date: "2026-11-02", customer: "Di-Corp", rig: "CC-Rig 4" }),
    ],
    warehouseOnly: 13,
  },
  openWells: {
    "auto-bonanza-11": {
      appWell: { id: "bantry", name: "Cardinal 103 HZ Bantry", lsd: "103/08-12-018-13W4", lsdNorm: "8-12-18-13W4", rig: "11", operator: "Cardinal Energy", status: "active" },
      reads: { well: 6, reports: 9, reportCount: 3 },
      unavailable: false,
      match: { matched: 2, missing: 0, waiting: 0 },
      tickets: bonanzaLines.map((row) => ({ ...row, inApp: "matched" })),
      appTickets: [
        { reportId: "r7", reportNumber: "7", index: "0", date: "2026-11-02", rawTicket: "BRKS-DT-000540", kind: "received", products: 2, warehouse: true, description: "Ticket:BRKS-DT-000540", lines: [line("Caustic Soda", 20, "22.68 kg"), line("Soda Ash", 120, "25 kg")] },
        { reportId: "r5", reportNumber: "5", index: "0", date: "2026-10-31", rawTicket: "BRKS-DT-000538", kind: "received", products: 3, warehouse: true, description: "Ticket:BRKS-DT-000538", lines: [line("UniCide G15", 32, "19 L"), line("Elixir", 24, "200 L"), line("Lime Hydrated", 50, "22.68 kg")] },
        { reportId: "r1", reportNumber: "1", index: "0", date: "2026-10-25", rawTicket: "BRKS-DT-000533", kind: "transferIn", products: 1, warehouse: false, description: "Transfer in", lines: [line("Elixir", 2, "200 L")] },
      ],
    },
  },
};
