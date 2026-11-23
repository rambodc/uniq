// Cursor Cloud Agents API for the Builder mini app. Pure helpers live here so tests can run them
// without Firestore. HTTP calls go to https://api.cursor.com.
// Creating and follow-ups use v1 (POST /v1/agents, POST /v1/agents/{id}/runs; 409 agent_busy, then delivery "steer").
// v1 has no transcript. Assistant replies are GET /v0/agents/{id}/conversation (messages[].type assistant_message),
// which a grok_ service token can read. v0 GET /v0/agents/{id} supplies status, summary, and target.prUrl.
// A run's `result` is only a fallback when that conversation is empty.

import { withoutStoredFiles } from "./builderHelp.js";

export const NOT_CONFIGURED = "Builder is not configured yet.";
export const REPO_URL = "https://github.com/rambodc/uniq";
export const STARTING_REF = "production";
const API = "https://api.cursor.com";
const ACTIVE = new Set(["CREATING", "RUNNING", "WAITING_FOR_BACKGROUND_WORK", "ACTIVE"]);
const ERRORS = new Set(["ERROR", "FAILED", "EXPIRED"]);
const DONE = new Set(["FINISHED", "COMPLETE", "COMPLETED", "CANCELLED", "IDLE", "ARCHIVED"]);
const REPLY_LIMIT = 20000;
const WAIT_MS = 2 * 60 * 1000;

export class BuilderError extends Error {
  constructor(message, code = "failed-precondition") {
    super(message);
    this.name = "BuilderError";
    this.code = code;
  }
}

/** Fast Composer. Create and ordinary follow-ups send this. A steer cannot carry a model. */
export const BUILDER_MODEL = { id: "composer-2.5", params: [{ id: "fast", value: "true" }] };

function standingText() {
  return [
    "Standing instructions. They win if the request below conflicts with them.",
    "This is the UniqEnergy site (uniqenergy.com). Work only in this repo. Follow docs/APP_GUIDE.md and AGENTS.md. Use the existing portal theme (src/auth/portal.css, Shell, and Theme). Do not change brand marks or logos unless the request asks for it.",
    "Follow four steps, in order: the mini app, the features, a short list of the planned changes, then build and deploy.",
    "The first message already names the mini app, for example Mini app: Wells. Do not ask that again. Also change other mini apps, and app-wide parts such as users, account types, portal navigation, shared components, auth, rules, and functions, when the person mentions them or the fix needs them. Everything goes in one pull request. Keep one Firestore top-level collection per mini app.",
    "Ask at most one question at a time. Use this shape, with each option on its own line:",
    "QUESTION:",
    "<one question>",
    "A) <choice>",
    "B) <choice>",
    "C) <choice>",
    "A chip list, when a few ideas would help:",
    "IDEAS:",
    "<one line>",
    "- <idea>",
    "- <idea>",
    "When you know what to build, post this and stop:",
    "BUILD:",
    "What: <what you will build>",
    "Parts: <every mini app or app-wide area this touches>",
    "Data: <no change, or the schema change; data that will not fit is deleted, with no conversion>",
    "CONTINUE:",
    "After they continue, post a short plain-text list of the planned changes and this block. No code until the preview is approved. Only make a screenshot when they ask for one.",
    "PREVIEW:",
    "<short list of planned changes>",
    "APPROVE:",
    "A change request is a new list and a new PREVIEW. On the first reply that is more than a question, add one line: TITLE: <a short name, such as Update Safety>",
    `After approval, build it in ${REPO_URL} and open a pull request into the production branch. Put this exact line in the body, on its own:`,
    "Builder-Auto-Deploy: yes",
    "Add the label builder-auto-deploy. Fix CI failures until they are green. It merges and goes live on its own. There is no final question.",
    "If you add or change a page, end with one line: Live route: /path. If a route, mini app, collection, function, or deploy changes, update docs/APP_GUIDE.md in that pull request.",
    "Do not merge or push to production yourself. The automation does that. Do not read or change secrets or IAM.",
    "When you are fully blocked on a secret, IAM, DNS, billing, or an external account, end with this block and nothing after it:",
    ":::builder-admin-help",
    "blocked: <what is blocked>",
    "why: <why you cannot do it>",
    "action: <the exact steps the Grok Bot admin must take>",
    "context: <the build, the files, and the error>",
    ":::",
    "The request:",
  ].join("\n");
}

