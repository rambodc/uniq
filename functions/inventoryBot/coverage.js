/** Well-based ticket coverage. Warehouse tickets are the source of truth. Pure data in, plain objects out. */

import { daysBetween, dayKey, docSlug, indexProducts, isIgnoredStockItem, lsdNorm, matchProduct, matchWell, nameNorm, packKey, rigNorm, stockEffect, stockItemKey, ticketNorm, ticketsMatch, warehouseTicketNumber } from "./engine.js";

const NOT_BOUND = new Set(["mr", "sr", "at", "st", "stx", "tt", "pr"]);
export const FLAG_STATUSES = ["new", "seen", "watching", "done"];

export function looseTicket(value) {
  const parsed = ticketNorm(value);
  if (parsed?.number && !parsed.thirdParty) return { ...parsed, bare: false };
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const glued = compact.match(/^([A-Z][A-Z0-9]*?)(\d+)$/);
  if (glued && /[A-Z]/.test(glued[1])) return { exact: compact, prefix: glued[1], type: "", number: String(Number(glued[2])), thirdParty: false, bare: false };
  if (/^\d+$/.test(compact)) return { exact: compact, prefix: "", type: "", number: String(Number(compact)), thirdParty: true, bare: true };
  return parsed ? { ...parsed, bare: false } : null;
}

export function ticketSeries(value, type) {
  const text = String(value ?? "").toUpperCase().replace(/^(XPRESS|MIM)_/, "");
  const kind = String(type || "").toUpperCase().replace(/[^A-Z]/g, "");
  const typed = text.match(/^([A-Z][A-Z0-9]*?)-([A-Z]{1,4})-(\d+)$/);
  if (typed && Number(typed[3]) > 0) return { series: `${typed[1]}-${typed[2]}`, prefix: typed[1], type: typed[2], number: Number(typed[3]) };
  const plain = text.match(/^([A-Z][A-Z0-9]*?)-(\d+)$/);
  if (plain && Number(plain[2]) > 0) {
    const prefix = plain[1];
    return { series: kind ? `${prefix}-${kind}` : prefix, prefix, type: kind, number: Number(plain[2]) };
  }
  const mim = text.match(/^([A-Z]{2})([A-Z]{2,})(\d+)$/);
  if (mim && Number(mim[3]) > 0) return { series: `${mim[1]}${mim[2]}`, prefix: `${mim[1]}${mim[2]}`, type: mim[1], number: Number(mim[3]) };
  const glued = text.replace(/[^A-Z0-9]/g, "").match(/^([A-Z]{2,})(\d{3,})$/);
  if (glued && Number(glued[2]) > 0) {
    const prefix = glued[1];
    return { series: kind ? `${prefix}-${kind}` : prefix, prefix, type: kind, number: Number(glued[2]) };
  }
  return null;
}

function ticketDay(ticket) {
  return dayKey(ticket.shippedAt) || dayKey(ticket.deliveredAt) || dayKey(ticket.deliveryDate) || dayKey(ticket.shipDate) || dayKey(ticket.date) || dayKey(ticket.postedAt) || dayKey(ticket.collectedAt);
}

function wellOf(wells, id) {
  return wells.find((well) => well.id === id) || null;
}

function lsdParts(value) {
  const norm = lsdNorm(value);
  const match = String(norm).match(/^(\d+)-(\d+)-(\d+)-(\d+)([WE])(\d+)$/);
  if (!match) return null;
  return { section: Number(match[2]), twp: Number(match[3]), rge: Number(match[4]), mer: `${match[5]}${match[6]}` };
}

function nearLsd(left, right) {
  const a = lsdParts(left);
  const b = lsdParts(right);
  if (!a || !b || a.twp !== b.twp || a.rge !== b.rge || a.mer !== b.mer) return false;
  return Math.abs(a.section - b.section) <= 1;
}

