import type { OpenXpressWell, RigBoard, XpressBoard, XpressTicket, XrefRow } from "../core/api";
import sample from "./invXpressSample.json";
import type { InvXpressResult } from "./invXpress";

const line = (name: string, qty: number, unit: string): XpressTicket["lines"][number] => ({ name, qty, unit, price: 0 });
const ticket = (fields: Partial<XpressTicket> & Pick<XpressTicket, "id" | "number" | "date">): XpressTicket => ({
  type: "DT", customer: "", shipTo: "", rig: "", lsd: "", value: 0, return: false, suggestion: null, lines: [], ...fields,
});

const bonanzaLines = [
  ticket({ id: "xpress_BRKS-000538", number: "BRKS-000538", date: "2026-10-30", customer: "Cardinal Energy Ltd.", lines: [line("UniCide G15", 32, "19 L"), line("Elixir", 24, "200 L"), line("Lime Hydrated", 50, "22.68 kg")] }),
  ticket({ id: "xpress_BRKS-000540", number: "BRKS-000540", date: "2026-11-02", customer: "Cardinal Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/BRKS-000540.pdf", lines: [line("Caustic Soda", 20, "22.68 kg"), line("Soda Ash", 120, "25 kg")] }),
];

function row(fields: Partial<XrefRow> & Pick<XrefRow, "id" | "number" | "date" | "tone" | "side">): XrefRow {
  return { pill: "Xpress · DT", summary: "", reason: "", typoFixed: false, paired: false, moved: false, correctionId: "", appId: "", ticketId: "", wellId: "", reportId: "", index: "", hasPdf: false, pdfPath: "", app: null, xpress: null, ...fields };
}
function card(fields: { key: string; name: string; operator: string; matched: number; onlyApp: number; onlyXpress: number; tone?: "green" | "amber" }): RigBoard["rigs"][number] {
  return { placeholders: 0, merged: false, aliases: [], needs: [], pending: [], transfers: [], pairs: [], tone: fields.onlyApp + fields.onlyXpress ? "amber" : "green", ...fields };
}

