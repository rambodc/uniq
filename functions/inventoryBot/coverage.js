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

export function ticketSeries(value) {
  const text = String(value ?? "").toUpperCase().replace(/^(XPRESS|MIM)_/, "");
  const typed = text.match(/^([A-Z][A-Z0-9]*?)-([A-Z]{1,4})-(\d+)$/);
  if (typed) return { series: `${typed[1]}-${typed[2]}`, number: Number(typed[3]) };
  const plain = text.match(/^([A-Z][A-Z0-9]*?)-(\d+)$/);
  if (plain) return { series: plain[1], number: Number(plain[2]) };
  const mim = text.match(/^([A-Z]{2})([A-Z]+)(\d+)$/);
  if (mim) return { series: `${mim[1]}${mim[2]}`, number: Number(mim[3]) };
  return null;
}

function ticketDay(ticket) {
  return dayKey(ticket.postedAt) || dayKey(ticket.shippedAt) || dayKey(ticket.collectedAt) || dayKey(ticket.date);
}

function wellOf(wells, id) {
  return wells.find((well) => well.id === id) || null;
}

function locationConfirms(ticket, well) {
  if (!well) return false;
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const wellLsd = well.lsdNorm || lsdNorm(well.lsd);
  if (ticketLsd && wellLsd) return ticketLsd === wellLsd;
  return Boolean(rigNorm(ticket.rig) && rigNorm(ticket.rig) === rigNorm(well.rig));
}

function locationDiffers(ticket, well) {
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const wellLsd = well?.lsdNorm || lsdNorm(well?.lsd);
  return Boolean(ticketLsd && wellLsd && ticketLsd !== wellLsd);
}

function trailingDigits(value) {
  const match = String(value ?? "").toUpperCase().match(/(\d+)$/);
  return match ? String(Number(match[1])) : "";
}

function lineKey(line) {
  const name = nameNorm(line?.name || line?.product || "");
  const pack = packKey(line?.unit || "");
  return pack ? `${name}|${pack}` : name;
}

function qtyDiffers(ticketLines, appLines) {
  if (!appLines?.length || !ticketLines?.length) return false;
  const tally = (lines) => {
    const map = new Map();
    for (const line of lines) {
      const key = lineKey(line);
      map.set(key, (map.get(key) || 0) + (Number(line.qty) || 0));
    }
    return map;
  };
  const left = tally(ticketLines);
  const right = tally(appLines);
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    if (Math.abs((left.get(key) || 0) - (right.get(key) || 0)) > 0.01) return true;
  }
  return false;
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

function boundReason(ticket) {
  const type = String(ticket.type || "").toLowerCase();
  const text = `${ticket.wellName || ""} ${ticket.customer || ""} ${ticket.orderedBy || ""}`;
  if (/warehouse sale/i.test(text)) return "Warehouse sale";
  if (type === "mr" || type === "sr" || type === "pr") return "Receipt into the warehouse";
  if (type === "at") return "Adjustment or blend";
  if (type === "st" || type === "stx") return "Warehouse transfer";
  if (type === "tt") return "Handling charge";
  return "";
}

function notBound(ticket) {
  const type = String(ticket.type || "").toLowerCase();
  if (/warehouse sale/i.test(`${ticket.wellName || ""} ${ticket.customer || ""}`)) return true;
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
  hits.sort((a, b) => rank[a.match] - rank[b.match]);
  for (const hit of hits) {
    const well = wellOf(wells, hit.app.wellId);
    if (hit.match === "alchem" && !locationConfirms(ticket, well)) continue;
    return { ...hit, well };
  }
  return null;
}

function classifyApp(app, loadedSeries, matchedIds) {
  if (matchedIds.has(app.id)) return null;
  if (app.kind === "transferIn" || app.kind === "transferOut") return { category: "transfer", reason: "Well-to-well transfer. No warehouse ticket is expected." };
  const raw = String(app.rawTicket || "").trim();
  const parsed = looseTicket(raw);
  if (!raw || /mudman/i.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw) || !parsed?.number) return { category: "no_ticket_number", reason: "The app line has no warehouse ticket number." };
  const series = ticketSeries(raw);
  if (parsed.bare) return { category: "no_ticket_number", reason: "The app cites a bare number that no loaded warehouse ticket confirmed." };
  if (series && loadedSeries.has(series.series)) return { category: "missing_from_pull", reason: `${raw} is in a loaded series but that ticket was not pulled.` };
  return { category: "unknown_prefix", reason: `${raw} uses a prefix that is not in the loaded warehouse tickets.` };
}

export function sequenceGaps(tickets, apps) {
  const groups = new Map();
  const loaded = new Set();
  for (const ticket of tickets) {
    const series = ticketSeries(warehouseTicketNumber(ticket));
    if (!series) continue;
    loaded.add(`${series.series}:${series.number}`);
    const list = groups.get(series.series) || [];
    list.push(series.number);
    groups.set(series.series, list);
  }
  const cited = [];
  for (const app of apps) {
    if (app.kind === "transferIn" || app.kind === "transferOut") continue;
    const series = ticketSeries(app.rawTicket || "");
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
  const preparedWells = wells.map((well) => ({ ...well, lsdNorm: well.lsdNorm || lsdNorm(well.lsd) }));
  const preparedTickets = tickets.map((ticket) => ({ ...ticket, lsdNorm: ticket.lsdNorm || lsdNorm(ticket.lsd) }));
  const apps = appTickets.map((entry) => ({ ...entry, kind: entry.kind || "received" }));
  const index = indexProducts(products);
  const loadedSeries = new Set(preparedTickets.map((ticket) => ticketSeries(warehouseTicketNumber(ticket))?.series).filter(Boolean));
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
      const lag = day && hit.app.date ? daysBetween(hit.app.date, day) : null;
      const mismatch = qtyDiffers(ticket.lines, hit.app.lines) || locationDiffers(ticket, hit.well);
      ticketStatus.push({
        ...base,
        status: mismatch ? "mismatch" : "logged",
        reason: mismatch ? "Quantity, product, or location does not match the mud report." : `Logged on ${hit.well?.name || hit.app.wellId || "the well"}.`,
        wellId: hit.app.wellId || "",
        wellName: hit.well?.name || "",
        reportId: hit.app.reportId || "",
        appTicketId: hit.app.id || "",
        lagDays: Number.isFinite(lag) ? lag : null,
        match: hit.match,
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
    const classified = classifyApp(app, loadedSeries, matchedIds);
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
      auto: classified.category === "transfer",
      date: app.date || "",
    });
  }
  const reviews = [...sequenceGaps(preparedTickets, apps).map((item) => ({ ...item, date })), ...stockItemsOf({ ignoreStockNames: config?.ignoreStockNames }, stock, preparedTickets).map((item) => ({ ...item, date })), ...appOnly];
  const counts = { logged: 0, pending: 0, overdue: 0, mismatch: 0, not_well_bound: 0 };
  for (const row of ticketStatus) if (counts[row.status] != null) counts[row.status] += 1;
  const dollarsAtRisk = Math.round(ticketStatus.filter((row) => row.status === "overdue" || row.status === "mismatch").reduce((sum, row) => sum + (row.dollarValue || 0), 0) * 100) / 100;
  return { ticketStatus, reviews, counts, dollarsAtRisk };
}
