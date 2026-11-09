/** Chemical inventory count for the Inventory Xpress tab. Pure: no Firebase, no network.
 * Warehouse in-stock is committed + available from the latest Xpress stock snapshot.
 * In transit is reported and not counted. Packaging and fees are dropped.
 * Active wells (status starts with "active", including active-pause) are counted per rig group:
 * deliveries + transfers in from outside the group − returns − transfers out of the group.
 * Transfers inside the group cancel, so product used on an older pad well still counts.
 * A negative product line is floored at 0. Pack "1 L" is kept out of the unit total.
 * Names link on an exact normalised match or a manual override. Fuzzy pairs are not linked. */

import { nameNorm, codeNorm } from "./engine.js";
import { isTestWell } from "./copiedReports.js";

const PACKAGING = [
  /\bempty\s+(drums?|totes?|pails?|bags?)\b/i,
  /\bmsds\b/i,
  /\bsds\s+books?\b/i,
  /\bpallets?\b/i,
  /\b(shrink|stretch)\s*wrap\b/i,
  /\bshrinkwraps?\b/i,
  /\bstretchwraps?\b/i,
  /\benviro\s*bags?\b/i,
  /\batp\s*tests?\b/i,
  /\bc\s*-\s*u\b/i,
  /\b(tote|pallet|drum|bag)\s+recycl/i,
  /\brecycl\w*\s+(tote|pallet|drum|bag)/i,
];

const UNIT_WORD = "kg|kgs|g|lb|lbs|l|lt|ltr|litre|liter|litres|liters|ml";

export function isActiveInventoryWell(well) {
  if (!well?.id || isTestWell(well)) return false;
  return String(well.status || "").trim().toLowerCase().startsWith("active");
}

export function isPausedStatus(status) {
  return /pause/i.test(String(status || ""));
}

