import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

export const MAX_FILE = 20 * 1024 * 1024, MAX_CANDIDATE = 50 * 1024 * 1024;
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function identifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new HttpsError("invalid-argument", "Invalid identifier.");
  return value;
}
export function encrypt(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64");
}
export function decrypt(value, key) {
  const bytes = Buffer.from(value, "base64"), cipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString("utf8");
}
export function parseMessage(message) {
  const headers = message.payload?.headers || [], get = (name) => headers.find((h) => h.name.toLowerCase() === name)?.value || "";
  const attachments = [], texts = [], html = [];
  function walk(part, path = "0") {
    if (part.filename) attachments.push({ id: path, name: part.filename, mime: part.mimeType || "application/octet-stream", size: part.body?.size || 0, attachmentId: part.body?.attachmentId || null, data: part.body?.data || null });
    else if (part.body?.data && part.mimeType === "text/plain") texts.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
    else if (part.body?.data && part.mimeType === "text/html") html.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
    (part.parts || []).forEach((p, i) => walk(p, `${path}_${i}`));
  }
  walk(message.payload || {});
  const htmlBody = html.join("\n");
  const body = texts.join("\n") || htmlBody.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ");
  return { id: message.id, subject: get("subject"), sender: get("from"), date: new Date(Number(message.internalDate)).toISOString(), body, html: htmlBody, attachments };
}
export function publicMessage(message) {
  return { ...message, attachments: message.attachments.map(({ id, name, mime, size }) => ({ id, name, mime, size })) };
}
export function selections(message, ids, separate) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new HttpsError("invalid-argument", "Select one or more distinct documents (up to 50).");
  const files = ids.map((id) => id === "body" ? { id, name: "Email body.txt", mime: "text/plain", size: Buffer.byteLength(message.body) } : message.attachments.find((a) => a.id === id));
  if (files.some((file) => !file)) throw new HttpsError("invalid-argument", "An attachment is no longer available.");
  if (files.some((file) => file.size > MAX_FILE)) throw new HttpsError("invalid-argument", "Each attachment must be 20 MB or smaller.");
  const groups = separate ? files.map((file) => [file]) : [files];
  if (groups.some((group) => group.reduce((sum, file) => sum + file.size, 0) > MAX_CANDIDATE)) throw new HttpsError("invalid-argument", "Each candidate must be 50 MB or smaller.");
  return groups;
}
export const sourceKey = (mailbox, messageId, partId) => hash(JSON.stringify([mailbox.toLowerCase(), messageId, partId]));
export function searchOptions(data = {}) {
  const q = typeof data.query === "string" ? data.query.trim() : "";
  if (q.length > 500) throw new HttpsError("invalid-argument", "Search must be 500 characters or fewer.");
  const terms = [q];
  for (const [key, operator] of [["from", "after"], ["to", "before"]]) {
    if (!data[key]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || !Number.isFinite(Date.parse(data[key]))) throw new HttpsError("invalid-argument", "Invalid date range.");
    const seconds = Math.floor(Date.parse(data[key]) / 1000) + (key === "to" ? 86400 : 0);
    terms.push(`${operator}:${seconds}`);
  }
  if (data.from && data.to && data.from > data.to) throw new HttpsError("invalid-argument", "Start date must precede end date.");
  const params = new URLSearchParams({ maxResults: "25", q: terms.join(" ") });
  if (data.label) params.set("labelIds", identifier(data.label));
  if (data.cursor) {
    if (typeof data.cursor !== "string" || data.cursor.length > 2000) throw new HttpsError("invalid-argument", "Invalid page.");
    params.set("pageToken", data.cursor);
  }
  return params;
}
