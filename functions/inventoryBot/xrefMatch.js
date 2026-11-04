/** Xpress ↔ app ticket cross-reference. Faithful to MATCHER_SPEC.md and xref.py.
 * App lines before the Xpress window that never match are left out of every list and count.
 * Corrections are applied before the automatic rules. App well documents are not changed. */

import { dayKey, daysBetween, todayKey } from "./engine.js";
import { isTestWell } from "./copiedReports.js";
import { parseXpressRig } from "./rigMatch.js";
import { ticketPdf, ticketWhen } from "./xpressBoard.js";

export const XPRESS_PREFIXES = ["WBFS", "TBAR", "BRKS", "BLKD", "NK"];
const TYPE_RE = "DT|CT|SR|MR|ST|AT";
const SKIP = new Set(["pallet", "pallets", "palletrecycling", "shrinkwrap", "sdsbook"]);
const TYPE_MAP = { received: new Set(["DT"]), returned: new Set(["CT", "SR"]) };

export function xrefWindow(today = todayKey()) {
  const year = Number(String(today).slice(0, 4)) || 2026;
  const october = `${today >= `${year}-10-01` ? year : year - 1}-10-01`;
  const september = `${today >= `${year}-09-01` ? year : year - 1}-09-01`;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 60);
  const floor = date.toISOString().slice(0, 10);
  return { today, xpressFrom: october, appFrom: september, floor };
}

function clean(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/CREDITTICKET/g, "");
}

/** { prefix, type, digits, number } or null when the text has no Xpress prefix. */
export function canon(raw, prefixes = XPRESS_PREFIXES) {
  let text = clean(raw);
  if (text.startsWith("WBS") && !text.startsWith("WBFS")) text = `WBFS${text.slice(3)}`;
  const prefix = prefixes.find((item) => text.startsWith(item));
  if (!prefix) return null;
  const rest = text.slice(prefix.length);
  const match = rest.match(new RegExp(`^(${TYPE_RE})?(\\d*)$`));
  if (!match) return null;
  const digits = match[2] || "";
  return { prefix, type: match[1] || "", digits, number: digits.replace(/0/g, "") ? Number(digits) : null };
}

