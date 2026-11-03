/** Turn the box job's copied report docs into the rows the well page already shows. Field names vary, so each slot accepts a few aliases. */

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (typeof value === "object") return Object.values(value).filter((row) => row && typeof row === "object");
  return [];
}

function text(value) {
  if (value == null) return "";
  return String(value).trim();
}

function firstText(source, keys) {
  for (const key of keys) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return "";
}

function productsOf(line) {
  const rows = asArray(line?.products || line?.lines || line?.detail || line?.receiveddetail || line?.returneddetail);
  if (rows.length) {
    return rows.map((row) => ({
      name: firstText(row, ["name", "product", "productname", "productName"]),
      qty: Number(row.qty ?? row.quantity ?? row.received ?? row.returned ?? 0) || 0,
      unit: firstText(row, ["pack", "unit", "size", "package"]),
    })).filter((row) => row.name);
  }
  const name = firstText(line, ["name", "product", "productname", "productName"]);
  if (!name) return [];
  return [{ name, qty: Number(line.qty ?? line.quantity ?? line.received ?? line.returned ?? 0) || 0, unit: firstText(line, ["pack", "unit", "size"]) }];
}

function sideRows(reportId, report, side) {
  const bucket = asArray(report?.[side] || report?.[`${side}Lines`] || report?.inventory?.[side]);
  return bucket.map((line, index) => {
    const rawTicket = firstText(line, ["ticket", "rawTicket", "ticketNumber", "number"]);
    const kind = firstText(line, ["kind"]) || (side === "returned" ? "returned" : "received");
    const lines = productsOf(line);
    const warehouse = kind === "received" || kind === "returned";
    return {
      reportId,
      reportNumber: firstText(report, ["reportNumber", "number", "reportNo"]),
      index: String(index),
      date: firstText(line, ["date"]) || firstText(report, ["date", "reportDate"]),
      description: rawTicket ? `Ticket:${rawTicket}` : "",
      rawTicket,
      kind,
      products: lines.length,
      lines,
      warehouse,
    };
  });
}

/** One copied report document becomes the flat ticket rows the page groups by report. */
export function copiedReportRows(reportId, data) {
  const report = data && typeof data === "object" ? data : {};
  return [...sideRows(reportId, report, "received"), ...sideRows(reportId, report, "returned")];
}

export function isTestWell(well) {
  if (well?.isTest === true) return true;
  return /test/i.test(String(well?.name || ""));
}
