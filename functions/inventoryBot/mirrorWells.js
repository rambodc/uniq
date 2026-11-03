/** Slim app-well directory and one-well live reads. The mirror is read-only and never scanned in full. */

import { lsdNorm, parseAppDescription, dayKey, linesFromDetail } from "./engine.js";

export const MIRROR_URL = "https://uniqenergymirror.firebaseio.com";

const NAME_FIELDS = ["name", "well_name", "wellName", "WellName"];
const LSD_FIELDS = ["lsd", "uwi", "location", "LSD", "surface_location", "surfaceLocation"];
const RIG_FIELDS = ["rig", "rig_name", "rigName", "rig_number", "rigNumber"];
const CONTRACTOR_FIELDS = ["contractor", "contractor_name", "contractorName"];
export const OPERATOR_FIELDS = ["operator_name", "operatorName", "operatorname", "company_name", "companyName", "client_name", "clientName", "operator", "company", "client", "customer"];
const STATUS_FIELDS = ["status", "well_status", "wellStatus"];

export function wellWindowStart(today) {
  const [year, month, day] = String(today).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() - 3);
  return date.toISOString().slice(0, 10);
}

function textOf(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object") {
    for (const key of ["name", "operator_name", "operatorName", "title"]) {
      const nested = textOf(value[key]);
      if (nested) return nested;
    }
  }
  return "";
}

function firstOf(source, keys) {
  for (const key of keys) {
    const value = textOf(source?.[key]);
    if (value) return value;
  }
  return "";
}

export function slimWell(id, data) {
  const source = data && typeof data === "object" ? data : {};
  const lsd = firstOf(source, LSD_FIELDS);
  return {
    id: String(id),
    name: firstOf(source, NAME_FIELDS) || String(id),
    lsd,
    lsdNorm: lsdNorm(lsd),
    rig: firstOf(source, RIG_FIELDS),
    contractor: firstOf(source, CONTRACTOR_FIELDS),
    operator: firstOf(source, OPERATOR_FIELDS),
    status: firstOf(source, STATUS_FIELDS),
  };
}

/** Pick the scalar child names to read. A shallow key list is enough; the well's children stay unread. */
export function chooseFields(keys) {
  const present = new Set(keys || []);
  const pick = (names) => names.find((name) => present.has(name)) || "";
  const operator = pick(OPERATOR_FIELDS) || [...present].find((key) => /operator|client_?name|company_?name/i.test(key)) || "";
  return {
    name: pick(NAME_FIELDS),
    lsd: pick(LSD_FIELDS),
    rig: pick(RIG_FIELDS),
    contractor: pick(CONTRACTOR_FIELDS),
    operator,
    status: pick(STATUS_FIELDS),
  };
}

/** Ids after the cursor, inside the three-month window. `after` is exclusive. */
export function directoryQuery(today, lastKey) {
  const windowStart = wellWindowStart(today);
  const startAfter = lastKey && lastKey >= windowStart ? lastKey : windowStart;
  const end = `${today}\uf8ff`;
  return { startAfter, windowStart, end, today, reads: startAfter > end ? 0 : 1 };
}

export function filterWellIds(keys, { after, windowStart, end }) {
  return [...(keys || [])].filter((id) => id && id >= windowStart && id <= end && (!after || id > after)).sort();
}

export async function mirrorGet(app, path, params) {
  const token = await app.options.credential.getAccessToken();
  const url = new URL(`${MIRROR_URL}/${String(path).replace(/^\/+|\/+$/g, "")}.json`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
    const error = new Error(`Mirror read failed (${detail}).`);
    error.detail = detail;
    throw error;
  }
  return body;
}

async function getOrNull(get, path, params) {
  try {
    return { ok: true, body: await get(path, params) };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Shallow key listing. A typical day, starting after the last stored id, is the new ids only. */
export async function listNewWellIds(get, query) {
  if (!query.reads) return [];
  const startAfter = JSON.stringify(query.startAfter);
  const limited = await getOrNull(get, "data/wells", { shallow: "true", startAfter, limitToFirst: "80" });
  if (limited.ok) {
    const ids = [];
    let after = query.startAfter;
    let body = limited.body;
    for (let page = 0; page < 20; page += 1) {
      const pageIds = filterWellIds(Object.keys(body || {}), { after, windowStart: query.windowStart, end: query.end });
      ids.push(...pageIds);
      if (pageIds.length < 80) return ids;
      after = pageIds[pageIds.length - 1];
      const next = await getOrNull(get, "data/wells", { shallow: "true", startAfter: JSON.stringify(after), limitToFirst: "80" });
      if (!next.ok) return ids;
      body = next.body;
    }
    return ids;
  }
  const ranged = await getOrNull(get, "data/wells", { shallow: "true", startAfter });
  const source = ranged.ok ? ranged.body : (await get("data/wells", { shallow: "true" }));
  return filterWellIds(Object.keys(source || {}), { after: query.startAfter, windowStart: query.windowStart, end: query.end });
}

function segment(value) {
  return encodeURIComponent(String(value));
}

/** One shallow key list when the field names are not known yet, then one GET per scalar field. */
export async function readSlimWell(get, id, fieldMap) {
  let map = fieldMap;
  if (!map?.name && !map?.lsd && !map?.operator) {
    const keys = await get(`data/wells/${segment(id)}`, { shallow: "true" });
    map = chooseFields(Object.keys(keys || {}));
  }
  const values = {};
  await Promise.all(Object.entries(map).filter(([, field]) => field).map(async ([slot, field]) => {
    const value = await get(`data/wells/${segment(id)}/${segment(field)}`, {});
    const text = textOf(value);
    if (text) values[slot] = text;
  }));
  return { well: slimWell(id, values), fieldMap: map };
}

/** Latest reports, without the rest of each report node. One shallow key list, then date, reportNumber, and the received and returned buckets. */
export async function readSlimReports(get, wellId, limit = 30) {
  const listed = await get(`data/wellReports/${segment(wellId)}`, { shallow: "true" });
  const ids = Object.keys(listed && typeof listed === "object" ? listed : {}).sort().slice(-limit);
  const reports = {};
  await Promise.all(ids.map(async (reportId) => {
    const base = `data/wellReports/${segment(wellId)}/${segment(reportId)}`;
    const [date, reportNumber, received, returned] = await Promise.all([
      get(`${base}/date`),
      get(`${base}/reportNumber`),
      get(`${base}/inventory/received`),
      get(`${base}/inventory/returned`),
    ]);
    reports[reportId] = {
      date: typeof date === "string" ? date : "",
      reportNumber: typeof reportNumber === "string" || typeof reportNumber === "number" ? reportNumber : "",
      inventory: {
        received: received && typeof received === "object" ? received : {},
        returned: returned && typeof returned === "object" ? returned : {},
      },
    };
  }));
  return { reports, reads: 1 + ids.length * 4 };
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
