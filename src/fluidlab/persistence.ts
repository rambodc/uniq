import type { WellDesign } from "./model";

const DB_NAME = "uniqenergy-fluidlab";
const STORE = "workspace";
export const GUEST_DRAFT_KEY = "guest-draft";
export const PENDING_SAVE_KEY = "pending-save";

export interface LocalDraft { design: WellDesign; updatedAt: string }

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function localGet<T>(key: string): Promise<T | null> {
  const db = await database();
  return new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}
export async function localSet<T>(key: string, value: T) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}
export async function localDelete(key: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}
