import { execFileSync } from "node:child_process";
const confirmed = process.argv.includes("--confirm"), project = "uniqenergy-de71c", database = "(default)", token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(), base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents`;
const encodedPath = (value) => value.split("/").map(encodeURIComponent).join("/");
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  if (!response.ok && !(options.method === "DELETE" && response.status === 404)) throw new Error(`${options.method || "GET"} ${url} failed (${response.status}): ${await response.text()}`);
  return response.status === 204 || response.status === 404 ? {} : response.json();
}
async function listDocuments(parent, collection) {
  const documents = []; let pageToken = "";
  do { const prefix = parent ? `${encodedPath(parent)}/` : "", query = new URLSearchParams({ pageSize: "300", showMissing: "true", ...(pageToken ? { pageToken } : {}) }), result = await request(`${base}/${prefix}${encodeURIComponent(collection)}?${query}`); documents.push(...(result.documents || [])); pageToken = result.nextPageToken || ""; } while (pageToken);
  return documents;
}
async function collectionIds(documentPath) {
  const ids = []; let pageToken = "";
  do { const result = await request(`${base}/${encodedPath(documentPath)}:listCollectionIds`, { method: "POST", body: JSON.stringify({ pageSize: 300, ...(pageToken ? { pageToken } : {}) }) }); ids.push(...(result.collectionIds || [])); pageToken = result.nextPageToken || ""; } while (pageToken);
  return ids;
}
const relativeName = (document) => document.name.split("/documents/")[1];
async function collect(document, rows) { const path = relativeName(document); for (const collection of await collectionIds(path)) for (const child of await listDocuments(path, collection)) await collect(child, rows); rows.push(path); }
const users = await listDocuments("", "fluidlabUsers"), rows = [];
for (const user of users) await collect(user, rows);
const projectsFound = rows.filter((path) => /\/projects\/[^/]+$/.test(path)).length, versionsFound = rows.filter((path) => /\/versions\/[^/]+$/.test(path)).length;
console.log(JSON.stringify({ mode: confirmed ? "confirmed-delete" : "dry-run", legacyAccountsFound: users.length, projectsFound, versionsFound, totalDocumentsFound: rows.length }));
if (!confirmed) { console.log("Dry run only. Re-run with --confirm after verifying the project and counts."); process.exit(0); }
for (const path of rows) await request(`${base}/${encodedPath(path)}`, { method: "DELETE" });
const remainingUsers = await listDocuments("", "fluidlabUsers"), remaining = [];
for (const user of remainingUsers) await collect(user, remaining);
console.log(JSON.stringify({ legacyAccountsDeleted: users.length, totalDocumentsDeleted: rows.length, legacyAccountsRemaining: remainingUsers.length, totalDocumentsRemaining: remaining.length }));
if (remainingUsers.length || remaining.length) process.exitCode = 1;