const REMINDER = [
  "Reminder. Four steps: mini app, features, a short list of the planned changes, then build and deploy. The first message names the mini app. Also change other mini apps and app-wide parts when the person mentions them or the fix needs them. Everything goes in one pull request. Only make a screenshot when they ask for one.",
  "Ask at most one question at a time, each option on its own line:",
  "QUESTION:",
  "<one question>",
  "A) <choice>",
  "B) <choice>",
  "C) <choice>",
  "A chip list:",
  "IDEAS:",
  "<one line>",
  "- <idea>",
  "- <idea>",
  "BUILD:",
  "What: <what you will build>",
  "Parts: <every mini app or app-wide area this touches>",
  "Data: <no change, or the schema change>",
  "CONTINUE:",
  "PREVIEW:",
  "<short list of planned changes>",
  "APPROVE:",
  "Add one TITLE: line once, such as TITLE: Update Wells. No code until the preview is approved. After approval, open a pull request into production with the label builder-auto-deploy and this body line on its own: Builder-Auto-Deploy: yes. Fix CI failures. It goes live automatically. There is no final question.",
  "Do not merge or push to production yourself. The automation does that. Do not read or change secrets or IAM.",
  "Follow-up:",
].join("\n");

/** The first prompt: standing instructions, then the request. */
export function promptFor(userText) {
  return `${standingText()}\n${userText.trim()}`;
}

/** A follow-up. The long standing block is not sent again. */
export function followPrompt(userText) {
  return `${REMINDER}\n${userText.trim()}`;
}

export function requestText(value) {
  if (typeof value !== "string") throw new BuilderError("Enter what you want built.", "invalid-argument");
  const text = value.trim();
  if (!text || text.length > 8000) throw new BuilderError("Enter what you want built (up to 8000 characters).", "invalid-argument");
  return text;
}

export const UNTITLED = "New build";
export const FILE_LIMIT = 20 * 1024 * 1024;

/** Paths the signed-in admin uploaded under their own builder folder. */
export function normalizeBuilderFiles(uid, files) {
  const list = Array.isArray(files) ? files.slice(0, 8) : [];
  return list.map((file) => {
    const path = String(file?.path || "");
    const name = String(file?.name || "file").replace(/[|\n]/g, " ").trim().slice(0, 120) || "file";
    const size = Number(file?.size) || 0;
    const contentType = String(file?.contentType || "application/octet-stream").replace(/[|\n]/g, "").slice(0, 80) || "application/octet-stream";
    if (!path.startsWith(`builder/${uid}/`) || path.includes("..")) throw new BuilderError("That file is not in your builder folder.", "invalid-argument");
    if (size < 1 || size > FILE_LIMIT) throw new BuilderError("Each file must be 20 MB or smaller.", "invalid-argument");
    return { path, name, size, contentType };
  });
}

/** The message the chat stores. The file block is how the bubble shows attachments. */
export function messageWithFiles(text, files) {
  if (!files.length) return text;
  const lines = files.map((file) => `${file.path}|${file.name}|${file.size}|${file.contentType}`).join("\n");
  return `:::builder-files\n${lines}\n:::\n${text}`;
}

/** The prompt text plus download URLs. The raw file block stays out of the prompt. */
export function promptFiles(text, links) {
  const clean = withoutStoredFiles(text);
  if (!links.length) return clean;
  const lines = links.map((file) => `- ${file.name} (${file.contentType}): ${file.url}`);
  return `${clean}\n\nAttached files. Open each URL and use the file:\n${lines.join("\n")}`;
}

