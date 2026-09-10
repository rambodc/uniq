// Temporary production reset, invoked only by the authorized GitHub Actions rollout.
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { db, storage } from "../core/firebase.js";
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("CI only");
const project = "uniqenergy-de71c",
  region = "us-central1";
const marker = storage.bucket().file("_maintenance/fluid-app-reset.json");
const mode = process.argv[2] || "reset";
const token = () =>
  execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
  }).trim();
async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(
      `${method} ${url}: ${response.status} ${await response.text()}`,
    );
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
const queue = `https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${region}/queues/processFluidImport`;
const functionList = await api(
  `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${region}/functions?pageSize=1000`,
);
const retired = new Set([
  "beginWellUpload",
  "completeWellUpload",
  "listSavedWells",
  "getSavedWell",
  "renameSavedWell",
  "deleteSavedWell",
]);
const targets = functionList.functions.filter((f) => {
  const name = f.name.split("/").at(-1);
  return (
    (name.includes("Fluid") &&
      !["processFluidImport", "cleanupFluidImports"].includes(name)) ||
    retired.has(name)
  );
});
async function publicAccess(enabled) {
  for (const f of targets) {
    const url = `https://run.googleapis.com/v2/${f.serviceConfig.service}`;
    const policy = await api(`${url}:getIamPolicy`);
    policy.bindings ||= [];
    for (const b of policy.bindings)
      if (b.role === "roles/run.invoker" && !b.condition)
        b.members = b.members.filter((m) => m !== "allUsers");
    policy.bindings = policy.bindings.filter((b) => b.members.length);
    if (enabled)
      policy.bindings.push({
        role: "roles/run.invoker",
        members: ["allUsers"],
      });
    await api(`${url}:setIamPolicy`, "POST", { policy });
  }
}
if (mode === "finish") {
  await marker.delete({ ignoreNotFound: true });
  console.log("Temporary reset marker removed.");
} else if (mode === "open") {
  await publicAccess(true);
  await api(`${queue}:resume`, "POST", {});
  console.log("Fluid Labs callable access and queue restored.");
} else {
  if ((await marker.exists())[0]) {
    console.log("Reset already verified; preserving newly created data.");
    process.exit(0);
  }
  await publicAccess(false);
  await api(`${queue}:pause`, "POST", {});
  console.log("App access blocked; allowing the 300-second callable deadline to drain.");
  await delay(310000);
  // Revoke every outstanding byte reservation before cleanup.
  for (const s of (await db.collection("fluidImports").get()).docs)
    if (s.data().status === "uploading")
      await s.ref.update({ status: "cancelled" });
  for (const s of (await db.collectionGroup("pasonUploads").get()).docs)
    if (/^fluidWells\/[^/]+\/pasonUploads\/[^/]+$/.test(s.ref.path))
      await s.ref.update({ status: "cancelled" });
  const users = await db.collection("users").listDocuments();
  for (const u of users)
    for (const w of (
      await u
        .collection("miniApps")
        .doc("well-viewer")
        .collection("wells")
        .get()
    ).docs)
      await w.ref.update({ status: "deleting" });
  for (let i = 0; ; i++) {
    const q = await api(
      `${queue.replace("/v2/", "/v2beta3/")}?readMask=name,state,stats`,
    );
    if (!q.stats)
      throw new Error(
        "Queue statistics unavailable; refusing to reset while workers may be running.",
      );
    if (Number(q.stats?.concurrentDispatchesCount || 0) === 0) break;
    if (i >= 65)
      throw new Error("Processing did not drain; apps remain blocked.");
    console.log("Waiting for in-flight processing to finish…");
    await delay(30000);
  }
  await api(`${queue}:purge`, "POST", {});
  for (const name of ["fluidWells", "fluidImports"])
    for (const ref of await db.collection(name).listDocuments())
      await db.recursiveDelete(ref);
  for (const u of users) {
    await db.recursiveDelete(u.collection("miniApps").doc("well-viewer"));
    const s = await u.get();
    if (s.data()?.enabledMiniApps?.includes("well-viewer"))
      await u.update({
        enabledMiniApps: s
          .data()
          .enabledMiniApps.filter((a) => a !== "well-viewer"),
      });
  }
  for (const s of (await db.collection("invitations").get()).docs)
    if (s.data().enabledMiniApps?.includes("well-viewer"))
      await s.ref.update({
        enabledMiniApps: s
          .data()
          .enabledMiniApps.filter((a) => a !== "well-viewer"),
      });
  const [files] = await storage.bucket().getFiles();
  const affected = files.filter(
    (f) =>
      f.name.startsWith("fluidlab/") ||
      /^users\/[^/]+\/well-viewer\//.test(f.name),
  );
  for (const f of affected) await f.delete({ ignoreNotFound: true });
  for (const name of ["fluidWells", "fluidImports"])
    if ((await db.collection(name).listDocuments()).length)
      throw new Error(`${name} was not cleared`);
  const [remaining] = await storage.bucket().getFiles();
  if (
    remaining.some(
      (f) =>
        f.name.startsWith("fluidlab/") ||
        /^users\/[^/]+\/well-viewer\//.test(f.name),
    )
  )
    throw new Error("App files remain");
  for (const group of ["wells", "fluidImports"]) {
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${group}/indexes`;
    for (const index of (await api(url)).indexes || [])
      await api(`https://firestore.googleapis.com/v1/${index.name}`, "DELETE");
  }
  await api(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/wells/fields/cleanupAt?updateMask=indexConfig`,
    "PATCH",
    { indexConfig: {} },
  );
  await marker.save(
    JSON.stringify({ resetComplete: true, objectsRemoved: affected.length }),
    { resumable: false },
  );
  console.log(
    `App reset verified; ${affected.length} objects removed. Accounts and other app data retained.`,
  );
}
