import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, identifier, MAX_CANDIDATE, MAX_FILE, parseMessage, publicMessage, searchOptions, selections, sourceKey } from "../apps/invoice-qb/model.js";
const encoded = (value) => Buffer.from(value).toString("base64url");
const sample = { id: "abc", internalDate: "1700000000000", payload: { headers: [{ name: "Subject", value: "Two invoices" }, { name: "From", value: "supplier@example.com" }], parts: [{ mimeType: "text/plain", body: { data: encoded("Please review"), size: 13 } }, { filename: "invoice.pdf", mimeType: "application/pdf", body: { attachmentId: "secret-attachment-id", size: 123 } }, { parts: [{ filename: "second.png", mimeType: "image/png", body: { data: encoded("image"), size: 5 } }] }] } };
test("parses nested attachments and preserves HTML without exposing internal attachment content", () => {
  const parsed = parseMessage(sample), visible = publicMessage(parsed);
  assert.equal(parsed.body, "Please review");
  assert.equal(parsed.html, "");
  assert.equal(parsed.attachments.length, 2);
  assert.equal(parsed.attachments[1].id, "0_2_0");
  assert.equal(visible.attachments[0].attachmentId, undefined);
  assert.equal(visible.attachments[1].data, undefined);
  assert.equal(visible.sender, "supplier@example.com");
});
test("HTML-only email preserves markup while providing a plain-text fallback", () => {
  const parsed = parseMessage({ ...sample, payload: { mimeType: "text/html", body: { data: encoded('<script>alert(1)</script><p>Invoice<img src="https://tracker.test/pixel"></p>') } } });
  assert.equal(parsed.body.trim(), "Invoice");
  assert.match(parsed.html, /<script>/);
  assert.match(parsed.html, /tracker\.test/);
});
test("selection validates missing, repeated, oversized and grouped documents", () => {
  const parsed = parseMessage(sample);
  assert.equal(selections(parsed, ["body", "0_1"], false).length, 1);
  assert.equal(selections(parsed, ["body", "0_1"], true).length, 2);
  assert.throws(() => selections(parsed, ["missing"], false));
  assert.throws(() => selections(parsed, ["0_1", "0_1"], false));
  assert.throws(() => selections(parsed, [], false));
  assert.throws(() => selections({ ...parsed, attachments: [{ id: "big", size: MAX_FILE + 1 }] }, ["big"], false));
  const large = { ...parsed, attachments: Array.from({ length: 3 }, (_, i) => ({ id: String(i), size: MAX_FILE })) };
  assert(MAX_FILE * 3 > MAX_CANDIDATE);
  assert.throws(() => selections(large, ["0", "1", "2"], false));
  assert.equal(selections(large, ["0", "1", "2"], true).length, 3);
});
test("source identity deduplicates a document across grouped and separate candidates", () => {
  assert.equal(sourceKey("AP@EXAMPLE.COM", "abc", "0_1"), sourceKey("ap@example.com", "abc", "0_1"));
  assert.notEqual(sourceKey("ap@example.com", "abc", "0_1"), sourceKey("other@example.com", "abc", "0_1"));
});
test("refresh tokens use authenticated encryption with random IVs", () => {
  const key = randomBytes(32).toString("base64"), value = encrypt("private-refresh-token", key);
  assert.equal(decrypt(value, key), "private-refresh-token");
  assert.notEqual(encrypt("private-refresh-token", key), value);
  assert.throws(() => decrypt(value, randomBytes(32).toString("base64")));
  const changed = Buffer.from(value, "base64"); changed[15] ^= 1;
  assert.throws(() => decrypt(changed.toString("base64"), key));
});
test("Gmail searches carry bounded query, inclusive end date, label and cursor", () => {
  const params = searchOptions({ query: "from:supplier@example.com", from: "2026-09-01", to: "2026-09-18", label: "INBOX", cursor: "next" });
  assert.equal(params.get("labelIds"), "INBOX");
  assert.equal(params.get("pageToken"), "next");
  assert(params.get("q").includes(`before:${Date.parse("2026-09-19") / 1000}`));
  assert.throws(() => searchOptions({ from: "2026-09-18", to: "2026-09-01" }));
  assert.throws(() => searchOptions({ query: "x".repeat(501) }));
  assert.throws(() => identifier("../../users/admin"));
});
test("Gmail default search leaves date and label filters unset", () => {
  const params = searchOptions({ query: "" });
  assert.equal(params.get("labelIds"), null);
  assert.equal(params.get("q"), "");
  assert.equal(params.get("after"), null);
  assert.equal(params.get("before"), null);
});