const pair = row({
  id: "pair-1220", date: "2026-10-23", number: "TBAR-DT-001220", tone: "matched", side: "pair", pill: "Xpress · DT", how: "exact",
  label: "TBAR-DT-001220 · DT · app delivery", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001220.pdf",
  app: { number: "TBAR-DT-001220", pill: "App · Delivery", summary: "40 Calcium Nitrate, 6 Clay-Control", date: "2026-10-24", products: [{ name: "Calcium Nitrate", pack: "25 kg", qty: 40 }, { name: "Clay-Control", pack: "19 L", qty: 6 }, { name: "Potash (UES)", pack: "25 kg", qty: 8 }] },
  xpress: { number: "TBAR-DT-001220", pill: "Xpress · DT", type: "DT", summary: "40 Calcium Nitrate, 4 Clay-Control", date: "2026-10-23", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001220.pdf", rig: "PD 156", customer: "Baytex Energy Ltd.", products: [{ name: "Calcium Nitrate", pack: "25 kg", qty: 40 }, { name: "Clay-Control", pack: "19 L", qty: 4 }, { name: "Soda Ash", pack: "25 kg", qty: 10 }] },
});

export const rigPreview: RigBoard = {
  since: "2026-10-01",
  appSince: "2026-09-05",
  rigs: [
    card({ key: "2", name: "Twilight 2", operator: "Mahikan Oil Corp / Tamarack Valley Energy", matched: 2, onlyApp: 3, onlyXpress: 10 }),
    card({ key: "420", name: "Savanna 420", operator: "Cardinal Energy / Westgate Energy", matched: 2, onlyApp: 3, onlyXpress: 8 }),
    card({ key: "361", name: "Ensign 361", operator: "Spur", matched: 3, onlyApp: 3, onlyXpress: 7 }),
    card({ key: "4", name: "Bonanza 4", operator: "Caltex Trilogy / Spur / Taprock Energy / Tundra Oil and Gas", matched: 2, onlyApp: 1, onlyXpress: 8 }),
    card({ key: "182", name: "Precision 182", operator: "CNRL", matched: 9, onlyApp: 2, onlyXpress: 6 }),
    card({ key: "299", name: "Precision 299", operator: "Tamarack Valley Energy", matched: 0, onlyApp: 4, onlyXpress: 3 }),
    card({ key: "859", name: "Ensign 859", operator: "Headwater Exploration", matched: 3, onlyApp: 2, onlyXpress: 5 }),
    card({ key: "218", name: "Ensign 218", operator: "CNRL", matched: 2, onlyApp: 0, onlyXpress: 6 }),
    { ...card({ key: "156", name: "Precision 156", operator: "Baytex", matched: 5, onlyApp: 1, onlyXpress: 4 }),
      needs: [
        row({ id: "app-ct", date: "2026-11-03", number: "TBAR-CT-0000", tone: "needs", side: "app", pill: "App · Return", summary: "Not in Xpress · 5 TKPP, 30 GAF-C1280, 8 Elixir, 5 Clay-Control", wellId: "silverdale", reportId: "r", index: "2", app: { number: "TBAR-CT-0000", pill: "App · Return", summary: "5 TKPP", date: "2026-11-03", products: [{ name: "TKPP", pack: "25 kg", qty: 5 }, { name: "GAF-C1280", pack: "20 L", qty: 30 }, { name: "Elixir", pack: "200 L", qty: 8 }, { name: "Clay-Control", pack: "19 L", qty: 5 }] }, suggestions: [{ number: "TBAR-CT-000331", date: "2026-11-01", shared: 3, compared: 4, wellId: "silverdale", reportId: "r", index: "2", xpress: "TBAR-CT-000331", ticketId: "xpress_TBAR-CT-000331" }] }),
        row({ id: "x-331", date: "2026-10-18", number: "TBAR-CT-000331", tone: "needs", side: "xpress", pill: "Xpress · CT", summary: "Not in app · PD 156 · Baytex Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-CT-000331.pdf", ticketId: "xpress_TBAR-CT-000331" }),
        row({ id: "x-1207", date: "2026-10-17", number: "TBAR-DT-001207", tone: "needs", side: "xpress", pill: "Xpress · DT", summary: "Not in app · PD 156 · Baytex Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001207.pdf", ticketId: "xpress_TBAR-DT-001207" }),
        row({ id: "x-1201", date: "2026-10-15", number: "TBAR-DT-001201", tone: "needs", side: "xpress", pill: "Xpress · DT", summary: "Not in app · PD 156 · Baytex Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001201.pdf", ticketId: "xpress_TBAR-DT-001201" }),
        row({ id: "x-1173", date: "2026-10-01", number: "TBAR-DT-001173", tone: "needs", side: "xpress", pill: "Xpress · DT", summary: "Not in app · PD 156 · Baytex Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001173.pdf", ticketId: "xpress_TBAR-DT-001173" }),
      ],
      transfers: [row({ id: "tr", date: "2026-10-25", number: "App transfer", tone: "transfer", side: "app", pill: "App · Transfer", summary: "Expected app-only · 7 Megasol, 235 Sawdust, 12 UniCorr Clear, 70 UniVis, 12 Elixir" })],
      pairs: [pair, row({ id: "pair-2", date: "2026-10-20", number: "TBAR-DT-001200", tone: "matched", side: "pair", label: "2026-10-20 · TBAR-DT-001200 · DT · app delivery" }), row({ id: "pair-3", date: "2026-10-12", number: "TBAR-DT-001180", tone: "matched", side: "pair", label: "2026-10-12 · TBAR-DT-001180 · DT · app delivery" }), row({ id: "pair-4", date: "2026-10-08", number: "TBAR-CT-000320", tone: "matched", side: "pair", pill: "Xpress · CT", label: "2026-10-08 · TBAR-CT-000320 · CT · app return" }), row({ id: "pair-5", date: "2026-10-02", number: "TBAR-DT-001160", tone: "matched", side: "pair", label: "2026-10-02 · TBAR-DT-001160 · DT · app delivery" })],
    },
    card({ key: "535", name: "Ensign 535", operator: "Baytex", matched: 2, onlyApp: 0, onlyXpress: 6 }),
    card({ key: "10", name: "Excalibur 10", operator: "CNRL / Tundra Oil and Gas", matched: 2, onlyApp: 1, onlyXpress: 4 }),
    card({ key: "19", name: "Horizon 19", operator: "CNRL", matched: 6, onlyApp: 1, onlyXpress: 4 }),
    card({ key: "7", name: "Bonanza 7", operator: "North 40", matched: 5, onlyApp: 2, onlyXpress: 2 }),
    card({ key: "11", name: "Bonanza 11", operator: "Cardinal Energy", matched: 3, onlyApp: 0, onlyXpress: 4 }),
    card({ key: "254", name: "Ensign 254", operator: "Cenovus", matched: 3, onlyApp: 0, onlyXpress: 4 }),
    card({ key: "55", name: "Horizon 55", operator: "Strathcona Resources", matched: 4, onlyApp: 0, onlyXpress: 1 }),
  ],
  loose: [
    row({ id: "loose-1", date: "2026-11-02", number: "NK-004810", tone: "loose", side: "xpress", pill: "Xpress · DT", summary: "Rig 99 · 8-8-8-8W4 · Other Oil", ticketId: "xpress_NK-004810", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/NK-004810.pdf", xpress: { number: "NK-004810", pill: "Xpress · DT", type: "DT", summary: "", date: "2026-11-02", rig: "Rig 99", lsd: "8-8-8-8W4", customer: "Other Oil", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/NK-004810.pdf" } }),
    row({ id: "loose-2", date: "2026-10-28", number: "NK-004790", tone: "loose", side: "xpress", pill: "Xpress · CT", summary: "Horizon 77 · 2-2-2-2W4 · Other Oil", ticketId: "xpress_NK-004790", xpress: { number: "NK-004790", pill: "Xpress · CT", type: "CT", summary: "", date: "2026-10-28", rig: "Horizon 77", lsd: "2-2-2-2W4", customer: "Other Oil" } }),
  ],
};