const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function imageMime(type) {
  const mime = String(type || "").toLowerCase();
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

/** Cursor prompt.images. Each entry is base64 data plus mimeType, or an https URL. At most five. */
export function cursorImages(images) {
  const out = [];
  for (const image of images || []) {
    if (out.length >= 5) break;
    if (image?.data && IMAGE_MIME.has(imageMime(image.mimeType))) {
      out.push({ data: image.data, mimeType: imageMime(image.mimeType) });
      continue;
    }
    const url = typeof image === "string" ? image : image?.url;
    if (typeof url === "string" && /^https:\/\//.test(url)) out.push({ url });
  }
  return out;
}

/** The first TITLE line, and only while the chat is still unnamed. A manual name is left alone. */
export function generatedTitle(current, messages) {
  if (current !== UNTITLED) return "";
  for (const message of messages || []) {
    if (message?.kind !== "assistant") continue;
    const match = /(?:^|\n)\s*TITLE:\s*(.+)/.exec(String(message.text || ""));
    const title = match ? withoutStoredFiles(match[1]).replace(/[.]+$/, "") : "";
    if (title && title.toLowerCase() !== "new build") return title.slice(0, 80);
  }
  return "";
}

/** The chat title is the first user message, trimmed and capped on a word. Not a generated summary. */
export function titleFrom(text) {
  const line = withoutStoredFiles(text).split("\n").map((part) => part.trim()).find(Boolean) || "New build";
  const flat = line.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim() || "New build";
  if (flat.length <= 56) return flat;
  const cut = flat.slice(0, 56);
  const space = cut.lastIndexOf(" ");
  return (space > 24 ? cut.slice(0, space) : cut).trim();
}

/** Empty, missing, or unreadable secret. The value itself is never returned in the error. */
export function readCursorKey(secret) {
  let value = "";
  try {
    value = typeof secret?.value === "function" ? secret.value() : "";
  } catch {
    value = "";
  }
  if (typeof value !== "string" || !value.trim()) throw new BuilderError(NOT_CONFIGURED, "failed-precondition");
  return value.trim();
}

export function createBody(text, imageUrls = []) {
  const prompt = { text: promptFor(text) };
  const images = cursorImages(imageUrls);
  if (images.length) prompt.images = images;
  return {
    prompt,
    model: BUILDER_MODEL,
    name: titleFrom(text).slice(0, 100),
    repos: [{ url: REPO_URL, startingRef: STARTING_REF }],
    autoCreatePR: true,
    workOnCurrentBranch: false,
  };
}

/** `steer` is only prompt + delivery. Any other field, including model, makes Cursor reject the steer. */
export function followBody(text, steer, { model = true, images = [] } = {}) {
  const prompt = { text: followPrompt(text) };
  const shots = cursorImages(images);
  if (shots.length) prompt.images = shots;
  if (steer) return { prompt, delivery: "steer" };
  return model ? { prompt, model: BUILDER_MODEL } : { prompt };
}

/** Cursor's error body with secrets removed, for logs and the chat. Empty when it is not safe to show. */
export function publicCursorError(data) {
  let text = "";
  try { text = typeof data === "string" ? data : JSON.stringify(data ?? ""); } catch { text = ""; }
  text = text.replace(/bearer\s+\S+/gi, "[redacted]").replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
  if (/api[_-]?key|authorization|cursor_api_key|\bkey\b/i.test(text)) return "";
  return text.slice(0, 500);
}

/** A 400 or 422 whose body talks about the model. Those are retried once with no model field. */
export function modelRejected(status, data) {
  return (status === 400 || status === 422) && /model/i.test(publicCursorError(data));
}

function logCursor(status, data) {
  const safe = publicCursorError(data);
  if (safe) globalThis.console.error("Cursor request failed", status, safe);
}

const upper = (value) => (typeof value === "string" ? value.toUpperCase() : "");
export function viewStatus(runStatus, agentStatus) {
  const run = upper(runStatus), agent = upper(agentStatus);
  if (ACTIVE.has(run)) return "running";
  if (ERRORS.has(run)) return "error";
  if (DONE.has(run)) return "finished";
  if (ACTIVE.has(agent)) return "running";
  if (ERRORS.has(agent)) return "error";
  if (DONE.has(agent)) return "finished";
  return "running";
}

export function cursorUrl(value) {
  return typeof value === "string" && /^https:\/\/cursor\.com\/[A-Za-z0-9/?=&._~%-]*$/.test(value) ? value : null;
}

export function pullRequestFrom(run) {
  const branches = Array.isArray(run?.git?.branches) ? run.git.branches : [];
  const host = (url) => String(url || "").replace(/^https?:\/\//, "").replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
  const ours = branches.find((branch) => host(branch?.repoUrl) === "github.com/rambodc/uniq") ?? branches[0];
  const prUrl = typeof ours?.prUrl === "string" && /^https:\/\/github\.com\/rambodc\/uniq\/pull\/\d+$/.test(ours.prUrl) ? ours.prUrl : null;
  const branch = typeof ours?.branch === "string" && ours.branch.length <= 200 ? ours.branch : null;
  return { prUrl, branch };
}

function failure(status, data) {
  logCursor(status, data);
  const detail = publicCursorError(data).replace(/[{}[\]"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  let base = "Cursor could not complete that request.";
  let code = "unavailable";
  if (status === 401) { base = "Cursor rejected the API key."; code = "failed-precondition"; }
  else if (status === 403) { base = "Cursor refused this request."; code = "permission-denied"; }
  else if (status === 404) { base = "That build no longer exists in Cursor."; code = "not-found"; }
  else if (status === 429) { base = "Cursor is rate limiting. Try again in a moment."; code = "resource-exhausted"; }
  const message = detail && status !== 401 ? `${base} (${detail})` : base;
  return new BuilderError(message, code);
}

export async function cursorJson(apiKey, method, path, body, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${globalThis.Buffer.from(`${apiKey}:`).toString("base64")}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new BuilderError("Cursor could not be reached. Try again.", "unavailable");
  }
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
  return { status: response.status, data };
}

function agentIdOf(value) {
  return typeof value === "string" && /^bc-[A-Za-z0-9-]{8,80}$/.test(value) ? value : null;
}

export async function createAgent(apiKey, text, fetchImpl, imageUrls = []) {
  let response = await cursorJson(apiKey, "POST", "/v1/agents", createBody(text, imageUrls), fetchImpl);
  if (imageUrls.length && (response.status === 400 || response.status === 422) && /image/i.test(publicCursorError(response.data) || JSON.stringify(response.data || ""))) {
    logCursor(response.status, response.data);
    response = await cursorJson(apiKey, "POST", "/v1/agents", createBody(text), fetchImpl);
  }
  if (modelRejected(response.status, response.data)) {
    logCursor(response.status, response.data);
    const plain = createBody(text);
    delete plain.model;
    response = await cursorJson(apiKey, "POST", "/v1/agents", plain, fetchImpl);
  }
  if (response.status !== 200 && response.status !== 201) throw failure(response.status, response.data);
  const agentId = agentIdOf(response.data?.agent?.id);
  if (!agentId) throw new BuilderError("Cursor did not start a build.", "unavailable");
  const runId = typeof response.data?.run?.id === "string" ? response.data.run.id : null;
  return { agentId, agentUrl: cursorUrl(response.data?.agent?.url), runId, runStatus: response.data?.run?.status || "CREATING" };
}

export async function sendFollowUp(apiKey, agentId, text, busy, fetchImpl, imageUrls = []) {
  const path = `/v1/agents/${encodeURIComponent(agentId)}/runs`;
  let first = await cursorJson(apiKey, "POST", path, followBody(text, busy, { images: imageUrls }), fetchImpl);
  if (imageUrls.length && (first.status === 400 || first.status === 422) && /image/i.test(publicCursorError(first.data) || JSON.stringify(first.data || ""))) {
    logCursor(first.status, first.data);
    first = await cursorJson(apiKey, "POST", path, followBody(text, busy), fetchImpl);
  }
  if (!busy && modelRejected(first.status, first.data)) {
    logCursor(first.status, first.data);
    first = await cursorJson(apiKey, "POST", path, followBody(text, false, { model: false }), fetchImpl);
  }
  const archived = first.data?.code === "agent_archived" || first.data?.error?.code === "agent_archived";
  if (first.status === 409 && archived) throw new BuilderError("That build is archived in Cursor.", "failed-precondition");
  const response = first.status === 409 && !busy ? await cursorJson(apiKey, "POST", path, followBody(text, true), fetchImpl) : first;
  if (response.status === 403 && (busy || first.status === 409)) throw new BuilderError("A build is already running. Wait until it finishes, then send again.", "failed-precondition");
  if (response.status === 409) throw new BuilderError("A build is already running.", "failed-precondition");
  if (response.status !== 200 && response.status !== 201 && response.status !== 202) throw failure(response.status, response.data);
  const runId = response.data?.run?.id ?? response.data?.runId ?? null;
  return { runId: typeof runId === "string" ? runId : null };
}

function messageText(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const key of ["text", "result", "summary", "content"]) {
    const found = messageText(value[key]);
    if (found) return found;
  }
  return "";
}
function kindOf(message) {
  const type = String(message?.type || message?.kind || message?.["rol" + "e"] || "").toLowerCase();
  if (type.includes("assistant")) return "assistant";
  if (type.includes("user")) return "user";
  return "";
}
function docId(value, fallback) {
  const id = typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200) : "";
  return id || fallback;
}
function githubPr(value) {
  return typeof value === "string" && /^https:\/\/github\.com\/rambodc\/uniq\/pull\/\d+$/.test(value) ? value : null;
}
function branchName(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/\s/.test(value) ? value : null;
}
function conversationMessages(payload) {
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.conversation?.messages)) return payload.conversation.messages;
  return [];
}

