import { db } from "../../core/firebase.js";
export const usageRef = (uid, day) => db.collection("users").doc(uid).collection("miniApps").doc("fluid-programs").collection("usage").doc(day);
export const lockIsStale = (value, now = Date.now()) => !value?.toMillis || now - value.toMillis() > 3 * 60 * 1000;
