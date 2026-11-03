/** Well-based ticket coverage. Warehouse tickets are the source of truth. Pure data in, plain objects out. */

import { createHash } from "node:crypto";
import { appCitesTicket, daysBetween, dayKey, docSlug, indexProducts, isIgnoredStockItem, looseTicket, lsdNorm, matchLoggedApp, matchWell, packStockKey, resolveLine, rigNorm, stockEffect, stockItemKey, warehouseTicketNumber } from "./engine.js";

export { looseTicket };

const NOT_BOUND = new Set(["mr", "sr", "at", "st", "stx", "tt", "pr"]);
export const FLAG_STATUSES = ["new", "seen", "watching", "done"];

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

function locationDiffers(ticket, well) {
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd);
  const wellLsd = well?.lsdNorm || lsdNorm(well?.lsd);
  if (!ticketLsd || !wellLsd || ticketLsd === wellLsd || nearLsd(ticketLsd, wellLsd)) return false;
  return true;
}

function rigDisagrees(ticket, well) {
  const left = rigNorm(ticket?.rig);
  const right = rigNorm(well?.rig);
  return Boolean(left && right && left !== right);
}

function locationNoteText(ticket, well) {
  const ticketLsd = ticket.lsdNorm || lsdNorm(ticket.lsd) || "the ticket";
  const wellLsd = well?.lsdNorm || lsdNorm(well?.lsd) || "the well";
  const left = lsdParts(ticketLsd);
  const right = lsdParts(wellLsd);
  if (left && right && left.mer !== right.mer && left.section === right.section && left.twp === right.twp && left.rge === right.rge) {
    return `Possible LSD typo ${left.mer} vs ${right.mer} (${ticketLsd} vs ${wellLsd}). Contractor and rig agree.`;
  }
  return `Location ${ticketLsd} vs ${wellLsd} differs, but the rig agrees. Possible typo, pad versus well, or picked up by the customer.`;
}

const SERVICE_LINE = /\bcallouts?\b|after[\s-]*hours|\bhandling\b|delivery[\s-]*charges?|fuel[\s-]*surcharges?|\bsurcharges?\b|\btt\s*charges?\b/i;

function isServiceLine(line) {
  const text = [line?.name, line?.product, line?.productname, line?.code, line?.service, line?.description, line?.type, line?.kind].filter(Boolean).join(" ");
  if (SERVICE_LINE.test(text)) return true;
  return /^(charge|service|fee)$/i.test(String(line?.type || line?.kind || ""));
}

function ignoredLine(line, index, ignoreNames) {
  const resolved = resolveLine(index, line);
  if (resolved.product?.name) return isIgnoredStockItem({ name: resolved.product.name, code: line?.code, product: resolved.product }, ignoreNames);
  return isIgnoredStockItem(line, ignoreNames);
}

function linePrice(index, line, resolved) {
  const own = Number(line?.price);
  if (Number.isFinite(own) && own > 0) return own;
  const listed = resolved?.product?.price;
  return typeof listed === "number" ? listed : 0;
}