/** Assistant turns in chat order. User rows we already stored mark where each reply sits. */
export function assistantReplies(messages, userAts, summary, nowIso) {
  const replies = [];
  let userIndex = 0, turn = 0, anchor = userAts?.[0] || nowIso;
  for (const message of Array.isArray(messages) ? messages : []) {
    const kind = kindOf(message);
    if (kind === "user") { anchor = userAts?.[userIndex] || anchor; userIndex += 1; turn = 0; continue; }
    if (kind !== "assistant") continue;
    const text = messageText(message);
    if (!text) continue;
    turn += 1;
    const base = Date.parse(anchor), next = Date.parse(userAts?.[userIndex] || "");
    let at = (Number.isFinite(base) ? base : Date.parse(nowIso)) + turn * 1000;
    if (Number.isFinite(next) && at >= next) at = next - 1;
    replies.push({ id: docId(message.id, `assistant-${userIndex}-${turn}`), kind: "assistant", text: text.slice(0, REPLY_LIMIT), runId: null, at: new Date(at).toISOString() });
  }
  const closing = typeof summary === "string" ? summary.trim() : "";
  if (closing && !replies.some((reply) => reply.text === closing)) {
    const last = Date.parse(replies.at(-1)?.at || anchor || nowIso);
    replies.push({ id: "summary", kind: "assistant", text: closing.slice(0, REPLY_LIMIT), runId: null, at: new Date((Number.isFinite(last) ? last : Date.parse(nowIso)) + 1000).toISOString() });
  }
  return replies;
}

