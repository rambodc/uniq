// Builder mini app, super admins only. One collection, `builder`, with messages under each conversation.
// The browser never writes it. Callers are checked the same way as the Safety PDF report:
// requireMiniApp(request, "builder") and then isSuperAdmin. Cursor is called only from here.
// The CURSOR_API_KEY secret is never logged and never returned.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { db, callable, cursorApiKey, resendApiKey, isSuperAdmin, requireMiniApp, text } from "./core.js";
import { BuilderError, NOT_CONFIGURED, UNTITLED, artifactRef, chatSummary, createAgent, fetchArtifact, generatedTitle, loadRemote, loadShip, messageView, messageWithFiles, needsFreshAgent, nextState, normalizeBuilderFiles, patchChanged, promptFiles, readCursorKey, repliesToWrite, requestText, sendFollowUp, shouldRefresh, summaryView, viewStatus } from "./builder.js";
import { latestAdminHelp } from "./builderHelp.js";
import { buildBuilderAdminEmail, builderNotifyAddress, sendBuilderAdminEmail } from "./mailer.js";

const builderCall = { ...callable, secrets: [cursorApiKey, resendApiKey], timeoutSeconds: 60 };
const warmBuilderCall = { ...builderCall, minInstances: 1 };
const SITE = "https://uniqenergy.com";
const conversations = () => db.collection("builder");
const messages = (id) => conversations().doc(id).collection("messages");

function raise(error) {
  if (error instanceof HttpsError) throw error;
  if (error instanceof BuilderError) throw new HttpsError(error.code, error.message);
  const detail = error instanceof Error ? error.message : "";
  if (detail && !/key|bearer|authorization/i.test(detail)) globalThis.console.error("Builder failed", detail);
  throw new HttpsError("internal", "The build could not be updated. Try again.");
}
function take(fn, value) { try { return fn(value); } catch (error) { raise(error); } }
function conversationId(value) { const id = text(value, "build", 128); if (!/^[A-Za-z0-9]+$/.test(id)) throw new HttpsError("invalid-argument", "Enter a valid build."); return id; }
function keyOrNull() { try { return readCursorKey(cursorApiKey); } catch { return null; } }