function mismatchPortion(ticketLines, appLines, index, ignoreNames) {
  const groups = new Map();
  const take = (line, side) => {
    if (!line || isServiceLine(line) || ignoredLine(line, index, ignoreNames)) return;
    const resolved = resolveLine(index, line);
    const group = groups.get(resolved.productKey) || { ticket: [], app: [] };
    group[side].push({ line, resolved });
    groups.set(resolved.productKey, group);
  };
  for (const line of ticketLines || []) take(line, "ticket");
  for (const line of appLines || []) take(line, "app");
  let dollars = 0;
  let differs = false;
  for (const group of groups.values()) {
    const bothUnits = group.ticket.length > 0 && group.app.length > 0 && group.ticket.every((row) => row.resolved.unit) && group.app.every((row) => row.resolved.unit);
    if (bothUnits) {
      const tally = (rows) => {
        const map = new Map();
        for (const row of rows) {
          const pack = row.resolved.pack || "unit";
          const current = map.get(pack) || { qty: 0, price: 0 };
          current.qty += Number(row.line.qty) || 0;
          if (!current.price) current.price = linePrice(index, row.line, row.resolved);
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
      const left = group.ticket.reduce((sum, row) => sum + (Number(row.line.qty) || 0), 0);
      const right = group.app.reduce((sum, row) => sum + (Number(row.line.qty) || 0), 0);
      const diff = Math.abs(left - right);
      if (diff <= 0.01) continue;
      differs = true;
      const sample = group.app[0] || group.ticket[0];
      dollars += diff * linePrice(index, sample.line, sample.resolved);
    }
  }
  return { differs, dollars: Math.round(dollars * 100) / 100 };
}

function dollarsOf(lines, index) {
  let sum = 0;
  for (const line of lines || []) {
    const qty = Math.abs(Number(line.qty) || 0);
    const own = Number(line.price);
    const product = resolveLine(index, line).product;
    const price = Number.isFinite(own) && own > 0 ? own : (typeof product?.price === "number" ? product.price : 0);
    sum += qty * (price || 0);
  }
  return Math.round(sum * 100) / 100;
}

function ticketPlace(ticket) {
  return [ticket.wellName, ticket.customer, ticket.orderedBy, ticket.shipTo, ticket.shipToName, ticket.shipToAddress, ticket.destination, ticket.deliverTo, ticket.deliveryAddress, ticket.instructions, ticket.lsd, ticket.lsdGrid, ticket.grid, ticket.gridLocation, ticket.location].filter(Boolean).join(" ");
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
  return matchLoggedApp(ticket, apps, wells);
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

function appCites(app, ticket) {
  return appCitesTicket(app, ticket);
}

function linkedApps(ticket, apps, hit) {
  const linked = [];
  for (const app of apps) {
    if (!appCites(app, ticket)) continue;
    if (app.id === hit.app.id || (app.wellId && app.wellId === hit.app.wellId)) linked.push(app);
  }
  return linked;
}

function noteFloor(floors, ticket, series) {
  const key = `${ticket.source || ""}|${series.series}`;
  const day = ticketDay(ticket) || "";
  const current = floors.get(key);
  if (!current) {
    floors.set(key, { ...series, source: ticket.source || "", min: series.number, max: series.number, date: day });
    return;
  }
  if (series.number < current.min) {
    current.min = series.number;
    current.date = day;
  } else if (series.number === current.min && day && (!current.date || day < current.date)) {
    current.date = day;
  }
  if (series.number > current.max) current.max = series.number;
}

function floorFor(raw, floors) {
  const cited = ticketSeries(raw);
  if (!cited?.number) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const floor of floors.values()) {
    if (floor.prefix !== cited.prefix) continue;
    if (cited.type && floor.type !== cited.type) continue;
    const distance = cited.number < floor.min ? floor.min - cited.number : cited.number > floor.max ? cited.number - floor.max : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = floor;
    }
  }
  return best ? { cited, floor: best } : null;
}

const XPRESS_PREFIXES = new Set(["NK", "CANNK", "BRKS", "SBBRK", "TBAR", "WBFS"]);

function sourceForSeries(series, ticketSource) {
  if (ticketSource === "xpress" || ticketSource === "mim") return ticketSource;
  if (XPRESS_PREFIXES.has(series?.prefix)) return "xpress";
  if (/AWEY|PROS|EVPR/.test(series?.prefix || "")) return "mim";
  return "";
}

function pullCoveredType(series, loadedTypes) {
  const source = sourceForSeries(series, "");
  return Boolean(series?.type && source && loadedTypes.has(`${source}|${series.type}`));
}

function entryDay(app) {
  return dayKey(app?.date) || dayKey(app?.reportDate) || dayKey(app?.receiveddate) || dayKey(app?.returneddate);
}

function beforeCollection(app, windowStart) {
  const when = entryDay(app);
  return Boolean(when && windowStart && when < windowStart);
}

function outsideCollection(app, windowStart) {
  if (!beforeCollection(app, windowStart)) return null;
  return { category: "outside_window", reason: `Outside the collected ticket window, which starts on ${windowStart}.`, auto: true, priority: "low" };
}

function citationKeys(value) {
  const raw = String(value || "").trim();
  const keys = [];
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact) keys.push(`raw:${compact}`);
  const parsed = looseTicket(raw);
  if (parsed?.number) keys.push(parsed.bare ? `bare:${parsed.number}` : `${parsed.prefix}:${parsed.number}`);
  return keys;
}

