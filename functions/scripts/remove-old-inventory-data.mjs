/** One-time removal of Inventory Bot data the Xpress tab does not use.
 * Lists every targeted collection and its document count, then deletes only with --yes.
 * Keeps tickets, stock, products, and the new xpressCards / placements / appWells / meta docs.
 * Run from functions/: node scripts/remove-old-inventory-data.mjs
 *                       node scripts/remove-old-inventory-data.mjs --yes
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault(), projectId: "uniqenergy-de71c" });
const db = getFirestore();
const root = db.collection("inventoryBot").doc("main");
const drop = ["wells", "appTickets", "issues", "rigInventory", "ticketStatus", "reviewItems", "flags", "chats"];
const yes = globalThis.process.argv.includes("--yes");

async function countCollection(collection) {
  const snap = await collection.count().get();
  return snap.data().count;
}

const rows = [];
for (const name of drop) rows.push({ name: `inventoryBot/main/${name}`, count: await countCollection(root.collection(name)) });
const testCount = await countCollection(db.collection("inventoryBotTest"));
rows.push({ name: "inventoryBotTest", count: testCount });
const runSnap = await root.collection("runs").select("summary").get();
const runsWithSummary = runSnap.docs.filter((doc) => doc.get("summary") != null).length;
rows.push({ name: "inventoryBot/main/runs (summary field only)", count: runsWithSummary });

globalThis.console.log(yes ? "Deleting:" : "Would delete (pass --yes to delete):");
for (const row of rows) globalThis.console.log(`${row.count}\t${row.name}`);

if (!yes) globalThis.process.exit(0);

async function deleteDocs(collection) {
  const snap = await collection.get();
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const messages = await doc.ref.collection("messages").get().catch(() => null);
    if (messages) {
      for (const message of messages.docs) {
        batch.delete(message.ref);
        pending += 1;
        if (pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
    }
    batch.delete(doc.ref);
    pending += 1;
    if (pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  return snap.size;
}

for (const name of drop) {
  const removed = await deleteDocs(root.collection(name));
  globalThis.console.log(`Removed ${removed} from inventoryBot/main/${name}.`);
}
const tests = await deleteDocs(db.collection("inventoryBotTest"));
globalThis.console.log(`Removed ${tests} from inventoryBotTest.`);
let cleared = 0;
let batch = db.batch();
for (const doc of runSnap.docs) {
  if (doc.get("summary") == null && doc.get("checkedAt") == null) continue;
  batch.update(doc.ref, { summary: FieldValue.delete(), checkedAt: FieldValue.delete() });
  cleared += 1;
  if (cleared % 400 === 0) { await batch.commit(); batch = db.batch(); }
}
if (cleared % 400 !== 0) await batch.commit();
globalThis.console.log(`Cleared the summary on ${cleared} run document${cleared === 1 ? "" : "s"}.`);