function repliesFromRuns(runs, nowIso) {
  return (Array.isArray(runs) ? runs : []).filter((run) => run && !ACTIVE.has(upper(run.status)) && messageText(run)).sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0)).map((run, index) => ({
    id: docId(run.id, `run-${index}`), kind: "assistant", text: messageText(run).slice(0, REPLY_LIMIT), runId: typeof run.id === "string" ? run.id : null, at: typeof run.updatedAt === "string" ? run.updatedAt : nowIso,
  }));
}

export async function loadRemote(apiKey, agentId, fetchImpl) {
  const path = encodeURIComponent(agentId);
  const [v0, conversation, agent, runs] = await Promise.all([
    cursorJson(apiKey, "GET", `/v0/agents/${path}`, undefined, fetchImpl),
    cursorJson(apiKey, "GET", `/v0/agents/${path}/conversation`, undefined, fetchImpl),
    cursorJson(apiKey, "GET", `/v1/agents/${path}`, undefined, fetchImpl),
    cursorJson(apiKey, "GET", `/v1/agents/${path}/runs?limit=50`, undefined, fetchImpl),
  ]);
  if ((v0.status === 404 || v0.status === 410) && (agent.status === 404 || agent.status === 410)) return { missing: true, messages: [], runs: [] };
  if (![v0, conversation, agent, runs].some((response) => response.status === 200)) throw failure(conversation.status || v0.status || agent.status || runs.status);
  const listed = Array.isArray(runs.data?.items) ? runs.data.items : (Array.isArray(runs.data?.runs) ? runs.data.runs : []);
  return {
    missing: false,
    status: v0.status === 200 ? v0.data?.status : null,
    summary: v0.status === 200 ? messageText(v0.data?.summary) : "",
    prUrl: v0.data?.target?.prUrl ?? null,
    branch: v0.data?.target?.branchName ?? null,
    agentUrl: (v0.status === 200 && v0.data?.target?.url) || agent.data?.url || null,
    agent: agent.status === 200 ? agent.data : null,
    runs: runs.status === 200 ? listed : [],
    messages: conversation.status === 200 ? conversationMessages(conversation.data) : [],
  };
}