function rememberMatch(matchedIds, matchedKeys, app) {
  if (app?.id) matchedIds.add(app.id);
  for (const key of citationKeys(app?.rawTicket || app?.ticketNorm)) matchedKeys.add(key);
}

function appIsMatched(app, matchedIds, matchedKeys) {
  if (app?.id && matchedIds.has(app.id)) return true;
  return citationKeys(app?.rawTicket || app?.ticketNorm).some((key) => matchedKeys.has(key));
}

const WAREHOUSE_MISSING = "App cites a ticket the warehouse doesn't have (likely typo or not yet posted).";

function classifyApp(app, loadedTypes, loadedNumbers, matchedIds, matchedKeys, floors, windowStart) {
  if (appIsMatched(app, matchedIds, matchedKeys)) return null;
  const raw = String(app.rawTicket || "").trim();
  if (app.kind === "transferIn" || app.kind === "transferOut") return { category: "transfer", reason: "Well-to-well transfer. No warehouse ticket is expected.", auto: true };
  const found = floorFor(raw, floors);
  if (found && found.cited.number < found.floor.min) {
    const when = found.floor.date ? ` on ${found.floor.date}` : "";
    return { category: "outside_window", reason: `Outside the collected ticket window. ${found.floor.series} starts at ${found.floor.min}${when}.`, auto: true, priority: "low" };
  }
  if (noRealNumber(raw)) return outsideCollection(app, windowStart) || { category: "no_ticket_number", reason: "The app line has no warehouse ticket number.", auto: false };
  if (found) {
    if (loadedNumbers.has(`${found.floor.series}:${found.cited.number}`)) return null;
    return { category: "not_at_warehouse", reason: WAREHOUSE_MISSING, auto: false };
  }
  const series = ticketSeries(raw);
  if (series) {
    const before = outsideCollection(app, windowStart);
    if (before) return before;
    if (pullCoveredType(series, loadedTypes)) return { category: "missing_from_pull", reason: `${raw} was not loaded, and this pull includes ${series.type} tickets.`, auto: false };
    return { category: "unknown_prefix", reason: `${raw} uses a series that was not in the loaded warehouse tickets.`, auto: false };
  }
  if (looseTicket(raw)?.bare) return outsideCollection(app, windowStart) || { category: "no_ticket_number", reason: "The app cites a bare number that no loaded warehouse ticket confirmed.", auto: false };
  return outsideCollection(app, windowStart) || { category: "unknown_prefix", reason: `${raw} uses a prefix that is not in the loaded warehouse tickets.`, auto: false };
}

/** Pre-#31 app review ids are slugs, including `_2` and `_3` suffixes. Current ids are `app_` plus 12 hex characters. */
export function isLegacyReviewId(id) {
  const text = String(id || "");
  return text.startsWith("app_") && !/^app_[0-9a-f]{12}$/.test(text);
}

function keptFlag(flags, entityType, entityId) {
  return (flags || []).some((flag) => flag?.entityType === entityType && flag.entityId === entityId && (flag.status || (Array.isArray(flag.notes) && flag.notes.length)));
}

/** Drop unflagged rows this run no longer writes, including rows dated on an earlier run. Keep flagged ones as resolved_auto. */
export function reconcileCoverage({ reviews = [], ticketStatus = [], existingReviews = [], existingStatuses = [], flags = [], at }) {
  const reviewIds = new Set(reviews.map((row) => row.id));
  const statusIds = new Set(ticketStatus.map((row) => row.id));
  const reviewDeletes = [];
  const reviewStale = [];
  for (const doc of existingReviews) {
    if (!doc?.id || reviewIds.has(doc.id) || doc.state === "resolved_auto") continue;
    if (keptFlag(flags, "review", doc.id)) reviewStale.push({ id: doc.id, state: "resolved_auto", staleSince: doc.staleSince || at });
    else reviewDeletes.push(doc.id);
  }
  const statusDeletes = [];
  const statusStale = [];
  for (const doc of existingStatuses) {
    if (!doc?.id || statusIds.has(doc.id) || doc.state === "resolved_auto") continue;
    if (keptFlag(flags, "ticket", doc.id)) statusStale.push({ id: doc.id, state: "resolved_auto", staleSince: doc.staleSince || at });
    else statusDeletes.push(doc.id);
  }
  return { reviewDeletes, reviewStale, statusDeletes, statusStale };
}

