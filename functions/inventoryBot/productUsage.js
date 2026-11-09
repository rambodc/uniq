/** Monthly product usage from mud-man daily reports. Pure: no Firebase, no network.
 *
 * Forecast (seasonal blend):
 * The next 30 and 60 days are each estimated from two daily rates.
 * Recent rate = quantity used in the 60 days ending today, divided by 60.
 * Seasonal rate = quantity used on those same calendar dates last year, divided by the day count.
 * Blend = 60% recent + 40% seasonal. Recent operations outweigh last year, and last year
 * still carries breakup and winter. If one side is zero it still counts: a product
 * that stopped moving pulls the forecast down, and a seasonal spike still shows up.
 * Days of cover = on-hand units (Inventory Xpress warehouse + active-well total) divided
 * by the 60-day blended daily rate, rounded down. Under 30 days is order now, 30–59 is
 * order soon, 60–180 is healthy, and more than 180 is overstock. No usage in the read
 * window is a separate "no usage" mark, including stock that never moved.
 * The 12 chart months are calendar months in America/Edmonton, ending with the current
 * month. That month is partial until its last day. 18 L and 19 L pails are one pack.
 * Litre packs stay off the unit totals. Prices are never read.
 */

import { dayKey, daysBetween, nameNorm, todayKey } from "./engine.js";
import { isPackagingOrFee, lineIdentity, prepareCatalog } from "./invXpress.js";
import { matchUniquem } from "./uniquem.js";

export const RECENT_WEIGHT = 0.6;
export const SEASON_WEIGHT = 0.4;
export const RECENT_DAYS = 60;
export const COVER_ORDER_DAYS = 30;
export const COVER_SOON_DAYS = 60;
export const COVER_OVER_DAYS = 180;

const STATUS_RANK = { order: 0, soon: 1, ok: 2, over: 3, idle: 4 };