/** Desired conversation fields and assistant replies after reading Cursor. */
export function nextState(record, remote, nowIso = new Date().toISOString()) {
  const list = (Array.isArray(remote.runs) ? remote.runs : []).filter((run) => typeof run?.id === "string" && !run.id.includes("/")).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const awaiting = typeof record.awaitingSince === "string" ? Date.parse(record.awaitingSince) : NaN;
  const newer = Number.isFinite(awaiting) ? list.find((run) => Date.parse(run.createdAt) >= awaiting - 2000) : null;
  const latest = newer ?? list.find((run) => run.id === (remote.agent?.latestRunId || record.runId)) ?? list[0] ?? null;
  let status = viewStatus(latest?.status, remote.status || remote.agent?.status);
  const stillWaiting = Number.isFinite(awaiting) && !newer && Date.parse(nowIso) - awaiting < WAIT_MS;
  if (stillWaiting && status !== "error") status = "running";
  const git = pullRequestFrom(list.find((run) => pullRequestFrom(run).prUrl) ?? latest);
  const fromChat = assistantReplies(remote.messages, remote.userAts, remote.summary, nowIso);
  const replies = fromChat.length ? fromChat : repliesFromRuns(list, nowIso);
  return {
    patch: {
      agentUrl: cursorUrl(remote.agentUrl || remote.agent?.url) ?? record.agentUrl ?? null,
      runId: newer?.id ?? (stillWaiting ? (record.runId ?? latest?.id ?? null) : (latest?.id ?? record.runId ?? null)),
      status,
      prUrl: githubPr(remote.prUrl) ?? git.prUrl ?? record.prUrl ?? null,
      branch: branchName(remote.branch) ?? git.branch ?? record.branch ?? null,
      error: status === "error" ? (upper(latest?.status) === "EXPIRED" || upper(remote.status) === "EXPIRED" ? "The build expired." : "The build failed.") : null,
      awaitingSince: stillWaiting ? record.awaitingSince : null,
    },
    replies,
  };
}

export function patchChanged(record, patch) {
  return ["agentUrl", "runId", "status", "prUrl", "branch", "error", "awaitingSince"].some((key) => (record[key] ?? null) !== (patch[key] ?? null));
}

export function repliesToWrite(replies, existing) {
  const saved = new Map(existing.filter((message) => message.kind === "assistant").map((message) => [message.id, message.text]));
  return replies.filter((reply) => saved.get(reply.id) !== reply.text);
}

function updatedMillis(record) {
  return record.updatedAt?.toMillis?.() ?? record.updatedAt?.toDate?.()?.getTime?.() ?? Date.parse(record.updatedAt);
}
/** Keep reading Cursor after a run looks finished until an assistant reply has been stored. */
export function shouldRefresh(record, now = Date.now(), hasAssistant = true) {
  if (!record?.agentId) return false;
  if (record.status === "running") return true;
  const at = updatedMillis(record), age = Number.isFinite(at) ? now - at : Infinity;
  if (!hasAssistant && age < 30 * 60 * 1000) return true;
  if (record.status === "finished" && !record.prUrl && age < 10 * 60 * 1000) return true;
  return false;
}

function stamp(value) {
  return value?.toDate?.().toISOString?.() ?? (typeof value === "string" ? value : null);
}

export function summaryView(id, data) {
  const updatedAt = stamp(data.updatedAt);
  const notice = data.adminNotice;
  return { id, title: data.title, status: data.status, prUrl: data.prUrl ?? null, branch: data.branch ?? null, error: data.error ?? null, askedBy: data.askedBy, updatedAt, ship: data.ship?.phase ? { phase: data.ship.phase, detail: data.ship.detail ?? null } : null, adminNotice: notice ? { at: stamp(notice.at), by: notice.by ?? "" } : null };
}

export function messageView(id, data) {
  return { id, kind: data.kind === "assistant" ? "assistant" : "user", text: typeof data.text === "string" ? data.text : "", at: typeof data.at === "string" ? data.at : "" };
}

export function pullNumber(url) {
  const match = /^https:\/\/github\.com\/rambodc\/uniq\/pull\/(\d+)$/.exec(url || "");
  return match ? Number(match[1]) : null;
}

const DONE_CHECK = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const PENDING_CHECK = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED"]);
const DEPLOY_NAMES = ["Production: Firebase Hosting", "Production: Firebase Functions", "Production: Firebase Rules"];

