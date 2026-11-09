/** Targeted reads of the mud-man mirror. No Firebase import.
 * The mirror is https://uniqenergymirror.firebaseio.com, path data/wellReports/{wellId}/{reportId}/inventory/used.
 * Callers pass a get() that must use shallow=true for well and report lists and must not write.
 */

import { reportIdDate, usedLines } from "./productUsage.js";

export const MIRROR_URL = "https://uniqenergymirror.firebaseio.com";
export const MIRROR_WELLS = "data/wellReports";

const PRICE_KEYS = new Set(["price", "unitPrice", "unitprice", "usedCost", "usedcost"]);

/** A well id dated after the window cannot have a report inside it. Undated ids are kept. */
export function wellOverlapsMirror(wellId, window) {
  const date = reportIdDate(wellId);
  if (!date) return true;
  return date <= window.readEnd;
}

/** Copy the used node and drop price fields before anything else sees them. */
export function stripPrices(value) {
  if (Array.isArray(value)) return value.map((item) => stripPrices(item));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) {
    if (PRICE_KEYS.has(key)) continue;
    copy[key] = child && typeof child === "object" ? stripPrices(child) : child;
  }
  return copy;
}

export function encodePath(segment) {
  return encodeURIComponent(String(segment || ""));
}

export function createCoverage(months) {
  const rows = new Map((months || []).map((month) => [month, { month, listed: 0, reports: 0, wells: new Set() }]));
  let earliest = "";
  return {
    noteEarliest(date) {
      const month = String(date || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month) && (!earliest || month < earliest)) earliest = month;
    },
    noteListed(date) {
      const month = String(date || "").slice(0, 7);
      const row = rows.get(month);
      if (row) row.listed += 1;
      this.noteEarliest(date);
    },
    noteUsed(date, wellId) {
      const month = String(date || "").slice(0, 7);
      const row = rows.get(month);
      if (row) {
        row.reports += 1;
        row.wells.add(String(wellId || ""));
      }
      this.noteEarliest(date);
    },
    historyStart() {
      return earliest;
    },
    snapshot() {
      return [...rows.values()].map((row) => ({ month: row.month, listed: row.listed, reports: row.reports, wells: row.wells.size }));
    },
  };
}

/** Shallow-list every well, then one inventory/used read per in-window report that is not already counted. */
export async function collectMirrorLines({ get, window, seen, seenListed, coverage, pool }) {
  const reads = { wells: 0, reportLists: 0, used: 0, skippedDuplicate: 0 };
  const lines = [];
  const root = await get(MIRROR_WELLS, { shallow: true });
  reads.wells = 1;
  const wellIds = Object.keys(root || {}).filter((id) => wellOverlapsMirror(id, window) && !/(^|_)test(_|$)/i.test(id));
  const jobs = [];
  await pool(wellIds, 12, async (wellId) => {
    const reports = await get(`${MIRROR_WELLS}/${encodePath(wellId)}`, { shallow: true });
    reads.reportLists += 1;
    for (const reportId of Object.keys(reports || {})) {
      const date = reportIdDate(reportId);
      if (!date) continue;
      if (date < window.readStart || date > window.readEnd) {
        coverage.noteEarliest(date);
        continue;
      }
      const signature = `${wellId}/${reportId}`;
      if (!seenListed.has(signature)) {
        seenListed.add(signature);
        coverage.noteListed(date);
      }
      if (seen.has(signature)) {
        reads.skippedDuplicate += 1;
        continue;
      }
      jobs.push({ wellId, reportId, date });
    }
  });
  await pool(jobs, 16, async (job) => {
    const signature = `${job.wellId}/${job.reportId}`;
    if (seen.has(signature)) {
      reads.skippedDuplicate += 1;
      return;
    }
    const raw = await get(`${MIRROR_WELLS}/${encodePath(job.wellId)}/${encodePath(job.reportId)}/inventory/used`);
    reads.used += 1;
    const priced = raw && typeof raw === "object" ? raw : null;
    const positive = usedLines(stripPrices(priced)).filter((line) => line.qty > 0);
    if (!positive.length || seen.has(signature)) return;
    seen.add(signature);
    coverage.noteUsed(job.date, job.wellId);
    for (const line of positive) {
      lines.push({ wellId: job.wellId, reportId: job.reportId, date: job.date, name: line.name, unit: line.unit, code: line.code, productId: line.productId, qty: line.qty });
    }
  });
  return { lines, reads, wells: wellIds.length };
}
