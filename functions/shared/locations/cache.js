import { db } from "../../core/firebase.js";
import { lookupGrid, GRID_VERSION } from "./grid.js";
export async function cachedGeometry(parsed) {
  const ref = db.doc(`lsdGridCache/${GRID_VERSION}-${parsed.canonical}`),
    snap = await ref.get();
  if (snap.exists) {
    const g = snap.data();
    return { ...g, boundary: JSON.parse(g.boundary) };
  }
  const result = await lookupGrid(parsed);
  await ref.set({ ...result, boundary: JSON.stringify(result.boundary) });
  return result;
}
