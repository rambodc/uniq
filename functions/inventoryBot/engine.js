/** Pure Inventory Bot checks. No Firebase imports, so the rules can be unit tested on their own.
 * The collector writes the documents described in docs/inventory-bot.md. This module only reads plain objects. */

export const DEFAULT_CONFIG = { graceDays: 3, valuation: "pricelist", receivedWindowDays: 5, staleReportDays: 7 };
export const DELIVERY_TYPES = ["DT"];
export const RETURN_TYPES = ["SR"];
export const TRANSFER_TYPES = ["SR", "ST", "STx", "TT"];
export const INBOUND_TYPES = ["MR", "PR", "SR", "FT"];
export const OUTBOUND_TYPES = ["DT", "CT", "ST", "STx", "TT"];
export const ADJUSTMENT_TYPES = ["AT"];
export const INACTIVE_STATUSES = ["paused", "inactive", "released", "completed", "closed", "suspended"];
const QTY_TOLERANCE = 0.01;
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
  return { graceDays, receivedWindowDays, staleReportDays, valuation };
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
  if (/^\d+$/.test(exact)) return { exact, prefix: "", type: "", number: String(Number(exact)), thirdParty: true };
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
  if (left === right) return true;
  if (!left || !right) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 2 && longer.endsWith(shorter)) return true;
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
  const described = entry?.description ? parseAppDescription(entry.description, entry.kind || "received") : null;
  const kind = entry?.kind || described?.kind || "received";
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
  const kind = String(type || "").toUpperCase();
  if (INBOUND_TYPES.includes(kind)) return amount;
  if (OUTBOUND_TYPES.includes(kind)) return -Math.abs(amount);
  if (ADJUSTMENT_TYPES.includes(kind)) return amount;
  return 0;
}

function identityOf(index, code, name) {
  const product = matchProduct(index, code, name);
  const key = product?.id || nameNorm(name) || codeNorm(code) || "unknown";
  return { product, key, name: product?.name || name || code || "Unknown product" };
}

function priceOf(product, fallback, valuation) {
  const field = valuation === "cost" ? "cost" : "price";
  const listed = product?.[field];
  if (typeof listed === "number" && Number.isFinite(listed)) return listed;
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
  return null;
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

export function docSlug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "item";
}

function issueId(date, rule, ...parts) {
  return `${date}_${rule}_${docSlug(parts.join("-"))}`;
}

function add(issues, issue) {
  issues.set(issue.id, issue);
}

function roundQty(qty) {
  return Math.round(qty * 1000) / 1000;
}

