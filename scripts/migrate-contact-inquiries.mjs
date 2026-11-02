#!/usr/bin/env node
// One-off, manual contactInquiries migration. Dry-run unless --execute is passed.
// Converts the previous inquiry shape and keeps extra fields (linkedinUrl, areaOfInterest, status, source) on `legacy`.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { convertContactInquiry, needsContactMigration } from "./maintenance/contact-migration.mjs";

const PROJECT = "uniqenergy-de71c";
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run while FIRESTORE_EMULATOR_HOST is set.");
  process.exit(1);
}
const execute = process.argv.includes("--execute");
initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();
const snapshot = await db.collection("contactInquiries").get();
const changes = [];
for (const doc of snapshot.docs) {
  const data = doc.data();
  if (!needsContactMigration(data)) continue;
  const next = convertContactInquiry(data);
  if (next.createdAt == null) next.createdAt = FieldValue.serverTimestamp();
  changes.push({ id: doc.id, next });
}
console.log(`${execute ? "Updating" : "Would update"} ${changes.length} of ${snapshot.size} contactInquiries documents.`);
for (const change of changes) {
  const keys = change.next.legacy ? Object.keys(change.next.legacy).join(",") : "none";
  console.log(`- ${change.id} type=${change.next.inquiryType} archived=${change.next.archived} legacy=${keys}`);
}
if (!execute) {
  console.log("Dry run. Re-run with --execute to write. This script never runs from CI.");
  process.exit(0);
}
for (const change of changes) await db.collection("contactInquiries").doc(change.id).set(change.next);
console.log("Migration finished.");
