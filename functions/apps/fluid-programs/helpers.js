import { db } from "../../core/firebase.js";
export const usageRef = (uid, day) => db.collection("users").doc(uid).collection("miniApps").doc("fluid-programs").collection("usage").doc(day);
export const lockIsStale = (value, now = Date.now()) => !value?.toMillis || now - value.toMillis() > 3 * 60 * 1000;
export function recoverStaleMutations(value, count, now = Date.now()) {
  const pending = { ...(value || {}) };
  let recoveredCount = Number.isInteger(count) ? count : 0;
  for (const [id, startedAt] of Object.entries(pending)) if (lockIsStale(startedAt, now)) { delete pending[id]; recoveredCount = Math.max(0, recoveredCount - 1); }
  return { pending, count: recoveredCount };
}