function namesClose(left, right) {
  const a = nameNorm(left);
  const b = nameNorm(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const word = a.split(" ")[0];
  return word.length >= 4 && word === b.split(" ")[0];
}

function contractorAndRig(ticket, well) {
  if (!rigNorm(ticket.rig) || rigNorm(ticket.rig) !== rigNorm(well.rig)) return false;
  const tickets = [ticket.contractor, ticket.customer];
  const wells = [well.contractor, well.operator, well.name];
  if (!tickets.some(Boolean) || !wells.some(Boolean)) return true;
  return tickets.some((name) => wells.some((other) => namesClose(name, other)));
}

function locationConfirms(ticket, well) {
  if (!well) return false;
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const wellLsd = well.lsdNorm || lsdNorm(well.lsd);
  if (ticketLsd && wellLsd && (ticketLsd === wellLsd || nearLsd(ticketLsd, wellLsd))) return true;
  return contractorAndRig(ticket, well);
}

function locationDiffers(ticket, well) {
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const wellLsd = well?.lsdNorm || lsdNorm(well?.lsd);
  if (!ticketLsd || !wellLsd || ticketLsd === wellLsd || nearLsd(ticketLsd, wellLsd)) return false;
  return true;
}

function trailingDigits(value) {
  const match = String(value ?? "").toUpperCase().match(/(\d+)$/);
  return match ? String(Number(match[1])) : "";
}

function lineUnit(line) {
  return String(line?.unit || line?.pack || line?.packSize || "").trim();
}

function lineLabel(line) {
  return line?.name || line?.product || line?.productname || "";
}

function productOf(index, line) {
  const id = line?.productId ? index.byId?.get(String(line.productId)) : null;
  if (id) return id;
  return matchProduct(index, line?.code || "", lineLabel(line), lineUnit(line));
}

function productKeyOf(index, line) {
  return productOf(index, line)?.id || nameNorm(lineLabel(line)) || "unknown";
}

function linePrice(index, line) {
  const own = Number(line?.price);
  if (Number.isFinite(own) && own > 0) return own;
  const listed = productOf(index, line)?.price;
  return typeof listed === "number" ? listed : 0;
}

function mismatchPortion(ticketLines, appLines, index) {
  const groups = new Map();
  const take = (line, side) => {
    const key = productKeyOf(index, line);
    const group = groups.get(key) || { ticket: [], app: [] };
    group[side].push(line);
    groups.set(key, group);
  };
  for (const line of ticketLines || []) take(line, "ticket");
  for (const line of appLines || []) take(line, "app");
  let dollars = 0;
  let differs = false;
  for (const group of groups.values()) {
    const bothUnits = group.ticket.length > 0 && group.app.length > 0 && group.ticket.every((line) => lineUnit(line)) && group.app.every((line) => lineUnit(line));
    if (bothUnits) {
      const tally = (lines) => {
        const map = new Map();
        for (const line of lines) {
          const pack = packKey(lineUnit(line)) || "unit";
          const current = map.get(pack) || { qty: 0, price: 0 };
          current.qty += Number(line.qty) || 0;
          if (!current.price) current.price = linePrice(index, line);
          map.set(pack, current);
        }
        return map;
      };
      const left = tally(group.ticket);
      const right = tally(group.app);
      for (const key of new Set([...left.keys(), ...right.keys()])) {
        const diff = Math.abs((left.get(key)?.qty || 0) - (right.get(key)?.qty || 0));
        if (diff <= 0.01) continue;
        differs = true;
        dollars += diff * (right.get(key)?.price || left.get(key)?.price || 0);
      }
    } else {
      const left = group.ticket.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
      const right = group.app.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
      const diff = Math.abs(left - right);
      if (diff <= 0.01) continue;
      differs = true;
      const sample = group.app[0] || group.ticket[0];
      dollars += diff * linePrice(index, sample);
    }
  }
  return { differs, dollars: Math.round(dollars * 100) / 100 };
}

function dollarsOf(lines, index) {
  let sum = 0;
  for (const line of lines || []) {
    const qty = Math.abs(Number(line.qty) || 0);
    const own = Number(line.price);
    const product = matchProduct(index, line.code, line.name || line.product);
    const price = Number.isFinite(own) && own > 0 ? own : (typeof product?.price === "number" ? product.price : 0);
    sum += qty * (price || 0);
  }
  return Math.round(sum * 100) / 100;
}

function ticketPlace(ticket) {
  return [ticket.wellName, ticket.customer, ticket.orderedBy, ticket.shipTo, ticket.shipToName, ticket.destination, ticket.deliverTo, ticket.instructions].filter(Boolean).join(" ");
}

function boundReason(ticket) {
  const type = String(ticket.type || "").toLowerCase();
  if (/warehouse sale/i.test(ticketPlace(ticket))) return "Warehouse sale";
  if (type === "mr" || type === "sr" || type === "pr") return "Receipt into the warehouse";
  if (type === "at") return "Adjustment or blend";
  if (type === "st" || type === "stx") return "Warehouse transfer";
  if (type === "tt") return "Handling charge";
  return "";
}

function notBound(ticket) {
  const type = String(ticket.type || "").toLowerCase();
  if (/warehouse sale/i.test(ticketPlace(ticket))) return true;
  return NOT_BOUND.has(type);
}

function matchApp(ticket, apps, wells) {
  const parsed = looseTicket(warehouseTicketNumber(ticket));
  const hits = [];
  for (const app of apps) {
    if (app.kind !== "received" && app.kind !== "returned") continue;
    const appParsed = looseTicket(app.rawTicket || app.ticketNorm);
    if (!appParsed) continue;
    if (parsed?.number && appParsed.number && !parsed.bare && !appParsed.bare) {
      const level = ticketsMatch(parsed, appParsed);
      if (level !== "none") hits.push({ app, match: level === "exact" ? "exact" : "typo" });
    }
    if (appParsed.bare && trailingDigits(warehouseTicketNumber(ticket)) === appParsed.number) hits.push({ app, match: "alchem" });
  }
  const rank = { exact: 0, typo: 1, alchem: 2 };
  const viable = [];
  for (const hit of hits) {
    const well = wellOf(wells, hit.app.wellId);
    if (hit.match === "alchem" && !locationConfirms(ticket, well)) continue;
    viable.push({ ...hit, well });
  }
  viable.sort((a, b) => rank[a.match] - rank[b.match] || String(reportDay(a.app, a.well) || "").localeCompare(String(reportDay(b.app, b.well) || "")));
  return viable[0] || null;
}

function reportDay(app, well) {
  const direct = dayKey(app?.reportDate) || dayKey(app?.report?.date);
  if (direct) return direct;
  const reportId = app?.reportId || "";
  const reports = Array.isArray(well?.reports) ? well.reports : [];
  const found = reports.find((report) => report && (report.id === reportId || report.reportId === reportId));
  if (dayKey(found?.date)) return dayKey(found.date);
  if (reportId && well?.newestReportId === reportId) return dayKey(well.newestReportDate || well.lastReportDate);
  if (reportId && well?.lastReportId === reportId) return dayKey(well.lastReportDate);
  return "";
}

function loggedLag(ticketDayValue, app, well) {
  if (!ticketDayValue) return null;
  const report = reportDay(app, well);
  const typed = dayKey(app?.date);
  const typedSkew = typed ? Math.abs(daysBetween(typed, ticketDayValue)) : 0;
  const used = report || (typed && typedSkew < 300 ? typed : "");
  if (!used) return null;
  return daysBetween(used, ticketDayValue);
}

function noRealNumber(raw) {
  const text = String(raw || "").trim();
  if (!text || /mudman/i.test(text) || /^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/[A-Z]0+$/.test(compact) && !/[1-9]/.test(compact)) return true;
  const parsed = looseTicket(text);
  return !parsed?.number || parsed.number === "0";
}

function windowFor(raw, windowBySource) {
  const series = ticketSeries(raw);
  const prefix = series?.prefix || "";
  const source = ["NK", "CANNK", "BRKS", "SBBRK", "TBAR", "WBFS"].includes(prefix) ? "xpress" : /AWEY|PROS|EVPR/.test(prefix) ? "mim" : "";
  if (source && windowBySource.get(source)) return windowBySource.get(source);
  const values = [...windowBySource.values()].filter(Boolean).sort();
  return values[0] || "";
}

function classifyApp(app, loadedSeries, loadedPrefixes, matchedIds, windowBySource) {
  if (matchedIds.has(app.id)) return null;
  const raw = String(app.rawTicket || "").trim();
  const when = dayKey(app.reportDate) || dayKey(app.date);
  const windowStart = windowFor(raw, windowBySource);
  if (when && windowStart && when < windowStart) return { category: "outside_window", reason: "Outside the collected ticket window.", auto: true, priority: "low" };
  if (app.kind === "transferIn" || app.kind === "transferOut") return { category: "transfer", reason: "Well-to-well transfer. No warehouse ticket is expected.", auto: true };
  if (noRealNumber(raw)) return { category: "no_ticket_number", reason: "The app line has no warehouse ticket number.", auto: false };
  const series = ticketSeries(raw);
  if (series && (loadedSeries.has(series.series) || (series.prefix && loadedPrefixes.has(series.prefix)))) return { category: "missing_from_pull", reason: `${raw} is in a loaded series but that ticket was not pulled.`, auto: false };
  if (looseTicket(raw)?.bare) return { category: "no_ticket_number", reason: "The app cites a bare number that no loaded warehouse ticket confirmed.", auto: false };
  return { category: "unknown_prefix", reason: `${raw} uses a prefix that is not in the loaded warehouse tickets.`, auto: false };
}

export function sequenceGaps(tickets, apps) {
  const groups = new Map();
  const loaded = new Set();
  for (const ticket of tickets) {
    const series = ticketSeries(warehouseTicketNumber(ticket), ticket.type);
    if (!series) continue;
    loaded.add(`${series.series}:${series.number}`);
    const list = groups.get(series.series) || [];
    list.push(series.number);
    groups.set(series.series, list);
  }
  const cited = [];
  for (const app of apps) {
    if (app.kind === "transferIn" || app.kind === "transferOut") continue;
    const series = ticketSeries(app.rawTicket || "", app.type);
    if (!series || loaded.has(`${series.series}:${series.number}`)) continue;
    cited.push(series);
  }
  const items = [];
  for (const [series, numbers] of groups) {
    const unique = [...new Set(numbers)].sort((a, b) => a - b);
    if (unique.length < 2 || unique.at(-1) - unique[0] > 200) continue;
    const have = new Set(unique);
    const gaps = [];
    for (let value = unique[0]; value <= unique.at(-1); value += 1) if (!have.has(value)) gaps.push(value);
    for (const extra of cited) if (extra.series === series && extra.number >= unique[0] && extra.number <= unique.at(-1) && !gaps.includes(extra.number) && !have.has(extra.number)) gaps.push(extra.number);
    if (!gaps.length) continue;
    items.push({
      id: `sequence_${docSlug(series)}`,
      kind: "sequence_gap",
      series,
      numbers: gaps.sort((a, b) => a - b).slice(0, 40),
      title: `${series} is missing ${gaps.slice(0, 8).join(", ")}`,
      detail: `Loaded ${series} numbers jump from ${unique[0]} to ${unique.at(-1)}. The missing numbers are ${gaps.join(", ")}.`,
      dollarValue: 0,
      auto: false,
      wellId: "",
    });
  }
  return items;
}

function qtyFields(item) {
  return ["onHand", "available", "committed", "inTransit"].map((key) => Number(item?.[key])).filter((value) => Number.isFinite(value));
}

export function compactStockItems(items, previousItems = []) {
  const previousLive = new Set();
  for (const item of previousItems || []) {
    if (qtyFields(item).some((value) => Math.abs(value) > 0.0001)) previousLive.add(stockItemKey(item));
  }
  const kept = [];
  const seenZero = new Set();
  for (const item of items || []) {
    const live = qtyFields(item).some((value) => Math.abs(value) > 0.0001);
    if (live) {
      kept.push(item);
      continue;
    }
    const key = stockItemKey(item);
    if (!previousLive.has(key) || seenZero.has(key)) continue;
    seenZero.add(key);
    kept.push(item);
  }
  return kept;
}

export function compactStockSnapshots(snapshots) {
  const groups = new Map();
  for (const snapshot of snapshots || []) {
    const key = `${snapshot.source}|${snapshot.warehouseCode}`;
    const list = groups.get(key) || [];
    list.push(snapshot);
    groups.set(key, list);
  }
  const writes = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let previous = [];
    for (const snapshot of ordered) {
      const items = compactStockItems(snapshot.items, previous);
      if (items.length !== (snapshot.items || []).length) writes.push({ id: snapshot.id, items });
      previous = snapshot.items || [];
    }
  }
  return writes;
}

