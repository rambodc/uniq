import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { convertContactInquiry, needsContactMigration } from "../scripts/maintenance/contact-migration.mjs";
import { countDocuments, exportDatabase, serializeValue } from "../scripts/maintenance/firestore-export.mjs";
import { writeVerifiedExport } from "../scripts/maintenance/write-export.mjs";
import { INTUIT_REVOKE_URL, buildRevokeRequest, decryptToken, encryptToken } from "../scripts/maintenance/quickbooks.mjs";
import { executeWipe } from "../scripts/maintenance/wipe.mjs";

const oldInquiry = {
  name: "Jane Field",
  email: " JANE@EXAMPLE.COM ",
  phone: "403-555-0100",
  company: "Rig Co",
  message: "Interested in field work.",
  inquiryType: "careers",
  areaOfInterest: "Engineering",
  linkedinUrl: "https://www.linkedin.com/in/jane",
  status: "new",
  source: "public-contact",
  createdAt: { seconds: 10, nanoseconds: 0 },
  schemaVersion: 1,
};

test("contact migration keeps extra fields and is idempotent", () => {
  assert.equal(needsContactMigration(oldInquiry), true);
  const next = convertContactInquiry(oldInquiry);
  assert.equal(next.inquiryType, "careers");
  assert.equal(next.email, "jane@example.com");
  assert.equal(next.archived, false);
  assert.equal(next.schemaVersion, 1);
  assert.equal(next.legacy.areaOfInterest, "Engineering");
  assert.equal(next.legacy.linkedinUrl, "https://www.linkedin.com/in/jane");
  assert.equal(next.legacy.status, "new");
  assert.equal(next.legacy.source, "public-contact");
  assert.equal("areaOfInterest" in next, false);
  assert.equal(needsContactMigration(next), false);
  assert.equal(convertContactInquiry({ ...oldInquiry, status: "archived", inquiryType: "nope" }).archived, true);
  assert.equal(convertContactInquiry({ ...oldInquiry, inquiryType: "nope" }).inquiryType, "general");
});

test("firestore export walks subcollections and preserves timestamps", async () => {
  const stamp = { toDate() { return new Date(0); }, seconds: 4, nanoseconds: 5 };
  const notes = { id: "notes", get: async () => ({ docs: [{ id: "n1", data: () => ({ text: "hi" }), ref: { path: "users/u1/notes/n1", listCollections: async () => [] } }] }) };
  const users = { id: "users", get: async () => ({ docs: [{ id: "u1", data: () => ({ email: "a@b.co", createdAt: stamp }), ref: { path: "users/u1", listCollections: async () => [notes] } }] }) };
  const payload = await exportDatabase({ listCollections: async () => [users] });
  assert.equal(payload.documentCount, 2);
  assert.equal(countDocuments(payload), 2);
  assert.equal(payload.collections.users.u1.subcollections.notes.n1.data.text, "hi");
  assert.deepEqual(payload.collections.users.u1.data.createdAt, { __type: "timestamp", seconds: 4, nanoseconds: 5 });
  assert.deepEqual(serializeValue(Buffer.from("abc")), { __type: "bytes", base64: Buffer.from("abc").toString("base64") });
});

test("export file is verified and a bad export is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uniq-export-"));
  try {
    const payload = { exportedAt: "t", projectId: "uniqenergy-de71c", documentCount: 1, collections: { users: { u1: { path: "users/u1", data: { email: "a@b.co" }, subcollections: {} } } } };
    const path = await writeVerifiedExport(payload, join(dir, "export.json"));
    assert.equal(JSON.parse(await readFile(path, "utf8")).documentCount, 1);
    await assert.rejects(() => writeVerifiedExport({ ...payload, documentCount: 2 }, join(dir, "bad.json")), /failed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("QuickBooks revoke uses Intuit and the stored token round-trips", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const stored = encryptToken("refresh-token", key);
  assert.equal(decryptToken(stored, key), "refresh-token");
  const request = buildRevokeRequest({ clientId: "id", clientSecret: "secret", token: "refresh-token" });
  assert.equal(request.url, INTUIT_REVOKE_URL);
  assert.equal(request.init.method, "POST");
  assert.match(request.init.headers.Authorization, /^Basic /);
  assert.equal(JSON.parse(request.init.body).token, "refresh-token");
});

test("wipe aborts before revoke or delete when the export fails", async () => {
  const calls = [];
  const steps = ["revokeQuickBooks", "deleteOtherCollections", "deleteFluidlabStorage", "deleteAuthUsers", "createSuperAdmin"].reduce((all, name) => ({ ...all, [name]: async () => { calls.push(name); } }), { exportAll: async () => { calls.push("export"); throw new Error("disk full"); } });
  await assert.rejects(() => executeWipe(steps), /disk full/);
  assert.deepEqual(calls, ["export"]);
});

test("wipe runs the export before every destructive step", async () => {
  const calls = [];
  const path = await executeWipe({
    exportAll: async () => { calls.push("export"); return { path: "/tmp/export.json" }; },
    revokeQuickBooks: async () => { calls.push("revoke"); },
    deleteOtherCollections: async () => { calls.push("delete-collections"); },
    deleteFluidlabStorage: async () => { calls.push("delete-storage"); },
    deleteAuthUsers: async () => { calls.push("delete-auth"); },
    createSuperAdmin: async () => { calls.push("admin"); },
  });
  assert.equal(path, "/tmp/export.json");
  assert.deepEqual(calls, ["export", "revoke", "delete-collections", "delete-storage", "delete-auth", "admin"]);
});
