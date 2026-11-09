/** Targeted reads of the mud-man mirror. No Firebase import.
 * The mirror is https://uniqenergymirror.firebaseio.com, path data/wellReports/{wellId}/{reportId}/inventory/used.
 * Auth matches the inventory sync: a Bearer token from `gcloud auth print-access-token <account>`.
 * Callers pass a get() that must use shallow=true for well and report lists and must not write.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addDays, reportIdDate, usedLines } from "./productUsage.js";

export const MIRROR_URL = "https://uniqenergymirror.firebaseio.com";
export const MIRROR_WELLS = "data/wellReports";
/** Same account the inventory sync uses. Override with the MIRROR_ACCOUNT env var. */
export const MIRROR_ACCOUNT = "rambodr@uniquem.ca";
/** Well ids are creation timestamps. A well started this many days before the window can still have a report inside it. Older ids are skipped without a report list. */
export const WELL_LEAD_DAYS = 180;

const execFileAsync = promisify(execFile);

const PRICE_KEYS = new Set(["price", "unitPrice", "unitprice", "usedCost", "usedcost"]);

export function mirrorAccount(env = globalThis.process?.env) {
  const override = env?.MIRROR_ACCOUNT;
  const account = override == null || String(override).trim() === "" ? MIRROR_ACCOUNT : String(override).trim();
  return account;
}

/** Bearer token for the mirror. Firestore keeps using ADC; this does not. */
export async function gcloudAccessToken(account, execFileImpl = execFileAsync) {
  let stdout = "";
  try {
    const result = await execFileImpl("gcloud", ["auth", "print-access-token", account]);
    stdout = result?.stdout ?? "";
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : error?.message;
    throw new Error(`gcloud auth print-access-token ${account} failed. ${detail || ""}`.trim());
  }
  const token = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || "";
  if (!token) throw new Error(`gcloud auth print-access-token ${account} returned an empty token.`);
  return token;
}

/** A well id is a creation timestamp. Reports cannot predate it, and a well started long before the window is not listed. Undated ids are kept. */
export function wellOverlapsMirror(wellId, window, leadDays = WELL_LEAD_DAYS) {
  const date = reportIdDate(wellId);
  if (!date) return true;
  if (date > window.readEnd) return false;
  return date >= addDays(window.readStart, -leadDays);
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

/** At most `perSecond` starts, with at most `concurrency` requests in flight. */
export async function pacedPool(items, { concurrency = 8, perSecond = 12 } = {}, fn) {
  if (!items?.length) return;
  const gap = Math.max(1, Math.ceil(1000 / perSecond));
  let cursor = 0;
  let nextStart = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const startAt = nextStart;
      nextStart += gap;
      const wait = startAt - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

/** Shallow-list wells that can overlap the window, then one inventory/used read per in-window report that is not already counted. */
export async function collectMirrorLines({ get, window, seen, seenListed, coverage, pool, pace }) {
  const reads = { wells: 0, reportLists: 0, used: 0, skippedDuplicate: 0, skippedWells: 0 };
  const lines = [];
  const root = await get(MIRROR_WELLS, { shallow: true });
  reads.wells = 1;
  const candidates = Object.keys(root || {}).filter((id) => !/(^|_)test(_|$)/i.test(id));
  const wellIds = candidates.filter((id) => wellOverlapsMirror(id, window));
  reads.skippedWells = candidates.length - wellIds.length;
  const jobs = [];
  const run = pace === false ? pool : (items, _limit, fn) => pacedPool(items, { concurrency: 8, perSecond: 12, ...(pace || {}) }, fn);
  await run(wellIds, 8, async (wellId) => {
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
  await run(jobs, 8, async (job) => {
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