function stockItemsOf(settings, stock, tickets) {
  const groups = new Map();
  for (const snapshot of stock || []) {
    const key = `${snapshot.source}|${snapshot.warehouseCode}`;
    const list = groups.get(key) || [];
    list.push(snapshot);
    groups.set(key, list);
  }
  const items = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const current = ordered.at(-1);
    const previous = ordered.length > 1 ? ordered.at(-2) : null;
    for (const item of current.items || []) {
      if (isIgnoredStockItem(item, settings.ignoreStockNames)) continue;
      const onHand = Number(item.onHand);
      const committed = Number(item.committed);
      const inTransit = Number(item.inTransit);
      const name = item.name || item.code || "Item";
      const base = { warehouseCode: current.warehouseCode, source: current.source, product: name, wellId: "" };
      if (Number.isFinite(onHand) && onHand < -0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(stockItemKey(item))}_negative`, kind: "stock_negative", title: `${name} is negative at ${current.warehouseCode}`, detail: `${current.source} ${current.warehouseCode} shows ${onHand} on hand on ${current.date}.`, dollarValue: 0, auto: false, qty: onHand });
      if (Number.isFinite(onHand) && Number.isFinite(committed) && committed > onHand + 0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(stockItemKey(item))}_committed`, kind: "stock_committed", title: `${name} is committed for more than is on hand`, detail: `${current.warehouseCode} has ${committed} committed and ${onHand} on hand.`, dollarValue: 0, auto: false, qty: committed - onHand });
      if (Number.isFinite(inTransit) && inTransit > 0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(stockItemKey(item))}_transit`, kind: "stock_transit", title: `${name} is in transit at ${current.warehouseCode}`, detail: `${inTransit} is still in transit on ${current.date}.`, dollarValue: 0, auto: false, qty: inTransit });
    }
    if (!previous) continue;
    const before = new Map((previous.items || []).map((item) => [stockItemKey(item), Number(item.onHand)]));
    const explained = new Map();
    for (const ticket of tickets || []) {
      if (ticket.warehouseCode !== current.warehouseCode || ticket.source !== current.source) continue;
      const day = ticketDay(ticket);
      if (!day || day <= previous.date || day > current.date) continue;
      for (const line of ticket.lines || []) {
        const key = stockItemKey(line);
        explained.set(key, (explained.get(key) || 0) + stockEffect(ticket.type, line.qty));
      }
    }
    for (const item of current.items || []) {
      if (isIgnoredStockItem(item, settings.ignoreStockNames)) continue;
      const key = stockItemKey(item);
      const from = before.get(key);
      const to = Number(item.onHand);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const delta = to - from;
      const net = explained.get(key) || 0;
      if (Math.abs(delta - net) <= 0.01) continue;
      items.push({ id: `stock_${docSlug(current.warehouseCode)}_${docSlug(key)}_drift`, kind: "stock_drift", warehouseCode: current.warehouseCode, source: current.source, product: item.name || key, wellId: "", title: `${item.name || key} changed at ${current.warehouseCode} without tickets`, detail: `On hand went from ${from} to ${to} between ${previous.date} and ${current.date}. Tickets explain ${net}.`, dollarValue: 0, auto: false, qty: delta - net });
    }
  }
  return items;
}

export function applyFlag(existing, input) {
  const at = input.at || new Date().toISOString();
  const notes = Array.isArray(existing?.notes) ? existing.notes.map((note) => ({ ...note })) : [];
  const text = String(input.note || "").trim();
  if (text) notes.push({ at, by: String(input.by || ""), text });
  const status = FLAG_STATUSES.includes(input.status) ? input.status : (existing?.status || "new");
  return {
    entityType: input.entityType || existing?.entityType || "",
    entityId: input.entityId || existing?.entityId || "",
    status,
    notes,
    forGrokBot: typeof input.forGrokBot === "boolean" ? input.forGrokBot : Boolean(existing?.forGrokBot),
    grokBotReply: input.grokBotReply != null ? String(input.grokBotReply) : (existing?.grokBotReply || ""),
    updatedAt: at,
  };
}

export function buildCoverage({ date, config, tickets = [], wells = [], products = [], stock = [], appTickets = [] }) {
  const grace = Number.isFinite(config?.graceDays) ? config.graceDays : 3;
  const preparedWells = wells.map((well) => ({ ...well, lsdNorm: lsdNorm(well.lsd) || well.lsdNorm || "" }));
  const preparedTickets = tickets.map((ticket) => ({ ...ticket, lsdNorm: lsdNorm(ticket.lsd) || ticket.lsdNorm || "" }));
  const apps = appTickets.map((entry) => ({ ...entry, kind: entry.kind || "received" }));
  const index = indexProducts(products);
  const loadedSeries = new Set();
  const loadedPrefixes = new Set();
  const windowBySource = new Map();
  for (const ticket of preparedTickets) {
    const series = ticketSeries(warehouseTicketNumber(ticket), ticket.type);
    if (series) {
      loadedSeries.add(series.series);
      if (series.prefix) loadedPrefixes.add(series.prefix);
    }
    const day = ticketDay(ticket);
    if (!day) continue;
    const source = ticket.source || "";
    const prior = windowBySource.get(source);
    if (!prior || day < prior) windowBySource.set(source, day);
  }
  const matchedIds = new Set();
  const ticketStatus = [];
  for (const ticket of preparedTickets) {
    const day = ticketDay(ticket);
    const age = day ? daysBetween(date, day) : 0;
    const reasonBound = boundReason(ticket);
    const base = {
      id: ticket.id,
      date,
      ticketId: ticket.id,
      number: warehouseTicketNumber(ticket),
      source: ticket.source || "",
      company: ticket.company || "",
      type: ticket.type || "",
      warehouseCode: ticket.warehouseCode || "",
      rig: ticket.rig || "",
      lsd: ticket.lsdNorm || "",
      ageDays: Number.isFinite(age) ? age : 0,
      ticketDate: day || "",
      dollarValue: dollarsOf(ticket.lines, index),
      wellId: "",
      wellName: "",
      reportId: "",
      appTicketId: "",
      lagDays: null,
      match: "none",
      escalate: false,
    };
    if (notBound(ticket)) {
      ticketStatus.push({ ...base, status: "not_well_bound", reason: reasonBound || "Not a well delivery", auto: true });
      continue;
    }
    const hit = matchApp(ticket, apps, preparedWells);
    if (hit) {
      matchedIds.add(hit.app.id);
      const lag = loggedLag(day, hit.app, hit.well);
      const portion = mismatchPortion(ticket.lines, hit.app.lines, index);
      const mismatch = portion.differs || locationDiffers(ticket, hit.well);
      ticketStatus.push({
        ...base,
        status: mismatch ? "mismatch" : "logged",
        reason: mismatch ? "Quantity, product, or location does not match the mud report." : `Logged on ${hit.well?.name || hit.app.wellId || "the well"}.`,
        wellId: hit.app.wellId || "",
        wellName: hit.well?.name || "",
        reportId: hit.app.reportId || "",
        appTicketId: hit.app.id || "",
        lagDays: lag,
        match: hit.match,
        dollarValue: mismatch ? portion.dollars : base.dollarValue,
        auto: false,
      });
      continue;
    }
    const candidate = matchWell(ticket, preparedWells);
    const overdue = day && age > grace;
    ticketStatus.push({
      ...base,
      status: overdue ? "overdue" : "pending",
      reason: candidate ? `No mud report has logged this ticket. It belongs near ${candidate.name || candidate.id}.` : "No mud report has logged this ticket, and no loaded well matches its location.",
      wellId: candidate?.id || "",
      wellName: candidate?.name || "",
      escalate: Boolean(overdue && age >= 7),
      auto: false,
    });
  }
  const appOnly = [];
  for (const app of apps) {
    const classified = classifyApp(app, loadedSeries, loadedPrefixes, matchedIds, windowBySource);
    if (!classified) continue;
    const well = wellOf(preparedWells, app.wellId);
    appOnly.push({
      id: `app_${docSlug(app.id || app.rawTicket)}`,
      kind: "app_only",
      category: classified.category,
      title: classified.category === "transfer" ? `Transfer ${app.rawTicket || "between wells"}` : `${app.rawTicket || "App line"} has no warehouse ticket`,
      detail: classified.reason,
      reason: classified.reason,
      wellId: app.wellId || "",
      wellName: well?.name || "",
      rawTicket: app.rawTicket || "",
      dollarValue: dollarsOf(app.lines, index),
      auto: classified.auto != null ? classified.auto : classified.category === "transfer",
      priority: classified.priority || "",
      date: app.date || "",
    });
  }
  const reviews = [...sequenceGaps(preparedTickets, apps).map((item) => ({ ...item, date })), ...stockItemsOf({ ignoreStockNames: config?.ignoreStockNames }, stock, preparedTickets).map((item) => ({ ...item, date })), ...appOnly];
  const counts = { logged: 0, pending: 0, overdue: 0, mismatch: 0, not_well_bound: 0 };
  for (const row of ticketStatus) if (counts[row.status] != null) counts[row.status] += 1;
  const dollarsAtRisk = Math.round(ticketStatus.filter((row) => row.status === "overdue" || row.status === "mismatch").reduce((sum, row) => sum + (row.dollarValue || 0), 0) * 100) / 100;
  return { ticketStatus, reviews, counts, dollarsAtRisk };
}
