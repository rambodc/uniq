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

function arraySide(line) {
  if (line?.side === "received" || line?.side === "returned") return line.side;
  return String(line?.kind || "").toLowerCase() === "returned" ? "returned" : "received";
}

/** Received and returned are numbered separately, so the side is part of the id. */
export function lineId(line) {
  return `${line.wellId}~${line.reportId}~${arraySide(line)}~${line.index}`;
}

function legacyLineId(line) {
  return `${line.wellId}~${line.reportId}~${line.index}`;
}

function numbersAgree(raw, ticketNumber) {
  if (!raw || !ticketNumber) return false;
  const left = canon(raw);
  const right = canon(ticketNumber);
  if (left && right && left.number != null && left.prefix === right.prefix && left.number === right.number) return true;
  return clean(raw) === clean(ticketNumber);
}

function compareLines(a, b) {
  return String(a.date).localeCompare(String(b.date))
    || String(a.wellId).localeCompare(String(b.wellId))
    || String(a.reportId).localeCompare(String(b.reportId))
    || arraySide(a).localeCompare(arraySide(b))
    || String(a.index).localeCompare(String(b.index), undefined, { numeric: true });
}

function ticketDate(ticket) {
  return dayKey(ticket?.shippedAt) || dayKey(ticket?.date) || ticketWhen(ticket);
}

function transferKey(raw) {
  const text = String(raw || "");
  const stamp = text.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
  if (stamp) return stamp[0];
  return text.replace(/_by-.*/, "") || text;
}

function isTransfer(line) {
  return String(line?.rawTicket || "").includes("transferTo") || String(line?.kind || "").toLowerCase().startsWith("transfer");
}

