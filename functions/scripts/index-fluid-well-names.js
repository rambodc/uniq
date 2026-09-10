// CI maintenance: build current name indexes without changing well revisions or timestamps.
import { db } from "../core/firebase.js";
import { nameSearch } from "../apps/fluidlab/search.js";
let cursor = null,
  count = 0;
while (true) {
  let query = db.collection("fluidWells").orderBy("__name__").limit(200);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const doc of page.docs)
    await db.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      if (!current.exists) return;
      const well = current.data(),
        fields = nameSearch(well.name),
        listed = well.status !== "deleting";
      if (
        well.nameNormalized === fields.nameNormalized &&
        JSON.stringify(well.namePrefixes) ===
          JSON.stringify(fields.namePrefixes) &&
        well.listed === listed
      )
        return;
      tx.update(doc.ref, { ...fields, listed });
      count++;
    });
  cursor = page.docs.at(-1);
}
console.log(`Indexed ${count} shared well names.`);
