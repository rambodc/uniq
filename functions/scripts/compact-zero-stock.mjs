/** One-time cleanup: drop zero stock lines, keeping a single zero row when the previous snapshot had quantity.
 * Run from functions/: node scripts/compact-zero-stock.mjs
 * Uses Application Default Credentials. Does not change the Xpress or MIM collectors. */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { compactStockSnapshots } from "../inventoryBot/coverage.js";

initializeApp({ credential: applicationDefault(), projectId: "uniqenergy-de71c" });
const db = getFirestore();
const stock = await db.collection("inventoryBot").doc("main").collection("stock").get();
const snapshots = stock.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const writes = compactStockSnapshots(snapshots);
let batch = db.batch();
let count = 0;
for (const write of writes) {
  batch.update(stock.docs.find((doc) => doc.id === write.id).ref, { items: write.items });
  count += 1;
  if (count % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
if (count % 400 !== 0) await batch.commit();
globalThis.console.log(`Updated ${writes.length} stock snapshot${writes.length === 1 ? "" : "s"}.`);
