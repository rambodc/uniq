import { auth, db, storage } from "../core/firebase.js";

async function allUsers() { const users = []; let token; do { const page = await auth.listUsers(1000, token); users.push(...page.users); token = page.pageToken; } while (token); return users; }
async function topLevelDocuments() { const collections = await db.listCollections(), groups = await Promise.all(collections.map(async (collection) => ({ collection: collection.id, documents: (await collection.listDocuments()).length }))); return groups.filter((group) => group.documents > 0); }
async function storedFiles() { const [files] = await storage.bucket().getFiles({ autoPaginate: true }); return files; }

const confirmed = process.argv.includes("--confirm-permanent-reset");
const [users, groups, files] = await Promise.all([allUsers(), topLevelDocuments(), storedFiles()]);
console.log(JSON.stringify({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "unknown", authUsers: users.map((user) => ({ uid: user.uid, email: user.email || null })), firestore: groups, storageObjects: files.map((file) => file.name), confirmationRequired: !confirmed }, null, 2));
if (!confirmed) process.exit(0);
if (process.env.ALLOW_ENTERPRISE_RESET !== "YES_DELETE_ALL_UNIQENERGY_DATA") throw new Error("Set ALLOW_ENTERPRISE_RESET=YES_DELETE_ALL_UNIQENERGY_DATA before confirming the permanent reset.");
for (const group of groups) { const collection = db.collection(group.collection), docs = await collection.listDocuments(); for (const ref of docs) await db.recursiveDelete(ref); }
for (let index = 0; index < users.length; index += 1000) await auth.deleteUsers(users.slice(index, index + 1000).map((user) => user.uid));
if (files.length) await Promise.all(files.map((file) => file.delete()));
const [remainingUsers, remainingGroups, remainingFiles] = await Promise.all([allUsers(), topLevelDocuments(), storedFiles()]);
if (remainingUsers.length || remainingGroups.length || remainingFiles.length) throw new Error("Reset verification failed: Firebase is not empty.");
console.log("Enterprise reset complete and verified. Create the first administrator in Firebase Console.");