const TICKET_STATUSES = new Set(["logged", "pending", "overdue", "mismatch", "not_well_bound"]);

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
}

function appReviewId(app) {
  const lines = (app.lines || []).map((line, index) => [index, line?.name || line?.product || line?.productname || "", line?.unit || "", line?.qty ?? ""].join(":")).join(";");
  return `app_${stableHash([app.source || "", app.id || "", app.wellId || "", app.reportId || "", app.date || "", app.kind || "", app.rawTicket || "", lines].join("|"))}`;
}

function legacyAppReviewId(app) {
  return `app_${docSlug(app.id || app.rawTicket)}`;
}

/** Review rows that will be written. One id each. Mismatch tickets stay on ticket status. */
export function reviewDocuments(reviews) {
  const byId = new Map();
  for (const row of reviews || []) {
    if (!row?.id || !row.kind || TICKET_STATUSES.has(row.status)) continue;
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** Copy a review flag onto its new stable id. No-op when the old flag is missing or the new id already has one. */
export function movedReviewFlag(flags, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return null;
  const list = flags || [];
  const prior = list.find((flag) => flag?.entityType === "review" && flag.entityId === fromId);
  if (!prior) return null;
  if (list.some((flag) => flag?.entityType === "review" && flag.entityId === toId)) return null;
  return {
    entityType: "review",
    entityId: toId,
    status: prior.status || "new",
    notes: Array.isArray(prior.notes) ? prior.notes.map((note) => ({ ...note })) : [],
    forGrokBot: Boolean(prior.forGrokBot),
    grokBotReply: prior.grokBotReply || "",
    updatedAt: prior.updatedAt || "",
  };
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

function stockItemsOf(settings, stock, tickets, index) {
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
      const itemKey = index ? packStockKey(index, item) : stockItemKey(item);
      if (Number.isFinite(onHand) && onHand < -0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(itemKey)}_negative`, kind: "stock_negative", title: `${name} is negative at ${current.warehouseCode}`, detail: `${current.source} ${current.warehouseCode} shows ${onHand} on hand on ${current.date}.`, dollarValue: 0, auto: false, qty: onHand });
      if (Number.isFinite(onHand) && Number.isFinite(committed) && committed > onHand + 0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(itemKey)}_committed`, kind: "stock_committed", title: `${name} is committed for more than is on hand`, detail: `${current.warehouseCode} has ${committed} committed and ${onHand} on hand.`, dollarValue: 0, auto: false, qty: committed - onHand });
      if (Number.isFinite(inTransit) && inTransit > 0.01) items.push({ ...base, id: `stock_${docSlug(current.warehouseCode)}_${docSlug(itemKey)}_transit`, kind: "stock_transit", title: `${name} is in transit at ${current.warehouseCode}`, detail: `${inTransit} is still in transit on ${current.date}.`, dollarValue: 0, auto: false, qty: inTransit });
    }
    if (!previous) continue;
    const lineKey = (item) => index ? packStockKey(index, item) : stockItemKey(item);
    const before = new Map((previous.items || []).map((item) => [lineKey(item), Number(item.onHand)]));
    const explained = new Map();
    for (const ticket of tickets || []) {
      if (ticket.warehouseCode !== current.warehouseCode || ticket.source !== current.source) continue;
      const day = ticketDay(ticket);
      if (!day || day <= previous.date || day > current.date) continue;
      for (const line of ticket.lines || []) {
        const key = lineKey(line);
        explained.set(key, (explained.get(key) || 0) + stockEffect(ticket.type, line.qty, ticket));
      }
    }
    for (const item of current.items || []) {
      if (isIgnoredStockItem(item, settings.ignoreStockNames)) continue;
      const key = lineKey(item);
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
  const ignoreNames = Array.isArray(config?.ignoreStockNames) ? config.ignoreStockNames : undefined;
  const checksStart = /^\d{4}-\d{2}-\d{2}$/.test(String(config?.checksStartDate || "")) ? String(config.checksStartDate) : "";
  const loadedTypes = new Set();
  const loadedNumbers = new Set();
  const floors = new Map();
  let earliestTicket = "";
  for (const ticket of preparedTickets) {
    const day = ticketDay(ticket);
    if (day && (!earliestTicket || day < earliestTicket)) earliestTicket = day;
    const series = ticketSeries(warehouseTicketNumber(ticket), ticket.type);
    if (!series) continue;
    const source = sourceForSeries(series, ticket.source);
    if (series.type && source) loadedTypes.add(`${source}|${series.type}`);
    loadedNumbers.add(`${series.series}:${series.number}`);
    noteFloor(floors, ticket, series);
  }
  const windowStart = [checksStart, earliestTicket].filter(Boolean).sort().at(-1) || "";
  const matchedIds = new Set();
  const matchedKeys = new Set();
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
      const linked = linkedApps(ticket, apps, hit);
      for (const app of linked) rememberMatch(matchedIds, matchedKeys, app);
      const lag = loggedLag(day, hit.app, hit.well);
      const portion = mismatchPortion(ticket.lines, linked.flatMap((app) => app.lines || []), index, ignoreNames);
      const locationMismatch = Boolean(hit.well && locationDiffers(ticket, hit.well) && rigDisagrees(ticket, hit.well));
      const locationNote = hit.well && locationDiffers(ticket, hit.well) && !locationMismatch ? { severity: "low", text: locationNoteText(ticket, hit.well) } : null;
      const mismatch = portion.differs || locationMismatch;
      ticketStatus.push({
        ...base,
        status: mismatch ? "mismatch" : "logged",
        reason: mismatch ? (portion.differs ? "Quantity, product, or location does not match the mud report." : "Location does not match and the rig disagrees.") : `Logged on ${hit.well?.name || hit.app.wellId || "the well"}.`,
        locationNote: locationNote || null,
        wellId: hit.app.wellId || "",
        wellName: hit.well?.name || "",
        reportId: hit.app.reportId || "",
        appTicketId: hit.app.id || "",
        lagDays: lag,
        match: hit.match,
        dollarValue: portion.differs ? portion.dollars : base.dollarValue,
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
  const flagMoves = [];
  for (const app of apps) {
    const classified = classifyApp(app, loadedTypes, loadedNumbers, matchedIds, matchedKeys, floors, windowStart);
    if (!classified) continue;
    const well = wellOf(preparedWells, app.wellId);
    const id = appReviewId(app);
    const legacyId = legacyAppReviewId(app);
    if (legacyId !== id) flagMoves.push({ fromId: legacyId, toId: id });
    appOnly.push({
      id,
      appId: app.id || "",
      kind: "app_only",
      category: classified.category,
      title: classified.category === "transfer" ? `Transfer ${app.rawTicket || "between wells"}` : classified.category === "not_at_warehouse" ? `${app.rawTicket || "App line"} is not on the warehouse list` : `${app.rawTicket || "App line"} has no warehouse ticket`,
      detail: classified.reason,
      reason: classified.reason,
      wellId: app.wellId || "",
      wellName: well?.name || "",
      reportId: app.reportId || "",
      rawTicket: app.rawTicket || "",
      dollarValue: dollarsOf(app.lines, index),
      auto: classified.auto != null ? classified.auto : classified.category === "transfer",
      priority: classified.priority || "",
      appDate: entryDay(app),
      date,
    });
  }
  const reviews = reviewDocuments([...sequenceGaps(preparedTickets, apps).map((item) => ({ ...item, date })), ...stockItemsOf({ ignoreStockNames: ignoreNames }, stock, preparedTickets, index).map((item) => ({ ...item, date })), ...appOnly]);
  const counts = { logged: 0, pending: 0, overdue: 0, mismatch: 0, not_well_bound: 0 };
  for (const row of ticketStatus) if (counts[row.status] != null) counts[row.status] += 1;
  const dollarsAtRisk = Math.round(ticketStatus.filter((row) => row.status === "overdue" || row.status === "mismatch").reduce((sum, row) => sum + (row.dollarValue || 0), 0) * 100) / 100;
  return { ticketStatus, reviews, reviewCount: reviews.length, flagMoves, counts, dollarsAtRisk, windowStart };
}
