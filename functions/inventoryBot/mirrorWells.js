/** Slim app-well directory and one-well live reads. The mirror is read-only and never scanned in full. */

import { lsdNorm, parseAppDescription, dayKey } from "./engine.js";

export const MIRROR_URL = "https://uniqenergymirror-default-rtdb.firebaseio.com";

export function wellWindowStart(today) {
  const [year, month, day] = String(today).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() - 3);
  return date.toISOString().slice(0, 10);
}

export function slimWell(id, data) {
  const source = data && typeof data === "object" ? data : {};
  const lsd = source.lsd || source.uwi || source.location || source.LSD || "";
  return {
    id: String(id),
    name: source.name || source.wellName || String(id),
    lsd: String(lsd || ""),
    lsdNorm: lsdNorm(lsd),
    rig: source.rig || source.rigName || source.rig_name || "",
    contractor: source.contractor || "",
    operator: source.operator || source.company || source.customer || "",
    status: source.status || "",
  };
}

/** One range read. After the first sync, start just after the last stored well id. */
export function directoryRange(today, lastKey) {
  const windowStart = wellWindowStart(today);
  const end = `${today}\uf8ff`;
  const start = lastKey && lastKey >= windowStart ? `${lastKey}\0` : windowStart;
  return { start, end, reads: start > end ? 0 : 1 };
}

export function reportTickets(reports) {
  const rows = [];
  for (const [reportId, report] of Object.entries(reports || {})) {
    if (!report || typeof report !== "object") continue;
    const inventory = report.inventory && typeof report.inventory === "object" ? report.inventory : report;
    for (const side of ["received", "returned"]) {
      const bucket = inventory[side];
      if (!bucket || typeof bucket !== "object") continue;
      for (const [index, line] of Object.entries(bucket)) {
        if (!line || typeof line !== "object") continue;
        const description = String(line.description || "");
        const parsed = description ? parseAppDescription(description, side) : { kind: side === "returned" ? "returned" : "received", rawTicket: line.rawTicket || "" };
        const detail = line.receiveddetail || line.returneddetail || line.detail;
        const products = detail && typeof detail === "object" ? Object.keys(detail).length : (line.product || line.productname ? 1 : 0);
        rows.push({
          reportId,
          index,
          date: dayKey(line.receiveddate || line.returneddate || line.date || report.date),
          description,
          rawTicket: parsed.rawTicket || "",
          kind: parsed.kind,
          products,
          warehouse: parsed.kind === "received" || parsed.kind === "returned",
        });
      }
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.rawTicket).localeCompare(String(b.rawTicket)));
  return rows;
}