function rankClaim(line, ticket) {
  const same = line.rig && line.rig === ticket.rigNumber ? 0 : 1;
  return same * 100000 + daysApart(line.date, ticketDate(ticket));
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

function publicProducts(rows) {
  return (rows || []).filter((row) => row?.name && !SKIP.has(nn(row.name))).map((row) => ({
    name: row.name, pack: row.pack || row.unit || "", qty: Number(row.qty) || 0, productId: row.productId || "",
  }));
}

function appSide(line) {
  const kind = String(line.kind || "");
  const pill = kind.startsWith("transfer") ? "App · Transfer" : kind === "returned" ? "App · Return" : "App · Delivery";
  return { number: line.rawTicket || "", pill, summary: productText(line.products), date: dayKey(line.date), products: publicProducts(line.products) };
}

function xpressSide(ticket) {
  const path = ticketPdf(ticket);
  return {
    number: ticketNo(ticket),
    type: String(ticket.type || "DT").toUpperCase(),
    pill: `Xpress · ${String(ticket.type || "DT").toUpperCase()}`,
    summary: productText(ticket.lines),
    date: dayKey(ticket.shippedAt) || dayKey(ticket.date) || ticketWhen(ticket),
    hasPdf: Boolean(path),
    pdfPath: path,
    rig: ticket.rig || "",
    lsd: ticket.lsd || "",
    customer: ticket.customer || "",
    products: publicProducts(ticket.lines),
  };
}

function suggestionRank(date, products, candidates, catalog) {
  return candidates.map((candidate) => {
    const otherDate = candidate.date;
    if (!date || !otherDate || daysApart(date, otherDate) > 3) return null;
    const score = productOverlap(products, candidate.products, catalog);
    const left = productMap(products, catalog);
    const right = productMap(candidate.products, catalog);
    const shared = [...left.keys()].filter((id) => right.has(id)).length;
    const compared = Math.min(left.size, right.size);
    return { candidate, overlap: score.overlap, shared, compared, days: daysApart(date, otherDate) };
  }).filter(Boolean).sort((a, b) => b.overlap - a.overlap || b.shared - a.shared || a.days - b.days || String(a.candidate.number).localeCompare(String(b.candidate.number))).slice(0, 2);
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
  const wellNames = new Map();
  const operators = new Map();
  for (const well of shownWells) {
    const number = applyAlias(rigNumber(well.rig), aliases);
    if (!number) continue;
    wellRig.set(well.id, number);
    wellNames.set(well.id, well.name || "");
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
    lines.push({ ...line, id: lineId(line), side: arraySide(line), uid: `${lineId(line)}#${lines.length}`, rig, date, wellName: wellNames.get(line.wellId) || "" });
  }
  lines.sort(compareLines);
  const buckets = new Map();
  const bucket = (rig) => {
    if (!buckets.has(rig)) buckets.set(rig, { matched: [], onlyApp: [], onlyX: [], noTicket: [], expected: [], appBeforeXpress: [], hidden: [] });
    return buckets.get(rig);
  };
  const used = new Set();
  const matchedLine = new Set();
  const claimed = new Map();
  const ticketByNo = new Map(xpress.map((ticket) => [ticket.ticketNumber, ticket]));
  const blocked = (line, number) => [line.id, legacyLineId(line)].some((id) => blocks.has(`${id}|${number}`));
  const markAlreadyUsed = (line, ticket, winner) => {
    const rig = winner?.line?.rig || ticket.rigNumber || "another rig";
    const date = winner?.line?.date || ticketDate(ticket);
    line.usedNote = `Ticket # already used on ${rig} ${date}`;
    const left = productMap(line.products, catalog);
    const right = productMap(ticket.lines, catalog);
    const shared = [...left.keys()].filter((id) => right.has(id)).length;
    line.suggestions = [{
      number: ticket.ticketNumber, date: ticketDate(ticket), shared, compared: Math.min(left.size, right.size),
      wellId: line.wellId || "", reportId: line.reportId || "", index: String(line.index ?? ""),
      xpress: ticket.ticketNumber, ticketId: ticket.id || "",
    }];
  };
  const claim = (line, ticket, how, score, correctionId = "") => {
    matchedLine.add(line.uid);
    used.add(ticket.ticketNumber);
    claimed.set(ticket.ticketNumber, { line, ticket });
    bucket(line.rig).matched.push({ line, ticket, how, score, correctionId });
  };
  const resolveLine = (id, ticketNumber) => {
    const exact = lines.filter((row) => row.id === id || row.uid === id);
    const pool = exact.length ? exact : lines.filter((row) => legacyLineId(row) === id);
    if (!pool.length) return null;
    return pool.find((row) => numbersAgree(row.rawTicket, ticketNumber)) || pool[0];
  };
  for (const pair of forced) {
    if (blocks.has(`${pair.id}|${pair.number}`)) continue;
    const line = resolveLine(pair.id, pair.number);
    const ticket = ticketByNo.get(pair.number);
    if (!line || !ticket || matchedLine.has(line.uid) || used.has(ticket.ticketNumber)) continue;
    claim(line, ticket, "manual", null, pair.correctionId);
  }
  const pending = [];
  const exactOptions = [];
  for (const line of lines) {
    if (matchedLine.has(line.uid)) continue;
    if (isTransfer(line)) {
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
    if (hits.length) exactOptions.push({ line, hits });
    else pending.push({ line, parsed });
  }
  const exactPairs = exactOptions.flatMap((option) => option.hits.map((ticket) => ({ line: option.line, ticket })));
  exactPairs.sort((a, b) => rankClaim(a.line, a.ticket) - rankClaim(b.line, b.ticket) || compareLines(a.line, b.line) || a.ticket.ticketNumber.localeCompare(b.ticket.ticketNumber));
  for (const pair of exactPairs) {
    if (matchedLine.has(pair.line.uid) || used.has(pair.ticket.ticketNumber)) continue;
    claim(pair.line, pair.ticket, "exact", null);
  }
  for (const option of exactOptions) {
    if (matchedLine.has(option.line.uid)) continue;
    const ticket = option.hits.find((hit) => used.has(hit.ticketNumber)) || option.hits[0];
    const winner = claimed.get(ticket.ticketNumber);
    markAlreadyUsed(option.line, ticket, winner);
    bucket(option.line.rig).onlyApp.push(option.line);
  }
  const fuzzy = [];
  for (const item of pending) {
    const { line, parsed } = item;
    if (matchedLine.has(line.uid)) continue;
    let offered = false;
    for (const ticket of xpress) {
      if (used.has(ticket.ticketNumber) || blocked(line, ticket.ticketNumber) || ticket.rigNumber !== line.rig) continue;
      if (!parsed.prefix && parsed.number != null) {
        const tail = String(ticket.ticketNumber).match(/(\d+)$/);
        const digits = tail ? tail[1].replace(/^0+/, "") : "";
        if (digits === String(parsed.number) && TYPE_MAP[line.kind]?.has(ticket.type)) {
          fuzzy.push({ line, ticket, overlap: 1, qty: 1, how: "digits", parsed });
          offered = true;
        }
        continue;
      }
      if (!ticket.hasLines || !parsed.prefix || ticket.ticketNumber.split("-")[0] !== parsed.prefix) continue;
      if (!TYPE_MAP[line.kind]?.has(ticket.type) || (parsed.type && parsed.type !== ticket.type)) continue;
      if (!ticketDate(ticket) || daysApart(ticketDate(ticket), line.date) > 5 || !numberClose(parsed.digits, ticket.ticketNumber)) continue;
      const score = productOverlap(line.products, ticket.lines, catalog);
      if (score.overlap >= 0.6 && score.qty >= 0.5) {
        fuzzy.push({ line, ticket, overlap: score.overlap, qty: score.qty, how: "typo", parsed });
        offered = true;
      }
    }
    if (!offered) {
      if (!parsed.prefix) bucket(line.rig).hidden.push(line);
      else if (line.date < window.xpressFrom) bucket(line.rig).appBeforeXpress.push(line);
      else if (parsed.number == null) bucket(line.rig).noTicket.push(line);
      else bucket(line.rig).onlyApp.push(line);
    }
  }
  fuzzy.sort((a, b) => b.overlap - a.overlap || b.qty - a.qty || rankClaim(a.line, a.ticket) - rankClaim(b.line, b.ticket) || compareLines(a.line, b.line));
  for (const item of fuzzy) {
    if (matchedLine.has(item.line.uid) || used.has(item.ticket.ticketNumber)) continue;
    claim(item.line, item.ticket, item.how, { overlap: item.overlap, qty: item.qty });
  }
  const fuzzySeen = new Set();
  for (const item of fuzzy) {
    if (matchedLine.has(item.line.uid) || fuzzySeen.has(item.line.uid)) continue;
    fuzzySeen.add(item.line.uid);
    const winner = claimed.get(item.ticket.ticketNumber);
    if (winner) {
      markAlreadyUsed(item.line, item.ticket, winner);
      bucket(item.line.rig).onlyApp.push(item.line);
    } else if (!item.parsed?.prefix) bucket(item.line.rig).hidden.push(item.line);
    else if (item.line.date < window.xpressFrom) bucket(item.line.rig).appBeforeXpress.push(item.line);
    else if (item.parsed?.number == null) bucket(item.line.rig).noTicket.push(item.line);
    else bucket(item.line.rig).onlyApp.push(item.line);
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
    const transfers = mergeTransfers(rows.expected).map((line) => appRow(line, "transfer", "transfer")).sort(byDate);
    const counts = {
      matched: rows.matched.length,
      onlyApp: rows.onlyApp.length,
      onlyX: rows.onlyX.length,
      noTicket: rows.noTicket.length,
      expected: transfers.length,
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
    const pairs = rows.matched.map((item) => pairRow(item)).sort(byDate);
    const appPool = [...rows.onlyApp, ...rows.noTicket].map((line) => ({ ...line, number: line.rawTicket || "No number", date: dayKey(line.date), products: line.products }));
    const xpressPool = rows.onlyX.map((ticket) => ({ ...ticket, number: ticketNo(ticket), date: dayKey(ticket.shippedAt) || dayKey(ticket.date) || ticketWhen(ticket), products: ticket.lines }));
    for (const row of [...needs, ...pendingRows]) {
      const pool = row.side === "app" ? xpressPool : appPool;
      const ownProducts = row.side === "app" ? row.app?.products : row.xpress?.products;
      const ranked = suggestionRank(row.date, ownProducts, pool, catalog).map((hit) => ({
        number: hit.candidate.number,
        date: hit.candidate.date,
        shared: hit.shared,
        compared: hit.compared,
        wellId: row.side === "app" ? row.wellId : (hit.candidate.wellId || ""),
        reportId: row.side === "app" ? row.reportId : (hit.candidate.reportId || ""),
        index: row.side === "app" ? row.index : String(hit.candidate.index ?? ""),
        xpress: row.side === "xpress" ? row.number : hit.candidate.number,
        ticketId: hit.candidate.id || "",
      }));
      const seen = new Set((row.suggestions || []).map((item) => item.number));
      row.suggestions = [...(row.suggestions || []), ...ranked.filter((item) => !seen.has(item.number))].slice(0, 2);
    }
    const suggestions = [...needs, ...pendingRows].filter((row) => row.suggestions?.length).map((row) => ({
      side: row.side, number: row.number, date: row.date, wellId: row.wellId, reportId: row.reportId, index: row.index, ticketId: row.ticketId,
      xpress: row.side === "xpress" ? row.number : "",
      matches: row.suggestions,
    }));
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
      needs, pending: pendingRows, transfers, pairs, suggestions,
    });
  }
  const problem = (rig) => rig.onlyApp + rig.onlyXpress;
  rigs.sort((a, b) => Number(problem(b) > 0) - Number(problem(a) > 0) || problem(b) - problem(a) || a.name.localeCompare(b.name));
  const totals = { matched: 0, onlyApp: 0, onlyX: 0, noTicket: 0, expected: 0, appBeforeXpress: 0, hidden: 0 };
  for (const counts of Object.values(stats)) for (const key of Object.keys(totals)) totals[key] += counts[key] || 0;
  totals.loose = loose.length;
  return { since: window.xpressFrom, appSince: window.appFrom, rigs, loose: loose.map((ticket) => xpressRow(ticket, "loose", "no-rig")).sort(byDate), totals, stats };
}

function mergeTransfers(list) {
  const groups = new Map();
  const order = [];
  for (const line of list) {
    const key = transferKey(line.rawTicket) || line.uid;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(line);
  }
  return order.map((key) => {
    const group = groups.get(key);
    const outgoing = group.find((line) => /out$/i.test(String(line.kind)));
    const incoming = group.find((line) => /in$/i.test(String(line.kind)));
    const richest = group.slice().sort((a, b) => (b.products?.length || 0) - (a.products?.length || 0))[0];
    const primary = group.slice().sort(compareLines)[0];
    return {
      ...primary,
      products: richest?.products || [],
      fromWell: outgoing?.wellName || "",
      toWell: incoming?.wellName || "",
      kind: "transfer",
    };
  });
}

function appRow(line, tone, reason) {
  const app = appSide(line);
  const summary = line.usedNote || (tone === "needs" ? `Not in Xpress · ${app.summary || "No products"}` : (app.summary || line.rawTicket || "No number"));
  return baseRow({
    id: `app-${line.uid || line.id}`, date: app.date, number: tone === "transfer" ? "Transfer" : (app.number || "No number"), pill: app.pill, summary, tone, side: "app", reason,
    appId: line.id, wellId: line.wellId || "", reportId: line.reportId || "", index: String(line.index ?? ""),
    fromWell: line.fromWell || "", toWell: line.toWell || "", app, suggestions: line.suggestions || [],
  });
}

function xpressRow(ticket, tone, reason) {
  const side = xpressSide(ticket);
  return baseRow({
    id: `xpress-${ticket.id || side.number}`, date: side.date, number: side.number, pill: side.pill,
    summary: tone === "loose" ? [side.rig, side.lsd, side.customer].filter(Boolean).join(" · ") : `Not in app · ${[side.rig, side.customer].filter(Boolean).join(" · ") || "No app ticket"}`,
    tone, side: "xpress", reason, ticketId: ticket.id || "", hasPdf: side.hasPdf, pdfPath: side.pdfPath, xpress: side, lsd: side.lsd, suggestions: [],
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
