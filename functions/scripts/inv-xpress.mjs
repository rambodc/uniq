/** Publish the Inventory Xpress count to inventoryBot/main/meta/invXpress.
 * Run from functions/: node scripts/inv-xpress.mjs
 * Uses Application Default Credentials for uniqenergy-de71c, same as the other box scripts.
 * Idempotent: writing again replaces the result. Add --dry-run to print the summary and skip the write.
 * No mirror reads and no AI. MIM stock is ignored. */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildInvXpress, isActiveInventoryWell, packInvXpress } from "../inventoryBot/invXpress.js";

const dryRun = globalThis.process.argv.includes("--dry-run");
initializeApp({ credential: applicationDefault(), projectId: "uniqenergy-de71c" });
const db = getFirestore();
const root = db.collection("inventoryBot").doc("main");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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

const [stockSnap, wellSnap, productSnap, linkSnap, syncSnap] = await Promise.all([
  root.collection("stock").get(),
  root.collection("appWells").get(),
  root.collection("products").get(),
  root.collection("meta").doc("invXpressLinks").get(),
  root.collection("meta").doc("appReportSync").get(),
]);

const wells = wellSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const active = wells.filter(isActiveInventoryWell);
const reports = [];
await pool(active, 8, async (well) => {
  const snap = await root.collection("appWells").doc(well.id).collection("reports").get();
  for (const doc of snap.docs) reports.push({ id: doc.id, wellId: well.id, ...doc.data() });
});

const sync = syncSnap.data() || {};
const result = buildInvXpress({
  stock: stockSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  wells,
  reports,
  products: productSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  links: linkSnap.data() || {},
  computedAt: new Date().toISOString(),
  reportsSyncedAt: sync.syncedAt || sync.finishedAt || sync.updatedAt || sync.at || "",
  syncStatus: sync.status || "",
});

const packed = packInvXpress(plain(result));
const summary = result.summary;
globalThis.console.log(`Stock ${result.stockDate || "n/a"} · ${summary.warehouses.warehouseCount} warehouses · ${summary.warehouses.units} units in stock · ${summary.warehouses.committed} committed · ${summary.warehouses.inTransit} in transit`);
globalThis.console.log(`Wells ${summary.wells.wellCount} (${summary.wells.active} active, ${summary.wells.paused} paused) · ${summary.wells.groups} rig groups · ${summary.wells.finished} likely finished · ${summary.wells.noReports} with no reports · ${summary.wells.units} units`);
globalThis.console.log(`Total ${summary.total.units} units · ${summary.total.productCount} products · litre products ${summary.litres.total} · ${result.unlinked.length} Xpress names not linked`);
if (result.splits.length) globalThis.console.log(`Kept ${result.splits.length} rig number${result.splits.length === 1 ? "" : "s"} split across operators.`);

if (dryRun) {
  globalThis.console.log("Dry run: nothing written.");
  globalThis.process.exit(0);
}

const headerRef = root.collection("meta").doc("invXpress");
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
globalThis.console.log(`Wrote inventoryBot/main/meta/invXpress${packed.parts.length ? ` and ${packed.parts.length} part${packed.parts.length === 1 ? "" : "s"}` : ""}.`);
