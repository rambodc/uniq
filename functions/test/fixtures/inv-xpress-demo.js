/** Sample input for the Inventory Xpress preview. The page shows buildInvXpress(demoInput()). */

const catalog = [
  ["Sawdust", "7.3 kg"],
  ["Barite", "40 kg"],
  ["UniSTAR", "22.68 kg"],
  ["UniPAC HVD", "22.68 kg"],
  ["UniPAC LVD", "22.7 kg"],
  ["Calcium Nitrate", "36.28 kg"],
  ["Bentonite - Regular", "40 kg"],
  ["UniSeal F", "11.3 kg"],
  ["Soap Sticks", "0.5 kg"],
  ["Nut Shell M", "22.68 kg"],
  ["2K7", "1 kg"],
  ["Mineral Oil", "1 L"],
  ["EZ Slide L", "1 L"],
].map(([name]) => ({ id: `app_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, name, appNames: [name], xpressNames: [name.toUpperCase()] }));
catalog.push(
  { id: "app_unicide_g15", name: "UniCide G15", appNames: ["UniCide G15"], xpressNames: ["UNICIDE G15 (18 L)", "UNICIDE G15 (19 L)"] },
  { id: "app_unibreak_1", name: "UniBreak 1", appNames: ["UniBreak 1"], xpressNames: ["UNIBREAK 1 (18 L)"] },
);

const warehouses = [
  ["CANNK", "Cannk"],
  ["TBAR", "Taber"],
  ["WBFS", "Wainwright"],
  ["GP", "Grande Prairie"],
  ["SBBRK", "Smithbrook"],
  ["NK", "Nisku"],
  ["BLKD", "Black Diamond"],
];

function split(total, parts) {
  const base = Math.floor(total / parts);
  const rows = Array.from({ length: parts }, () => base);
  rows[0] += total - base * parts;
  return rows;
}

const stockPlan = [
  ["SAWDUST", "7.3 kg", 5420, 80],
  ["BARITE", "40 kg", 6402, 120],
  ["UNISTAR", "22.68 kg", 5173, 40],
  ["UNIPAC HVD", "22.68 kg", 4314, 15],
  ["UNIPAC LVD (22.7 KG)", "22.7 kg", 4471, 40],
  ["CALCIUM NITRATE", "36.28 kg", 3287, 25],
  ["BENTONITE - REGULAR", "40 kg", 1429, 10],
  ["UNISEAL F", "11.3 kg", 4375, 30],
  ["SOAP STICKS", "0.5 kg", 1859, 12],
  ["NUT SHELL M", "22.68 kg", 760, 8],
  ["2K7", "1 kg", 1892, 6],
  ["MINERAL OIL", "1 L", 40, 0],
  ["UNICIDE G15 (18 L)", "18 L", 120, 15],
  ["UNICIDE G15 (19 L)", "19 L", 40, 5],
  ["UNIBREAK 1 (18 L)", "18 L", 12, 3],
  ["MYSTERY POLYMER 25KG", "25 kg", 220, 4],
  ["FOAM STICK SPECIAL", "1 kg", 86, 0],
  ["Empty Drums", "unit", 400, 0],
  ["Pallets", "unit", 90, 0],
  ["MSDS Book", "unit", 12, 0],
  ["Stretch Wrap", "unit", 30, 0],
  ["Envirobags", "unit", 16, 0],
  ["ATP Test Kit", "unit", 4, 0],
  ["C-U Charge", "unit", 7, 0],
  ["Tote Recycling", "unit", 11, 0],
];

function itemsFor(codeIndex) {
  return stockPlan.map(([name, unit, total, committed]) => {
    const parts = split(total, warehouses.length);
    const commits = split(committed, warehouses.length);
    const qty = parts[codeIndex];
    const held = commits[codeIndex];
    return { name, unit, committed: held, available: Math.max(0, qty - held), inTransit: name === "BARITE" && codeIndex === 0 ? 2555 : 0 };
  }).filter((item) => item.available || item.committed || item.inTransit);
}

export function demoInput() {
  const received = (ticket, date, rows) => ({ kind: "received", ticket, date, products: rows.map(([name, qty, pack]) => ({ name, qty, pack })) });
  const returned = (ticket, date, rows) => ({ kind: "returned", ticket, date, products: rows.map(([name, qty, pack]) => ({ name, qty, pack })) });
  const moved = (ticket, date, rows) => ({ kind: "transferOut", ticket, date, products: rows.map(([name, qty, pack]) => ({ name, qty, pack })) });
  const brought = (ticket, date, rows) => ({ kind: "transferIn", ticket, date, products: rows.map(([name, qty, pack]) => ({ name, qty, pack })) });
  return {
    computedAt: "2026-11-05T15:20:00.000Z",
    reportsSyncedAt: "2026-11-05T15:13:00.000Z",
    syncStatus: "ok",
    products: catalog,
    links: { xpress: { "UNIPAC LVD (22.7 KG)": "app_unipac_lvd" } },
    stock: [
      ...warehouses.map(([code, name], index) => ({ date: "2026-11-05", source: "xpress", warehouseCode: code, warehouseName: name, collectedAt: "2026-11-05T15:15:00.000Z", items: itemsFor(index) })),
      { date: "2026-11-04", source: "xpress", warehouseCode: "CANNK", warehouseName: "Cannk", items: [{ name: "BARITE", unit: "40 kg", committed: 0, available: 1 }] },
      { date: "2026-11-05", source: "mim", warehouseCode: "ALCHEM", warehouseName: "Alchem", items: [{ name: "BARITE", unit: "40 kg", committed: 0, available: 9999 }] },
    ],
    wells: [
      { id: "s3", name: "SRL MEOTA WEST 2 PAD 405 S3 HZ", status: "active-pause", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-10-14", lastReportDate: "2026-10-19" },
      { id: "s4", name: "SRL MEOTA WEST 2 PAD 405 S4 HZ", status: "active-pause", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-10-20", lastReportDate: "2026-10-20" },
      { id: "p6", name: "SRL MEOTA WEST 2 PAD 405 P6 HZ", status: "active", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-10-23", lastReportDate: "2026-11-04" },
      { id: "p4", name: "SRL MEOTA WEST 2 PAD 405 P4 HZ", status: "active", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-10-29", lastReportDate: "2026-11-05" },
      { id: "kent", name: "CNRL 15A FT KENT 15-31-61-4", status: "active", operator: "CNRL", rig: "Horizon 19", firstReportDate: "2026-10-12", lastReportDate: "2026-10-31" },
      { id: "tundra", name: "Tundra Steelman Hz B04-06", status: "active", operator: "Tundra Oil and Gas", rig: "Rig 4", firstReportDate: "2026-10-02", lastReportDate: "2026-11-04" },
      { id: "marten", name: "TVE 15-15 HZ 103 MARTEN", status: "active", operator: "Tamarack Valley Energy", rig: "Precision 299", firstReportDate: "2026-10-18", lastReportDate: "2026-11-05" },
      { id: "hwx-old", name: "HWX 105 HZ MARTENH 16-23-75-2", status: "active-pause", operator: "Headwater Exploration", rig: "Ensign 859", firstReportDate: "2026-10-16", lastReportDate: "2026-10-18" },
      { id: "hwx", name: "HWX 100 HZ MartenH 09-11-75-02", status: "active", operator: "Headwater Exploration", rig: "Ensign 859", firstReportDate: "2026-10-22", lastReportDate: "2026-11-03" },
      { id: "quiet", name: "New Horizon hole", status: "active", operator: "Strathcona Resources", rig: "Horizon 80", firstReportDate: "", lastReportDate: "" },
      { id: "card", name: "Cardinal 103 HZ Bantry", status: "active", operator: "Cardinal Energy", rig: "Bonanza 11", firstReportDate: "2026-10-20", lastReportDate: "2026-11-02" },
      { id: "other7", name: "CNRL other rig 7", status: "active", operator: "CNRL", rig: "7", firstReportDate: "2026-10-20", lastReportDate: "2026-11-01" },
      { id: "card7", name: "Cardinal rig 7", status: "active", operator: "Cardinal Energy", rig: "Rig 7", firstReportDate: "2026-10-21", lastReportDate: "2026-11-02" },
      { id: "test", name: "Horizon 55 Test Well", status: "active", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-11-01", lastReportDate: "2026-11-05" },
      { id: "done", name: "Completed Meota", status: "completed", operator: "Strathcona Resources", rig: "Horizon 55", firstReportDate: "2026-09-01", lastReportDate: "2026-09-20" },
    ],
    reports: [
      { id: "s3", wellId: "s3", date: "2026-10-19", received: [received("NK-100", "2026-10-15", [["Barite", 400, "40 kg"], ["Sawdust", 900, "7.3 kg"], ["UniSTAR", 200, "22.68 kg"], ["Soap Sticks", 40, "0.5 kg"]])], returned: [moved("T-S3", "2026-10-19", [["Barite", 400, "40 kg"], ["Sawdust", 900, "7.3 kg"], ["UniSTAR", 200, "22.68 kg"]])] },
      { id: "s4", wellId: "s4", date: "2026-10-20", received: [brought("T-S3", "2026-10-19", [["Barite", 400, "40 kg"], ["Sawdust", 900, "7.3 kg"], ["UniSTAR", 200, "22.68 kg"]]), received("NK-101", "2026-10-20", [["Barite", 80, "40 kg"]])], returned: [moved("T-S4", "2026-10-20", [["Barite", 480, "40 kg"], ["Sawdust", 900, "7.3 kg"], ["UniSTAR", 200, "22.68 kg"]])] },
      { id: "p6", wellId: "p6", date: "2026-11-04", received: [brought("T-S4", "2026-10-20", [["Barite", 480, "40 kg"], ["Sawdust", 900, "7.3 kg"], ["UniSTAR", 200, "22.68 kg"]]), received("NK-102", "2026-10-24", [["Sawdust", 300, "7.3 kg"], ["UniPAC LVD", 116, "22.7 kg"]])], returned: [moved("T-P6", "2026-11-04", [["Barite", 200, "40 kg"], ["Sawdust", 400, "7.3 kg"]])] },
      { id: "p4", wellId: "p4", date: "2026-11-05", received: [brought("T-P6", "2026-11-04", [["Barite", 200, "40 kg"], ["Sawdust", 400, "7.3 kg"]]), received("NK-103", "2026-11-01", [["Barite", 150, "40 kg"], ["Sawdust", 700, "7.3 kg"], ["UniSTAR", 220, "22.68 kg"], ["Mineral Oil", 7375, "1 L"], ["EZ Slide L", 7160, "1 L"], ["Nut Shell M", 180, "22.68 kg"]])], returned: [returned("CT-9", "2026-11-02", [["Soap Sticks", 80, "0.5 kg"]])], remaining: [{ product: "Barite", qty: 42, unit: "40 kg" }, { product: "Sawdust", qty: 110, unit: "7.3 kg" }, { product: "Mineral Oil", qty: 900, unit: "1 L" }] },
      { id: "kent", wellId: "kent", date: "2026-10-31", received: [received("TBAR-200", "2026-10-18", [["UniPAC LVD", 128, "22.7 kg"], ["Calcium Nitrate", 210, "36.28 kg"], ["UniSeal F", 90, "11.3 kg"], ["2K7", 70, "1 kg"]])], returned: [returned("CT-2", "2026-10-30", [["Calcium Nitrate", 10, "36.28 kg"]])] },
      { id: "tundra", wellId: "tundra", date: "2026-11-04", received: [received("NK-300", "2026-10-08", [["Sawdust", 1400, "7.3 kg"], ["Barite", 600, "40 kg"], ["Bentonite - Regular", 500, "40 kg"], ["Nut Shell M", 320, "22.68 kg"]])], returned: [] },
      { id: "marten", wellId: "marten", date: "2026-11-05", received: [received("WBFS-40", "2026-10-22", [["UniSTAR", 300, "22.68 kg"], ["UniPAC HVD", 240, "22.68 kg"], ["Sawdust", 800, "7.3 kg"]]), brought("FROM-DONE", "2026-10-25", [["Barite", 75, "40 kg"]])], returned: [moved("TO-DONE", "2026-11-03", [["UniPAC HVD", 20, "22.68 kg"]])] },
      { id: "hwx-old", wellId: "hwx-old", date: "2026-10-18", received: [received("GP-10", "2026-10-16", [["Barite", 90, "40 kg"], ["Sawdust", 140, "7.3 kg"]])], returned: [] },
      { id: "hwx", wellId: "hwx", date: "2026-11-03", received: [received("GP-11", "2026-10-23", [["Barite", 40, "40 kg"], ["UniSeal F", 60, "11.3 kg"]])], returned: [] },
      { id: "card", wellId: "card", date: "2026-11-02", received: [received("SB-8", "2026-10-26", [["UniPAC LVD", 187, "22.7 kg"], ["Bentonite - Regular", 160, "40 kg"], ["2K7", 44, "1 kg"]])], returned: [] },
      { id: "other7", wellId: "other7", date: "2026-11-01", received: [received("NK-70", "2026-10-28", [["Sawdust", 55, "7.3 kg"]])], returned: [] },
      { id: "card7", wellId: "card7", date: "2026-11-02", received: [received("NK-71", "2026-10-29", [["Sawdust", 35, "7.3 kg"]])], returned: [] },
      { id: "test", wellId: "test", date: "2026-11-05", received: [received("NK-TEST", "2026-11-05", [["Barite", 5000, "40 kg"]])], returned: [] },
    ],
  };
}