export const inventoryPreview: { xpress: XpressBoard; mim: XpressBoard; rigs: RigBoard; openWell?: OpenXpressWell; openWells?: Record<string, OpenXpressWell>; invXpress: InvXpressResult } = {
  rigs: rigPreview,
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
      ticket({ id: "xpress_NK-004804", number: "NK-004804", date: "2026-10-30", customer: "Wozniak Bulk Fuel Sales Inc.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/NK-004804.pdf", lines: [line("Caustic Soda", 45, "22.68 kg"), line("Sulphamic Acid", 210, "25 kg"), line("Bentonite - Regular", 120, "40 kg"), line("PALLETS", 1, "22.7 kg")] }),
      ticket({ id: "xpress_NK-004808", number: "NK-004808", date: "2026-11-02", customer: "The Crossing Company", rig: "CC-Rig 4" }),
      ticket({ id: "xpress_NK-000891", number: "NK-000891", type: "CT", date: "2026-11-02", customer: "The Crossing Company", rig: "CC-Rig 4", return: true }),
      ticket({ id: "xpress_NK-000604", number: "NK-000604", type: "SR", date: "2026-11-02", customer: "Di-Corp", rig: "CC-Rig 4" }),
    ],
    warehouseOnly: 13,
  },
  mim: {
    pulledAt: "2026-11-04T15:00:00.000Z",
    directory: { reads: 0, added: 0, error: "" },
    appWells: [
      { id: "tundra", name: "Tundra 13-26", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12", operator: "Tundra", status: "active" },
    ],
    cards: [
      {
        id: "auto-mim-tundra", name: "Tundra 13-26", operator: "Tundra", lsd: "13-26-2-28W1", lsdNorm: "13-26-2-28W1", rig: "12",
        ticketCount: 2, totalValue: 80, status: { tone: "green", label: "2 of 2 in app" },
        link: { state: "linked", appWellId: "tundra", name: "Tundra 13-26", reason: "Same LSD and rig.", source: "auto" },
        match: { matched: 2, waiting: 0, missing: 0, compared: true },
        tickets: [
          ticket({ id: "mim_DTAWEY011649", number: "DTAWEY011649", date: "2026-11-01", customer: "Tundra", rig: "12", lsd: "13-26-2-28W1", hasPdf: false, warehouseName: "ALCHEM", lines: [line("Bleach", 4, "19 L")] }),
          ticket({ id: "mim_TTPROS1", number: "TTPROS1", type: "TT", date: "2026-11-03", customer: "Tundra", rig: "12", lsd: "13-26-2-28W1", hasPdf: false, warehouseName: "PR PREMIUM", value: 100, charges: [{ service: "Haul", qty: 1, billingMethod: "flat", price: 80, total: 80 }, { service: "Wait time", qty: 1, billingMethod: "hour", price: 20, total: 20 }] }),
        ],
      },
      {
        id: "auto-mim-premium", name: "UNIQENERGY pad", operator: "Cardinal Energy", lsd: "1-26-16-12W4", lsdNorm: "1-26-16-12W4", rig: "Bonanza 11",
        ticketCount: 1, totalValue: 0, status: { tone: "grey", label: "No app well linked yet" },
        link: { state: "none", appWellId: "", reason: "no app well found", source: "" },
        match: { matched: 0, waiting: 0, missing: 0, compared: false },
        tickets: [ticket({ id: "mim_DTPROS9", number: "DTPROS9", date: "2026-11-02", customer: "Cardinal Energy", rig: "Bonanza 11", lsd: "1-26-16-12W4", hasPdf: false, warehouseName: "UNIQENERGY", lines: [line("Elixir", 2, "200 L")] })],
      },
    ],
    unassigned: [
      ticket({ id: "mim_TTLOOSE", number: "TTLOOSE", type: "TT", date: "2026-11-04", customer: "Hourly haul", hasPdf: false, warehouseName: "PR PREMIUM", charges: [{ service: "Haul", qty: 1, billingMethod: "flat", price: 60, total: 60 }] }),
    ],
    warehouseOnly: 0,
  },
  invXpress: sample as InvXpressResult,
  openWells: {
    "auto-bonanza-11": {
      appWell: { id: "bantry", name: "Cardinal 103 HZ Bantry", lsd: "103/08-12-018-13W4", lsdNorm: "8-12-18-13W4", rig: "11", operator: "Cardinal Energy", status: "active" },
      reads: { well: 1, reports: 1, reportCount: 3 },
      unavailable: false,
      appDataAsOf: "2026-11-03T16:01:00.000Z",
      syncStatus: "ok",
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
