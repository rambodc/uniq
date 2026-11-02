function isTimestamp(value) {
  return Boolean(value && typeof value === "object" && typeof value.toDate === "function" && typeof value.seconds === "number" && typeof value.nanoseconds === "number");
}

/** Turns Firestore values into JSON, keeping timestamps, bytes, geopoints and references. */
export function serializeValue(value) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (isTimestamp(value)) return { __type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value?.constructor?.name === "GeoPoint" && typeof value.latitude === "number") return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  if (typeof value?.path === "string" && value?.constructor?.name === "DocumentReference") return { __type: "reference", path: value.path };
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return { __type: "bytes", base64: value.toString("base64") };
  if (value instanceof Uint8Array) return { __type: "bytes", base64: Buffer.from(value).toString("base64") };
  if (value instanceof Date) return { __type: "date", iso: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = serializeValue(item);
    return out;
  }
  return String(value);
}

export function countDocuments(payload) {
  let count = 0;
  const walk = (docs) => {
    for (const doc of Object.values(docs || {})) {
      count += 1;
      for (const sub of Object.values(doc.subcollections || {})) walk(sub);
    }
  };
  for (const collection of Object.values(payload?.collections || {})) walk(collection);
  return count;
}

/** Reads every document in every collection and subcollection. */
export async function exportDatabase(db, projectId = "uniqenergy-de71c") {
  let documentCount = 0;
  async function walk(collection) {
    const snap = await collection.get();
    const docs = {};
    for (const doc of snap.docs) {
      documentCount += 1;
      const subcollections = {};
      for (const sub of await doc.ref.listCollections()) subcollections[sub.id] = await walk(sub);
      docs[doc.id] = { path: doc.ref.path, data: serializeValue(doc.data()), subcollections };
    }
    return docs;
  }
  const collections = {};
  for (const collection of await db.listCollections()) collections[collection.id] = await walk(collection);
  return { exportedAt: new Date().toISOString(), projectId, documentCount, collections };
}
