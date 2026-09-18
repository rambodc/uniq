import { randomBytes, randomUUID } from "node:crypto";
import { getApp } from "firebase-admin/app";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { db, storage } from "../../core/firebase.js";
import { requireAdmin, requireMiniApp } from "../../core/auth.js";
import { callable, REGION } from "../../core/config.js";
import { decrypt, encrypt, hash, identifier, MAX_FILE, MAX_CANDIDATE, parseMessage, publicMessage, searchOptions, selections, sourceKey } from "./model.js";

const connection = db.doc("invoiceQbPrivate/connection"), entries = db.collection("invoiceQbQueue"), claims = db.collection("invoiceQbClaims");
const appUrl = () => String(process.env.PUBLIC_APP_URL || "https://uniqenergy-de71c.web.app").replace(/\/$/, "");
let cachedConfig;
async function config() {
  if (cachedConfig && cachedConfig.until > Date.now()) return cachedConfig.value;
  const project = getApp().options.projectId || process.env.GCLOUD_PROJECT;
  const { access_token: token } = await getApp().options.credential.getAccessToken();
  const response = await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/INVOICE_QB_CONFIG/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new HttpsError("failed-precondition", "Gmail setup is incomplete. An administrator must configure the Invoice QB secret and grant runtime access.");
  let value;
  try { value = JSON.parse(Buffer.from((await response.json()).payload.data, "base64").toString()); } catch { throw new HttpsError("failed-precondition", "Invoice QB configuration is invalid."); }
  if (!value.clientId || !value.clientSecret || !value.redirectUri?.startsWith("https://") || Buffer.from(value.encryptionKey || "", "base64").length !== 32) throw new HttpsError("failed-precondition", "Invoice QB configuration is incomplete.");
  cachedConfig = { value, until: Date.now() + 60000 };
  return value;
}
const wrap = (action, admin = false) => onCall({ ...callable, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const current = admin ? await requireAdmin(request) : await requireMiniApp(request, "invoice-qb");
  try { return await action(request.data || {}, current); }
  catch (error) {
    if (error instanceof HttpsError) throw error;
    // Never log OAuth responses, tokens, message bodies, or attachments.
    throw new HttpsError("unavailable", "Invoice QB could not complete this request. Please retry.");
  }
});
async function exchange(params) {
  const c = await config();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new HttpsError("failed-precondition", "Gmail authorization expired or was denied. Reconnect the mailbox.");
  return response.json();
}
async function session() {
  const c = await config(), saved = (await connection.get()).data();
  if (!saved?.refreshToken) throw new HttpsError("failed-precondition", "Connect the shared Gmail mailbox first.");
  const token = await exchange({ grant_type: "refresh_token", refresh_token: decrypt(saved.refreshToken, c.encryptionKey) });
  return { email: saved.email, generation: saved.generation, token: token.access_token };
}
async function gmail(s, path) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${s.token}` }, signal: AbortSignal.timeout(30000) });
  if (response.status === 401) throw new HttpsError("failed-precondition", "Reconnect the shared Gmail mailbox.");
  if (response.status === 404) throw new HttpsError("not-found", "This email or attachment is no longer available in Gmail.");
  if (response.status === 429 || response.status >= 500) throw new HttpsError("unavailable", "Gmail is temporarily unavailable or rate limited. Retry shortly.");
  if (!response.ok) throw new HttpsError("failed-precondition", "Gmail access failed. Check Workspace permissions and reconnect if necessary.");
  return response.json();
}
async function message(s, id) { return parseMessage(await gmail(s, `messages/${identifier(id)}?format=full`)); }
async function revoke(token) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token }), signal: AbortSignal.timeout(20000) });
  if (!response.ok && response.status !== 400) throw new HttpsError("unavailable", "Google could not revoke access yet. Retry disconnect.");
}

export const invoiceQbConnection = wrap(async () => {
  let configured = true;
  try { await config(); } catch { configured = false; }
  const saved = (await connection.get()).data();
  return { configured, connected: Boolean(saved?.refreshToken), email: saved?.email || null };
});
export const invoiceQbConnect = wrap(async (_data, current) => {
  const c = await config(), state = randomBytes(32).toString("hex"), generation = (await connection.get()).data()?.generation || null;
  await db.doc(`invoiceQbOauth/${hash(state)}`).set({ uid: current.uid, expires: Date.now() + 600000, generation });
  const params = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/gmail.readonly", access_type: "offline", prompt: "consent select_account", state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}, true);
export const invoiceQbOauthCallback = onRequest({ region: REGION, maxInstances: 2, timeoutSeconds: 60 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const state = String(req.query.state || "");
    if (!/^[a-f0-9]{64}$/.test(state)) throw new Error("state");
    const stateRef = db.doc(`invoiceQbOauth/${hash(state)}`);
    const pending = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists) throw new Error("state");
      const value = snap.data();
      tx.delete(stateRef);
      return value;
    });
    if (pending.expires < Date.now()) throw new Error("expired");
    if (req.query.error) return res.redirect(`${appUrl()}/apps/invoice-qb?connection=denied`);
    const adminRef = db.doc(`users/${pending.uid}`), admin = (await adminRef.get()).data();
    if (admin?.role !== "admin" || admin.status !== "active" || admin.schemaVersion !== 1) throw new Error("admin");
    if (typeof req.query.code !== "string") throw new Error("code");
    const c = await config(), tokens = await exchange({ code: req.query.code, grant_type: "authorization_code", redirect_uri: c.redirectUri });
    if (!tokens.refresh_token || !String(tokens.scope || "").split(" ").includes("https://www.googleapis.com/auth/gmail.readonly")) throw new Error("scope");
    const profile = await gmail({ token: tokens.access_token }, "profile");
    if (c.workspaceDomain && !profile.emailAddress.toLowerCase().endsWith(`@${c.workspaceDomain.toLowerCase()}`)) {
      await revoke(tokens.refresh_token);
      throw new Error("domain");
    }
    await db.runTransaction(async (tx) => {
      const [freshAdmin, previous] = await Promise.all([tx.get(adminRef), tx.get(connection)]);
      if (freshAdmin.data()?.role !== "admin" || freshAdmin.data()?.status !== "active" || (previous.data()?.generation || null) !== pending.generation) throw new Error("changed");
      // Replacing a different account requires an explicit disconnect first.
      if (previous.data()?.email && previous.data().email !== profile.emailAddress) throw new Error("disconnect-first");
      tx.set(connection, { email: profile.emailAddress, refreshToken: encrypt(tokens.refresh_token, c.encryptionKey), generation: randomUUID(), connectedBy: pending.uid });
    });
    res.redirect(`${appUrl()}/apps/invoice-qb?connection=success`);
  } catch { res.redirect(`${appUrl()}/apps/invoice-qb?connection=failed`); }
});
export const invoiceQbDisconnect = wrap(async () => {
  const saved = (await connection.get()).data();
  if (saved?.refreshToken) await revoke(decrypt(saved.refreshToken, (await config()).encryptionKey));
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(connection)).data();
    if (current?.generation !== saved?.generation) throw new HttpsError("aborted", "Connection changed. Refresh and retry.");
    tx.set(connection, { generation: randomUUID() });
  });
  return { success: true };
}, true);
export const invoiceQbLabels = wrap(async () => {
  const result = await gmail(await session(), "labels");
  return { labels: (result.labels || []).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) };
});
export const invoiceQbMessages = wrap(async (data) => {
  const s = await session(), result = await gmail(s, `messages?${searchOptions(data)}`);
  const messages = [];
  // Small batches bound requests to Gmail and avoid fetching the whole mailbox.
  for (let i = 0; i < (result.messages || []).length; i += 5) {
    messages.push(...await Promise.all(result.messages.slice(i, i + 5).map(async ({ id }) => {
      const m = await message(s, id), refs = ["body", ...m.attachments.map((a) => a.id)].map((part) => claims.doc(sourceKey(s.email, id, part)));
      const queued = (await db.getAll(...refs)).some((doc) => doc.exists);
      return { id: m.id, subject: m.subject, sender: m.sender, date: m.date, attachmentCount: m.attachments.length, queued };
    })));
  }
  return { messages: messages.sort((a, b) => b.date.localeCompare(a.date)), cursor: result.nextPageToken || null };
});
export const invoiceQbMessage = wrap(async (data) => publicMessage(await message(await session(), data.id)));

async function bytes(s, m, part) {
  if (part.size > MAX_FILE) throw new HttpsError("invalid-argument", "Each attachment must be 20 MB or smaller.");
  let result;
  if (part.id === "body") result = Buffer.from(m.body);
  else if (part.data) result = Buffer.from(part.data, "base64url");
  else if (part.attachmentId) result = Buffer.from((await gmail(s, `messages/${identifier(m.id)}/attachments/${encodeURIComponent(part.attachmentId)}`)).data, "base64url");
  else throw new HttpsError("not-found", "Attachment content is unavailable.");
  if (result.length > MAX_FILE || result.length !== part.size) throw new HttpsError("invalid-argument", "Attachment size is invalid or exceeds 20 MB. Nothing was queued.");
  return result;
}
// Download browsing attachments directly through an authenticated HTTP request.
// Tokens in URL parameters are never used; this endpoint uses the Firebase bearer header.
export const invoiceQbDownload = onRequest({ region: REGION, cors: [appUrl(), "https://uniqenergy.com", "https://www.uniqenergy.com", "https://uniqenergy-de71c.firebaseapp.com"], maxInstances: 2, memory: "512MiB" }, async (req, res) => {
  try {
    const { auth } = await import("../../core/firebase.js");
    const token = await auth.verifyIdToken(String(req.headers.authorization || "").replace(/^Bearer /, ""), true);
    await requireMiniApp({ auth: { uid: token.uid, token } }, "invoice-qb");
    let content, mime, name;
    if (req.query.entry) {
      const snap = await entries.doc(identifier(req.query.entry)).get(), entry = snap.data();
      if (!entry || entry.deleting) throw new Error("missing");
      const part = entry.documents.find((d) => d.id === req.query.part);
      if (!part) throw new Error("missing");
      [content] = await storage.bucket().file(part.path).download();
      mime = part.mime; name = part.name;
    } else {
      const s = await session(), m = await message(s, req.query.message), part = m.attachments.find((a) => a.id === req.query.part);
      if (!part) throw new Error("missing");
      content = await bytes(s, m, part); mime = part.mime; name = part.name;
    }
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
    res.send(content);
  } catch { res.status(403).json({ error: "Document unavailable. Refresh, check access, or reconnect Gmail." }); }
});
export const invoiceQbAdd = wrap(async (data, current) => {
  const s = await session(), m = await message(s, data.messageId), groups = selections(m, data.parts, data.separate === true);
  const operation = randomUUID(), prefix = `invoice-qb/${operation}/`, bucket = storage.bucket(), docs = [];
  let committed = false;
  try {
    for (let i = 0; i < groups.length; i++) {
      const documents = []; let total = 0;
      for (const part of groups[i]) {
        const content = await bytes(s, m, part); total += content.length;
        if (total > MAX_CANDIDATE) throw new HttpsError("invalid-argument", "Candidate exceeds 50 MB.");
        const path = `${prefix}${i}/${part.id}`;
        await bucket.file(path).save(content, { resumable: false, contentType: part.mime });
        documents.push({ id: part.id, name: part.name, mime: part.mime, size: content.length, path, claim: sourceKey(s.email, m.id, part.id) });
      }
      const id = hash(`${operation}:${i}`);
      docs.push({ id, mailbox: s.email, messageId: m.id, subject: m.subject, sender: m.sender, date: m.date, body: m.body, documents, createdAt: new Date().toISOString(), addedBy: current.uid, addedByName: `${current.user.firstName} ${current.user.lastName}`.trim() || current.user.email, notes: "", status: "queued", revision: 1 });
    }
    // Keep the full source message in private storage, not in Firestore's 1 MB documents.
    await bucket.file(`${prefix}source.json`).save(JSON.stringify(await gmail(s, `messages/${identifier(m.id)}?format=full`)), { resumable: false, contentType: "application/json" });
    for (const doc of docs) { doc.bodyPath = `${prefix}${doc.id}-body.txt`; await bucket.file(doc.bodyPath).save(m.body, { resumable: false, contentType: "text/plain" }); delete doc.body; doc.sourcePath = `${prefix}${doc.id}-source.json`; await bucket.file(`${prefix}source.json`).copy(bucket.file(doc.sourcePath)); }
    await bucket.file(`${prefix}source.json`).delete();
    await db.runTransaction(async (tx) => {
      const refs = docs.flatMap((doc) => doc.documents.map((d) => claims.doc(d.claim)));
      const [saved, user, ...existing] = await tx.getAll(connection, current.ref, ...refs);
      if (saved.data()?.generation !== s.generation) throw new HttpsError("aborted", "Mailbox changed. Refresh and retry.");
      if (user.data()?.status !== "active" || (user.data()?.role !== "admin" && !user.data()?.enabledMiniApps?.includes("invoice-qb"))) throw new HttpsError("permission-denied", "Invoice QB access was removed.");
      if (existing.some((snap) => snap.exists)) throw new HttpsError("already-exists", "One or more selected documents are already in the bill queue. Refresh and select only new documents.");
      for (const doc of docs) {
        tx.create(entries.doc(doc.id), doc);
        for (const d of doc.documents) tx.create(claims.doc(d.claim), { entryId: doc.id });
      }
    });
    committed = true;
    return { ids: docs.map((doc) => doc.id) };
  } finally {
    if (!committed) await bucket.deleteFiles({ prefix }).catch(() => {});
  }
});
export const invoiceQbQueue = wrap(async (data) => {
  let query = entries.orderBy("createdAt", "desc").orderBy("__name__", "desc").limit(50);
  if (data.cursor) { const cursor = await entries.doc(identifier(data.cursor)).get(); if (cursor.exists) query = query.startAfter(cursor); }
  const result = await query.get();
  return { entries: result.docs.map((d) => { const item = d.data(); delete item.bodyPath; delete item.sourcePath; return { ...item, documents: item.documents.map(({ id, name, mime, size }) => ({ id, name, mime, size })) }; }), cursor: result.size === 50 ? result.docs.at(-1).id : null };
});
export const invoiceQbQueueBody = wrap(async (data) => {
  const entry = (await entries.doc(identifier(data.id)).get()).data();
  if (!entry || entry.deleting) throw new HttpsError("not-found", "Candidate not found.");
  const [body] = await storage.bucket().file(entry.bodyPath).download();
  return { body: body.toString("utf8") };
});
export const invoiceQbUpdate = wrap(async (data) => {
  if (!["queued", "already-entered", "ignored"].includes(data.status) || typeof data.notes !== "string" || data.notes.length > 5000) throw new HttpsError("invalid-argument", "Choose a valid status and notes of up to 5,000 characters.");
  await db.runTransaction(async (tx) => {
    const ref = entries.doc(identifier(data.id)), snap = await tx.get(ref);
    if (!snap.exists || snap.data().deleting) throw new HttpsError("not-found", "Candidate not found.");
    if (snap.data().revision !== data.revision) throw new HttpsError("aborted", "Another teammate updated this candidate. Refresh before saving.");
    tx.update(ref, { status: data.status, notes: data.notes, revision: data.revision + 1 });
  });
  return { success: true };
});
export const invoiceQbRemove = wrap(async (data) => {
  const ref = entries.doc(identifier(data.id));
  const entry = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.update(ref, { deleting: true }); return snap.data();
  });
  if (entry) {
    await Promise.all([...entry.documents.map((d) => d.path), entry.bodyPath, entry.sourcePath].map((path) => storage.bucket().file(path).delete({ ignoreNotFound: true })));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      for (const d of entry.documents) tx.delete(claims.doc(d.claim));
      tx.delete(ref);
    });
  }
  return { success: true };
});