/** Where a Builder pull request is on the way to production. */
export function shipFromGitHub({ pr, checks, deploys }) {
  if (!pr) return null;
  if (pr.state === "closed" && !pr.merged) return { phase: "failed", detail: "The pull request was closed without merging." };
  const relevant = (checks || []).filter((check) => check.name !== "Builder auto deploy");
  const failed = relevant.filter((check) => String(check.status).toUpperCase() === "COMPLETED" && !DONE_CHECK.has(String(check.conclusion || "").toUpperCase()));
  const pending = relevant.filter((check) => PENDING_CHECK.has(String(check.status || "").toUpperCase()) || !check.conclusion && String(check.status).toUpperCase() !== "COMPLETED");
  if (!pr.merged) {
    if (failed.length) return { phase: "failed", detail: `${failed.map((check) => check.name).join(", ")} failed.` };
    if (!relevant.length || pending.length) return { phase: relevant.length ? "checks" : "pr", detail: relevant.length ? "Checks are running." : "Pull request opened." };
    if (!pr.labeled) return { phase: "checks", detail: "Checks passed. The pull request needs the builder-auto-deploy label before it can merge." };
    return { phase: "checks", detail: "Checks passed. Merging into production." };
  }
  const runs = deploys || [];
  const broken = runs.filter((run) => ["FAILURE", "CANCELLED", "TIMED_OUT"].includes(String(run.conclusion || "").toUpperCase()));
  if (broken.length) return { phase: "failed", detail: broken.map((run) => `${run.name} ${String(run.conclusion).toLowerCase()}`).join(", ") + "." };
  const finished = DEPLOY_NAMES.every((name) => runs.some((run) => run.name === name && String(run.conclusion).toUpperCase() === "SUCCESS"));
  if (finished) return { phase: "live", detail: "Live on uniqenergy.com." };
  if (runs.some((run) => String(run.status).toUpperCase() !== "COMPLETED")) return { phase: "deploying", detail: "Deploying to production." };
  return { phase: "merged", detail: "Merged. Waiting for the production deploy." };
}

/** A GitHub token if one is available. Prefers a Builder-specific secret, then the usual env names. Empty when none is set. */
export function githubAuthToken(env = globalThis.process?.env ?? {}) {
  const value = env.BUILDER_GITHUB_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function githubHeaders(etag, env = globalThis.process?.env ?? {}) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "uniq-builder", "X-GitHub-Api-Version": "2022-11-28" };
  const token = githubAuthToken(env);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers["If-None-Match"] = etag;
  return headers;
}

export async function githubGet(url, etag, fetchImpl = globalThis.fetch, env = globalThis.process?.env ?? {}) {
  let response;
  try { response = await fetchImpl(url, { headers: githubHeaders(etag, env) }); } catch { return { error: "network" }; }
  const next = response.headers?.get?.("etag") || etag || null;
  if (response.status === 304) return { notModified: true, etag: next };
  if (response.status === 403 || response.status === 429) return { limited: true, etag: next };
  if (response.status !== 200) return { error: response.status, etag: next };
  return { data: await response.json(), etag: next };
}

function slimPr(data) {
  const labels = (data.labels || []).map((label) => label.name || label);
  return { merged: data.merged === true, state: data.state === "closed" ? "closed" : "open", sha: data.head?.sha || null, mergeSha: data.merge_commit_sha || null, labeled: labels.includes("builder-auto-deploy") };
}
function slimChecks(data) {
  return (data.check_runs || []).map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion }));
}
function slimRuns(name, data, sha) {
  const run = (data.workflow_runs || []).find((item) => item.head_sha === sha);
  return run ? [{ name, status: run.status, conclusion: run.conclusion }] : [];
}