function sumLines(tickets, index, accept) {
  const groups = new Map();
  const ticketIds = new Map();
  for (const ticket of tickets) {
    if (!accept(ticket)) continue;
    for (const line of linesOf(ticket)) {
      const item = identityOf(index, line.code, line.name);
      const current = groups.get(item.key) || { ...item, qty: 0 };
      current.qty += qtyOf(line);
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
  for (const line of well.remaining || []) {
    const item = identityOf(index, line.code, line.product || line.name);
    const current = groups.get(item.key) || { ...item, qty: 0 };
    current.qty += qtyOf(line);
    groups.set(item.key, current);
    if (Number.isFinite(Number(line.price))) prices.set(item.key, Number(line.price));
  }
  return { groups, prices };
}

function movementMap(entries, index, dateField) {
  const groups = new Map();
  for (const line of entries || []) {
    const item = identityOf(index, line.code, line.product || line.name);
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
    const item = identityOf(index, line.code, line.name || line.product);
    const current = groups.get(item.key) || { ...item, qty: 0, price: null };
    current.qty += qtyOf(line);
    if (current.price == null && typeof line.price === "number") current.price = line.price;
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

function kindsFor(entry) {
  return entry.kind === "returned" || entry.kind === "transferOut" ? ["SR", "CT"] : ["DT"];
}

function fallbackTickets(entry, tickets, wells, index, windowDays) {
  const well = wells.find((item) => item.id === entry.wellId);
  if (!well) return [];
  const center = entry.date || dayKey(well.lastReportDate);
  const wanted = new Set(kindsFor(entry));
  const products = appEntryLines(entry, index);
  return tickets.filter((ticket) => {
    if (!wanted.has(String(ticket.type || "").toUpperCase())) return false;
    if (matchWell(ticket, [well])?.id !== well.id) return false;
    if (!within(ticketDay(ticket), center, windowDays)) return false;
    if (!products.size) return true;
    return linesOf(ticket).some((line) => products.has(identityOf(index, line.code, line.name).key));
  });
}

function deliveryIssues(issues, { date, settings, tickets, wells, index, appEntries }) {
  const deliveries = tickets.filter((ticket) => DELIVERY_TYPES.includes(String(ticket.type || "").toUpperCase()));
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
      const price = priceOf(row.product, null, settings.valuation);
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
    const chosen = exact.length ? exact : numbered;
    const level = exact.length ? "exact" : numbered.length ? "fuzzy" : "none";
    const fallback = level === "none" ? fallbackTickets(entry, tickets, wells, index, settings.receivedWindowDays) : [];
    const matched = level === "none" ? fallback : chosen.map((hit) => hit.ticket);
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
    if (!matched.length) {
      const row = [...appLines.values()][0] || { name: entry.rawTicket || "product", qty: 0, product: null, price: null };
      add(issues, baseIssue({
        date, rule: "logged_no_ticket", severity: "medium", well, key: entry.id || entry.rawTicket || row.key, row,
        title: `${row.name} was logged at ${well.name || well.id} with no warehouse ticket`,
        detail: `The app cites ${entry.rawTicket || entry.ticketNorm || "a receipt"} and no warehouse ticket matches that number, or the LSD, rig, and date window.`,
        valuation: settings.valuation, fallbackPrice: row.price,
      }));
      continue;
    }
    if (!appLines.size) continue;
    for (const [key, row] of appLines) {
      const ticketQty = matched.reduce((sum, ticket) => sum + linesOf(ticket).filter((line) => identityOf(index, line.code, line.name).key === key).reduce((inner, line) => inner + qtyOf(line), 0), 0);
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

function receiptIssues(issues, { date, settings, tickets, wells, index, appEntries }) {
  const windowDays = settings.receivedWindowDays;
  for (const well of wells) {
    const received = movementMap(well.received, index);
    const returned = movementMap(well.returned, index);
    const wellTickets = tickets.filter((ticket) => matchWell(ticket, [well])?.id === well.id);
    for (const [key, row] of received) {
      if (appEntries.some((entry) => entry.wellId === well.id && entry.kind === "received" && entry.parsed?.number && !entry.parsed.thirdParty && appEntryLines(entry, index).has(key))) continue;
      const center = row.dates[0] || dayKey(well.lastReportDate);
      const matched = wellTickets.filter((ticket) => DELIVERY_TYPES.includes(String(ticket.type || "").toUpperCase()) && within(ticketDay(ticket), center, windowDays) && linesOf(ticket).some((line) => identityOf(index, line.code, line.name).key === key));
      const ticketQty = matched.reduce((sum, ticket) => sum + linesOf(ticket).filter((line) => identityOf(index, line.code, line.name).key === key).reduce((inner, line) => inner + qtyOf(line), 0), 0);
      if (!matched.length) {
        add(issues, baseIssue({
          date, rule: "logged_no_ticket", severity: "medium", well, key, row,
          title: `${row.name} was logged at ${well.name || well.id} with no delivery ticket`,
          detail: `The latest app report received ${roundQty(row.qty)} ${row.name}, and no delivery ticket matches it within ${windowDays} days.`,
          valuation: settings.valuation,
        }));
        continue;
      }
      if (Math.abs(ticketQty - row.qty) > QTY_TOLERANCE) {
        const gap = roundQty(row.qty - ticketQty);
        add(issues, baseIssue({
          date, rule: "qty_mismatch", severity: "medium", well, key, row: { ...row, qty: gap },
          title: `${row.name} received at ${well.name || well.id} does not match the tickets`,
          detail: `The app logged ${roundQty(row.qty)} ${row.name} and the delivery tickets in the same window total ${roundQty(ticketQty)}.`,
          ticketIds: matched.map((ticket) => ticket.id),
          valuation: settings.valuation,
        }));
      }
    }
    for (const [key, row] of returned) {
      if (appEntries.some((entry) => entry.wellId === well.id && entry.kind === "returned" && entry.parsed?.number && !entry.parsed.thirdParty && appEntryLines(entry, index).has(key))) continue;
      const center = row.dates[0] || dayKey(well.lastReportDate);
      const matched = wellTickets.filter((ticket) => RETURN_TYPES.includes(String(ticket.type || "").toUpperCase()) && within(ticketDay(ticket), center, windowDays) && linesOf(ticket).some((line) => identityOf(index, line.code, line.name).key === key));
      const ticketQty = matched.reduce((sum, ticket) => sum + linesOf(ticket).filter((line) => identityOf(index, line.code, line.name).key === key).reduce((inner, line) => inner + qtyOf(line), 0), 0);
      if (!matched.length || Math.abs(ticketQty - row.qty) <= QTY_TOLERANCE) continue;
      add(issues, baseIssue({
        date, rule: "qty_mismatch", severity: "medium", well, key, row: { ...row, qty: row.qty - ticketQty },
        title: `${row.name} returned from ${well.name || well.id} does not match the tickets`,
        detail: `The app logged ${roundQty(row.qty)} ${row.name} returned and the return tickets in the same window total ${roundQty(ticketQty)}.`,
        ticketIds: matched.map((ticket) => ticket.id),
        valuation: settings.valuation,
      }));
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
  function partner(entry) {
    const stamp = transferStamp(entry);
    const byStamp = stamp ? outgoing.find((other) => !used.has(other) && transferStamp(other) === stamp) : null;
    if (byStamp) return byStamp;
    const well = wells.find((item) => item.id === entry.wellId);
    return outgoing.find((other) => {
      if (used.has(other)) return false;
      const otherWell = wells.find((item) => item.id === other.wellId);
      const fromHere = well && lsdNorm(other.otherWellUWI) === (well.lsdNorm || lsdNorm(well.lsd));
      const toThere = otherWell && lsdNorm(entry.otherWellUWI) === (otherWell.lsdNorm || lsdNorm(otherWell.lsd));
      return fromHere && toThere;
    });
  }
  for (const entry of incoming) {
    const pair = partner(entry);
    if (pair) used.add(pair);
    const well = wells.find((item) => item.id === entry.wellId) || { id: entry.wellId || "transfer", name: "Receiving well", rig: "", lsd: "" };
    const left = appEntryLines(entry, index);
    const right = pair ? appEntryLines(pair, index) : new Map();
    const keys = new Set([...left.keys(), ...right.keys()]);
    for (const key of keys) {
      const row = left.get(key) || right.get(key);
      const gap = (left.get(key)?.qty || 0) - (right.get(key)?.qty || 0);
      if (Math.abs(gap) <= QTY_TOLERANCE) continue;
      const other = wells.find((item) => item.id === pair?.wellId);
      add(issues, baseIssue({
        date, rule: "transfer_mismatch", severity: "medium", well, key: `${entry.id || entry.rawTicket}-${key}`, row: { ...row, qty: gap },
        title: `${row.name} transferred onto ${well.name || well.id} does not match the sending well`,
        detail: pair
          ? `${well.name || well.id} received ${roundQty(left.get(key)?.qty || 0)} ${row.name} and ${other?.name || pair.wellId} sent ${roundQty(right.get(key)?.qty || 0)}.`
          : `${well.name || well.id} received ${roundQty(left.get(key)?.qty || 0)} ${row.name} and no Transfer-From entry matches ${entry.otherWellUWI || entry.rawTicket || "that well"}.`,
        valuation: settings.valuation, fallbackPrice: row.price,
      }));
    }
  }
  for (const entry of outgoing) {
    if (used.has(entry)) continue;
    const well = wells.find((item) => item.id === entry.wellId) || { id: entry.wellId || "transfer", name: "Sending well", rig: "", lsd: "" };
    for (const [, row] of appEntryLines(entry, index)) {
      if (row.qty <= QTY_TOLERANCE) continue;
      add(issues, baseIssue({
        date, rule: "transfer_mismatch", severity: "medium", well, key: `${entry.id || entry.rawTicket}-out`, row,
        title: `${row.name} left ${well.name || well.id} with no matching Transfer-To`,
        detail: `${well.name || well.id} transferred out ${roundQty(row.qty)} ${row.name} and no receiving well has the matching Transfer-To entry.`,
        valuation: settings.valuation, fallbackPrice: row.price,
      }));
    }
  }
}

function baseIssue({ date, rule, severity, well, key, row, title, detail, ticketIds, valuation, fallbackPrice }) {
  const appPrice = typeof fallbackPrice === "number" ? fallbackPrice : (typeof row.price === "number" ? row.price : null);
  const price = appPrice != null ? appPrice : priceOf(row.product, null, valuation);
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

function rigMoveIssues(issues, { date, settings, tickets, wells, index }) {
  const groups = new Map();
  for (const well of wells) {
    const rig = rigNorm(well.rig);
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
      const before = remainingMap(previous, index);
      const received = movementMap(next.received, index);
      const deliveries = tickets.filter((ticket) => DELIVERY_TYPES.includes(String(ticket.type || "").toUpperCase()) && matchWell(ticket, [next])?.id === next.id);
      const delivered = sumLines(deliveries, index, () => true).groups;
      for (const [key, row] of before.groups) {
        if (row.qty <= QTY_TOLERANCE) continue;
        if ((delivered.get(key)?.qty || 0) > QTY_TOLERANCE) continue;
        const carried = received.get(key)?.qty || 0;
        const missing = row.qty - carried;
        if (missing <= QTY_TOLERANCE) continue;
        const price = priceOf(row.product, before.prices.get(key), settings.valuation);
        const value = dollars(missing, price);
        add(issues, {
          id: issueId(date, "lost_on_rig_move", previous.id, next.id, key),
          date, rule: "lost_on_rig_move", severity: "high",
          title: `${row.name} did not follow rig ${next.rig} to ${next.name || next.id}`,
          detail: `${previous.name || previous.id} still showed ${roundQty(row.qty)} ${row.name}. ${next.name || next.id} carried in ${roundQty(carried)}, and no delivery ticket covers the gap.`,
          wellId: next.id, rig: next.rig || "", lsd: next.lsd || previous.lsd || "",
          ticketIds: [],
          products: [{ name: row.name, qty: roundQty(missing), value }],
          dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
        });
      }
    }
  }
}

function returnIssues(issues, { date, settings, tickets, wells, index }) {
  for (const well of wells) {
    const stale = !well.lastReportDate || daysBetween(date, dayKey(well.lastReportDate)) > settings.staleReportDays;
    if (!INACTIVE_STATUSES.includes(String(well.status || "").toLowerCase()) && !stale) continue;
    const { groups, prices } = remainingMap(well, index);
    const reportDay = dayKey(well.lastReportDate);
    for (const [key, row] of groups) {
      if (row.qty <= QTY_TOLERANCE) continue;
      const covered = tickets.some((ticket) => TRANSFER_TYPES.includes(String(ticket.type || "").toUpperCase()) && matchWell(ticket, [well])?.id === well.id && (!reportDay || ticketDay(ticket) >= reportDay) && linesOf(ticket).some((line) => identityOf(index, line.code, line.name).key === key));
      if (covered) continue;
      const price = priceOf(row.product, prices.get(key), settings.valuation);
      const value = dollars(row.qty, price);
      const why = INACTIVE_STATUSES.includes(String(well.status || "").toLowerCase()) ? `status is ${well.status}` : `no app report in more than ${settings.staleReportDays} days`;
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
    const items = new Map((current.items || []).map((item) => [codeNorm(item.code) || nameNorm(item.name), item]));
    for (const item of items.values()) {
      const onHand = Number(item.onHand);
      const available = Number(item.available);
      if ((Number.isFinite(onHand) && onHand < -QTY_TOLERANCE) || (Number.isFinite(available) && available < -QTY_TOLERANCE)) {
        const row = identityOf(index, item.code, item.name);
        const price = priceOf(row.product, null, settings.valuation);
        const qty = Number.isFinite(onHand) && onHand < 0 ? onHand : available;
        const value = dollars(qty, price);
        add(issues, {
          id: issueId(date, "warehouse_drift", current.source, current.warehouseCode, row.key, "negative"),
          date, rule: "warehouse_drift", severity: "high",
          title: `${row.name} is negative at ${current.warehouseName || current.warehouseCode}`,
          detail: `${current.source} ${current.warehouseCode} shows ${roundQty(qty)} on hand on ${current.date}.`,
          wellId: "", rig: "", lsd: "", ticketIds: [],
          products: [{ name: row.name, qty: roundQty(qty), value }],
          dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
        });
      }
    }
    if (!previous) continue;
    const explained = new Map();
    const ticketIds = new Map();
    for (const ticket of tickets) {
      if (ticket.warehouseCode !== current.warehouseCode || ticket.source !== current.source) continue;
      const day = ticketDay(ticket);
      if (!day || day <= previous.date || day > current.date) continue;
      for (const line of linesOf(ticket)) {
        const row = identityOf(index, line.code, line.name);
        explained.set(row.key, (explained.get(row.key) || 0) + stockEffect(ticket.type, line.qty));
        const ids = ticketIds.get(row.key) || [];
        if (!ids.includes(ticket.id)) ids.push(ticket.id);
        ticketIds.set(row.key, ids);
      }
    }
    const previousItems = new Map((previous.items || []).map((item) => [identityOf(index, item.code, item.name).key, item]));
    for (const item of current.items || []) {
      const row = identityOf(index, item.code, item.name);
      const before = Number(previousItems.get(row.key)?.onHand);
      const after = Number(item.onHand);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      const delta = after - before;
      const net = explained.get(row.key) || 0;
      if (Math.abs(delta - net) <= QTY_TOLERANCE) continue;
      const price = priceOf(row.product, null, settings.valuation);
      const gap = delta - net;
      const value = dollars(gap, price);
      add(issues, {
        id: issueId(date, "warehouse_drift", current.source, current.warehouseCode, row.key),
        date, rule: "warehouse_drift", severity: "medium",
        title: `${row.name} at ${current.warehouseName || current.warehouseCode} changed without tickets`,
        detail: `On hand went from ${roundQty(before)} to ${roundQty(after)} between ${previous.date} and ${current.date}. Tickets explain ${roundQty(net)} of that change.`,
        wellId: "", rig: "", lsd: "", ticketIds: ticketIds.get(row.key) || [],
        products: [{ name: row.name, qty: roundQty(gap), value }],
        dollarValue: value, status: "open", note: "", resolvedBy: "", resolvedAt: null,
      });
    }
  }
}

function priceIssues(issues, { date, settings, tickets, index }) {
  const missing = new Map();
  for (const ticket of tickets) {
    if (!DELIVERY_TYPES.includes(String(ticket.type || "").toUpperCase()) || ticketDay(ticket) !== date) continue;
    for (const line of linesOf(ticket)) {
      const row = identityOf(index, line.code, line.name);
      if (priceOf(row.product, null, settings.valuation) != null) continue;
      const current = missing.get(row.key) || { ...row, qty: 0, ticketIds: [] };
      current.qty += qtyOf(line);
      if (!current.ticketIds.includes(ticket.id)) current.ticketIds.push(ticket.id);
      missing.set(row.key, current);
    }
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
      const kind = String(ticket.type || "").toUpperCase();
      if (!DELIVERY_TYPES.includes(kind) && !RETURN_TYPES.includes(kind)) continue;
      related.push(ticket.id);
      const sign = DELIVERY_TYPES.includes(kind) ? 1 : -1;
      for (const line of linesOf(ticket)) {
        const row = identityOf(index, line.code, line.name);
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
    if (String(ticket.source || "") !== "mim" || String(ticket.type || "").toUpperCase() !== "TT") return sum;
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

function liftedEntries(wells) {
  const entries = [];
  for (const well of wells) {
    for (const [side, kind] of [["received", "received"], ["returned", "returned"]]) {
      for (const [index, line] of (well[side] || []).entries()) {
        if (!line?.description && !line?.rawTicket) continue;
        entries.push(normalizeAppTicket({ ...line, id: `${well.id}_${side}_${index}`, wellId: well.id, kind, date: line.date }));
      }
    }
  }
  return entries;
}

export function runChecks({ date, config, tickets = [], wells = [], products = [], stock = [], appTickets = [], sources }) {
  const settings = configOf(config);
  const index = indexProducts(products);
  const preparedTickets = tickets.map((ticket) => ({ ...ticket, lsdNorm: ticket.lsdNorm || lsdNorm(ticket.lsd) }));
  const preparedWells = wells.map((well) => ({ ...well, lsdNorm: well.lsdNorm || lsdNorm(well.lsd) }));
  const appEntries = [...appTickets.map((entry) => normalizeAppTicket(entry)), ...liftedEntries(preparedWells)];
  const issues = new Map();
  const input = { date, settings, tickets: preparedTickets, wells: preparedWells, index, stock, appEntries };
  deliveryIssues(issues, input);
  ticketLinkIssues(issues, input);
  receiptIssues(issues, input);
  transferMismatchIssues(issues, input);
  rigMoveIssues(issues, input);
  returnIssues(issues, input);
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