async function loadMessages(id) {
  const snapshot = await messages(id).orderBy("at", "asc").limit(200).get();
  return snapshot.docs.map((doc) => messageView(doc.id, doc.data()));
}
async function refresh(id, data, apiKey, force = false) {
  if (!data?.agentId) return;
  const stored = await loadMessages(id);
  if (!force && !shouldRefresh(data, Date.now(), stored.some((message) => message.kind === "assistant"))) return;
  try {
    const remote = await loadRemote(apiKey, data.agentId);
    if (remote.missing) {
      await conversations().doc(id).update({ status: "error", error: "That build no longer exists in Cursor.", awaitingSince: null, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    const next = nextState(data, { ...remote, userAts: stored.filter((message) => message.kind === "user").map((message) => message.at) });
    const writes = repliesToWrite(next.replies, stored);
    if (writes.length) {
      const batch = db.batch();
      for (const reply of writes) batch.set(messages(id).doc(reply.id), { kind: "assistant", text: reply.text, runId: reply.runId, at: reply.at }, { merge: true });
      await batch.commit();
    }
    if (writes.length || patchChanged(data, next.patch)) await conversations().doc(id).update({ ...next.patch, updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (error instanceof BuilderError && error.message === NOT_CONFIGURED) raise(error);
  }
}
async function refreshShip(id, data) {
  if (!data?.prUrl) return;
  const at = Date.parse(data.shipCache?.at || "");
  if (data.ship && Number.isFinite(at) && Date.now() - at < 20_000) return;
  try {
    const loaded = await loadShip(data.prUrl, data.shipCache, globalThis.fetch, globalThis.process.env);
    if (!loaded || loaded.limited || loaded.error || !loaded.ship) return;
    await conversations().doc(id).set({ ship: loaded.ship, shipCache: { ...loaded.cache, at: new Date().toISOString() } }, { merge: true });
  } catch { /* a public GitHub read is best-effort; the saved ship stays */ }
}
function blank(access) {
  return { title: UNTITLED, agentId: null, agentUrl: null, runId: null, status: "running", error: null, prUrl: null, branch: null, awaitingSince: null, askedBy: access.email, askedByUid: access.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
}
function builderFiles(uid, value) { try { return normalizeBuilderFiles(uid, value); } catch (error) { raise(error); } }
async function shareFile(path) {
  const stored = getStorage().bucket().file(path);
  const token = randomUUID();
  await stored.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  const bucket = getStorage().bucket().name;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
const CURSOR_IMAGE_LIMIT = 15 * 1024 * 1024;
const CURSOR_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
function cursorMime(type) {
  const mime = String(type || "").toLowerCase();
  return mime === "image/jpg" ? "image/jpeg" : mime;
}
async function imageForCursor(file, url) {
  const mime = cursorMime(file.contentType);
  if (!CURSOR_IMAGE_MIME.has(mime)) return null;
  if (file.size <= CURSOR_IMAGE_LIMIT) {
    try {
      const [bytes] = await getStorage().bucket().file(file.path).download();
      return { data: globalThis.Buffer.from(bytes).toString("base64"), mimeType: mime };
    } catch { /* the download URL still goes in the prompt text */ }
  }
  return url ? { url, mimeType: mime } : null;
}
async function sharedFiles(uid, value) {
  const files = builderFiles(uid, value);
  const links = [];
  const images = [];
  for (const file of files) {
    const url = await shareFile(file.path);
    links.push({ ...file, url });
    const image = await imageForCursor(file, url);
    if (image) images.push(image);
  }
  return { files, links, images };
}
async function present(id) {
  const snap = await conversations().doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "That build no longer exists.");
  const data = snap.data();
  const stored = await loadMessages(id);
  const title = generatedTitle(data.title, stored);
  if (title) {
    await conversations().doc(id).update({ title, updatedAt: FieldValue.serverTimestamp() });
    data.title = title;
  }
  return { ...summaryView(id, data), agentUrl: data.agentUrl ?? null, messages: stored };
}

export const listBuilderConversations = onCall(builderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const snapshot = await conversations().orderBy("updatedAt", "desc").limit(40).get();
  const configured = keyOrNull() != null;
  const items = snapshot.docs.map((doc) => { const view = summaryView(doc.id, doc.data()); if (!configured && view.status === "running") view.error = NOT_CONFIGURED; return view; });
  return { conversations: items };
});

export const getBuilderConversation = onCall(warmBuilderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const id = conversationId(request.data?.conversationId);
  const force = request.data?.force === true;
  const snap = await conversations().doc(id).get();
  if (!snap.exists) throw new HttpsError("not-found", "That build no longer exists.");
  const apiKey = keyOrNull();
  if (apiKey) await refresh(id, snap.data(), apiKey, force);
  await refreshShip(id, (await conversations().doc(id).get()).data());
  const conversation = await present(id);
  if (!apiKey && conversation.status === "running") conversation.error = NOT_CONFIGURED;
  return { conversation };
});

export const startBuilderConversation = onCall(warmBuilderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const raw = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const shared = await sharedFiles(access.uid, request.data?.files);
  const body = take(requestText, raw || (shared.files.length ? "Attached files." : request.data?.text));
  const apiKey = take(readCursorKey, cursorApiKey);
  const ref = conversations().doc();
  await ref.set(blank(access));
  const now = new Date().toISOString();
  await messages(ref.id).add({ kind: "user", text: messageWithFiles(body, shared.files), runId: null, at: now });
  try {
    const created = await createAgent(apiKey, promptFiles(body, shared.links), undefined, shared.images);
    await ref.update({ agentId: created.agentId, agentUrl: created.agentUrl, runId: created.runId, status: viewStatus(created.runStatus, "ACTIVE"), error: null, awaitingSince: now, updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    const message = error instanceof BuilderError ? error.message : "Cursor could not start the build.";
    await ref.update({ status: "error", error: message, updatedAt: FieldValue.serverTimestamp() });
  }
  return { conversation: await present(ref.id) };
});

export const sendBuilderMessage = onCall(warmBuilderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const id = conversationId(request.data?.conversationId);
  const raw = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const shared = await sharedFiles(access.uid, request.data?.files);
  const body = take(requestText, raw || (shared.files.length ? "Attached files." : request.data?.text));
  const apiKey = take(readCursorKey, cursorApiKey);
  const ref = conversations().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That build no longer exists.");
  const data = snap.data();
  const now = new Date().toISOString();
  await messages(id).add({ kind: "user", text: messageWithFiles(body, shared.files), runId: null, at: now });
  const prompt = promptFiles(body, shared.links);
  const fresh = Boolean(data.agentId) && await needsFreshAgent(data);
  if (!data.agentId || fresh) {
    try {
      const prior = fresh ? await loadMessages(id) : [];
      const summary = fresh ? chatSummary(prior.at(-1)?.kind === "user" ? prior.slice(0, -1) : prior) : undefined;
      const created = await createAgent(apiKey, prompt, undefined, shared.images, fresh ? { summary } : undefined);
      await ref.update({
        agentId: created.agentId,
        agentUrl: created.agentUrl,
        runId: created.runId,
        status: viewStatus(created.runStatus, "ACTIVE"),
        error: null,
        prUrl: null,
        branch: null,
        ship: FieldValue.delete(),
        shipCache: FieldValue.delete(),
        awaitingSince: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message = error instanceof BuilderError ? error.message : "Cursor could not start the build.";
      await ref.update({ status: "error", error: message, updatedAt: FieldValue.serverTimestamp() });
    }
    return { conversation: await present(id) };
  }
  try {
    const sent = await sendFollowUp(apiKey, data.agentId, prompt, data.status === "running", undefined, shared.images);
    await ref.update({ status: "running", error: null, awaitingSince: now, ...(sent.runId ? { runId: sent.runId } : {}), updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    const message = error instanceof BuilderError ? error.message : "The follow-up could not be sent.";
    await ref.update({ error: message, updatedAt: FieldValue.serverTimestamp() });
  }
  return { conversation: await present(id) };
});

/** The name shown in the list and the chat header. */
export const renameBuilderConversation = onCall(builderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const id = conversationId(request.data?.conversationId);
  const title = text(request.data?.title, "name", 80);
  const ref = conversations().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That build no longer exists.");
  await ref.update({ title, updatedAt: FieldValue.serverTimestamp() });
  return { conversation: await present(id) };
});

/** A short-lived download URL for one file the agent saved under its artifacts directory. */
export const getBuilderArtifact = onCall(builderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const id = conversationId(request.data?.conversationId);
  const ref = artifactRef(request.data?.path);
  if (!ref) return { available: false, name: "file" };
  const snap = await conversations().doc(id).get();
  if (!snap.exists || !snap.data().agentId) throw new HttpsError("not-found", "That build no longer exists.");
  const apiKey = take(readCursorKey, cursorApiKey);
  let file = null;
  try { file = await fetchArtifact(apiKey, snap.data().agentId, ref); } catch { file = null; }
  if (!file) return { available: false, name: ref.name };
  return { available: true, ...file };
});

/** Emails the Grok Bot admin once, when an assistant reply contains a complete builder-admin-help block. */
export const notifyBuilderAdmin = onCall(builderCall, async (request) => {
  const access = await requireMiniApp(request, "builder");
  if (!isSuperAdmin(access)) throw new HttpsError("permission-denied", "This account is not authorized.");
  const id = conversationId(request.data?.conversationId);
  const ref = conversations().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That build no longer exists.");
  const data = snap.data();
  if (data.adminNotice?.at) return { already: true, conversation: await present(id) };
  const stored = await loadMessages(id);
  const help = latestAdminHelp(stored);
  if (!help) throw new HttpsError("failed-precondition", "There is nothing for the admin to fix.");
  const original = stored.find((message) => message.kind === "user")?.text ?? data.title;
  const name = [access.profile?.firstName, access.profile?.lastName].filter(Boolean).join(" ") || access.email;
  const message = buildBuilderAdminEmail({ to: builderNotifyAddress(), askedByName: name, askedByEmail: access.email, title: data.title, link: `${SITE}/builder/${id}`, request: original, help, prUrl: data.prUrl ?? null });
  let sent;
  try { sent = await sendBuilderAdminEmail(message, resendApiKey.value(), { idempotencyKey: `builder-admin/${id}` }); }
  catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (detail && !/key|bearer|authorization/i.test(detail)) globalThis.console.error("Builder notify failed", detail);
    throw new HttpsError("internal", "The admin could not be notified. Try again.");
  }
  await ref.update({ adminNotice: { at: FieldValue.serverTimestamp(), by: access.email, resendId: sent.id }, updatedAt: FieldValue.serverTimestamp() });
  return { already: false, conversation: await present(id) };
});