/** Packaging, empty containers, and fee lines are not chemical inventory. A pack note such as `40/PALLET` is not a pallet. */
export function isPackagingOrFee(name) {
  const text = String(name || "")
    .replace(/[_/]+/g, " ")
    .replace(/\b\d+\s*pallets?\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
  return PACKAGING.some((pattern) => pattern.test(text));
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundQty(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (typeof value === "object") return Object.values(value).filter((row) => row && typeof row === "object");
  return [];
}

function day(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function formatAmount(amount) {
  if (Number.isInteger(amount)) return String(amount);
  return String(Math.round(amount * 1000) / 1000);
}

function familyOf(token) {
  const word = String(token || "").toLowerCase();
  if (["l", "lt", "ltr", "litre", "liter", "litres", "liters"].includes(word)) return "L";
  if (word === "ml") return "mL";
  if (["kg", "kgs"].includes(word)) return "kg";
  if (word === "g") return "g";
  if (["lb", "lbs"].includes(word)) return "lb";
  return "";
}

/** Pack label such as "40 kg" or "1 L". A bare litre unit is one litre. */
export function parsePack(unit, name = "") {
  const source = `${unit || ""} ${name || ""}`;
  const match = source.toLowerCase().replace(/,/g, "").match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORD})\\b`));
  if (match) {
    const amount = Number(match[1]);
    const family = familyOf(match[2]);
    if (amount > 0 && family) {
      return normalizePail({ label: `${formatAmount(amount)} ${family}`, litre: family === "L" && amount === 1, amount, family });
    }
  }
  const bare = String(unit || "").trim().toLowerCase();
  if (["l", "lt", "ltr", "litre", "liter", "litres", "liters"].includes(bare)) return { label: "1 L", litre: true, amount: 1, family: "L" };
  const word = String(unit || "").trim();
  return { label: word || "unit", litre: false, amount: 0, family: "" };
}

/** An Xpress 18 L pail is the same pack as 19 L. The count is still one pail, not 18 litres. */
function normalizePail(pack) {
  if (pack.family === "L" && pack.amount === 18) return { label: "19 L", litre: false, amount: 19, family: "L" };
  return pack;
}

function stripPack(name) {
  return String(name || "")
    .replace(new RegExp(`\\(\\s*\\d[\\d.]*\\s*(?:${UNIT_WORD})\\s*\\)`, "ig"), " ")
    .replace(new RegExp(`\\b\\d[\\d.]*\\s*(?:${UNIT_WORD})\\b`, "ig"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ticketKey(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function rigIdentity(rig) {
  const text = String(rig ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return { name: text.replace(/\s+/g, ""), number: "" };
  return { name: match[1].replace(/\s+/g, ""), number: String(Number(match[2])) };
}

function rigsCompatible(left, right) {
  if (!left.number || left.number !== right.number) return false;
  if (!left.name || !right.name) return true;
  return left.name === right.name;
}

function operatorKey(value) {
  return nameNorm(value || "");
}

/** In stock is committed + available. On hand is the fallback when neither field was written. */
export function stockInHand(item) {
  const committed = num(item?.committed);
  const available = num(item?.available);
  if (committed != null || available != null) return roundQty((committed || 0) + (available || 0));
  return roundQty(num(item?.onHand) || 0);
}

function indexCatalog(products) {
  const byId = new Map();
  const byName = new Map();
  const byCode = new Map();
  for (const product of products || []) {
    if (!product?.id && !product?.name) continue;
    const row = { ...product, id: String(product.id || nameNorm(product.name)) };
    byId.set(row.id, row);
    for (const code of [...(row.xpressCodes || []), ...(row.mimCodes || [])]) {
      const key = codeNorm(code);
      if (key && !byCode.has(key)) byCode.set(key, row);
    }
    for (const label of [row.name, ...(row.appNames || []), ...(row.xpressNames || []), ...(row.mimNames || []), ...(row.aliases || [])]) {
      const key = nameNorm(label);
      if (key && !byName.has(key)) byName.set(key, row);
    }
  }
  return { byId, byName, byCode };
}

function linkIndex(links, catalog) {
  const map = new Map();
  const source = links && typeof links === "object" ? links : {};
  const pairs = [
    ...Object.entries(source.xpress || {}),
    ...Object.entries(source.app || {}),
    ...asArray(source.links).map((row) => [row.name || row.xpressName || row.appName || "", row.productId || row.product || ""]),
  ];
  for (const [raw, target] of pairs) {
    const product = catalog.byId.get(String(target)) || catalog.byName.get(nameNorm(target));
    const key = nameNorm(raw);
    if (key && product) map.set(key, product);
  }
  return map;
}

function resolveProduct(raw, code, productId, catalog, links) {
  const override = links.get(nameNorm(raw));
  if (override) return { product: override, how: "override" };
  if (productId && catalog.byId.get(String(productId))) return { product: catalog.byId.get(String(productId)), how: "id" };
  if (code && catalog.byCode.get(codeNorm(code))) return { product: catalog.byCode.get(codeNorm(code)), how: "code" };
  const named = catalog.byName.get(nameNorm(raw));
  if (named) return { product: named, how: "name" };
  return { product: null, how: "none" };
}

function productKey(resolved, raw, pack) {
  if (resolved.product) return `${resolved.product.id}|${pack.label}`;
  return `name:${nameNorm(stripPack(raw) || raw)}|${pack.label}`;
}

function productLabel(resolved, raw) {
  if (resolved.product) return resolved.product.name || stripPack(raw) || String(raw || "Product");
  return stripPack(raw) || String(raw || "Product");
}

/** Same name, code, and pack resolution Inventory Xpress uses, including 18 L → 19 L. */
export function prepareCatalog(products, links) {
  const catalog = indexCatalog(products);
  return { catalog, links: linkIndex(links || {}, catalog) };
}

export function lineIdentity(prepared, raw, unit = "", code = "", productId = "") {
  const pack = parsePack(unit, raw);
  const resolved = resolveProduct(String(raw || ""), code, productId, prepared.catalog, prepared.links);
  return {
    key: productKey(resolved, raw, pack),
    name: productLabel(resolved, raw),
    pack: pack.label,
    litre: Boolean(pack.litre),
    amount: pack.amount,
    family: pack.family,
    productId: resolved.product?.id || "",
    linked: Boolean(resolved.product),
  };
}

function blankLine() {
  return { delivered: 0, transferredIn: 0, returned: 0, movedOut: 0 };
}

function addQty(bucket, field, qty) {
  bucket[field] = roundQty((bucket[field] || 0) + qty);
}

function lineKind(row, side) {
  const kind = String(row?.kind || "").trim();
  if (kind === "received" || kind === "transferIn" || kind === "returned" || kind === "transferOut") return kind;
  const text = String(row?.description || row?.ticket || row?.rawTicket || "");
  if (/^transfer-to ticket:/i.test(text.replace(/\s+/g, " ").trim())) return "transferIn";
  if (/^transfer-from ticket:/i.test(text.replace(/\s+/g, " ").trim())) return "transferOut";
  if (/-CT-/i.test(text) && side === "received") return "returned";
  return side === "returned" ? "returned" : "received";
}

function flattenReports(reports) {
  const lines = [];
  for (const report of reports || []) {
    const wellId = String(report.wellId || report.well || "");
    if (!wellId) continue;
    for (const side of ["received", "returned"]) {
      asArray(report[side]).forEach((row, index) => {
        const products = asArray(row.products || row.lines).length
          ? asArray(row.products || row.lines)
          : (row.name || row.product ? [row] : []);
        const kind = lineKind(row, side);
        const ticket = ticketKey(row.ticket || row.rawTicket || row.ticketNumber || "");
        const date = day(row.date) || day(report.date);
        products.forEach((product) => {
          const name = product.name || product.product || product.productname || "";
          const qty = Math.abs(num(product.qty ?? product.quantity ?? product.received ?? product.returned) || 0);
          if (!name || qty <= 0 || isPackagingOrFee(name)) return;
          lines.push({
            wellId,
            reportId: String(report.id || ""),
            index,
            kind,
            ticket,
            date,
            name,
            code: product.code || "",
            productId: product.productId || "",
            pack: product.pack || product.unit || product.size || "",
            qty: roundQty(qty),
          });
        });
      });
    }
  }
  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    if (!line.ticket) {
      unique.push(line);
      continue;
    }
    const signature = [line.wellId, line.kind, line.ticket, line.date, nameNorm(line.name), line.pack, line.qty].join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(line);
  }
  return unique;
}

function remainingFrom(report) {
  const direct = asArray(report?.remaining || report?.remainingInventory || report?.remainingInventoryAfterReport);
  if (direct.length) return direct;
  return asArray(report?.inventory?.remaining || report?.inventory?.remainingInventoryAfterReport);
}

function latestStock(stock) {
  const byWarehouse = new Map();
  for (const snap of stock || []) {
    if (String(snap?.source || "xpress").toLowerCase() !== "xpress") continue;
    const code = String(snap.warehouseCode || snap.code || snap.id || "warehouse");
    const date = day(snap.date);
    const prev = byWarehouse.get(code);
    if (!prev || date > prev.date || (date === prev.date && String(snap.collectedAt || "") > String(prev.collectedAt || ""))) {
      byWarehouse.set(code, { ...snap, warehouseCode: code, date });
    }
  }
  return [...byWarehouse.values()];
}

function findParent(parent, id) {
  let node = id;
  while (parent.get(node) !== node) node = parent.get(node);
  let cursor = id;
  while (cursor !== node) {
    const next = parent.get(cursor);
    parent.set(cursor, node);
    cursor = next;
  }
  return node;
}

function datesOf(well, lines) {
  return [day(well.firstReportDate), day(well.lastReportDate), day(well.spudDate), ...lines.map((line) => line.date)].filter(Boolean).sort();
}

function spansOverlap(left, right) {
  if (!left.length || !right.length) return false;
  return left[0] <= right[right.length - 1] && right[0] <= left[left.length - 1];
}

function countedOf(row) {
  return roundQty(Math.max(0, row.delivered + row.transferredIn - row.returned - row.movedOut));
}

/**
 * @param {{ stock?: object[], wells?: object[], reports?: object[], products?: object[], links?: object, computedAt?: string, reportsSyncedAt?: string, syncStatus?: string }} input
 */
export function buildInvXpress(input = {}) {
  const catalog = indexCatalog(input.products);
  const links = linkIndex(input.links, catalog);
  const snapshots = latestStock(input.stock);
  const stockDate = snapshots.map((snap) => snap.date).filter(Boolean).sort().at(-1) || "";
  const stockAsOf = snapshots.map((snap) => snap.collectedAt || "").filter(Boolean).sort().at(-1) || "";

  const warehouses = [];
  const whBuckets = new Map();
  const unlinkedNames = new Map();

  function bucketFor(raw, code, productId, packText) {
    const resolved = resolveProduct(raw, code, productId, catalog, links);
    const pack = parsePack(packText, raw);
    const key = productKey(resolved, raw, pack);
    if (!whBuckets.has(key)) {
      whBuckets.set(key, {
        key,
        name: productLabel(resolved, raw),
        pack: pack.label,
        litre: pack.litre,
        linked: Boolean(resolved.product),
        productId: resolved.product?.id || "",
        link: resolved.how,
        warehouses: 0,
        committed: 0,
        available: 0,
        inTransit: 0,
        xpressNames: new Set(),
        byWarehouse: new Map(),
      });
    }
    return { row: whBuckets.get(key), resolved, pack };
  }

  for (const snap of snapshots) {
    const code = snap.warehouseCode;
    const warehouseName = snap.warehouseName || code;
    if (!warehouses.some((row) => row.code === code)) warehouses.push({ code, name: warehouseName });
    for (const item of asArray(snap.items)) {
      const raw = item.name || item.product || "";
      if (!raw || isPackagingOrFee(raw)) continue;
      const variants = asArray(item.variants).filter((variant) => (num(variant.qty ?? variant.onHand ?? variant.quantity) || 0) !== 0 || (num(variant.inTransit) || 0) !== 0);
      const parentIn = stockInHand(item);
      const variantSum = roundQty(variants.reduce((sum, variant) => sum + (num(variant.qty ?? variant.onHand ?? variant.quantity) || 0), 0));
      const split = variants.length > 0 && parentIn > 0 && Math.abs(variantSum - parentIn) <= Math.max(1, parentIn * 0.01);
      const pieces = split
        ? variants.map((variant) => ({
          name: variant.name || raw,
          code: item.code || "",
          productId: item.productId || "",
          pack: variant.unit || variant.pack || variant.size || "",
          inStock: num(variant.qty ?? variant.onHand ?? variant.quantity) || 0,
          committed: 0,
          inTransit: num(variant.inTransit) || 0,
        }))
        : [{
          name: raw,
          code: item.code || "",
          productId: item.productId || "",
          pack: item.unit || item.pack || item.size || "",
          inStock: parentIn,
          committed: num(item.committed) || 0,
          inTransit: num(item.inTransit ?? item.in_transit) || 0,
        }];
      if (split) {
        const committed = num(item.committed) || 0;
        const transit = num(item.inTransit ?? item.in_transit) || 0;
        if (pieces[0]) {
          pieces[0].committed = committed;
          if (!pieces.some((piece) => piece.inTransit)) pieces[0].inTransit = transit;
        }
      }
      for (const piece of pieces) {
        if (piece.inStock <= 0 && piece.inTransit <= 0 && piece.committed <= 0) continue;
        const { row, resolved } = bucketFor(piece.name, piece.code, piece.productId, piece.pack);
        const inStock = roundQty(Math.max(0, piece.inStock));
        row.warehouses = roundQty(row.warehouses + inStock);
        row.committed = roundQty(row.committed + Math.max(0, piece.committed));
        row.inTransit = roundQty(row.inTransit + Math.max(0, piece.inTransit));
        row.xpressNames.add(String(piece.name).trim());
        const cell = row.byWarehouse.get(code) || { code, name: warehouseName, units: 0 };
        cell.units = roundQty(cell.units + inStock);
        row.byWarehouse.set(code, cell);
        if (!resolved.product) {
          const name = String(piece.name).trim();
          const entry = unlinkedNames.get(name) || { name, pack: row.pack, units: 0 };
          entry.units = roundQty(entry.units + inStock);
          entry.pack = row.pack;
          unlinkedNames.set(name, entry);
        }
      }
    }
  }
  for (const row of whBuckets.values()) row.available = roundQty(Math.max(0, row.warehouses - row.committed));

  const activeWells = (input.wells || []).filter(isActiveInventoryWell);
  const activeIds = new Set(activeWells.map((well) => String(well.id)));
  const lines = flattenReports(input.reports).filter((line) => activeIds.has(line.wellId));
  const linesByWell = new Map(activeWells.map((well) => [String(well.id), []]));
  for (const line of lines) linesByWell.get(line.wellId).push(line);

  const transferOut = new Map();
  const transferIn = new Map();
  for (const line of lines) {
    if (!line.ticket) continue;
    if (line.kind === "transferOut" && !transferOut.has(line.ticket)) transferOut.set(line.ticket, line.wellId);
    if (line.kind === "transferIn" && !transferIn.has(line.ticket)) transferIn.set(line.ticket, line.wellId);
  }
  const edges = [];
  for (const [ticket, source] of transferOut) {
    const dest = transferIn.get(ticket);
    if (dest && dest !== source) edges.push({ source, dest, ticket });
  }

  const groupOfWell = new Map();
  const parent = new Map();
  for (const well of activeWells) {
    const id = String(well.id);
    const identity = rigIdentity(well.rig);
    const groupId = identity.number || identity.name ? `${identity.name}|${identity.number}|${operatorKey(well.operator)}` : `well:${id}`;
    groupOfWell.set(id, groupId);
    parent.set(groupId, groupId);
  }
  function union(left, right) {
    const a = findParent(parent, left);
    const b = findParent(parent, right);
    if (a !== b) parent.set(b, a);
  }
  for (const edge of edges) {
    const leftWell = activeWells.find((well) => String(well.id) === edge.source);
    const rightWell = activeWells.find((well) => String(well.id) === edge.dest);
    const leftId = rigIdentity(leftWell?.rig);
    const rightId = rigIdentity(rightWell?.rig);
    if (!rigsCompatible(leftId, rightId)) continue;
    union(groupOfWell.get(edge.source), groupOfWell.get(edge.dest));
  }

  const splits = [];
  const groupIds = [...new Set([...groupOfWell.values()])];
  for (let i = 0; i < groupIds.length; i += 1) {
    for (let j = i + 1; j < groupIds.length; j += 1) {
      if (findParent(parent, groupIds[i]) === findParent(parent, groupIds[j])) continue;
      const leftWells = activeWells.filter((well) => groupOfWell.get(String(well.id)) === groupIds[i]);
      const rightWells = activeWells.filter((well) => groupOfWell.get(String(well.id)) === groupIds[j]);
      const leftRig = rigIdentity(leftWells[0]?.rig);
      const rightRig = rigIdentity(rightWells[0]?.rig);
      if (!rigsCompatible(leftRig, rightRig)) continue;
      const leftDates = leftWells.flatMap((well) => datesOf(well, linesByWell.get(String(well.id)) || []));
      const rightDates = rightWells.flatMap((well) => datesOf(well, linesByWell.get(String(well.id)) || []));
      if (!spansOverlap(leftDates, rightDates)) continue;
      const operators = [...new Set([...leftWells, ...rightWells].map((well) => well.operator || "Unknown operator"))];
      splits.push({ rig: String(leftWells[0]?.rig || rightWells[0]?.rig || leftRig.number), operators, reason: "Different operators share this rig number on overlapping dates, and no transfer links them." });
    }
  }

  const members = new Map();
  for (const well of activeWells) {
    const root = findParent(parent, groupOfWell.get(String(well.id)));
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(well);
  }

  const wellViews = [];
  const groups = [];
  const wellProductKeys = new Set();

  for (const [root, wells] of members) {
    const ids = new Set(wells.map((well) => String(well.id)));
    const totals = new Map();
    const perWell = new Map();
    for (const well of wells) {
      const own = new Map();
      for (const line of linesByWell.get(String(well.id)) || []) {
        const resolved = resolveProduct(line.name, line.code, line.productId, catalog, links);
        const pack = parsePack(line.pack, line.name);
        const key = productKey(resolved, line.name, pack);
        if (!totals.has(key)) {
          totals.set(key, { key, name: productLabel(resolved, line.name), pack: pack.label, litre: pack.litre, linked: Boolean(resolved.product), productId: resolved.product?.id || "", ...blankLine() });
        }
        if (!own.has(key)) own.set(key, { key, name: productLabel(resolved, line.name), pack: pack.label, litre: pack.litre, ...blankLine(), left: null });
        const row = totals.get(key);
        const mine = own.get(key);
        if (line.kind === "received") {
          addQty(row, "delivered", line.qty);
          addQty(mine, "delivered", line.qty);
        } else if (line.kind === "returned") {
          addQty(row, "returned", line.qty);
          addQty(mine, "returned", line.qty);
        } else if (line.kind === "transferIn") {
          const source = line.ticket ? transferOut.get(line.ticket) : "";
          if (!source || !ids.has(source)) {
            addQty(row, "transferredIn", line.qty);
            addQty(mine, "transferredIn", line.qty);
          }
        } else if (line.kind === "transferOut") {
          const dest = line.ticket ? transferIn.get(line.ticket) : "";
          if (!dest || !ids.has(dest)) {
            addQty(row, "movedOut", line.qty);
            addQty(mine, "movedOut", line.qty);
          }
        }
      }
      perWell.set(String(well.id), own);
    }

    const movement = new Map();
    for (const well of wells) {
      const outs = [];
      const ins = [];
      let lastDel = "";
      for (const line of linesByWell.get(String(well.id)) || []) {
        if (line.kind === "received" && line.date > lastDel) lastDel = line.date;
        if (line.kind === "transferOut" && line.ticket && ids.has(transferIn.get(line.ticket) || "")) outs.push({ date: line.date, to: transferIn.get(line.ticket) });
        if (line.kind === "transferIn" && line.ticket && ids.has(transferOut.get(line.ticket) || "")) ins.push(line.date);
      }
      const lastOut = outs.filter((row) => row.date).sort((a, b) => a.date.localeCompare(b.date)).at(-1) || null;
      const lastIn = ins.filter(Boolean).sort().at(-1) || "";
      const lastActivity = [day(well.lastReportDate), ...((linesByWell.get(String(well.id)) || []).map((line) => line.date))].filter(Boolean).sort().at(-1) || "";
      const first = day(well.firstReportDate) || day(well.spudDate) || (linesByWell.get(String(well.id)) || []).map((line) => line.date).filter(Boolean).sort()[0] || "";
      movement.set(String(well.id), { lastOut, lastIn, lastDel, lastActivity, first, lines: (linesByWell.get(String(well.id)) || []).length });
    }

    const stamp = (move) => [move.lastActivity, move.first].filter(Boolean).sort().at(-1) || "";
    const current = [...wells].sort((a, b) => {
      const left = movement.get(String(a.id));
      const right = movement.get(String(b.id));
      return stamp(right).localeCompare(stamp(left)) || (right.first || "").localeCompare(left.first || "") || String(a.name || "").localeCompare(String(b.name || ""));
    })[0];
    const currentId = String(current.id);

    const reportsByWell = new Map();
    for (const report of input.reports || []) {
      const wellId = String(report.wellId || "");
      if (!ids.has(wellId)) continue;
      if (!reportsByWell.has(wellId)) reportsByWell.set(wellId, []);
      reportsByWell.get(wellId).push(report);
    }
    function leftOn(wellId, key, name, packLabel) {
      const reports = (reportsByWell.get(wellId) || []).slice().sort((a, b) => day(b.date).localeCompare(day(a.date)) || String(b.id).localeCompare(String(a.id)));
      for (const report of reports) {
        const rows = remainingFrom(report);
        if (!rows.length) continue;
        let found = false;
        let qty = 0;
        for (const row of rows) {
          const rowName = row.name || row.product || row.productname || "";
          if (!rowName || isPackagingOrFee(rowName)) continue;
          const resolved = resolveProduct(rowName, row.code || "", row.productId || "", catalog, links);
          const pack = parsePack(row.unit || row.pack || row.size || "", rowName);
          const rowKey = productKey(resolved, rowName, pack);
          if (rowKey === key || (nameNorm(productLabel(resolved, rowName)) === nameNorm(name) && pack.label === packLabel)) {
            found = true;
            qty = roundQty(qty + Math.max(0, num(row.qty ?? row.quantity ?? row.remaining) || 0));
          }
        }
        return found ? qty : null;
      }
      return null;
    }

    const finished = new Map();
    for (const well of wells) {
      const id = String(well.id);
      if (id === currentId) continue;
      const move = movement.get(id);
      if (!move.lines && !move.lastActivity && !move.first) continue;
      if (move.lastOut && (!move.lastIn || move.lastOut.date >= move.lastIn) && move.lastDel <= move.lastOut.date) {
        const dest = wells.find((item) => String(item.id) === move.lastOut.to);
        finished.set(id, { reason: `Product moved to ${dest?.name || "the next well"} on ${move.lastOut.date}` });
        continue;
      }
      if (!move.lastActivity) continue;
      const newer = wells.filter((item) => {
        if (String(item.id) === id) return false;
        const start = movement.get(String(item.id)).first;
        return start && start > move.lastActivity;
      });
      if (newer.length) {
        const target = newer.some((item) => String(item.id) === currentId)
          ? current
          : newer.slice().sort((a, b) => movement.get(String(a.id)).first.localeCompare(movement.get(String(b.id)).first))[0];
        const when = movement.get(String(target.id)).first;
        finished.set(id, { reason: `Rig moved to ${target.name} on ${when}` });
      }
    }

    const groupProducts = [...totals.values()].map((row) => {
      const counted = countedOf(row);
      const left = leftOn(currentId, row.key, row.name, row.pack);
      return { ...row, counted, left };
    }).filter((row) => row.delivered || row.transferredIn || row.returned || row.movedOut || row.counted);
    for (const row of groupProducts) wellProductKeys.add(row.key);

    const sum = (pick) => roundQty(groupProducts.filter((row) => !row.litre).reduce((total, row) => total + pick(row), 0));
    const group = {
      id: root,
      rig: String(current.rig ?? ""),
      operator: [...new Set(wells.map((well) => well.operator || "").filter(Boolean))].join(" / "),
      currentWellId: currentId,
      wellIds: wells.map((well) => String(well.id)),
      delivered: sum((row) => row.delivered),
      transferredIn: sum((row) => row.transferredIn),
      returned: sum((row) => row.returned),
      movedOut: sum((row) => row.movedOut),
      counted: sum((row) => row.counted),
    };
    groups.push(group);

    for (const well of wells) {
      const id = String(well.id);
      const move = movement.get(id);
      const role = id === currentId ? "current" : finished.has(id) ? "finished" : "alongside";
      const own = [...(perWell.get(id) || new Map()).values()].map((row) => ({ ...row, counted: countedOf(row), left: leftOn(id, row.key, row.name, row.pack) }));
      const products = role === "current"
        ? groupProducts.map((row) => ({ key: row.key, name: row.name, pack: row.pack, litre: row.litre, linked: row.linked, productId: row.productId, delivered: row.delivered, transferredIn: row.transferredIn, returned: row.returned, movedOut: row.movedOut, counted: row.counted, left: row.left }))
        : own;
      const unitRows = products.filter((row) => !row.litre);
      wellViews.push({
        id,
        name: well.name || id,
        rig: String(well.rig ?? ""),
        operator: well.operator || "",
        status: well.status || "",
        paused: isPausedStatus(well.status),
        firstReport: move.first,
        lastReport: day(well.lastReportDate) || move.lastActivity,
        noReports: !move.lines,
        role,
        groupId: root,
        reason: finished.get(id)?.reason || "",
        includedIn: role === "current" ? "" : current.name || currentId,
        alongside: role === "current" ? wells.filter((item) => !finished.has(String(item.id)) && String(item.id) !== id).map((item) => item.name || String(item.id)) : [],
        delivered: roundQty(unitRows.reduce((total, row) => total + row.delivered, 0)),
        transferredIn: roundQty(unitRows.reduce((total, row) => total + row.transferredIn, 0)),
        returned: roundQty(unitRows.reduce((total, row) => total + row.returned, 0)),
        movedOut: roundQty(unitRows.reduce((total, row) => total + row.movedOut, 0)),
        counted: role === "current" ? group.counted : 0,
        sentIn: roundQty(unitRows.reduce((total, row) => total + row.delivered + row.transferredIn, 0)),
        productCount: unitRows.filter((row) => row.counted || row.delivered || row.transferredIn).length,
        products,
      });
    }
  }

  const products = [];
  const keys = new Set([...whBuckets.keys(), ...wellProductKeys]);
  for (const key of keys) {
    const wh = whBuckets.get(key);
    const atWells = [];
    let wellUnits = 0;
    for (const group of groups) {
      const current = wellViews.find((well) => well.id === group.currentWellId);
      const row = current?.products.find((item) => item.key === key);
      if (!row || row.counted <= 0) continue;
      wellUnits = roundQty(wellUnits + row.counted);
      atWells.push({ id: current.id, name: current.name, rig: current.rig, units: row.counted });
    }
    const seed = wh || {};
    const sample = wellViews.flatMap((well) => well.products).find((row) => row.key === key);
    const litre = Boolean(seed.litre || sample?.litre);
    const warehousesUnits = seed.warehouses || 0;
    if (warehousesUnits <= 0 && wellUnits <= 0 && !(seed.inTransit > 0)) continue;
    products.push({
      key,
      name: seed.name || sample?.name || key,
      pack: seed.pack || sample?.pack || "unit",
      litre,
      linked: seed.linked !== undefined ? seed.linked : Boolean(sample && !key.startsWith("name:")),
      link: seed.link || (key.startsWith("name:") ? "none" : "name"),
      productId: seed.productId || sample?.productId || "",
      warehouses: warehousesUnits,
      wells: wellUnits,
      total: roundQty(warehousesUnits + wellUnits),
      committed: seed.committed || 0,
      available: seed.available || 0,
      inTransit: seed.inTransit || 0,
      xpressNames: [...(seed.xpressNames || [])].sort(),
      byWarehouse: [...(seed.byWarehouse?.values() || [])].sort((a, b) => b.units - a.units),
      byWell: atWells.sort((a, b) => b.units - a.units),
    });
  }
  products.sort((a, b) => Number(a.litre) - Number(b.litre) || b.total - a.total || a.name.localeCompare(b.name));

  const units = products.filter((row) => !row.litre);
  const litres = products.filter((row) => row.litre);
  const sumBy = (rows, field) => roundQty(rows.reduce((total, row) => total + (row[field] || 0), 0));
  const paused = activeWells.filter((well) => isPausedStatus(well.status)).length;
  const summary = {
    warehouses: {
      units: sumBy(units, "warehouses"),
      committed: sumBy(units, "committed"),
      available: sumBy(units, "available"),
      inTransit: sumBy(units, "inTransit"),
      productCount: units.filter((row) => row.warehouses > 0).length,
      warehouseCount: warehouses.length,
    },
    wells: {
      units: sumBy(units, "wells"),
      delivered: roundQty(groups.reduce((total, group) => total + group.delivered, 0)),
      transferredIn: roundQty(groups.reduce((total, group) => total + group.transferredIn, 0)),
      returned: roundQty(groups.reduce((total, group) => total + group.returned, 0)),
      movedOut: roundQty(groups.reduce((total, group) => total + group.movedOut, 0)),
      productCount: units.filter((row) => row.wells > 0).length,
      wellCount: activeWells.length,
      active: activeWells.length - paused,
      paused,
      groups: groups.length,
      finished: wellViews.filter((well) => well.role === "finished").length,
      noReports: wellViews.filter((well) => well.noReports).length,
    },
    total: {
      units: roundQty(sumBy(units, "warehouses") + sumBy(units, "wells")),
      productCount: units.filter((row) => row.warehouses + row.wells > 0).length,
    },
    litres: {
      warehouseUnits: sumBy(litres, "warehouses"),
      wellUnits: sumBy(litres, "wells"),
      total: roundQty(sumBy(litres, "warehouses") + sumBy(litres, "wells")),
      productCount: litres.filter((row) => row.warehouses + row.wells > 0).length,
    },
  };

  wellViews.sort((a, b) => b.counted - a.counted || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  groups.sort((a, b) => b.counted - a.counted || a.rig.localeCompare(b.rig));

  return {
    version: 1,
    computedAt: input.computedAt || "",
    stockDate,
    stockAsOf,
    reportsSyncedAt: input.reportsSyncedAt || "",
    syncStatus: input.syncStatus || "",
    chunks: 0,
    summary,
    warehouses,
    products,
    groups,
    wells: wellViews,
    unlinked: [...unlinkedNames.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)),
    splits,
  };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function chunkItems(items, field, maxBytes) {
  const parts = [];
  let current = [];
  for (const item of items) {
    const next = current.concat(item);
    if (current.length && byteLength({ index: parts.length, [field]: next }) > maxBytes) {
      parts.push(current);
      current = [item];
    } else {
      current = next;
    }
  }
  if (current.length) parts.push(current);
  return parts;
}

/** Split a result so each Firestore document stays under maxBytes. One megabyte is the hard limit. */
export function packInvXpress(result, maxBytes = 700_000) {
  const full = { ...result, chunks: 0 };
  if (byteLength(full) <= maxBytes) return { header: full, parts: [] };
  const { products, wells, groups, ...header } = result;
  const parts = [];
  for (const slice of chunkItems(products || [], "products", maxBytes)) parts.push({ products: slice, wells: [], groups: [] });
  for (const slice of chunkItems(wells || [], "wells", maxBytes)) parts.push({ products: [], wells: slice, groups: [] });
  for (const slice of chunkItems(groups || [], "groups", maxBytes)) parts.push({ products: [], wells: [], groups: slice });
  return {
    header: { ...header, products: [], wells: [], groups: [], chunks: parts.length },
    parts: parts.map((part, index) => ({ index, ...part })),
  };
}

export function assembleInvXpress(header, parts = []) {
  if (!header?.chunks) return header;
  const ordered = parts.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  return {
    ...header,
    chunks: 0,
    products: ordered.flatMap((part) => part.products || []),
    wells: ordered.flatMap((part) => part.wells || []),
    groups: ordered.flatMap((part) => part.groups || []),
  };
}
