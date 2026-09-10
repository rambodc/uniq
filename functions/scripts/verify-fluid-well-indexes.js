// Read-only production verification after the Rules workflow deploys indexes.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../core/firebase.js";
import { searchWells } from "../apps/fluidlab/search.js";
const config = JSON.parse(await readFile(new URL("../../firestore.indexes.json", import.meta.url), "utf8"));
const wanted = config.indexes.filter(i => i.collectionGroup === "fluidWells");
const fields = (i) => JSON.stringify(i.fields.filter(f => f.fieldPath !== "__name__"));
for (let attempt = 0; ; attempt++) {
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const response = await fetch("https://firestore.googleapis.com/v1/projects/uniqenergy-de71c/databases/(default)/collectionGroups/-/indexes?pageSize=1000", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Index verification failed: ${response.status}`);
  const { indexes = [] } = await response.json();
  if (wanted.every(w => indexes.some(i => i.name.includes("/collectionGroups/fluidWells/") && i.queryScope === w.queryScope && fields(i) === fields(w) && i.state === "READY"))) break;
  if (attempt >= 40) throw new Error("Fluid Labs search indexes did not become ready; hold Hosting.");
  console.log("Waiting for both Fluid Labs search indexes to become READY…");
  await delay(30000);
}
const collection = db.collection("fluidWells");
const first = await searchWells(collection);
if (first.cursor) await searchWells(collection, { cursor: first.cursor });
await searchWells(collection, { search: first.wells[0]?.name?.slice(0, 3) || "index-check" });
console.log("Listing, available pagination, and prefix search queries verified against production. No data changed.");
