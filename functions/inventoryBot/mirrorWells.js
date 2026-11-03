/** Parse older mud-report nodes that are still stored as received/returned maps. The website no longer reads the mirror. */

import { parseAppDescription, dayKey, linesFromDetail } from "./engine.js";

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
        const lines = linesFromDetail(detail, parsed.kind).map((entry) => ({ name: entry.name, qty: entry.qty, unit: entry.unit || "" }));
        rows.push({
          reportId,
          reportNumber: report.reportNumber != null && report.reportNumber !== "" ? String(report.reportNumber) : "",
          index,
          date: dayKey(line.receiveddate || line.returneddate || line.date || report.date),
          description,
          rawTicket: parsed.rawTicket || "",
          kind: parsed.kind,
          products: lines.length || products,
          lines,
          warehouse: parsed.kind === "received" || parsed.kind === "returned",
        });
      }
    }
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.rawTicket).localeCompare(String(b.rawTicket)));
  return rows;
}
