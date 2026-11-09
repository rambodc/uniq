/** Publish monthly product usage to inventoryBot/main/meta/productUsage.
 * Run from functions/: node scripts/product-usage.mjs
 * Sundays at 8:00 America/Edmonton. The scheduler lives outside this repo.
 * Uses Application Default Credentials for uniqenergy-de71c, same as inv-xpress.mjs.
 * Idempotent: writing again replaces the result. Add --dry-run to print the summary and skip the write.
 * Reads are targeted and read-only. Daily `used` quantities come from the Firestore copy of
 * mud-man reports (wellsApp well collections, then inventoryBot appWells). The Realtime
 * Database mirror is not opened. App documents are not modified. No AI.
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isTestWell } from "../inventoryBot/copiedReports.js";
import { dayKey } from "../inventoryBot/engine.js";
import { assembleInvXpress } from "../inventoryBot/invXpress.js";
import { buildProductUsage, packProductUsage, reportIdDate, reportInWindow, usageWindow, usedLines, usedLinesFromReport } from "../inventoryBot/productUsage.js";

const dryRun = globalThis.process.argv.includes("--dry-run");
initializeApp({ credential: applicationDefault(), projectId: "uniqenergy-de71c" });
const db = getFirestore();
const root = db.collection("inventoryBot").doc("main");
const window = usageWindow(new Date());

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  if (typeof value === "object") return Object.values(value).filter((row) => row && typeof row === "object");
  return [];
}

async function pool(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function overlaps(well) {
  const last = dayKey(well.lastReportDate || well.lastReport || "");
  return !last || last >= window.readStart;
}

async function usedForReport(reportRef) {
  const dated = reportIdDate(reportRef.id);
  if (dated && !reportInWindow(reportRef.id, window)) return null;
  const usedSnap = await reportRef.collection("inventory").doc("used").get();
  if (usedSnap.exists) {
    const date = dated || dayKey(usedSnap.data()?.reportDay || usedSnap.data()?.date);
    if (!date || date < window.readStart || date > window.readEnd) return null;
    return { date, lines: usedLines(usedSnap.data()) };
  }
  const report = await reportRef.get();
  const data = report.data() || {};
  const date = dated || dayKey(data.reportDay || data.date);
  if (!date || date < window.readStart || date > window.readEnd) return null;
  return { date, lines: usedLinesFromReport(data) };
}

async function readWell(well, wellRef, source, state) {
  const refs = await wellRef.collection("reports").listDocuments();
  const picked = refs.filter((ref) => reportInWindow(ref.id, window));
  await pool(picked, 6, async (reportRef) => {
    const found = await usedForReport(reportRef);
    if (!found) return;
    const signature = `${well.id}/${reportRef.id}`;
    if (state.seen.has(signature)) return;
    const positive = found.lines.filter((line) => line.qty > 0);
    if (!positive.length) return;
    state.seen.add(signature);
    state.reports += 1;
    state.usedWells.add(well.id);
    if (source === "app") state.activeReports += 1;
    else state.olderReports += 1;
    for (const line of positive) {
      state.lines.push({ wellId: well.id, reportId: reportRef.id, date: found.date, name: line.name, unit: line.unit, code: line.code, productId: line.productId, qty: line.qty });
    }
  });
}

async function scanWells(wells, refFor, source, state) {
  const open = wells.filter((well) => well?.id && !isTestWell(well) && overlaps(well));
  state.scanned += open.length;
  await pool(open, 5, async (well) => {
    await readWell(well, refFor(well), source, state);
  });
}

async function olderFromMeta() {
  const meta = await db.collection("wellsApp").doc("main").collection("meta").doc("olderWells").get();
  const wells = asArray(meta.data()?.wells).map((well) => ({ ...well, id: String(well.id || well.wellId || "") })).filter((well) => well.id);
  if (wells.length) return wells;
  const snap = await db.collection("wellsApp").doc("main").collection("olderWells").select("name", "status", "isTest", "lastReportDate", "firstReportDate").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function extraWellGroups() {
  const parent = db.collection("wellsApp").doc("main");
  const groups = [];
  const cols = await parent.listCollections();
  for (const col of cols) {
    if (col.id === "meta" || col.id === "olderWells") continue;
    const sample = await col.limit(1).get();
    if (sample.empty) continue;
    const subs = await sample.docs[0].ref.listCollections();
    if (!subs.some((sub) => sub.id === "reports")) continue;
    const snap = await col.select("name", "status", "isTest", "lastReportDate", "firstReportDate").get();
    groups.push({
      name: col.id,
      wells: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      refFor: (well) => col.doc(well.id),
    });
  }
  return groups;
}

async function loadStock() {
  const ref = root.collection("meta").doc("invXpress");
  const snap = await ref.get();
  if (!snap.exists) return { products: [], stockDate: "", stockAsOf: "" };
  const data = snap.data() || {};
  if (!data.chunks) return { products: data.products || [], stockDate: data.stockDate || "", stockAsOf: data.stockAsOf || "" };
  const parts = await ref.collection("parts").get();
  const assembled = assembleInvXpress(data, parts.docs.map((doc) => doc.data()));
  return { products: assembled.products || [], stockDate: data.stockDate || "", stockAsOf: data.stockAsOf || "" };
}

const state = { seen: new Set(), lines: [], reports: 0, olderReports: 0, activeReports: 0, scanned: 0, usedWells: new Set(), collections: [] };

const [olderWells, extras, appSnap, stock, productSnap, linkSnap] = await Promise.all([
  olderFromMeta(),
  extraWellGroups(),
  root.collection("appWells").select("name", "status", "isTest", "lastReportDate", "firstReportDate").get(),
  loadStock(),
  root.collection("products").get(),
  root.collection("meta").doc("invXpressLinks").get(),
]);

state.collections.push("olderWells");
await scanWells(olderWells, (well) => db.collection("wellsApp").doc("main").collection("olderWells").doc(well.id), "older", state);
for (const group of extras) {
  state.collections.push(group.name);
  await scanWells(group.wells, group.refFor, "older", state);
}
const appWells = appSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
state.collections.push("appWells");
await scanWells(appWells, (well) => root.collection("appWells").doc(well.id), "app", state);

const result = buildProductUsage({
  lines: state.lines,
  products: productSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  links: linkSnap.data() || {},
  stock: stock.products,
  now: new Date(),
  generatedAt: new Date().toISOString(),
  stockDate: stock.stockDate,
  stockAsOf: stock.stockAsOf,
  reports: state.reports,
  wells: state.usedWells.size,
});
result.sources = {
  collections: state.collections,
  scannedWells: state.scanned,
  olderReports: state.olderReports,
  activeReports: state.activeReports,
  readStart: window.readStart,
  readEnd: window.readEnd,
};

const summary = result.summary;
globalThis.console.log(`Window ${window.months[0]} through ${window.months[11]}${window.partial ? " (current month partial)" : ""} · read ${window.readStart} to ${window.readEnd}`);
globalThis.console.log(`Reports ${state.reports} with usage (${state.olderReports} from well history, ${state.activeReports} from active-well copies) · ${state.usedWells.size} wells · ${state.lines.length} used lines · ${state.scanned} wells scanned`);
globalThis.console.log(`Unit products ${summary.productCount} · order now ${summary.orderNow} · order soon ${summary.orderSoon} · healthy ${summary.healthy} · overstock ${summary.overstock} · no usage ${summary.noUsage} · Uniquem ${summary.uniquem} · litre products ${summary.litreCount}`);
if (result.uniquemMatched.length) {
  globalThis.console.log("Uniquem products marked:");
  for (const row of result.uniquemMatched) globalThis.console.log(`  ${row.name} · ${row.pack} · ${row.family}`);
} else globalThis.console.log("Uniquem products marked: none");

if (dryRun) {
  globalThis.console.log("Dry run: nothing written.");
  globalThis.process.exit(0);
}

const packed = packProductUsage(plain(result));
const headerRef = root.collection("meta").doc("productUsage");
const parts = headerRef.collection("parts");
const existing = await parts.get();
const batch = db.batch();
batch.set(headerRef, packed.header);
const keep = new Set(packed.parts.map((part) => String(part.index)));
for (const part of packed.parts) batch.set(parts.doc(String(part.index)), part);
for (const doc of existing.docs) {
  if (!keep.has(doc.id)) batch.delete(doc.ref);
}
await batch.commit();
globalThis.console.log(`Wrote inventoryBot/main/meta/productUsage${packed.parts.length ? ` and ${packed.parts.length} part${packed.parts.length === 1 ? "" : "s"}` : ""}.`);
