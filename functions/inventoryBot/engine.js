/** Pure Inventory Bot checks. No Firebase imports, so the rules can be unit tested on their own.
 * The collector writes the documents described in docs/inventory-bot.md. This module only reads plain objects. */

import { createHash } from "node:crypto";

export const DEFAULT_CONFIG = { graceDays: 3, valuation: "pricelist", receivedWindowDays: 5, staleReportDays: 7 };
export const DELIVERY_TYPES = ["DT"];
export const RETURN_TYPES = ["SR"];
export const TRANSFER_TYPES = ["SR", "ST", "STx", "TT"];
export const INBOUND_TYPES = ["MR", "PR", "SR", "FT"];
export const OUTBOUND_TYPES = ["DT", "CT", "ST", "STx", "TT"];
export const ADJUSTMENT_TYPES = ["AT"];
export const INACTIVE_STATUSES = ["paused", "inactive", "released", "completed", "completed-reviewed", "closed", "suspended"];
const QTY_TOLERANCE = 0.01;
export const DEFAULT_IGNORE_STOCK_NAMES = ["Empty Drums", "Empty Totes", "MSDS Book", "Pallets", "Shrink Wrap"];

export function isTicketType(value, expected) {
  return String(value ?? "").trim().toLowerCase() === String(expected ?? "").trim().toLowerCase();
}
export function inTicketTypes(value, list) {
  return (list || []).some((item) => isTicketType(value, item));
}
/** Doc ids keep their stored case. `xpress_TBAR-DT-001232` must not be lowercased before the lookup. */
export function ticketLookupId(query) {
  const text = String(query ?? "").trim();
  return /^[A-Za-z0-9]+_[A-Za-z0-9-]+$/.test(text) ? text : "";
}
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export function lsdNorm(value) {
  const raw = String(value ?? "").toUpperCase().trim();
  if (!raw) return "";
  const stripped = raw.replace(/^1\d\d\//, "").replace(/\/\d{1,2}$/, "");
  const match = stripped.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{1,3})\D+(\d{1,2})\D*([WE])\D*(\d)/);
  if (!match) return stripped.replace(/[^A-Z0-9]/g, "");
  return `${Number(match[1])}-${Number(match[2])}-${Number(match[3])}-${Number(match[4])}${match[5]}${Number(match[6])}`;
}

export function rigNorm(value) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** Same rig number for two contractors is not the same rig. */
export function rigIdentity(record) {
  const rig = rigNorm(record?.rig);
  if (!rig) return "";
  return `${nameNorm(record?.contractor || "")}|${rig}`;
}