export function addDays(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function shiftYear(iso, delta = -1) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const target = year + delta;
  const last = new Date(Date.UTC(target, month, 0)).getUTCDate();
  return `${target}-${pad(month)}-${pad(Math.min(day, last))}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function roundQty(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function inclusiveDays(start, end) {
  return daysBetween(end, start) + 1;
}

/** Twelve calendar months ending this month, plus the earlier dates the forecast needs. */
export function usageWindow(now = new Date()) {
  const today = todayKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const startIndex = year * 12 + (month - 1) - 11;
  const months = [];
  for (let offset = 0; offset < 12; offset += 1) {
    const index = startIndex + offset;
    const y = Math.floor(index / 12);
    const m = index % 12 + 1;
    months.push(`${y}-${pad(m)}`);
  }
  const nextStart = addDays(today, 1);
  const season30 = { start: shiftYear(nextStart), end: shiftYear(addDays(today, 30)) };
  const season60 = { start: shiftYear(nextStart), end: shiftYear(addDays(today, 60)) };
  const recent = { start: addDays(today, -(RECENT_DAYS - 1)), end: today };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const readStart = [recent.start, season60.start, `${months[0]}-01`].sort()[0];
  return {
    today,
    months,
    partial: day < lastDay,
    recent,
    season30,
    season60,
    readStart,
    readEnd: today,
  };
}

function inRange(date, range) {
  return Boolean(date) && date >= range.start && date <= range.end;
}

function asLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (typeof value !== "object") return [];
  if (Array.isArray(value.lines)) return value.lines.filter((row) => row && typeof row === "object");
  if (value.lines && typeof value.lines === "object") return Object.values(value.lines).filter((row) => row && typeof row === "object");
  if (value.productname || value.product || value.name || value.used != null) return [value];
  return Object.values(value).filter((row) => row && typeof row === "object" && (row.productname || row.product || row.name || row.used != null));
}

function usedQty(line) {
  if (!line || typeof line !== "object") return 0;
  const raw = line.used ?? line.qty ?? line.quantity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Positive `used` quantities on a daily-report inventory doc. Received and remaining are ignored. */
export function usedLines(bucket) {
  const rows = [];
  for (const line of asLines(bucket)) {
    const name = line.productname || line.product || line.name || "";
    const qty = usedQty(line);
    if (!name || qty <= 0) continue;
    rows.push({
      name: String(name),
      unit: String(line.unit || line.pack || line.size || ""),
      code: String(line.code || ""),
      productId: String(line.productId || ""),
      qty: roundQty(qty),
    });
  }
  return rows;
}

/** Used lines embedded on a copied report. One source wins so a copy of the same lines is not added twice. */
export function usedLinesFromReport(report) {
  if (!report || typeof report !== "object") return [];
  const inventory = report.inventory && typeof report.inventory === "object" ? report.inventory : {};
  const embedded = usedLines(inventory.used);
  if (embedded.length) return embedded;
  const direct = usedLines(report.used);
  if (direct.length) return direct;
  return usedLines(report.inventoryUsed);
}

export function reportIdDate(id) {
  const match = String(id || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

/** A report id dated inside the read window. Ids without a date are left for a field read. */
export function reportInWindow(id, window) {
  const date = reportIdDate(id);
  if (!date) return true;
  return date >= window.readStart && date <= window.readEnd;
}

export function containerOf(name, pack) {
  const text = `${name || ""} ${pack?.label || ""}`.toLowerCase();
  if (/\bpails?\b/.test(text)) return "pail";
  if (/\btotes?\b/.test(text)) return "tote";
  if (/\bdrums?\b/.test(text)) return "drum";
  if (/\b(bags?|sacks?)\b/.test(text)) return "bag";
  const amount = Number(pack?.amount) || 0;
  const family = pack?.family || "";
  if (family === "L" && (amount === 18 || amount === 19)) return "pail";
  if (family === "L" && amount >= 800) return "tote";
  if (family === "L" && amount >= 150 && amount <= 250) return "drum";
  if (family === "kg" || family === "g" || family === "lb") return "bag";
  return "";
}

function blankBucket(key, identity, uniquem) {
  return {
    key,
    name: identity.name,
    pack: identity.pack,
    litre: Boolean(identity.litre),
    amount: identity.amount,
    family: identity.family,
    productId: identity.productId || "",
    uniquemId: uniquem?.id || "",
    uniquem: uniquem?.label || "",
    months: new Array(12).fill(0),
    names: new Map(),
    onHand: 0,
    recent: 0,
    season30: 0,
    season60: 0,
    readQty: 0,
  };
}

function groupKey(identity, uniquem) {
  if (uniquem) return `uniq:${uniquem.id}|${identity.pack}`;
  return identity.key;
}

function coverFor(onHand, daily, readQty) {
  if (!(readQty > 0)) return { status: "idle", days: null };
  if (!(daily > 0)) return { status: onHand > 0 ? "over" : "ok", days: null };
  const days = Math.floor(onHand / daily);
  if (days < COVER_ORDER_DAYS) return { status: "order", days };
  if (days < COVER_SOON_DAYS) return { status: "soon", days };
  if (days > COVER_OVER_DAYS) return { status: "over", days };
  return { status: "ok", days };
}

function blend(recentDaily, seasonDaily) {
  return RECENT_WEIGHT * recentDaily + SEASON_WEIGHT * seasonDaily;
}

function preferredName(bucket) {
  if (bucket.lockedName) return bucket.lockedName;
  let best = bucket.name;
  let bestQty = -1;
  for (const [name, qty] of bucket.names) {
    if (qty > bestQty) {
      best = name;
      bestQty = qty;
    }
  }
  return best || bucket.name;
}

export function buildProductUsage(input) {
  const now = input?.now ? new Date(input.now) : new Date();
  const window = usageWindow(now);
  const prepared = prepareCatalog(input?.products || [], input?.links || {});
  const buckets = new Map();
  const stockAlias = new Map();

  function ensure(key, identity, uniquem) {
    if (!buckets.has(key)) buckets.set(key, blankBucket(key, identity, uniquem));
    return buckets.get(key);
  }

  for (const row of input?.stock || []) {
    const name = row?.name || "";
    if (!name || isPackagingOrFee(name)) continue;
    const identity = lineIdentity(prepared, name, row.pack || row.unit || "", row.code || "", row.productId || "");
    const uniquem = matchUniquem(name) || matchUniquem(identity.name);
    const key = row.key && !uniquem ? row.key : groupKey({ ...identity, key: row.key || identity.key }, uniquem);
    const bucket = ensure(key, { ...identity, name: identity.linked ? identity.name : name, pack: identity.pack }, uniquem);
    bucket.onHand = roundQty(bucket.onHand + (Number(row.total) || 0));
    bucket.litre = Boolean(row.litre ?? identity.litre);
    bucket.pack = identity.pack || row.pack;
    if (identity.linked) bucket.lockedName = identity.name;
    else bucket.names.set(name, (bucket.names.get(name) || 0) + (Number(row.total) || 0));
    stockAlias.set(`${nameNorm(name)}|${bucket.pack}`, key);
    stockAlias.set(`${nameNorm(identity.name)}|${identity.pack}`, key);
  }

  for (const line of input?.lines || []) {
    const date = dayKey(line?.date);
    if (!date || date < window.readStart || date > window.readEnd) continue;
    const name = line?.name || "";
    if (!name || isPackagingOrFee(name)) continue;
    const qty = roundQty(line.qty);
    if (qty <= 0) continue;
    const identity = lineIdentity(prepared, name, line.unit || "", line.code || "", line.productId || "");
    const uniquem = matchUniquem(name) || matchUniquem(identity.name);
    const alias = stockAlias.get(`${nameNorm(identity.name)}|${identity.pack}`) || stockAlias.get(`${nameNorm(name)}|${identity.pack}`);
    const key = alias || groupKey(identity, uniquem);
    const bucket = ensure(key, identity, uniquem);
    if (identity.linked) bucket.lockedName = identity.name;
    if (!bucket.uniquem && uniquem) {
      bucket.uniquem = uniquem.label;
      bucket.uniquemId = uniquem.id;
    }
    bucket.names.set(identity.name || name, (bucket.names.get(identity.name || name) || 0) + qty);
    bucket.readQty = roundQty(bucket.readQty + qty);
    const month = window.months.indexOf(date.slice(0, 7));
    if (month >= 0) bucket.months[month] = roundQty(bucket.months[month] + qty);
    if (inRange(date, window.recent)) bucket.recent = roundQty(bucket.recent + qty);
    if (inRange(date, window.season30)) bucket.season30 = roundQty(bucket.season30 + qty);
    if (inRange(date, window.season60)) bucket.season60 = roundQty(bucket.season60 + qty);
  }

  const season30Days = inclusiveDays(window.season30.start, window.season30.end);
  const season60Days = inclusiveDays(window.season60.start, window.season60.end);
  const products = [];
  const matched = [];
  for (const bucket of buckets.values()) {
    const total = roundQty(bucket.months.reduce((sum, value) => sum + value, 0));
    const onHand = roundQty(bucket.onHand);
    if (total <= 0 && bucket.readQty <= 0 && onHand <= 0) continue;
    const recentDaily = bucket.recent / RECENT_DAYS;
    const season30Daily = bucket.season30 / season30Days;
    const season60Daily = bucket.season60 / season60Days;
    const daily30 = blend(recentDaily, season30Daily);
    const daily60 = blend(recentDaily, season60Daily);
    const daily = daily60 > 0 ? daily60 : daily30;
    const cover = coverFor(onHand, daily, bucket.readQty);
    const name = preferredName(bucket);
    const row = {
      key: bucket.key,
      name,
      pack: bucket.pack,
      litre: Boolean(bucket.litre),
      container: containerOf(name, bucket),
      uniquem: Boolean(bucket.uniquem),
      uniquemLabel: bucket.uniquem || "",
      productId: bucket.productId,
      onHand,
      months: bucket.months.map(roundQty),
      total,
      average: roundQty(total / 12),
      forecast30: roundQty(daily30 * 30),
      forecast60: roundQty(daily60 * 60),
      days: cover.days,
      status: cover.status,
    };
    products.push(row);
    if (row.uniquem) matched.push({ name: row.name, pack: row.pack, family: row.uniquemLabel });
  }

  products.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || ((a.days ?? 99999) - (b.days ?? 99999)) || a.name.localeCompare(b.name) || a.pack.localeCompare(b.pack, undefined, { numeric: true }));
  matched.sort((a, b) => a.name.localeCompare(b.name) || a.pack.localeCompare(b.pack, undefined, { numeric: true }));

  const units = products.filter((row) => !row.litre);
  const litres = products.filter((row) => row.litre);
  const count = (rows, status) => rows.filter((row) => row.status === status).length;
  return {
    version: 1,
    generatedAt: input?.generatedAt || now.toISOString(),
    asOf: window.today,
    partial: window.partial,
    months: window.months,
    method: "Days of cover use a 60/40 blend of the last 60 days and the same upcoming dates last year. Under 30 days is order now, 30 to 59 is order soon, 60 to 180 is healthy, and more than 180 is overstock. No usage in the read window is marked on its own.",
    stockDate: input?.stockDate || "",
    stockAsOf: input?.stockAsOf || "",
    chunks: 0,
    summary: {
      reports: Number(input?.reports) || 0,
      wells: Number(input?.wells) || 0,
      lines: Number(input?.lines?.length) || 0,
      productCount: units.length,
      litreCount: litres.length,
      orderNow: count(units, "order"),
      orderSoon: count(units, "soon"),
      healthy: count(units, "ok"),
      overstock: count(units, "over"),
      noUsage: count(units, "idle"),
      uniquem: units.filter((row) => row.uniquem).length,
    },
    products,
    uniquemMatched: matched,
  };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function chunkItems(items, maxBytes) {
  const parts = [];
  let current = [];
  for (const item of items) {
    const next = current.concat(item);
    if (current.length && byteLength({ index: parts.length, products: next }) > maxBytes) {
      parts.push(current);
      current = [item];
    } else current = next;
  }
  if (current.length) parts.push(current);
  return parts;
}

/** Split a result so each Firestore document stays under maxBytes. */
export function packProductUsage(result, maxBytes = 700_000) {
  const full = { ...result, chunks: 0 };
  if (byteLength(full) <= maxBytes) return { header: full, parts: [] };
  const { products, ...header } = result;
  const parts = chunkItems(products || [], maxBytes);
  return {
    header: { ...header, products: [], chunks: parts.length },
    parts: parts.map((productsSlice, index) => ({ index, products: productsSlice })),
  };
}

export function assembleProductUsage(header, parts = []) {
  if (!header?.chunks) return header;
  const ordered = parts.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  return { ...header, chunks: 0, products: ordered.flatMap((part) => part.products || []) };
}
