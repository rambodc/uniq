import { db } from "../core/firebase.js";

const users = await db.collection("users").listDocuments();
const targets = [];
for (const user of users) {
  const projects = await user.collection("miniApps").doc("fluid-programs").collection("projects").listDocuments();
  targets.push(...projects.map((project) => project.path));
}

const confirmed = process.argv.includes("--confirm-permanent-cleanup");
console.log(JSON.stringify({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown", obsoleteFluidProgramsProjects: targets, count: targets.length, usageDocumentsPreserved: true, confirmationRequired: !confirmed }, null, 2));
if (!confirmed) process.exit(0);
if (process.env.ALLOW_FLUID_PROGRAMS_CLEANUP !== "YES_DELETE_OBSOLETE_CONVERSATIONS") throw new Error("Set ALLOW_FLUID_PROGRAMS_CLEANUP=YES_DELETE_OBSOLETE_CONVERSATIONS before confirming cleanup.");
for (const path of targets) await db.recursiveDelete(db.doc(path));
const remaining = [];
for (const user of users) {
  const projects = await user.collection("miniApps").doc("fluid-programs").collection("projects").listDocuments();
  remaining.push(...projects.map((project) => project.path));
}
if (remaining.length) throw new Error(`Cleanup verification failed; ${remaining.length} obsolete projects remain.`);
console.log("Obsolete Fluid Programs project history deleted. Daily usage documents were preserved.");