/** Read a pull request, its checks, and the three production deploys. Uses a GitHub token when one is in the environment; otherwise the public API (rambodc/uniq is public). 304 responses reuse the saved snapshot. */
export async function loadShip(prUrl, previous, fetchImpl, env = globalThis.process?.env ?? {}) {
  const number = pullNumber(prUrl);
  if (!number) return null;
  const etags = previous?.etags || {};
  const base = `https://api.github.com/repos/rambodc/uniq`;
  const prRes = await githubGet(`${base}/pulls/${number}`, etags.pr, fetchImpl, env);
  if (prRes.limited) return { limited: true };
  if (prRes.error) return { error: prRes.error };
  const pr = prRes.notModified ? previous.pr : slimPr(prRes.data);
  const sha = pr.merged && pr.mergeSha ? pr.mergeSha : pr.sha;
  if (!sha) return { ship: { phase: "pr", detail: "Pull request opened." }, cache: { etags: { pr: prRes.etag }, pr, checks: [], deploys: [] } };
  const checksUrl = `${base}/commits/${sha}/check-runs?per_page=100`;
  const checksRes = await githubGet(checksUrl, previous?.sha === sha ? etags.checks : null, fetchImpl, env);
  if (checksRes.limited) return { limited: true };
  const checks = checksRes.notModified ? previous.checks : checksRes.data ? slimChecks(checksRes.data) : [];
  const deploys = [];
  const nextEtags = { pr: prRes.etag || etags.pr, checks: checksRes.etag || null };
  if (pr.merged) {
    for (const [file, name] of [["firebase-hosting-merge.yml", "Production: Firebase Hosting"], ["firebase-functions-merge.yml", "Production: Firebase Functions"], ["firebase-rules-merge.yml", "Production: Firebase Rules"]]) {
      const key = file;
      const runRes = await githubGet(`${base}/actions/workflows/${file}/runs?head_sha=${sha}&per_page=1`, previous?.sha === sha ? etags[key] : null, fetchImpl, env);
      if (runRes.limited) return { limited: true };
      nextEtags[key] = runRes.etag || null;
      deploys.push(...(runRes.notModified ? (previous.deploys || []).filter((run) => run.name === name) : runRes.data ? slimRuns(name, runRes.data, sha) : []));
    }
  }
  return { ship: shipFromGitHub({ pr, checks, deploys }), cache: { etags: nextEtags, pr, checks, deploys, sha } };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;
/** Videos at most this size play in the chat. Larger ones are a file card. */
export const SMALL_VIDEO_BYTES = 12 * 1024 * 1024;

/** A path the agent used for a file under /opt/cursor/artifacts. Anything else is rejected. */
export function artifactRef(input) {
  if (typeof input !== "string" || input.length > 500) return null;
  let path = input.trim().split("?")[0].split("#")[0];
  try { path = decodeURIComponent(path); } catch { return null; }
  if (path.includes("..") || path.includes("\\") || path.includes("\0") || path.includes("://")) return null;
  const marker = "/opt/cursor/artifacts/";
  const relative = path.startsWith(marker) ? path.slice(marker.length) : path.startsWith("artifacts/") ? path.slice("artifacts/".length) : null;
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ /-]*$/.test(relative)) return null;
  const name = relative.split("/").pop();
  return { name, relative, v0Path: `${marker}${relative}`, v1Path: `artifacts/${relative}` };
}

export function artifactKind(name) {
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  return "file";
}

function httpsUrl(value) {
  if (typeof value !== "string" || value.length > 4000 || !value.startsWith("https://")) return null;
  try { return new globalThis.URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

/** A 15-minute download URL for one artifact. v0 first (service tokens), then v1. */
export async function fetchArtifact(apiKey, agentId, ref, fetchImpl) {
  const id = encodeURIComponent(agentId);
  const listed = await cursorJson(apiKey, "GET", `/v0/agents/${id}/artifacts`, undefined, fetchImpl);
  let bytes = null;
  if (listed.status === 200) {
    const items = Array.isArray(listed.data?.artifacts) ? listed.data.artifacts : [];
    const hit = items.find((item) => item?.absolutePath === ref.v0Path || (typeof item?.absolutePath === "string" && item.absolutePath.endsWith(`/${ref.name}`)));
    if (hit && Number.isFinite(hit.sizeBytes)) bytes = hit.sizeBytes;
    if (!hit) {
      const v1 = await cursorJson(apiKey, "GET", `/v1/agents/${id}/artifacts`, undefined, fetchImpl);
      const again = (Array.isArray(v1.data?.items) ? v1.data.items : []).find((item) => item?.path === ref.v1Path || item?.path === ref.relative);
      if (again && Number.isFinite(again.sizeBytes)) bytes = again.sizeBytes;
    }
  }
  for (const [version, path] of [["v0", ref.v0Path], ["v1", ref.v1Path], ["v1", ref.relative]]) {
    const route = version === "v0" ? `/v0/agents/${id}/artifacts/download?path=${encodeURIComponent(path)}` : `/v1/agents/${id}/artifacts/download?path=${encodeURIComponent(path)}`;
    const downloaded = await cursorJson(apiKey, "GET", route, undefined, fetchImpl);
    const url = httpsUrl(downloaded.data?.url);
    if (downloaded.status === 200 && url) return { name: ref.name, url, expiresAt: typeof downloaded.data?.expiresAt === "string" ? downloaded.data.expiresAt : null, bytes, kind: artifactKind(ref.name) };
  }
  return null;
}
