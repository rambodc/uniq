import type { OpenXpressWell, RigBoard, RigTicket, RigWell, XpressBoard, XpressTicket } from "../core/api";

const line = (name: string, qty: number, unit: string): XpressTicket["lines"][number] => ({ name, qty, unit, price: 0 });
const ticket = (fields: Partial<XpressTicket> & Pick<XpressTicket, "id" | "number" | "date">): XpressTicket => ({
  type: "DT", customer: "", shipTo: "", rig: "", lsd: "", value: 0, return: false, suggestion: null, lines: [], ...fields,
});

const bonanzaLines = [
  ticket({ id: "xpress_BRKS-000538", number: "BRKS-000538", date: "2026-10-30", customer: "Cardinal Energy Ltd.", lines: [line("UniCide G15", 32, "19 L"), line("Elixir", 24, "200 L"), line("Lime Hydrated", 50, "22.68 kg")] }),
  ticket({ id: "xpress_BRKS-000540", number: "BRKS-000540", date: "2026-11-02", customer: "Cardinal Energy Ltd.", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/BRKS-000540.pdf", lines: [line("Caustic Soda", 20, "22.68 kg"), line("Soda Ash", 120, "25 kg")] }),
];

const rigTicket = (fields: Partial<RigTicket> & Pick<RigTicket, "id" | "number" | "date">): RigTicket => ({
  rigKey: "", matchReason: "rig-number", matchConfidence: "green", note: "", moved: false, correctionId: "", ...ticket(fields), ...fields,
});
const rigWell = (fields: Partial<RigWell> & Pick<RigWell, "id" | "name">): RigWell => ({
  lsd: "", lsdNorm: "", status: "active", operator: "", rig: "", firstReport: "2026-10-02", lastReport: "2026-11-02", moved: false, correctionId: "", ...fields,
});

export const rigPreview: RigBoard = {
  pulledAt: "2026-11-03T16:01:00.000Z",
  rigs: [
    {
      key: "55~strathcona", name: "Horizon 55", operator: "Strathcona Resources", xpressName: "Horizon 55", appRig: "55", appRigs: ["55"],
      merged: true, aliases: [{ key: "19~strathcona", correctionId: "merge__19~strathcona" }],
      currentWell: rigWell({ id: "pad", name: "Strathcona 4-5 Pad", lsd: "4-5-46-17W3", lsdNorm: "4-5-46-17W3", operator: "Strathcona Resources", rig: "55", reports: [{ id: "r8", date: "2026-11-02", number: "8" }, { id: "r7", date: "2026-10-28", number: "7" }] }),
      wells: [
        rigWell({ id: "pad", name: "Strathcona 4-5 Pad", lsd: "4-5-46-17W3", lsdNorm: "4-5-46-17W3", operator: "Strathcona Resources", rig: "55", reports: [{ id: "r8", date: "2026-11-02", number: "8" }, { id: "r7", date: "2026-10-28", number: "7" }] }),
        rigWell({ id: "other", name: "Strathcona 1-1 Pad", lsd: "1-1-1-1W4", lsdNorm: "1-1-1-1W4", status: "completed", operator: "Strathcona Resources", rig: "19", firstReport: "2026-10-01", lastReport: "2026-10-18" }),
      ],
      wellCount: 2, ticketCount: 3, lineCount: 6, latest: "2026-11-02",
      note: "Ticket LSD 9-7-46-17W3 differs from pad LSD 4-5-46-17W3 — amber until confirmed.",
      status: { tone: "amber", label: "Needs a look" },
      tickets: [
        rigTicket({ id: "xpress_TBAR-DT-001243", number: "TBAR-DT-001243", date: "2026-11-02", customer: "Strathcona Resources", rig: "Horizon 55", lsd: "9-7-46-17W3", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001243.pdf", rigKey: "55~strathcona", matchConfidence: "amber", note: "Ticket LSD 9-7-46-17W3 differs from pad LSD 4-5-46-17W3 — amber until confirmed.", lines: [line("Barite", 20, "40 kg"), line("Gel", 8, "25 kg")] }),
        rigTicket({ id: "xpress_TBAR-DT-001242", number: "TBAR-DT-001242", date: "2026-11-01", customer: "Strathcona Resources", rig: "Horizon 55", lsd: "9-7-46-17W3", hasPdf: true, pdfPath: "inventoryBot/tickets/xpress/TBAR-DT-001242.pdf", rigKey: "55~strathcona", matchConfidence: "amber", moved: true, correctionId: "ticket__xpress_TBAR-DT-001242", lines: [line("Caustic Soda", 10, "22.68 kg")] }),
        rigTicket({ id: "xpress_TBAR-DT-001234", number: "TBAR-DT-001234", date: "2026-10-29", customer: "Strathcona Resources", rig: "Horizon 55", lsd: "9-7-46-17W3", rigKey: "55~strathcona", matchConfidence: "amber", lines: [line("Soda Ash", 40, "25 kg"), line("Lime", 12, "22.68 kg"), line("Polymer", 6, "19 L")] }),
      ],
    },
    {
      key: "7~north", name: "Bonanza 7", operator: "North 40 Resources", xpressName: "Bonanza 7", appRig: "7", appRigs: ["7"],
      merged: false, aliases: [],
      currentWell: rigWell({ id: "verger", name: "North 40 4B HZ Verger", lsd: "4-9-22-14W4", lsdNorm: "4-9-22-14W4", operator: "North 40 Resources", rig: "7" }),
      wells: [rigWell({ id: "verger", name: "North 40 4B HZ Verger", lsd: "4-9-22-14W4", lsdNorm: "4-9-22-14W4", operator: "North 40 Resources", rig: "7" })],
      wellCount: 1, ticketCount: 2, lineCount: 4, latest: "2026-11-01", note: "", status: { tone: "green", label: "Matches app" },
      tickets: [
        rigTicket({ id: "xpress_BRKS-000539", number: "BRKS-000539", date: "2026-11-01", customer: "North 40 Resources", rig: "Bonanza 7", lsd: "4-9-22-14W4", rigKey: "7~north", lines: [line("Potash", 120, "25 kg"), line("UniSTAR", 105, "22.68 kg")] }),
        rigTicket({ id: "xpress_BRKS-000537", number: "BRKS-000537", date: "2026-10-29", customer: "North 40 Resources", rig: "Bonanza 7", lsd: "4-9-22-14W4", rigKey: "7~north", lines: [line("Can-Break ECA", 16, "16 kg"), line("UniBreak 1", 32, "19 L")] }),
      ],
    },
    {
      key: "156~baytex", name: "Precision 156", operator: "Baytex Energy", xpressName: "PD 156", appRig: "156", appRigs: ["156"],
      merged: false, aliases: [],
      currentWell: rigWell({ id: "baytex", name: "Baytex 13-35", lsd: "13-35-48-28W3", lsdNorm: "13-35-48-28W3", operator: "Baytex Energy", rig: "156" }),
      wells: [rigWell({ id: "baytex", name: "Baytex 13-35", lsd: "13-35-48-28W3", lsdNorm: "13-35-48-28W3", operator: "Baytex Energy", rig: "156" })],
      wellCount: 1, ticketCount: 1, lineCount: 1, latest: "2026-10-28", note: "", status: { tone: "green", label: "Matches app" },
      tickets: [rigTicket({ id: "xpress_TBAR-DT-001233", number: "TBAR-DT-001233", date: "2026-10-28", customer: "Baytex Energy", rig: "PD 156", lsd: "13-35-48-28W3", rigKey: "156~baytex", lines: [line("Elixir", 4, "200 L")] })],
    },
    {
      key: "535~baytex", name: "Ensign 535", operator: "Baytex Energy", xpressName: "Ensign 535", appRig: "535", appRigs: ["535"],
      merged: false, aliases: [],
      currentWell: rigWell({ id: "beaver", name: "S515 Beaverdam", lsd: "11-27-62-3W4", lsdNorm: "11-27-62-3W4", operator: "Baytex Energy", rig: "535", status: "active" }),
      wells: [rigWell({ id: "beaver", name: "S515 Beaverdam", lsd: "11-27-62-3W4", lsdNorm: "11-27-62-3W4", operator: "Baytex Energy", rig: "535" })],
      wellCount: 1, ticketCount: 1, lineCount: 1, latest: "2026-10-29", note: "", status: { tone: "amber", label: "Needs a look" },
      tickets: [rigTicket({ id: "xpress_TBAR-DT-001232", number: "TBAR-DT-001232", date: "2026-10-29", customer: "Baytex Energy", rig: "Ensign 535", lsd: "11-27-62-3W4", rigKey: "535~baytex", matchReason: "operator-span", matchConfidence: "amber", lines: [line("Barite", 40, "40 kg")] })],
    },
    {
      key: "254~cenovus", name: "Rig 254", operator: "Cenovus", xpressName: "PD 254", appRig: "254", appRigs: ["254"],
      merged: false, aliases: [],
      currentWell: rigWell({ id: "beacon", name: "Beacon Hill", lsd: "6-6-60-6W4", lsdNorm: "6-6-60-6W4", operator: "Cenovus", rig: "254" }),
      wells: [rigWell({ id: "beacon", name: "Beacon Hill", lsd: "6-6-60-6W4", lsdNorm: "6-6-60-6W4", operator: "Cenovus", rig: "254" })],
      wellCount: 1, ticketCount: 2, lineCount: 2, latest: "2026-11-01",
      note: "Rig 254 is shared by Precision and Ensign for Cenovus — amber until confirmed.",
      status: { tone: "amber", label: "Needs a look" },
      tickets: [
        rigTicket({ id: "xpress_PD-254", number: "NK-004900", date: "2026-11-01", customer: "Cenovus", rig: "PD 254", lsd: "6-6-60-6W4", rigKey: "254~cenovus", matchConfidence: "amber" }),
        rigTicket({ id: "xpress_EN-254", number: "NK-004901", date: "2026-10-30", customer: "Cenovus", rig: "Ensign 254", lsd: "6-6-60-6W4", rigKey: "254~cenovus", matchConfidence: "amber" }),
      ],
    },
  ],
  quietRigs: [
    {
      key: "12~tundra", name: "Rig 12", operator: "Tundra", xpressName: "Rig 12", appRig: "12", appRigs: ["12"],
      merged: false, aliases: [], currentWell: rigWell({ id: "tundra-well", name: "Tundra 13-26", lsd: "13-26-2-28W1", operator: "Tundra", rig: "12" }),
      wells: [rigWell({ id: "tundra-well", name: "Tundra 13-26", lsd: "13-26-2-28W1", operator: "Tundra", rig: "12" })],
      wellCount: 1, tickets: [], ticketCount: 0, lineCount: 0, latest: "", note: "", status: { tone: "grey", label: "No app link" },
    },
    {
      key: "3~cardinal", name: "Rig 3", operator: "Cardinal Energy", xpressName: "Rig 3", appRig: "3", appRigs: ["3"],
      merged: false, aliases: [], currentWell: rigWell({ id: "card-well", name: "Cardinal Bantry", lsd: "8-12-18-13W4", operator: "Cardinal Energy", rig: "3" }),
      wells: [rigWell({ id: "card-well", name: "Cardinal Bantry", lsd: "8-12-18-13W4", operator: "Cardinal Energy", rig: "3" })],
      wellCount: 1, tickets: [], ticketCount: 0, lineCount: 0, latest: "", note: "", status: { tone: "grey", label: "No app link" },
    },
  ],
  unassigned: [
    rigTicket({ id: "xpress_NK-004810", number: "NK-004810", date: "2026-11-02", customer: "Other Oil", rig: "Nabors 99", lsd: "8-8-8-8W4", matchReason: "unassigned", matchConfidence: "grey", note: "No rig on the board matched this ticket." }),
    rigTicket({ id: "xpress_NK-004811", number: "NK-004811", date: "2026-10-31", customer: "Other Oil", rig: "Horizon 77", lsd: "2-2-2-2W4", matchReason: "unassigned", matchConfidence: "grey" }),
  ],
  warehouse: [
    rigTicket({ id: "xpress_MR-1", number: "NK-004820", type: "MR", date: "2026-11-01", customer: "Warehouse", matchReason: "warehouse", matchConfidence: "grey" }),
    rigTicket({ id: "xpress_ST-1", number: "NK-004821", type: "ST", date: "2026-10-30", customer: "Warehouse", matchReason: "warehouse", matchConfidence: "grey" }),
    rigTicket({ id: "xpress_AT-1", number: "NK-004822", type: "AT", date: "2026-10-29", customer: "Warehouse", matchReason: "warehouse", matchConfidence: "grey" }),
    rigTicket({ id: "xpress_STx-1", number: "NK-004823", type: "STx", date: "2026-10-28", customer: "Warehouse", matchReason: "warehouse", matchConfidence: "grey" }),
  ],
};

export const inventoryPreview: { xpress: XpressBoard; mim: XpressBoard; rigs: RigBoard; openWell?: OpenXpressWell; openWells?: Record<string, OpenXpressWell> } = {
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