export function rigNumber(value) {
  const match = String(value ?? "").match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

function nn(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function daysApart(left, right) {
  const a = dayKey(left);
  const b = dayKey(right);
  if (!a || !b) return 9999;
  return Math.abs(daysBetween(a > b ? a : b, a > b ? b : a));
}

function levenshtein(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
}

function numberClose(digits, ticketNo) {
  const tail = String(ticketNo ?? "").match(/(\d+)$/);
  const candidate = tail ? tail[1].replace(/^0+/, "") : "";
  const typed = String(digits ?? "").replace(/^0+/, "");
  if (!typed) return true;
  return levenshtein(typed, candidate) <= 1 || (typed.length >= 3 && (candidate.startsWith(typed) || candidate.endsWith(typed)));
}

export function productMap(rows, catalog) {
  const map = new Map();
  for (const row of rows || []) {
    const name = nn(row?.name);
    if (!name || SKIP.has(name)) continue;
    const qty = Number(row.qty) || 0;
    if (!qty) continue;
    const id = row.productId || catalog?.get(name) || `?${name}`;
    map.set(id, (map.get(id) || 0) + qty);
  }
  return map;
}

export function productOverlap(appRows, xpressRows, catalog) {
  const app = productMap(appRows, catalog);
  const xpress = productMap(xpressRows, catalog);
  if (!app.size || !xpress.size) return { overlap: 0, qty: 0 };
  const shared = [...app.keys()].filter((id) => xpress.has(id));
  const overlap = shared.length / Math.min(app.size, xpress.size);
  const qty = shared.length ? shared.filter((id) => Math.abs(app.get(id) - xpress.get(id)) <= Math.max(1, 0.1 * xpress.get(id))).length / shared.length : 0;
  return { overlap, qty };
}

function catalogOf(products) {
  const map = new Map();
  for (const product of products || []) {
    const names = [product.name, ...(product.appNames || [])];
    for (const name of names) {
      const key = nn(name);
      if (key && !map.has(key)) map.set(key, product.id);
    }
  }
  return map;
}

function ticketNo(ticket) {
  return String(ticket?.ticketNumber || ticket?.number || "").trim();
}

function productText(rows) {
  return (rows || []).filter((row) => row?.name && !SKIP.has(nn(row.name)) && Number(row.qty)).slice(0, 8).map((row) => `${Number(row.qty)} ${row.name}`).join(", ");
}

function hiddenText(raw) {
  const upper = String(raw ?? "").trim().toUpperCase();
  if (/^(MUDMAN|NOTICKET|ATPTEST\w*)$/.test(upper)) return false;
  if (/^\d{4}-\d\d-\d\d/.test(upper) || /^(RSA|CT-20|DT-20)/.test(upper)) return false;
  return /[A-Z]{2,}\d|\d{4,}|\//.test(upper);
}

export function wellIsCurrent(well, today = todayKey()) {
  if (!well?.id || isTestWell(well)) return false;
  const { floor } = xrefWindow(today);
  const active = String(well.status || "").toLowerCase().startsWith("active");
  const last = dayKey(well.lastReportDate || well.lastReport || "");
  return active || (Boolean(last) && last >= floor);
}

function lineId(line) {
  return line.id || `${line.wellId}~${line.reportId}~${line.index}`;
}

function applyAlias(number, aliases) {
  let current = number;
  const seen = new Set();
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = aliases.get(current);
  }
  return current || "";
}

function baseRow(fields) {
  return { typoFixed: false, paired: false, moved: false, correctionId: "", hasPdf: false, pdfPath: "", appId: "", ticketId: "", wellId: "", reportId: "", index: "", app: null, xpress: null, how: "", score: null, ...fields };
}

function appSide(line) {
  const kind = String(line.kind || "");
  const pill = kind.startsWith("transfer") ? "App · Transfer" : kind === "returned" ? "App · Return" : "App · Delivery";
  return { number: line.rawTicket || "", pill, summary: productText(line.products), date: dayKey(line.date) };
}

function xpressSide(ticket) {
  const path = ticketPdf(ticket);
  return {
    number: ticketNo(ticket),
    pill: `Xpress · ${String(ticket.type || "DT").toUpperCase()}`,
    summary: productText(ticket.lines),
    date: ticketWhen(ticket),
    hasPdf: Boolean(path),
    pdfPath: path,
    rig: ticket.rig || "",
    customer: ticket.customer || "",
  };
}

function byDate(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(a.number).localeCompare(String(b.number));
}

export function buildXref({ tickets = [], wells = [], appLines = [], corrections = [], products = [], prefixes, today = todayKey() } = {}) {
  const window = xrefWindow(today);
  const prefixList = [...new Set([...(prefixes || []), ...XPRESS_PREFIXES, ...tickets.map((ticket) => ticketNo(ticket).split("-")[0]).filter(Boolean)])].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const catalog = catalogOf(products);
  const active = (corrections || []).filter((row) => row && row.undone !== true);
  const aliases = new Map();
  const rigOverride = new Map();
  const forced = [];
  const blocks = new Set();
  for (const row of active) {
    if (row.type === "alias" && row.rig && row.into) aliases.set(String(row.rig), String(row.into));
    if (row.type === "rig" && (row.xpress || row.ticketNumber)) rigOverride.set(String(row.xpress || row.ticketNumber), rigNumber(row.rig));
    if ((row.type === "pair" || row.type === "unpair") && row.appLine && (row.xpress || row.ticketNumber)) {
      const id = `${row.appLine.wellId}~${row.appLine.reportId}~${row.appLine.index}`;
      const number = String(row.xpress || row.ticketNumber);
      if (row.type === "unpair") blocks.add(`${id}|${number}`);
      else forced.push({ id, number, correctionId: row.id || "" });
    }
  }
  const shownWells = (wells || []).filter((well) => wellIsCurrent(well, window.today));
  const wellRig = new Map();
  const operators = new Map();
  for (const well of shownWells) {
    const number = applyAlias(rigNumber(well.rig), aliases);
    if (!number) continue;
    wellRig.set(well.id, number);
    const name = well.operator || well.operator_name || "";
    if (name) {
      if (!operators.has(number)) operators.set(number, new Set());
      operators.get(number).add(name);
    }
  }
  const targets = new Set(wellRig.values());
  const xpress = [];
  for (const ticket of tickets || []) {
    if (!ticket || (ticket.source && ticket.source !== "xpress")) continue;
    const type = String(ticket.type || "").toUpperCase();
    const number = ticketNo(ticket);
    if (!number) continue;
    const rig = applyAlias(rigOverride.get(number) || rigNumber(ticket.rig), aliases);
    xpress.push({ ...ticket, ticketNumber: number, type, rigNumber: rig, hasLines: ticket.hasLines !== false && Array.isArray(ticket.lines) });
  }
  const byKey = new Map();
  for (const ticket of xpress) {
    const parsed = canon(ticket.ticketNumber, prefixList);
    if (!parsed || parsed.number == null) continue;
    const key = `${parsed.prefix}:${parsed.number}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(ticket);
  }
  const lines = [];
  for (const line of appLines || []) {
    const rig = wellRig.get(line.wellId);
    if (!rig) continue;
    const date = dayKey(line.date);
    if (!date || date < window.appFrom || date < window.floor) continue;
    lines.push({ ...line, id: lineId(line), uid: `${lineId(line)}#${lines.length}`, rig, date });
  }
  const buckets = new Map();
  const bucket = (rig) => {
    if (!buckets.has(rig)) buckets.set(rig, { matched: [], onlyApp: [], onlyX: [], noTicket: [], expected: [], appBeforeXpress: [], hidden: [] });
    return buckets.get(rig);
  };
  const used = new Set();
  const matchedLine = new Set();
  const ticketByNo = new Map(xpress.map((ticket) => [ticket.ticketNumber, ticket]));
  for (const pair of forced) {
    if (blocks.has(`${pair.id}|${pair.number}`)) continue;
    const line = lines.find((row) => row.uid === pair.id || row.id === pair.id || `${row.wellId}~${row.reportId}~${row.index}` === pair.id);
    const ticket = ticketByNo.get(pair.number);
    if (!line || !ticket || matchedLine.has(line.uid)) continue;
    matchedLine.add(line.uid);
    used.add(ticket.ticketNumber);
    bucket(line.rig).matched.push({ line, ticket, how: "manual", score: null, correctionId: pair.correctionId });
  }
  const pending = [];
  const blocked = (line, number) => blocks.has(`${line.wellId}~${line.reportId}~${line.index}|${number}`) || blocks.has(`${line.id}|${number}`);
  for (const line of lines) {
    if (matchedLine.has(line.uid)) continue;
    if (String(line.rawTicket || "").includes("transferTo") || String(line.kind || "").startsWith("transfer")) {
      bucket(line.rig).expected.push(line);
      continue;
    }
    const parsed = canon(line.rawTicket, prefixList);
    if (!parsed && /^0\d{3,5}$/.test(String(line.rawTicket || ""))) {
      pending.push({ line, parsed: { prefix: "", type: "", digits: String(line.rawTicket), number: Number(line.rawTicket) } });
      continue;
    }
    if (!parsed) {
      if (hiddenText(line.rawTicket)) bucket(line.rig).hidden.push(line);
      else bucket(line.rig).noTicket.push(line);
      continue;
    }
    const hits = parsed.number == null ? [] : (byKey.get(`${parsed.prefix}:${parsed.number}`) || []).filter((ticket) => {
      if (blocked(line, ticket.ticketNumber)) return false;
      if (!parsed.type) return true;
      return String(ticket.type || "").startsWith(parsed.type) || ticket.ticketNumber.includes(parsed.type);
    });
    if (hits.length) {
      matchedLine.add(line.uid);
      used.add(hits[0].ticketNumber);
      bucket(line.rig).matched.push({ line, ticket: hits[0], how: "exact", score: null });
      continue;
    }
    pending.push({ line, parsed });
  }
  for (const item of pending) {
    const { line, parsed } = item;
    let best = null;
    for (const ticket of xpress) {
      if (used.has(ticket.ticketNumber) || blocked(line, ticket.ticketNumber) || ticket.rigNumber !== line.rig) continue;
      if (!parsed.prefix && parsed.number != null) {
        const tail = String(ticket.ticketNumber).match(/(\d+)$/);
        const digits = tail ? tail[1].replace(/^0+/, "") : "";
        if (digits === String(parsed.number) && TYPE_MAP[line.kind]?.has(ticket.type)) {
          best = { ticket, overlap: 1, qty: 1, how: "digits" };
          break;
        }
      }
      if (!ticket.hasLines || !parsed.prefix || ticket.ticketNumber.split("-")[0] !== parsed.prefix) continue;
      if (!TYPE_MAP[line.kind]?.has(ticket.type) || (parsed.type && parsed.type !== ticket.type)) continue;
      if (!ticketWhen(ticket) || daysApart(ticketWhen(ticket), line.date) > 5 || !numberClose(parsed.digits, ticket.ticketNumber)) continue;
      const score = productOverlap(line.products, ticket.lines, catalog);
      if (score.overlap >= 0.6 && score.qty >= 0.5 && (!best || score.overlap > best.overlap || (score.overlap === best.overlap && score.qty > best.qty))) {
        best = { ticket, ...score, how: "typo" };
      }
    }
    if (best) {
      matchedLine.add(line.uid);
      used.add(best.ticket.ticketNumber);
      bucket(line.rig).matched.push({ line, ticket: best.ticket, how: best.how, score: { overlap: best.overlap, qty: best.qty } });
    } else if (!parsed.prefix) bucket(line.rig).hidden.push(line);
    else if (line.date < window.xpressFrom) bucket(line.rig).appBeforeXpress.push(line);
    else if (parsed.number == null) bucket(line.rig).noTicket.push(line);
    else bucket(line.rig).onlyApp.push(line);
  }
  const loose = [];
  for (const ticket of xpress) {
    const date = dayKey(ticket.date) || ticketWhen(ticket);
    if (used.has(ticket.ticketNumber) || !date || date < window.xpressFrom || date < window.floor) continue;
    if (!["DT", "CT", "SR"].includes(ticket.type)) continue;
    if (ticket.rigNumber && targets.has(ticket.rigNumber)) bucket(ticket.rigNumber).onlyX.push(ticket);
    else loose.push(ticket);
  }
  const rigNames = new Map();
  for (const ticket of xpress) {
    if (!ticket.rigNumber || !ticket.rig) continue;
    if (!rigNames.has(ticket.rigNumber)) rigNames.set(ticket.rigNumber, new Map());
    const counts = rigNames.get(ticket.rigNumber);
    counts.set(ticket.rig, (counts.get(ticket.rig) || 0) + 1);
  }
  const stats = {};
  const rigs = [];
  for (const [rig, rows] of buckets) {
    const counts = {
      matched: rows.matched.length,
      onlyApp: rows.onlyApp.length,
      onlyX: rows.onlyX.length,
      noTicket: rows.noTicket.length,
      expected: rows.expected.length,
      appBeforeXpress: rows.appBeforeXpress.length,
      hidden: rows.hidden.length,
    };
    stats[rig] = counts;
    const visible = counts.matched + counts.onlyApp + counts.onlyX + counts.noTicket + counts.expected;
    if (!visible) continue;
    const names = [...(rigNames.get(rig) || [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const parsed = parseXpressRig(names[0]?.[0] || "");
    const needs = [...rows.onlyApp.map((line) => appRow(line, "needs", "only-app")), ...rows.onlyX.map((ticket) => xpressRow(ticket, "needs", "only-xpress"))].sort(byDate);
    const pendingRows = rows.noTicket.map((line) => appRow(line, "placeholder", "no-ticket")).sort(byDate);
    const transfers = rows.expected.map((line) => appRow(line, "transfer", "transfer")).sort(byDate);
    const pairs = rows.matched.map((item) => pairRow(item)).sort(byDate);
    rigs.push({
      key: rig,
      name: parsed.display || `Rig ${rig}`,
      operator: [...(operators.get(rig) || [])].sort().join(" / "),
      tone: counts.onlyApp + counts.onlyX ? "amber" : "green",
      matched: counts.matched,
      onlyApp: counts.onlyApp,
      onlyXpress: counts.onlyX,
      placeholders: counts.noTicket,
      merged: [...aliases.entries()].some(([, into]) => into === rig),
      aliases: [...aliases.entries()].filter(([, into]) => into === rig).map(([from]) => ({ key: from, correctionId: `alias_${from}` })),
      needs, pending: pendingRows, transfers, pairs,
    });
  }
  const problem = (rig) => rig.onlyApp + rig.onlyXpress;
  rigs.sort((a, b) => Number(problem(b) > 0) - Number(problem(a) > 0) || problem(b) - problem(a) || a.name.localeCompare(b.name));
  const totals = { matched: 0, onlyApp: 0, onlyX: 0, noTicket: 0, expected: 0, appBeforeXpress: 0, hidden: 0 };
  for (const counts of Object.values(stats)) for (const key of Object.keys(totals)) totals[key] += counts[key] || 0;
  totals.loose = loose.length;
  return { since: window.xpressFrom, appSince: window.appFrom, rigs, loose: loose.map((ticket) => xpressRow(ticket, "loose", "no-rig")).sort(byDate), totals, stats };
}

function appRow(line, tone, reason) {
  const app = appSide(line);
  const summary = tone === "needs" ? `Not in Xpress · ${app.summary || "No products"}` : (app.summary || line.rawTicket || "No number");
  return baseRow({
    id: `app-${line.id}`, date: app.date, number: app.number || "No number", pill: app.pill, summary, tone, side: "app", reason,
    appId: line.id, wellId: line.wellId || "", reportId: line.reportId || "", index: String(line.index ?? ""), app,
  });
}

function xpressRow(ticket, tone, reason) {
  const side = xpressSide(ticket);
  return baseRow({
    id: `xpress-${ticket.id || side.number}`, date: side.date, number: side.number, pill: side.pill,
    summary: tone === "loose" ? (side.rig || side.customer || "No rig on the ticket") : `Not in app · ${[side.rig, side.customer].filter(Boolean).join(" · ") || "No app ticket"}`,
    tone, side: "xpress", reason, ticketId: ticket.id || "", hasPdf: side.hasPdf, pdfPath: side.pdfPath, xpress: side,
    moved: Boolean(ticket.moved),
  });
}

function pairRow(item) {
  const app = appSide(item.line);
  const xpress = xpressSide(item.ticket);
  const kind = String(item.line.kind) === "returned" ? "app return" : "app delivery";
  return baseRow({
    id: `pair-${item.line.id}-${item.ticket.ticketNumber}`,
    date: xpress.date || app.date,
    number: xpress.number,
    pill: xpress.pill,
    summary: item.how === "manual" ? "Paired manually" : item.how === "typo" ? "Typo fixed" : "Matched",
    tone: "matched",
    side: "pair",
    reason: item.how,
    how: item.how,
    typoFixed: item.how === "typo",
    paired: item.how === "manual",
    correctionId: item.correctionId || "",
    score: item.score,
    appId: item.line.id,
    ticketId: item.ticket.id || "",
    wellId: item.line.wellId || "",
    reportId: item.line.reportId || "",
    index: String(item.line.index ?? ""),
    hasPdf: xpress.hasPdf,
    pdfPath: xpress.pdfPath,
    label: `${xpress.date || app.date} · ${xpress.number} · ${String(item.ticket.type || "DT").toUpperCase()} · ${kind}${item.how === "typo" ? " · typo fixed" : ""}`,
    app, xpress,
  });
}
