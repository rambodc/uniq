import { HttpsError } from "firebase-functions/v2/https";
import { iso, docId } from "./values.js";

export const projectCollection = (uid, appId) => import("./firebase.js").then(({ db }) => db.collection("users").doc(uid).collection("miniApps").doc(appId).collection("projects"));
export function publicProject(snapshot, type, includeData = true) { const data = snapshot.data(); return { id: snapshot.id, type, schemaVersion: 1, name: data.name, ...(includeData ? { data: data.currentData } : {}), revision: data.revision, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt) }; }
export async function ownedProject(uid, appId, id) { const collection = await projectCollection(uid, appId), ref = collection.doc(docId(id, "project")), snap = await ref.get(); if (!snap.exists || snap.data()?.owner !== uid || snap.data()?.schemaVersion !== 1) throw new HttpsError("not-found", "Project not found."); return { ref, snap }; }
