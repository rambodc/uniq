import { open, readFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { countDocuments } from "./firestore-export.mjs";

/** Writes the export, reads it back, and refuses to continue unless the document count matches. */
export async function writeVerifiedExport(payload, filePath) {
  if (!payload || typeof payload.documentCount !== "number" || countDocuments(payload) !== payload.documentCount) {
    throw new Error("Firestore export failed before it was written.");
  }
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  const json = JSON.stringify(payload);
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(json, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  let parsed;
  try { parsed = JSON.parse(await readFile(temporary, "utf8")); } catch { throw new Error("Firestore export could not be read back."); }
  if (parsed.documentCount !== payload.documentCount || countDocuments(parsed) !== payload.documentCount) {
    throw new Error("Firestore export verification failed.");
  }
  await rename(temporary, filePath);
  return filePath;
}