export function nameNorm(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function codeNorm(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function dayKey(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

export function daysBetween(later, earlier) {
  if (!later || !earlier) return Number.POSITIVE_INFINITY;
  const end = Date.parse(`${later}T00:00:00Z`);
  const start = Date.parse(`${earlier}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(start)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000);
}

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isTicketPdfPath(value) {
  return typeof value === "string" && value.startsWith("inventoryBot/tickets/") && !value.includes("..") && !value.includes("\\");
}

export function configOf(value) {
  const source = value && typeof value === "object" ? value : {};
  const graceDays = Number.isFinite(source.graceDays) ? source.graceDays : DEFAULT_CONFIG.graceDays;
  const receivedWindowDays = Number.isFinite(source.receivedWindowDays) ? source.receivedWindowDays : DEFAULT_CONFIG.receivedWindowDays;
  const staleReportDays = Number.isFinite(source.staleReportDays) ? source.staleReportDays : DEFAULT_CONFIG.staleReportDays;
  const valuation = source.valuation === "cost" ? "cost" : "pricelist";
  const checksStartDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.checksStartDate || "")) ? String(source.checksStartDate) : "";
  const ignoreStockNames = Array.isArray(source.ignoreStockNames)
    ? source.ignoreStockNames.map((item) => String(item).trim()).filter(Boolean)
    : [...DEFAULT_IGNORE_STOCK_NAMES];
  return { graceDays, receivedWindowDays, staleReportDays, valuation, checksStartDate, ignoreStockNames };
}

/** Blank warehouse codes are normal. Match on the first of code, product id, or name. */
export function stockItemKey(item) {
  const chosen = [item?.code, item?.productId, item?.name].map((value) => String(value ?? "").trim()).find(Boolean) || "";
  return chosen.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "unknown";
}

export function isIgnoredStockItem(item, names = DEFAULT_IGNORE_STOCK_NAMES) {
  const text = `${item?.name ?? ""} ${item?.code ?? ""}`.toLowerCase();
  return (names || []).some((needle) => {
    const phrase = String(needle ?? "").trim().toLowerCase();
    if (!phrase) return false;
    if (text.includes(phrase)) return true;
    const stem = phrase.endsWith("s") ? phrase.slice(0, -1) : phrase;
    return stem.length >= 4 && text.includes(stem);
  });
}

/** `checksStartDate` lives on `config` or, as in the current main document, beside it. */
export function configFromMain(data) {
  const root = data && typeof data === "object" ? data : {};
  const config = root.config && typeof root.config === "object" ? root.config : {};
  return configOf({ ...config, checksStartDate: config.checksStartDate || root.checksStartDate });
}

export function isInactiveStatus(status) {
  const value = String(status || "").toLowerCase();
  return INACTIVE_STATUSES.includes(value) || value.startsWith("completed");
}

export function datedOnOrAfter(day, start) {
  if (!start || !day) return true;
  return day >= start;
}

export function requestStamp(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") {
    try { return value.toDate().toISOString(); } catch { return ""; }
  }
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) return `${value.seconds}.${value.nanoseconds || 0}`;
  return String(value);
}

/** True only when checksRequestedAt is present and different, so a summary write does not run the checks again. */
export function checksRequestChanged(before, after) {
  const next = requestStamp(after);
  return Boolean(next) && next !== requestStamp(before);
}

export function kindFromAppTicketId(id) {
  const match = String(id || "").match(/_(received|returned|transferIn|transferOut)-[A-Za-z0-9]+$/i);
  if (!match) return "";
  if (/^transferin$/i.test(match[1])) return "transferIn";
  if (/^transferout$/i.test(match[1])) return "transferOut";
  return match[1].toLowerCase();
}

export function remainingList(well) {
  const source = String(well?.remainingSource || "").toLowerCase();
  if (source === "opening" && Array.isArray(well?.openingRemaining)) return well.openingRemaining;
  if (Array.isArray(well?.remaining) && well.remaining.length) return well.remaining;
  if (!Array.isArray(well?.remaining) && Array.isArray(well?.openingRemaining)) return well.openingRemaining;
  return Array.isArray(well?.remaining) ? well.remaining : [];
}

export function indexProducts(products) {
  const byCode = new Map();
  const byName = new Map();
  for (const product of products || []) {
    for (const code of [...(product.xpressCodes || []), ...(product.mimCodes || [])]) {
      const key = codeNorm(code);
      if (key && !byCode.has(key)) byCode.set(key, product);
    }
    for (const label of [product.name, ...(product.appNames || [])]) {
      const key = nameNorm(label);
      if (key && !byName.has(key)) byName.set(key, product);
    }
  }
  return { byCode, byName };
}

export function matchProduct(index, code, name) {
  const coded = code ? index.byCode.get(codeNorm(code)) : undefined;
  if (coded) return coded;
  const named = name ? index.byName.get(nameNorm(name)) : undefined;
  return named || null;
}

export function matchWell(ticket, wells) {
  const norm = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const rig = rigNorm(ticket.rig);
  const byLsd = norm ? (wells || []).filter((well) => (well.lsdNorm || lsdNorm(well.lsd)) === norm) : [];
  if (byLsd.length === 1) return byLsd[0];
  if (byLsd.length > 1) {
    const sameRig = rig ? byLsd.filter((well) => rigNorm(well.rig) === rig) : [];
    return (sameRig.length ? sameRig : byLsd)[0];
  }
  if (!rig) return null;
  const byRig = (wells || []).filter((well) => rigNorm(well.rig) === rig);
  return byRig.length === 1 ? byRig[0] : null;
}

/** Xpress ticket prefixes and the warehouse codes they correspond to. Prefixes are fuzzy, not equal. */
const PREFIX_PAIRS = [["NK", "CANNK"], ["BRKS", "SBBRK"]];

export function ticketNorm(value) {
  const exact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!exact) return null;
  if (/^\d+$/.test(exact) || !exact.includes("-")) return { exact, prefix: "", type: "", number: "", thirdParty: true };
  const typed = exact.match(/^([A-Z][A-Z0-9]*?)-([A-Z]{1,4})-(\d+)$/);
  if (typed) return { exact, prefix: typed[1], type: typed[2], number: String(Number(typed[3])), thirdParty: false };
  const plain = exact.match(/^([A-Z][A-Z0-9]*?)-(\d+)$/);
  if (plain) return { exact, prefix: plain[1], type: "", number: String(Number(plain[2])), thirdParty: false };
  return { exact, prefix: "", type: "", number: "", thirdParty: false };
}

export function warehouseTicketNumber(ticket) {
  const explicit = ticket?.ticketNumber || ticket?.number;
  if (explicit) return String(explicit);
  return String(ticket?.id || "").replace(/^(xpress|mim)_/i, "");
}

function prefixClose(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  return PREFIX_PAIRS.some(([a, b]) => (a === left && b === right) || (a === right && b === left));
}

/** `exact` when the cleaned numbers are the same string, `fuzzy` when only the prefix and digits agree, otherwise `none`. */
export function ticketsMatch(left, right) {
  if (!left?.number || !right?.number || left.thirdParty || right.thirdParty) return "none";
  if (left.number !== right.number || !prefixClose(left.prefix, right.prefix)) return "none";
  return left.exact === right.exact ? "exact" : "fuzzy";
}

export function firstUwi(text) {
  const match = String(text ?? "").match(/(\d{1,3}\/)?\d{1,2}[-/]\d{1,2}[-/]\d{1,3}[-/]\d{1,2}\s*[WEwe]\s*\d(?:\/\d{1,2})?/);
  return match ? lsdNorm(match[0]) : "";
}

export function linesFromDetail(detail, kind) {
  if (!detail || typeof detail !== "object") return [];
  const qtyKey = kind === "returned" || kind === "transferOut" ? "returned" : "received";
  return Object.values(detail).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const name = row.productname || row.product || row.name || "";
    if (!name) return [];
    const qty = Number(row[qtyKey] ?? row.qty ?? row.received ?? row.returned);
    return [{ name, code: row.code || "", unit: row.unit || "", price: Number.isFinite(Number(row.price)) ? Number(row.price) : null, qty: Number.isFinite(qty) ? qty : 0 }];
  });
}

/** Reads a mud-report description into a ticket entry. Newlines and a missing DT/CT segment are preserved for fuzzy matching. */
export function parseAppDescription(description, side = "received") {
  const text = String(description ?? "").replace(/\r/g, "");
  const compact = text.replace(/\s+/g, " ").trim();
  if (/^transfer-to ticket:/i.test(compact)) {
    const rawTicket = (text.match(/ticket:\s*([^,]+)/i)?.[1] || "").replace(/\s+/g, "");
    return { kind: "transferIn", rawTicket, otherWellUWI: firstUwi(text) };
  }
  if (/^transfer-from ticket:/i.test(compact)) {
    const rawTicket = (text.match(/ticket:\s*([^,]+)/i)?.[1] || "").replace(/\s+/g, "");
    return { kind: "transferOut", rawTicket, otherWellUWI: firstUwi(text) };
  }
  const rawTicket = (text.match(/ticket:\s*([^,]+)/i)?.[1] || "").replace(/\s+/g, "");
  const parsed = ticketNorm(rawTicket);
  const kind = parsed?.type === "CT" || side === "returned" ? "returned" : "received";
  return { kind, rawTicket, otherWellUWI: "" };
}

export function normalizeAppTicket(entry) {
  const fromId = kindFromAppTicketId(entry?.id);
  const described = entry?.description ? parseAppDescription(entry.description, entry.kind || fromId || "received") : null;
  const transferKind = described?.kind === "transferIn" || described?.kind === "transferOut" ? described.kind : "";
  const kind = entry?.kind || transferKind || fromId || described?.kind || "received";
  const rawTicket = entry?.rawTicket || described?.rawTicket || "";
  const parsed = ticketNorm(entry?.ticketNorm || rawTicket);
  const lines = Array.isArray(entry?.lines) && entry.lines.length ? entry.lines : linesFromDetail(entry?.receiveddetail || entry?.returneddetail || entry?.detail, kind);
  const other = entry?.otherWellUWI || described?.otherWellUWI || "";
  return {
    ...entry,
    kind, rawTicket,
    ticketNorm: parsed?.exact || "",
    parsed,
    lines,
    otherWellUWI: other ? (lsdNorm(other) || other) : "",
    date: dayKey(entry?.date) || dayKey(entry?.receiveddate) || dayKey(entry?.returneddate),
  };
}

export function stockEffect(type, qty) {
  const amount = Number(qty);
  if (!Number.isFinite(amount)) return 0;
  if (inTicketTypes(type, INBOUND_TYPES)) return amount;
  if (inTicketTypes(type, OUTBOUND_TYPES)) return -Math.abs(amount);
  if (inTicketTypes(type, ADJUSTMENT_TYPES)) return amount;
  return 0;
}

function identityOf(index, code, name) {
  const product = matchProduct(index, code, name);
  const key = product?.id || nameNorm(name) || codeNorm(code) || "unknown";
  return { product, key, name: product?.name || name || code || "Unknown product" };
}

function lineIdentity(index, line) {
  const item = identityOf(index, line?.code, line?.name || line?.product || line?.productname);
  const unit = loggedUnit(line);
  const pack = packKey(unit);
  return { ...item, unit, key: pack ? `${item.key}|${pack}` : item.key, name: unit ? `${item.name} ${unit}` : item.name };
}

function money(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function appLinePrice(line) {
  if (!line) return null;
  return money(line.price) ?? money(line.unitCost) ?? money(line.unitcost);
}

function loggedUnit(line) {
  if (!line) return "";
  return String(line.unit || line.pack || line.packSize || line.size || "").trim();
}

function productUnit(product) {
  if (!product) return "";
  return String(product.unit || product.pack || product.packSize || product.size || "").trim();
}

function unitToken(value) {
  const token = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function unitFamily(raw) {
  const token = unitToken(raw);
  if (["l", "lt", "ltr", "litre", "liter"].includes(token)) return "l";
  if (["ml", "millilitre", "milliliter"].includes(token)) return "ml";
  if (["kg", "kilo", "kilogram"].includes(token)) return "kg";
  if (["g", "gram"].includes(token)) return "g";
  if (["lb", "pound"].includes(token)) return "lb";
  if (["gal", "gallon"].includes(token)) return "gal";
  return "";
}

function packSize(unit) {
  const match = String(unit ?? "").toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
  if (!match) return null;
  const amount = Number(match[1]);
  const family = unitFamily(match[2]);
  if (!Number.isFinite(amount) || amount <= 0 || !family) return null;
  return { amount, family };
}

function packKey(unit) {
  const size = packSize(unit);
  if (size) return `${Math.round(size.amount * 1000) / 1000}${size.family}`;
  return unitToken(unit);
}

function unitsDiffer(logged, listed) {
  const left = packSize(logged);
  const right = packSize(listed);
  if (left && right) {
    if (left.family !== right.family) return true;
    return Math.abs(left.amount - right.amount) / Math.max(left.amount, right.amount) > 0.15;
  }
  const a = unitToken(logged);
  const b = unitToken(listed);
  if (!a || !b) return false;
  return a !== b;
}

function samePack(index, line, key) {
  const item = lineIdentity(index, line);
  if (item.key === key) return true;
  const itemPack = item.key.includes("|") ? item.key.slice(item.key.indexOf("|") + 1) : "";
  const keyPack = String(key).includes("|") ? String(key).slice(String(key).indexOf("|") + 1) : "";
  const itemProduct = itemPack ? item.key.slice(0, item.key.indexOf("|")) : item.key;
  const keyProduct = keyPack ? String(key).slice(0, String(key).indexOf("|")) : String(key);
  if (itemProduct !== keyProduct) return false;
  if (!itemPack || !keyPack) return true;
  return itemPack === keyPack;
}

/** App line price first. The pricelist (or cost) is used only when that price is missing and the product unit matches the logged unit. */
function unitPrice(row, valuation) {
  const app = appLinePrice(row);
  if (app != null) return app;
  const product = row?.product;
  if (!product || unitsDiffer(loggedUnit(row), productUnit(product))) return null;
  const listed = valuation === "cost" ? product.cost : product.price;
  return typeof listed === "number" && Number.isFinite(listed) ? listed : null;
}

function catalogPrice(product, valuation) {
  if (!product) return null;
  const listed = valuation === "cost" ? product.cost : product.price;
  return typeof listed === "number" && Number.isFinite(listed) ? listed : null;
}

function addLineQty(current, line) {
  const qty = qtyOf(line);
  current.qty += qty;
  const price = appLinePrice(line);
  if (price != null && qty > 0) {
    current.pricedQty = (current.pricedQty || 0) + qty;
    current.pricedValue = (current.pricedValue || 0) + qty * price;
    current.price = current.pricedValue / current.pricedQty;
  } else if (current.price == null && price != null) {
    current.price = price;
  }
}

function dollars(qty, price) {
  if (!Number.isFinite(price)) return 0;
  return Math.round(Math.abs(qty) * price * 100) / 100;
}

function ticketDay(ticket) {
  return dayKey(ticket.postedAt) || dayKey(ticket.shippedAt) || dayKey(ticket.collectedAt);
}

function linesOf(ticket) {
  return Array.isArray(ticket.lines) ? ticket.lines : [];
}

function qtyOf(line) {
  const qty = Number(line?.qty);
  return Number.isFinite(qty) ? qty : 0;
}

function slugText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function docSlug(value) {
  return slugText(value).slice(0, 80) || "item";
}

function shortHash(parts) {
  return createHash("sha1").update(JSON.stringify(parts.map((part) => String(part ?? "")))).digest("hex").slice(0, 12);
}

function issueId(date, rule, ...parts) {
  const productKey = parts.length ? parts[parts.length - 1] : "item";
  return `${date}_${rule}_${shortHash(parts.slice(0, -1))}_${slugText(productKey) || "item"}`;
}

function issueBody(issue) {
  return JSON.stringify({
    rule: issue.rule, severity: issue.severity, title: issue.title, detail: issue.detail,
    wellId: issue.wellId, rig: issue.rig, lsd: issue.lsd, ticketIds: issue.ticketIds,
    products: issue.products, dollarValue: issue.dollarValue,
  });
}

function add(issues, issue) {
  let id = issue.id;
  let suffix = 2;
  while (issues.has(id)) {
    if (issueBody(issues.get(id)) === issueBody(issue)) return;
    id = `${issue.id}_${suffix}`;
    suffix += 1;
  }
  issues.set(id, id === issue.id ? issue : { ...issue, id });
}

export { add as addIssue };

function roundQty(qty) {
  return Math.round(qty * 1000) / 1000;
}

function sumLines(tickets, index, accept) {
  const groups = new Map();
  const ticketIds = new Map();
  for (const ticket of tickets) {
    if (!accept(ticket)) continue;
    for (const line of linesOf(ticket)) {
      const item = lineIdentity(index, line);
      const current = groups.get(item.key) || { ...item, qty: 0, price: null };
      addLineQty(current, line);
      groups.set(item.key, current);
      const ids = ticketIds.get(item.key) || [];
      if (!ids.includes(ticket.id)) ids.push(ticket.id);
      ticketIds.set(item.key, ids);
    }
  }
  return { groups, ticketIds };
}

function remainingMap(well, index) {
  const groups = new Map();
  const prices = new Map();
  for (const line of remainingList(well)) {
    const item = lineIdentity(index, line);
    const current = groups.get(item.key) || { ...item, qty: 0, price: null };
    addLineQty(current, line);
    groups.set(item.key, current);
    if (current.price != null) prices.set(item.key, current.price);
  }
  return { groups, prices };
}

function movementMap(entries, index, dateField) {
  const groups = new Map();
  for (const line of entries || []) {
    const item = lineIdentity(index, line);
    const current = groups.get(item.key) || { ...item, qty: 0, dates: [] };
    current.qty += qtyOf(line);
    const day = dayKey(line[dateField]) || dayKey(line.date);
    if (day) current.dates.push(day);
    groups.set(item.key, current);
  }
  return groups;
}

function appEntryLines(entry, index) {
  const groups = new Map();
  for (const line of entry.lines || []) {
    const item = lineIdentity(index, line);
    const current = groups.get(item.key) || { ...item, qty: 0, price: null };
    addLineQty(current, line);
    groups.set(item.key, current);
  }
  return groups;
}

function numberMatch(ticket, entries) {
  const parsed = ticketNorm(warehouseTicketNumber(ticket));
  const hits = [];
  for (const entry of entries) {
    if (!entry.parsed || entry.parsed.thirdParty) continue;
    const level = ticketsMatch(parsed, entry.parsed);
    if (level !== "none") hits.push({ entry, level });
  }
  const exact = hits.filter((hit) => hit.level === "exact");
  if (exact.length) return { level: "exact", hits: exact };
  if (hits.length) return { level: "fuzzy", hits };
  return { level: "none", hits: [] };
}

function deliveryIssues(issues, { date, settings, tickets, wells, index, appEntries }) {
  const deliveries = tickets.filter((ticket) => inTicketTypes(ticket.type, DELIVERY_TYPES));
  const byWell = new Map();
  for (const ticket of deliveries) {
    const day = ticketDay(ticket);
    if (!day || daysBetween(date, day) <= settings.graceDays) continue;
    const numbered = numberMatch(ticket, appEntries.filter((entry) => entry.kind === "received" || entry.kind === "transferIn"));
    if (numbered.level !== "none") continue;
    const well = matchWell(ticket, wells);
    if (!well?.lastReportDate || daysBetween(well.lastReportDate, day) < 0) continue;
    const bucket = byWell.get(well.id) || { well, tickets: [] };
    bucket.tickets.push(ticket);
    byWell.set(well.id, bucket);
  }
  for (const { well, tickets: wellTickets } of byWell.values()) {
    const received = movementMap(well.received, index);
    const { groups, ticketIds } = sumLines(wellTickets, index, () => true);
    for (const [key, row] of groups) {
      const numbered = appEntries.some((entry) => entry.wellId === well.id && entry.kind === "received" && entry.parsed?.number && !entry.parsed.thirdParty);
      if (received.has(key) && !numbered) continue;
      const price = unitPrice(row, settings.valuation);
      const value = dollars(row.qty, price);
      add(issues, {
        id: issueId(date, "delivered_not_logged", well.id, key),
        date, rule: "delivered_not_logged", severity: "high",
        title: `${row.name} delivered to ${well.name || well.id} was not logged`,
        detail: `${roundQty(row.qty)} ${row.name} left on a delivery ticket more than ${settings.graceDays} days ago, and the latest app report does not show that ticket number or product as received.`,
        wellId: well.id, rig: well.rig || "", lsd: well.lsd || "",
        ticketIds: ticketIds.get(key) || [],
        products: [{ name: row.name, qty: roundQty(row.qty), value }],
        dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
      });
    }
  }
}

function ticketLinkIssues(issues, { date, settings, tickets, wells, index, appEntries }) {
  for (const entry of appEntries) {
    if (entry.kind !== "received" && entry.kind !== "returned") continue;
    if (!entry.parsed?.number || entry.parsed.thirdParty) continue;
    const well = wells.find((item) => item.id === entry.wellId) || { id: entry.wellId || "app", name: entry.wellId || "App report", rig: "", lsd: "" };
    const numbered = [];
    for (const ticket of tickets) {
      const level = ticketsMatch(entry.parsed, ticketNorm(warehouseTicketNumber(ticket)));
      if (level !== "none") numbered.push({ ticket, level });
    }
    const exact = numbered.filter((hit) => hit.level === "exact");
    let chosen = exact.length ? exact : numbered;
    let level = exact.length ? "exact" : numbered.length ? "fuzzy" : "none";
    const sources = new Set(chosen.map((hit) => hit.ticket.source).filter(Boolean));
    if (level === "fuzzy" && sources.size > 1) {
      chosen = [];
      level = "none";
    }
    const matched = level === "none" ? [] : chosen.map((hit) => hit.ticket);
    if (level === "none") {
      const row = [...appEntryLines(entry, index).values()][0] || { name: entry.rawTicket || "product", qty: 0, product: null, price: null };
      if (!isIgnoredStockItem(row, settings.ignoreStockNames)) {
        add(issues, baseIssue({
          date, rule: "logged_no_ticket", severity: "medium", well, key: entry.id || entry.rawTicket || row.key, row,
          title: `${row.name} was logged at ${well.name || well.id} with no warehouse ticket`,
          detail: `The app cites ${entry.rawTicket || entry.ticketNorm || "a receipt"} and no warehouse ticket has that number.`,
          valuation: settings.valuation, fallbackPrice: row.price,
        }));
      }
      continue;
    }
    if (level === "fuzzy") {
      add(issues, {
        id: issueId(date, "ticket_typo", entry.id || entry.rawTicket, well.id),
        date, rule: "ticket_typo", severity: "low",
        title: `App ticket ${entry.rawTicket || entry.ticketNorm} only matches a warehouse ticket fuzzily`,
        detail: `${well.name || well.id} logged ${entry.rawTicket || entry.ticketNorm}. The closest warehouse ticket is ${warehouseTicketNumber(chosen[0].ticket)} (${chosen[0].ticket.id}). The numbers agree once a missing type segment, zero padding, or a warehouse prefix alias is allowed.`,
        wellId: well.id || "", rig: well.rig || "", lsd: well.lsd || "",
        ticketIds: chosen.map((hit) => hit.ticket.id),
        products: [], dollarValue: 0, status: "open", note: "", resolvedBy: "", resolvedAt: null,
      });
    }
    const appLines = appEntryLines(entry, index);
    if (!appLines.size) continue;
    for (const [key, row] of appLines) {
      if (isIgnoredStockItem(row, settings.ignoreStockNames)) continue;
      const ticketQty = matched.reduce((sum, ticket) => sum + linesOf(ticket).filter((line) => samePack(index, line, key)).reduce((inner, line) => inner + qtyOf(line), 0), 0);
      if (Math.abs(ticketQty - row.qty) <= QTY_TOLERANCE) continue;
      add(issues, baseIssue({
        date, rule: "qty_mismatch", severity: "medium", well, key: `${entry.id || entry.rawTicket}-${key}`, row: { ...row, qty: row.qty - ticketQty },
        title: `${row.name} ${entry.kind} at ${well.name || well.id} does not match ticket ${entry.rawTicket || entry.ticketNorm}`,
        detail: `The app logged ${roundQty(row.qty)} ${row.name} on ${entry.rawTicket || entry.ticketNorm} and the warehouse ticket lines total ${roundQty(ticketQty)}.`,
        ticketIds: matched.map((ticket) => ticket.id),
        valuation: settings.valuation, fallbackPrice: row.price,
      }));
    }
  }
}

function periodMovement(well, side, index, start) {
  const reports = Array.isArray(well.reports) ? well.reports.filter((report) => report && typeof report === "object").slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))) : [];
  let currentLines = well[side] || [];
  let previousLines = null;
  if (reports.length >= 2) {
    const latest = reports.at(-1);
    const prior = reports.at(-2);
    if (start && (dayKey(latest.date) < start || dayKey(prior.date) < start)) return new Map();
    currentLines = latest[side] || [];
    previousLines = prior[side] || [];
  } else if (Array.isArray(well[side === "received" ? "previousReceived" : "previousReturned"])) {
    previousLines = well[side === "received" ? "previousReceived" : "previousReturned"];
  } else {
    return new Map();
  }
  const current = movementMap(currentLines, index);
  const previous = movementMap(previousLines, index);
  const delta = new Map();
  for (const key of new Set([...current.keys(), ...previous.keys()])) {
    const qty = (current.get(key)?.qty || 0) - (previous.get(key)?.qty || 0);
    if (qty <= QTY_TOLERANCE) continue;
    delta.set(key, { ...(current.get(key) || previous.get(key)), qty });
  }
  return delta;
}

function receiptIssues(issues, { date, settings, tickets, wells, index, appEntries }) {
  const windowDays = settings.receivedWindowDays;
  for (const well of wells) {
    if (appEntries.some((entry) => entry.wellId === well.id && !entry.lifted && (entry.kind === "received" || entry.kind === "returned"))) continue;
    const received = periodMovement(well, "received", index, settings.checksStartDate);
    const returned = periodMovement(well, "returned", index, settings.checksStartDate);
    const wellTickets = tickets.filter((ticket) => matchWell(ticket, [well])?.id === well.id);
    for (const [key, row] of received) {
      if (appEntries.some((entry) => entry.wellId === well.id && entry.kind === "received" && entry.parsed?.number && !entry.parsed.thirdParty && appEntryLines(entry, index).has(key))) continue;
      const center = row.dates[0] || dayKey(well.lastReportDate);
      const matched = wellTickets.filter((ticket) => inTicketTypes(ticket.type, DELIVERY_TYPES) && within(ticketDay(ticket), center, windowDays) && linesOf(ticket).some((line) => samePack(index, line, key)));
      if (!matched.length) {
        add(issues, baseIssue({
          date, rule: "logged_no_ticket", severity: "medium", well, key, row,
          title: `${row.name} was logged at ${well.name || well.id} with no delivery ticket`,
          detail: `The latest app report received ${roundQty(row.qty)} ${row.name}, and no delivery ticket matches it within ${windowDays} days.`,
          valuation: settings.valuation,
        }));
        continue;
      }
    }
    for (const [key, row] of returned) {
      if (appEntries.some((entry) => entry.wellId === well.id && entry.kind === "returned" && entry.parsed?.number && !entry.parsed.thirdParty && appEntryLines(entry, index).has(key))) continue;
      const center = row.dates[0] || dayKey(well.lastReportDate);
      const matched = wellTickets.filter((ticket) => inTicketTypes(ticket.type, RETURN_TYPES) && within(ticketDay(ticket), center, windowDays) && linesOf(ticket).some((line) => samePack(index, line, key)));
      if (!matched.length) {
        if (isIgnoredStockItem(row, settings.ignoreStockNames)) continue;
        add(issues, baseIssue({
          date, rule: "logged_no_ticket", severity: "medium", well, key, row,
          title: `${row.name} returned from ${well.name || well.id} with no return ticket`,
          detail: `The mud report shows ${roundQty(row.qty)} ${row.name} returned since the previous report, and no return ticket matches it within ${windowDays} days.`,
          valuation: settings.valuation,
        }));
      }
    }
  }
}

function within(day, center, windowDays) {
  if (!day || !center) return false;
  return Math.abs(daysBetween(day, center)) <= windowDays;
}

function transferStamp(entry) {
  const match = String(entry.rawTicket || "").match(/^(\d+)_transfer/i);
  return match ? match[1] : "";
}

function transferMismatchIssues(issues, { date, settings, wells, index, appEntries }) {
  const incoming = appEntries.filter((entry) => entry.kind === "transferIn");
  const outgoing = appEntries.filter((entry) => entry.kind === "transferOut");
  const used = new Set();
  function differentWell(entry, other) {
    return !entry.wellId || !other.wellId || entry.wellId !== other.wellId;
  }
  function partner(entry) {
    const stamp = transferStamp(entry);
    const byStamp = stamp ? outgoing.find((other) => !used.has(other) && differentWell(entry, other) && transferStamp(other) === stamp) : null;
    if (byStamp) return byStamp;
    const well = wells.find((item) => item.id === entry.wellId);
    const byWell = outgoing.find((other) => {
      if (used.has(other) || !differentWell(entry, other)) return false;
      const otherWell = wells.find((item) => item.id === other.wellId);
      const fromHere = well && lsdNorm(other.otherWellUWI) === (well.lsdNorm || lsdNorm(well.lsd));
      const toThere = otherWell && lsdNorm(entry.otherWellUWI) === (otherWell.lsdNorm || lsdNorm(otherWell.lsd));
      return fromHere && toThere;
    });
    if (byWell) return byWell;
    const lines = appEntryLines(entry, index);
    if (!entry.date || !lines.size) return null;
    return outgoing.find((other) => {
      if (used.has(other) || !differentWell(entry, other) || !other.date || !within(entry.date, other.date, 1)) return false;
      const otherLines = appEntryLines(other, index);
      if (otherLines.size !== lines.size) return false;
      for (const [key, row] of lines) {
        if (Math.abs((otherLines.get(key)?.qty || 0) - row.qty) > QTY_TOLERANCE) return false;
      }
      return true;
    });
  }
  const groups = new Map();
  for (const entry of incoming) {
    const pair = partner(entry);
    if (!pair && outgoing.some((other) => !differentWell(entry, other))) {
      for (const other of outgoing) if (!differentWell(entry, other)) used.add(other);
      continue;
    }
    if (pair) used.add(pair);
    const receiver = wells.find((item) => item.id === entry.wellId) || { id: entry.wellId || "transfer", name: "Receiving well", rig: "", lsd: "" };
    const sender = (pair && wells.find((item) => item.id === pair.wellId)) || wellByUwi(wells, entry.otherWellUWI);
    noteTransfer(groups, { sender, receiver, transferDay: entry.date || pair?.date || "", senderHint: entry.otherWellUWI });
    const left = appEntryLines(entry, index);
    const right = pair ? appEntryLines(pair, index) : new Map();
    for (const key of new Set([...left.keys(), ...right.keys()])) {
      const row = transferRow(left.get(key), right.get(key));
      addTransferLine(groups, groupKey(sender, receiver, entry.date || pair?.date || "", entry.otherWellUWI), row, (left.get(key)?.qty || 0) - (right.get(key)?.qty || 0), settings);
    }
  }
  for (const entry of outgoing) {
    if (used.has(entry)) continue;
    const sender = wells.find((item) => item.id === entry.wellId) || null;
    const receiver = wellByUwi(wells, entry.otherWellUWI) || { id: lsdNorm(entry.otherWellUWI) || "transfer", name: "Receiving well", rig: "", lsd: lsdNorm(entry.otherWellUWI) || "" };
    noteTransfer(groups, { sender, receiver, transferDay: entry.date || "", senderHint: entry.wellId });
    for (const [, row] of appEntryLines(entry, index)) addTransferLine(groups, groupKey(sender, receiver, entry.date || "", entry.wellId), row, row.qty, settings);
  }
  for (const group of groups.values()) {
    const lines = [...group.lines.values()].filter((line) => line.qty > QTY_TOLERANCE);
    if (!lines.length) continue;
    const senderLoaded = Boolean(group.sender && wells.some((item) => item.id === group.sender.id));
    const senderName = group.sender?.name || lsdNorm(group.senderHint) || group.senderHint || "the sending well";
    const receiverName = group.receiver?.name || group.receiver?.id || "the receiving well";
    const listed = lines.map((line) => `${roundQty(line.qty)} ${line.name}`).join(", ");
    const counted = senderLoaded ? Math.round(lines.reduce((sum, line) => sum + line.value, 0) * 100) / 100 : 0;
    add(issues, {
      id: issueId(date, "transfer_mismatch", group.sender?.id || group.senderHint || "sender", group.receiver?.id || "receiver", group.transferDay || "transfer"),
      date, rule: "transfer_mismatch", severity: senderLoaded ? "medium" : "low",
      title: senderLoaded ? `Transfer from ${senderName} to ${receiverName} does not match` : "Transfer sender not loaded",
      detail: senderLoaded
        ? `${senderName} to ${receiverName} on ${group.transferDay || "an undated transfer"} does not balance: ${listed}.`
        : `${receiverName} received ${listed} on ${group.transferDay || "an undated transfer"} from ${senderName}, and that sending well is not loaded. Its dollars are not counted.`,
      wellId: wells.some((item) => item.id === group.receiver?.id) ? group.receiver.id : (group.sender?.id || ""),
      rig: group.receiver?.rig || group.sender?.rig || "",
      lsd: group.receiver?.lsd || group.sender?.lsd || "",
      ticketIds: [],
      products: lines.map((line) => ({ name: line.name, qty: roundQty(line.qty), value: senderLoaded ? line.value : 0 })),
      dollarValue: counted, status: "open", note: "", resolvedBy: "", resolvedAt: null,
    });
  }
}

function wellByUwi(wells, uwi) {
  const norm = lsdNorm(uwi);
  if (!norm) return null;
  return wells.find((item) => (item.lsdNorm || lsdNorm(item.lsd)) === norm) || null;
}

function groupKey(sender, receiver, transferDay, hint) {
  return `${sender?.id || lsdNorm(hint) || hint || "sender"}|${receiver?.id || "receiver"}|${transferDay || ""}`;
}

function noteTransfer(groups, { sender, receiver, transferDay, senderHint }) {
  const key = groupKey(sender, receiver, transferDay, senderHint);
  const current = groups.get(key) || { sender, receiver, transferDay, senderHint, lines: new Map() };
  if (!current.sender && sender) current.sender = sender;
  groups.set(key, current);
  return current;
}

function addTransferLine(groups, key, row, gap, settings) {
  const group = groups.get(key);
  if (!group || !row || Math.abs(gap) <= QTY_TOLERANCE || isIgnoredStockItem(row, settings.ignoreStockNames)) return;
  const qty = Math.abs(gap);
  const value = dollars(qty, unitPrice(row, settings.valuation));
  const current = group.lines.get(row.key) || { name: row.name, qty: 0, value: 0 };
  current.qty += qty;
  current.value = Math.round((current.value + value) * 100) / 100;
  group.lines.set(row.key, current);
}

function transferRow(left, right) {
  const base = left || right;
  if (!base) return null;
  const price = appLinePrice(left) ?? appLinePrice(right);
  const unit = loggedUnit(left) || loggedUnit(right);
  return { ...base, price: price ?? base.price ?? null, unit: unit || base.unit || "" };
}

function baseIssue({ date, rule, severity, well, key, row, title, detail, ticketIds, valuation, fallbackPrice }) {
  const price = unitPrice({ ...row, price: fallbackPrice ?? row.price }, valuation);
  const value = dollars(row.qty, price);
  return {
    id: issueId(date, rule, well.id, key),
    date, rule, severity, title, detail,
    wellId: well.id, rig: well.rig || "", lsd: well.lsd || "",
    ticketIds: ticketIds || [],
    products: [{ name: row.name, qty: roundQty(Math.abs(row.qty)), value }],
    dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
  };
}

function isInboundCarry(entry) {
  if (!entry || entry.kind === "transferOut" || entry.kind === "returned") return false;
  if (entry.kind === "transferIn") return true;
  return /transfer/i.test(`${entry.description || ""} ${entry.rawTicket || ""}`);
}

function openingCarry(next, key, index) {
  if (Array.isArray(next.openingRemaining) && next.openingRemaining.length) return movementMap(next.openingRemaining, index).get(key)?.qty || 0;
  if (!Array.isArray(next.reports) || !next.reports.length) return null;
  const first = [...next.reports].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))[0];
  const onHand = movementMap(first.remaining || [], index).get(key)?.qty || 0;
  const received = movementMap(first.received || [], index).get(key)?.qty || 0;
  return Math.max(onHand, received);
}

function carriedOnto(next, key, index, appEntries) {
  let transfer = 0;
  let sawTransfer = false;
  for (const entry of appEntries || []) {
    if (entry.wellId !== next.id || !isInboundCarry(entry)) continue;
    sawTransfer = true;
    transfer += appEntryLines(entry, index).get(key)?.qty || 0;
  }
  for (const line of next.received || []) {
    if (!/transfer/i.test(`${line.description || ""} ${line.rawTicket || ""}`)) continue;
    sawTransfer = true;
    transfer += movementMap([line], index).get(key)?.qty || 0;
  }
  const opening = openingCarry(next, key, index);
  if (sawTransfer || opening != null) return Math.max(transfer, opening || 0);
  return movementMap(next.received, index).get(key)?.qty || 0;
}

function hasMudReport(well) {
  if (dayKey(well?.lastReportDate)) return true;
  return Array.isArray(well?.reports) && well.reports.some((report) => dayKey(report?.date));
}

function reportedWithinGrace(well, date, graceDays) {
  const day = dayKey(well?.lastReportDate);
  if (!day) return false;
  return daysBetween(date, day) <= graceDays;
}

function rigMoveIssues(issues, { date, settings, wells, index, appEntries }) {
  const claimed = new Set();
  const groups = new Map();
  for (const well of wells) {
    const rig = rigIdentity(well);
    if (!rig) continue;
    const list = groups.get(rig) || [];
    list.push(well);
    groups.set(rig, list);
  }
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => String(a.spudDate || a.lastReportDate || "").localeCompare(String(b.spudDate || b.lastReportDate || "")) || String(a.id).localeCompare(String(b.id)));
    for (let indexWell = 1; indexWell < ordered.length; indexWell += 1) {
      const previous = ordered[indexWell - 1];
      const next = ordered[indexWell];
      if ((previous.spudDate || previous.lastReportDate || "") === (next.spudDate || next.lastReportDate || "")) continue;
      if (!hasMudReport(next) || reportedWithinGrace(previous, date, settings.graceDays)) continue;
      const before = remainingMap(previous, index);
      for (const [key, row] of before.groups) {
        if (row.qty <= QTY_TOLERANCE || isIgnoredStockItem(row, settings.ignoreStockNames)) continue;
        const carried = carriedOnto(next, key, index, appEntries);
        const missing = row.qty - carried;
        if (missing <= QTY_TOLERANCE) {
          claimed.add(`${previous.id}|${key}`);
          continue;
        }
        const price = unitPrice(row, settings.valuation);
        const value = dollars(missing, price);
        claimed.add(`${previous.id}|${key}`);
        add(issues, {
          id: issueId(date, "lost_on_rig_move", previous.id, next.id, key),
          date, rule: "lost_on_rig_move", severity: "high",
          title: `${row.name} did not follow rig ${next.rig} to ${next.name || next.id}`,
          detail: `${previous.name || previous.id} still showed ${roundQty(row.qty)} ${row.name}. ${next.name || next.id} carried over ${roundQty(carried)}, leaving ${roundQty(missing)} unaccounted.`,
          wellId: next.id, rig: next.rig || "", lsd: next.lsd || previous.lsd || "",
          ticketIds: [],
          products: [{ name: row.name, qty: roundQty(missing), value }],
          dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
        });
      }
    }
  }
  return claimed;
}

function returnIssues(issues, { date, settings, tickets, wells, index, claimed }) {
  for (const well of wells) {
    const stale = !well.lastReportDate || daysBetween(date, dayKey(well.lastReportDate)) > settings.staleReportDays;
    if (!isInactiveStatus(well.status) && !stale) continue;
    const { groups } = remainingMap(well, index);
    const reportDay = dayKey(well.lastReportDate);
    for (const [key, row] of groups) {
      if (row.qty <= QTY_TOLERANCE || isIgnoredStockItem(row, settings.ignoreStockNames)) continue;
      if (claimed?.has(`${well.id}|${key}`)) continue;
      const covered = tickets.some((ticket) => inTicketTypes(ticket.type, TRANSFER_TYPES) && matchWell(ticket, [well])?.id === well.id && (!reportDay || ticketDay(ticket) >= reportDay) && linesOf(ticket).some((line) => samePack(index, line, key)));
      if (covered) continue;
      const price = unitPrice(row, settings.valuation);
      const value = dollars(row.qty, price);
      const why = isInactiveStatus(well.status) ? `status is ${well.status}` : `no app report in more than ${settings.staleReportDays} days`;
      add(issues, {
        id: issueId(date, "should_be_returned", well.id, key),
        date, rule: "should_be_returned", severity: "medium",
        title: `${row.name} is still on ${well.name || well.id} and should come back`,
        detail: `${roundQty(row.qty)} ${row.name} remains, the well ${why}, and there is no return or transfer ticket after the last report.`,
        wellId: well.id, rig: well.rig || "", lsd: well.lsd || "", ticketIds: [],
        products: [{ name: row.name, qty: roundQty(row.qty), value }],
        dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
      });
    }
  }
}

function warehouseIssues(issues, { date, settings, tickets, stock, index }) {
  const groups = new Map();
  for (const snapshot of stock || []) {
    if (!snapshot.date || snapshot.date > date) continue;
    const key = `${snapshot.source}|${snapshot.warehouseCode}`;
    const list = groups.get(key) || [];
    list.push(snapshot);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const current = ordered.at(-1);
    const previous = ordered.length > 1 ? ordered.at(-2) : null;
    const items = new Map((current.items || []).filter((item) => !isIgnoredStockItem(item, settings.ignoreStockNames)).map((item) => [stockItemKey(item), item]));
    for (const item of items.values()) {
      const onHand = Number(item.onHand);
      const available = Number(item.available);
      const onHandNegative = Number.isFinite(onHand) && onHand < -QTY_TOLERANCE;
      const availableNegative = Number.isFinite(available) && available < -QTY_TOLERANCE;
      if (onHandNegative || availableNegative) {
        const row = identityOf(index, item.code, item.name);
        const price = unitPrice({ ...row, unit: item.unit || item.pack || item.packSize }, settings.valuation);
        const parts = [];
        if (onHandNegative) parts.push(`${roundQty(onHand)} on hand`);
        if (availableNegative) parts.push(`${roundQty(available)} available`);
        const qty = onHandNegative ? onHand : available;
        const value = dollars(qty, price);
        add(issues, {
          id: issueId(date, "warehouse_drift", current.source, current.warehouseCode, "negative", row.key),
          date, rule: "warehouse_drift", severity: "high",
          title: `${row.name} is negative at ${current.warehouseName || current.warehouseCode}`,
          detail: `${current.source} ${current.warehouseCode} shows ${parts.join(" and ")} on ${current.date}.`,
          wellId: "", rig: "", lsd: "", ticketIds: [],
          products: [{ name: row.name, qty: roundQty(qty), value }],
          dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
        });
      }
    }
    if (!previous) continue;
    const explained = new Map();
    const explainAlias = new Map();
    const ticketIds = new Map();
    for (const ticket of tickets) {
      if (ticket.warehouseCode !== current.warehouseCode || ticket.source !== current.source) continue;
      const day = ticketDay(ticket);
      if (!day || day <= previous.date || day > current.date) continue;
      for (const line of linesOf(ticket)) {
        if (isIgnoredStockItem(line, settings.ignoreStockNames)) continue;
        const row = identityOf(index, line.code, line.name || line.productId);
        const keys = [...new Set([stockItemKey(line), row.key].filter(Boolean))];
        const primary = keys[0];
        explained.set(primary, (explained.get(primary) || 0) + stockEffect(ticket.type, line.qty));
        for (const key of keys.slice(1)) if (!explained.has(key)) explainAlias.set(key, primary);
        for (const key of keys) {
          const ids = ticketIds.get(key) || [];
          if (!ids.includes(ticket.id)) ids.push(ticket.id);
          ticketIds.set(key, ids);
        }
      }
    }
    const previousItems = new Map((previous.items || []).filter((item) => !isIgnoredStockItem(item, settings.ignoreStockNames)).map((item) => [stockItemKey(item), item]));
    for (const item of current.items || []) {
      if (isIgnoredStockItem(item, settings.ignoreStockNames)) continue;
      const key = stockItemKey(item);
      const row = identityOf(index, item.code, item.name || item.productId);
      const before = Number(previousItems.get(key)?.onHand);
      const after = Number(item.onHand);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      const delta = after - before;
      const primary = explained.has(key) ? key : (explainAlias.get(key) || (explained.has(row.key) ? row.key : explainAlias.get(row.key)));
      const net = primary ? explained.get(primary) || 0 : 0;
      if (Math.abs(delta - net) <= QTY_TOLERANCE) continue;
      const price = unitPrice({ ...row, unit: item.unit || item.pack || item.packSize }, settings.valuation);
      const gap = delta - net;
      const value = dollars(gap, price);
      add(issues, {
        id: issueId(date, "warehouse_drift", current.source, current.warehouseCode, key),
        date, rule: "warehouse_drift", severity: "medium",
        title: `${row.name} at ${current.warehouseName || current.warehouseCode} changed without tickets`,
        detail: `On hand went from ${roundQty(before)} to ${roundQty(after)} between ${previous.date} and ${current.date}. Tickets explain ${roundQty(net)} of that change.`,
        wellId: "", rig: "", lsd: "", ticketIds: ticketIds.get(key) || ticketIds.get(row.key) || [],
        products: [{ name: row.name, qty: roundQty(gap), value }],
        dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
      });
    }
  }
}

function priceIssues(issues, { date, settings, tickets, index }) {
  const missing = new Map();
  const unlinked = [];
  for (const ticket of tickets) {
    if (!inTicketTypes(ticket.type, DELIVERY_TYPES) || ticketDay(ticket) !== date) continue;
    for (const line of linesOf(ticket)) {
      const row = identityOf(index, line.code, line.name);
      if (catalogPrice(row.product, settings.valuation) != null) continue;
      if (isIgnoredStockItem(row, settings.ignoreStockNames)) continue;
      if (!row.product) {
        unlinked.push({ name: row.name, qty: qtyOf(line), ticketId: ticket.id });
        continue;
      }
      const current = missing.get(row.key) || { ...row, qty: 0, ticketIds: [] };
      current.qty += qtyOf(line);
      if (!current.ticketIds.includes(ticket.id)) current.ticketIds.push(ticket.id);
      missing.set(row.key, current);
    }
  }
  if (unlinked.length) {
    const names = [...new Set(unlinked.map((item) => item.name))].slice(0, 12).join(", ");
    add(issues, {
      id: issueId(date, "missing_price", "unpriced-items"),
      date, rule: "missing_price", severity: "low",
      title: "Unpriced items",
      detail: `${unlinked.length} delivered ${unlinked.length === 1 ? "line is" : "lines are"} not linked to a product, so ${unlinked.length === 1 ? "it has" : "they have"} no pricelist price: ${names}.`,
      wellId: "", rig: "", lsd: "", ticketIds: [...new Set(unlinked.map((item) => item.ticketId))],
      products: [], dollarValue: 0, status: "open", note: "", resolvedBy: "", resolvedAt: null,
    });
  }
  for (const [key, row] of missing) {
    add(issues, {
      id: issueId(date, "missing_price", key),
      date, rule: "missing_price", severity: "low",
      title: `${row.name} was delivered with no pricelist price`,
      detail: `${roundQty(row.qty)} ${row.name} went out on ${date} and the product record has no ${settings.valuation === "cost" ? "cost" : "price"}, so its dollar value is missing.`,
      wellId: "", rig: "", lsd: "", ticketIds: row.ticketIds,
      products: [{ name: row.name, qty: roundQty(row.qty), value: 0 }],
      dollarValue: 0, status: "open", note: "", resolvedBy: "", resolvedAt: null,
    });
  }
}

function rigInventoryFor(date, wells, tickets, index) {
  return wells.map((well) => {
    const reportDay = dayKey(well.lastReportDate);
    const { groups, prices } = remainingMap(well, index);
    const expected = new Map([...groups.entries()].map(([key, row]) => [key, { ...row, qty: row.qty }]));
    const related = [];
    for (const ticket of tickets) {
      const day = ticketDay(ticket);
      if (!day || (reportDay && day <= reportDay) || day > date) continue;
      if (matchWell(ticket, [well])?.id !== well.id) continue;
      if (!inTicketTypes(ticket.type, DELIVERY_TYPES) && !inTicketTypes(ticket.type, RETURN_TYPES)) continue;
      related.push(ticket.id);
      const sign = inTicketTypes(ticket.type, DELIVERY_TYPES) ? 1 : -1;
      for (const line of linesOf(ticket)) {
        const row = lineIdentity(index, line);
        const current = expected.get(row.key) || { ...row, qty: 0 };
        current.qty += sign * qtyOf(line);
        expected.set(row.key, current);
      }
    }
    const names = new Set([...groups.keys(), ...expected.keys()]);
    const appRemaining = [...groups.values()].map((row) => ({ product: row.name, qty: roundQty(row.qty) }));
    const expectedRows = [...expected.values()].map((row) => ({ product: row.name, qty: roundQty(row.qty) }));
    const diff = [...names].map((key) => {
      const name = expected.get(key)?.name || groups.get(key)?.name || key;
      return { product: name, qty: roundQty((expected.get(key)?.qty || 0) - (groups.get(key)?.qty || 0)) };
    }).filter((row) => Math.abs(row.qty) > QTY_TOLERANCE);
    return {
      id: `${date}_${docSlug(well.id)}`,
      date, wellId: well.id, rig: well.rig || "", name: well.name || well.id,
      expected: expectedRows, appRemaining, diff, ticketIds: related, prices: Object.fromEntries(prices),
    };
  });
}

export function mimTtCharges(tickets, date) {
  return (tickets || []).reduce((sum, ticket) => {
    if (String(ticket.source || "") !== "mim" || !isTicketType(ticket.type, "TT")) return sum;
    if (ticketDay(ticket) !== date) return sum;
    const charges = Array.isArray(ticket.charges) ? ticket.charges : [];
    return sum + charges.reduce((inner, charge) => inner + (Number(charge.total) || 0), 0);
  }, 0);
}

export function appMoney(wells, date) {
  const totals = { appProductCost: 0, appServiceCost: 0, appTotalCost: 0, reports: 0 };
  for (const well of wells || []) {
    if (dayKey(well.lastReportDate) !== date) continue;
    const costs = well.costs || {};
    const productCost = Number(costs.dailyProductCost);
    const serviceCost = Number(costs.dailyServiceCost);
    const totalCost = Number(costs.dailyTotalCost);
    if (![productCost, serviceCost, totalCost].some(Number.isFinite)) continue;
    totals.reports += 1;
    if (Number.isFinite(productCost)) totals.appProductCost += productCost;
    if (Number.isFinite(serviceCost)) totals.appServiceCost += serviceCost;
    if (Number.isFinite(totalCost)) totals.appTotalCost += totalCost;
  }
  for (const key of ["appProductCost", "appServiceCost", "appTotalCost"]) totals[key] = Math.round(totals[key] * 100) / 100;
  return totals;
}

export function summaryOf({ date, issues, mimCharges, sources, costs }) {
  const open = issues.filter((issue) => issue.status === "open");
  const counts = { high: 0, medium: 0, low: 0, open: open.length };
  for (const issue of open) if (counts[issue.severity] != null) counts[issue.severity] += 1;
  const dollarsAtRisk = Math.round(open.reduce((sum, issue) => sum + (Number(issue.dollarValue) || 0), 0) * 100) / 100;
  const delivered = open.filter((issue) => issue.rule === "delivered_not_logged").length;
  const moneyText = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(dollarsAtRisk);
  const sentences = [`Checks for ${date}: ${open.length} open issue${open.length === 1 ? "" : "s"} (${counts.high} high). ${moneyText} at risk.`];
  if (delivered) sentences.push(`${delivered} delivery ${delivered === 1 ? "ticket was" : "tickets were"} not logged in the company app.`);
  if (mimCharges) sentences.push(`MIM truck-ticket charges for this day are ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Math.round(mimCharges * 100) / 100)}.`);
  if (costs?.reports) sentences.push(`App reports for this day show ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(costs.appProductCost)} of product cost, ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(costs.appServiceCost)} of service cost, and ${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(costs.appTotalCost)} total.`);
  const failed = Object.entries(sources || {}).filter(([, source]) => source && source.ok === false).map(([name]) => name);
  if (failed.length) sentences.push(`The collector reported a problem for ${failed.join(", ")}.`);
  return { text: sentences.join(" "), issueCounts: counts, dollarsAtRisk, mimTtCharges: Math.round((mimCharges || 0) * 100) / 100, appProductCost: costs?.appProductCost || 0, appServiceCost: costs?.appServiceCost || 0, appTotalCost: costs?.appTotalCost || 0 };
}

function liftedEntries(wells, appTickets) {
  const coveredReports = new Set();
  const coveredWells = new Set();
  for (const entry of appTickets) {
    if (!entry.wellId) continue;
    coveredWells.add(entry.wellId);
    if (entry.reportId) coveredReports.add(`${entry.wellId}|${entry.reportId}`);
  }
  const entries = [];
  for (const well of wells) {
    for (const [side, kind] of [["received", "received"], ["returned", "returned"]]) {
      for (const [index, line] of (well[side] || []).entries()) {
        if (!line?.description && !line?.rawTicket) continue;
        const reportId = line.reportId || well.lastReportId || "";
        if (coveredWells.has(well.id) && (!reportId || coveredReports.has(`${well.id}|${reportId}`) || !appTickets.some((entry) => entry.wellId === well.id && entry.reportId))) continue;
        entries.push(normalizeAppTicket({ ...line, id: `${well.id}_${side}_${index}`, wellId: well.id, kind, date: line.date, lifted: true }));
      }
    }
  }
  return entries;
}

export function runChecks({ date, config, tickets = [], wells = [], products = [], stock = [], appTickets = [], sources }) {
  const settings = configOf(config);
  const index = indexProducts(products);
  const preparedTickets = tickets.map((ticket) => ({ ...ticket, lsdNorm: ticket.lsdNorm || lsdNorm(ticket.lsd) })).filter((ticket) => datedOnOrAfter(ticketDay(ticket), settings.checksStartDate));
  const preparedWells = wells.map((well) => ({
    ...well,
    lsdNorm: well.lsdNorm || lsdNorm(well.lsd),
    lastReportId: well.lastReportId || well.newestReportId || "",
    remaining: remainingList(well),
  }));
  const normalizedApps = appTickets.map((entry) => normalizeAppTicket(entry));
  const appEntries = [...normalizedApps, ...liftedEntries(preparedWells, normalizedApps)].filter((entry) => datedOnOrAfter(entry.date, settings.checksStartDate));
  const stockInWindow = (stock || []).filter((row) => datedOnOrAfter(row.date, settings.checksStartDate));
  const issues = new Map();
  const input = { date, settings, tickets: preparedTickets, wells: preparedWells, index, stock: stockInWindow, appEntries };
  deliveryIssues(issues, input);
  ticketLinkIssues(issues, input);
  receiptIssues(issues, input);
  transferMismatchIssues(issues, input);
  const carried = rigMoveIssues(issues, input);
  returnIssues(issues, { ...input, claimed: carried });
  warehouseIssues(issues, input);
  priceIssues(issues, input);
  const issueList = [...issues.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
  const charges = mimTtCharges(preparedTickets, date);
  const costs = appMoney(preparedWells, date);
  return {
    issues: issueList,
    rigInventory: rigInventoryFor(date, preparedWells, preparedTickets, index),
    summary: summaryOf({ date, issues: issueList, mimCharges: charges, sources, costs }),
  };
}
