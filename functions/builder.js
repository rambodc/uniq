// Cursor Cloud Agents API for the Builder mini app. Pure helpers live here so tests can run them
// without Firestore. HTTP calls go to https://api.cursor.com.
// Creating and follow-ups use v1 (POST /v1/agents, POST /v1/agents/{id}/runs; 409 agent_busy, then delivery "steer").
// v1 has no transcript. Assistant replies are GET /v0/agents/{id}/conversation (messages[].type assistant_message),
// which a grok_ service token can read. v0 GET /v0/agents/{id} supplies status, summary, and target.prUrl.
// A run's `result` is only a fallback when that conversation is empty.
// Live steps are SSE from GET /v1/agents/{id}/runs/{runId}/stream (or the agent stream when the run id is missing).
// The key stays on the server. The browser only receives the short step label and assistant line.

import { LIVE_SITE, LIVE_TEXT, clipLine, liveHref, withoutStoredFiles } from "./builderHelp.js";
import { MINI_APPS } from "./miniApps.js";

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text, phrase) {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(text);
}

/** Mini apps the first message names, in registry order, plus whether it starts a new one. */
function targetedDocs(userText) {
  const text = String(userText || "");
  const ids = MINI_APPS.filter((app) => mentions(text, app.name)).map((app) => app.id);
  return { ids, isNew: mentions(text, "New mini app") };
}

function fileList(ids) {
  const files = ids.map((id) => `docs/mini-apps/${id}.md`);
  if (files.length < 2) return files[0] || "";
  if (files.length === 2) return `${files[0]} and ${files[1]}`;
  return `${files.slice(0, -1).join(", ")}, and ${files.at(-1)}`;
}

/** What the first Cursor run should read before it opens code. */
function docsInstruction(userText) {
  const { ids, isNew } = targetedDocs(userText);
  const files = fileList(ids);
  if (isNew && files) return `Read AGENTS.md and ${files} first. Only open code when those docs are not enough. This also starts a new mini app: create docs/mini-apps/<id>.md for it and add that app to the list in AGENTS.md.`;
  if (isNew) return "Read AGENTS.md first. This is a new mini app: create docs/mini-apps/<id>.md for it and add that app to the list in AGENTS.md. Only open code when AGENTS.md is not enough.";
  if (files) return `Read AGENTS.md and ${files} first. Only open code when those docs are not enough.`;
  return "Read AGENTS.md first. Only open code when that guide is not enough.";
}

function standingText(userText) {
  return [
    "Standing instructions. They win if the request below conflicts with them.",
    docsInstruction(userText),
    "This is the UniqEnergy site (uniqenergy.com). Work only in this repo. Follow AGENTS.md. production is the only permanent branch. Your branch is deleted when the pull request merges. Use the existing portal theme (src/auth/portal.css, Shell, and Theme). Do not change brand marks or logos unless the request asks for it.",
    "Follow their lead. They may answer, skip ahead, or tell you to build it. When you still need a decision, ask one question, offer idea chips, or post the plan.",
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
    "After they continue, post a short plain-text list of the planned changes and this block. No code until the plan is approved. If they tell you to build it, that is the approval. Only make a screenshot when they explicitly ask for one. Do not create a screenshot, a mockup, or a visual preview unless they ask.",
    "PREVIEW:",
    "<short list of planned changes>",
    "APPROVE:",
    "A change request is a new list and a new PREVIEW. On the first reply that is more than a question, add one line: TITLE: <a short name, such as Update Safety>",
    `After approval, build it in ${REPO_URL} and open a pull request into the production branch. Put this exact line in the body, on its own:`,
    "Builder-Auto-Deploy: yes",
    "Add the label builder-auto-deploy. Fix CI failures until they are green. It merges on its own. Do not say the change is live, done, or on production. The app posts that message after the production deploy succeeds. There is no final question.",
    "If you add or change a page, end with one line: Live route: /path. That line is the page path. It is not a claim that the change is live. If the pull request changes a mini app, update its docs/mini-apps/<id>.md. If a mini app is added, renamed, or removed, update the list in AGENTS.md.",
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
  "Reminder. Follow their lead. The first message names the mini app. Also change other mini apps and app-wide parts when the person mentions them or the fix needs them. Everything goes in one pull request. Only make a screenshot when they explicitly ask for one. Do not create a screenshot, a mockup, or a visual preview unless they ask.",
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
  "Add one TITLE: line once, such as TITLE: Update Wells. No code until the plan is approved. If they tell you to build it, that is the approval. After approval, open a pull request into production with the label builder-auto-deploy and this body line on its own: Builder-Auto-Deploy: yes. Fix CI failures. It merges on its own. Do not say the change is live, done, or on production. The app posts that message after the production deploy succeeds. There is no final question. production is the only permanent branch, and the branch is deleted when the pull request merges.",
  "If the pull request changes a mini app, update its docs/mini-apps/<id>.md. If a mini app is added, renamed, or removed, update the list in AGENTS.md.",
  "Do not merge or push to production yourself. The automation does that. Do not read or change secrets or IAM.",
  "Follow-up:",
].join("\n");

/** The first prompt: standing instructions, then the request. */
export function promptFor(userText) {
  const text = userText.trim();
  return `${standingText(text)}\n${text}`;
}

/** A follow-up. The long standing block is not sent again. */
export function followPrompt(userText) {
  return `${REMINDER}\n${userText.trim()}`;
}

/** A short record of the chat so a new agent can continue it. */
export function chatSummary(messages, max = 1600) {
  const lines = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const kind = message?.kind === "assistant" ? "Builder" : message?.kind === "user" ? "User" : "";
    if (!kind) continue;
    const text = withoutStoredFiles(message.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push(`${kind}: ${text.length > 320 ? `${text.slice(0, 319)}…` : text}`);
  }
  const summary = lines.join("\n");
  return summary.length <= max ? summary : summary.slice(summary.length - max);
}

/** A new agent on a new branch. Standing rules, a short recap, then the new request. */
export function continuationPrompt(summary, userText) {
  const standing = standingText(userText).replace(/\nThe request:$/, "");
  return [
    standing,
    "This continues an earlier build in the same chat. That pull request is already merged or closed. Start from production on a new branch. Do not reuse the old branch or the old pull request.",
    "Earlier in this chat:",
    summary || "(no earlier messages)",
    "The new request:",
    userText.trim(),
  ].join("\n");
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

function agentBody(promptText, imageUrls, name) {
  const prompt = { text: promptText };
  const images = cursorImages(imageUrls);
  if (images.length) prompt.images = images;
  return {
    prompt,
    model: BUILDER_MODEL,
    name: titleFrom(name).slice(0, 100),
    repos: [{ url: REPO_URL, startingRef: STARTING_REF }],
    autoCreatePR: true,
    workOnCurrentBranch: false,
  };
}

export function createBody(text, imageUrls = []) {
  return agentBody(promptFor(text), imageUrls, text);
}

/** The create body for a follow-up that must start from production on a new branch. */
export function continuationBody(summary, text, imageUrls = []) {
  return agentBody(continuationPrompt(summary, text), imageUrls, text);
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

export async function createAgent(apiKey, text, fetchImpl, imageUrls = [], options = {}) {
  const build = (images) => options.summary == null ? createBody(text, images) : continuationBody(options.summary, text, images);
  let images = imageUrls;
  let response = await cursorJson(apiKey, "POST", "/v1/agents", build(images), fetchImpl);
  if (images.length && (response.status === 400 || response.status === 422) && /image/i.test(publicCursorError(response.data) || JSON.stringify(response.data || ""))) {
    logCursor(response.status, response.data);
    images = [];
    response = await cursorJson(apiKey, "POST", "/v1/agents", build(images), fetchImpl);
  }
  if (modelRejected(response.status, response.data)) {
    logCursor(response.status, response.data);
    const plain = build(images);
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

function siteHref(value) {
  if (typeof value !== "string") return LIVE_SITE;
  try {
    const url = new globalThis.URL(value);
    if (url.protocol !== "https:" || url.hostname !== "uniqenergy.com") return LIVE_SITE;
    const path = url.pathname.replace(/\/+$/, "");
    return path ? `${LIVE_SITE}${path}` : LIVE_SITE;
  } catch {
    return LIVE_SITE;
  }
}

export function messageView(id, data) {
  const kind = data.kind === "assistant" ? "assistant" : data.kind === "notice" ? "notice" : "user";
  const view = { id, kind, text: typeof data.text === "string" ? data.text : "", at: typeof data.at === "string" ? data.at : "" };
  if (kind === "notice") {
    view.tone = data.tone === "live" ? "live" : "note";
    view.href = siteHref(data.href);
    view.prUrl = githubPr(data.prUrl);
  }
  return view;
}

export function pullNumber(url) {
  const match = /^https:\/\/github\.com\/rambodc\/uniq\/pull\/(\d+)$/.exec(url || "");
  return match ? Number(match[1]) : null;
}

const DONE_CHECK = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const PENDING_CHECK = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED"]);
const DEPLOY_NAMES = ["Production: Firebase Hosting", "Production: Firebase Functions", "Production: Firebase Rules"];

/** A merged pull request whose merge commit changed no files. */
export function commitEmpty(data) {
  if (!data || typeof data !== "object") return false;
  if (data.stats && data.stats.total === 0) return true;
  if (Array.isArray(data.files) && data.files.length === 0) return true;
  return false;
}

/** Where a Builder pull request is on the way to production. */
export function shipFromGitHub({ pr, checks, deploys }) {
  if (!pr) return null;
  if (pr.merged && pr.empty) return { phase: "merged", detail: "No changes." };
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
  const runs = (deploys || []).filter((run) => DEPLOY_NAMES.includes(run.name) && String(run.conclusion || "").toUpperCase() !== "SKIPPED");
  const broken = runs.filter((run) => ["FAILURE", "CANCELLED", "TIMED_OUT"].includes(String(run.conclusion || "").toUpperCase()));
  if (broken.length) return { phase: "failed", detail: broken.map((run) => `${run.name} ${String(run.conclusion).toLowerCase()}`).join(", ") + "." };
  if (runs.some((run) => String(run.status).toUpperCase() !== "COMPLETED")) return { phase: "deploying", detail: "Deploying to production." };
  if (runs.length && runs.every((run) => String(run.conclusion).toUpperCase() === "SUCCESS")) return { phase: "live", detail: "Live on uniqenergy.com." };
  return { phase: "merged", detail: "Merged. Waiting for the production deploy." };
}

/** True when the latest pull request is merged or closed, so the next message needs a new branch. */
export function pullRequestSettled(pr) {
  if (!pr || typeof pr !== "object") return false;
  if (pr.merged === true) return true;
  return String(pr.state || "").toLowerCase() === "closed";
}

/** Ship cache used only when GitHub cannot be read. An open pull request with failing checks stays a follow-up. */
export function shipMeansSettled(ship) {
  const phase = ship?.phase;
  if (phase === "merged" || phase === "deploying" || phase === "live") return true;
  if (ship?.detail === "No changes.") return true;
  if (phase === "failed" && /closed without merging/i.test(ship.detail || "")) return true;
  if (phase === "failed" && /Production: Firebase/i.test(ship.detail || "")) return true;
  return false;
}

/** A GitHub token if one is available. Prefers the optional BUILDER_GITHUB_TOKEN, then the usual env names. Empty when none is set. Never throws. */
export function githubAuthToken(env = globalThis.process?.env ?? {}) {
  const value = env?.BUILDER_GITHUB_TOKEN || env?.GITHUB_TOKEN || env?.GH_TOKEN;
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
  const empty = data.changed_files === 0 || (data.additions === 0 && data.deletions === 0 && data.changed_files == null);
  return { merged: data.merged === true, state: data.state === "closed" ? "closed" : "open", sha: data.head?.sha || null, mergeSha: data.merge_commit_sha || null, labeled: labels.includes("builder-auto-deploy"), empty };
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
  let pr = prRes.notModified ? previous.pr : slimPr(prRes.data);
  const sha = pr.merged && pr.mergeSha ? pr.mergeSha : pr.sha;
  if (!sha) return { ship: shipFromGitHub({ pr, checks: [], deploys: [] }) || { phase: "pr", detail: "Pull request opened." }, cache: { etags: { pr: prRes.etag }, pr, checks: [], deploys: [] } };
  const nextEtags = { pr: prRes.etag || etags.pr };
  if (pr.merged && pr.mergeSha) {
    const commitRes = await githubGet(`${base}/commits/${pr.mergeSha}`, previous?.sha === sha ? etags.commit : null, fetchImpl, env);
    if (commitRes.limited) return { limited: true };
    nextEtags.commit = commitRes.etag || null;
    const empty = commitRes.notModified ? previous?.pr?.empty === true : commitRes.data ? commitEmpty(commitRes.data) : false;
    if (empty) pr = { ...pr, empty: true };
  }
  const checksUrl = `${base}/commits/${sha}/check-runs?per_page=100`;
  const checksRes = await githubGet(checksUrl, previous?.sha === sha ? etags.checks : null, fetchImpl, env);
  if (checksRes.limited) return { limited: true };
  const checks = checksRes.notModified ? previous.checks : checksRes.data ? slimChecks(checksRes.data) : [];
  const deploys = [];
  nextEtags.checks = checksRes.etag || null;
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

/** The GitHub state of the chat's pull request, or null when GitHub cannot be read. */
export async function lookupPullRequest(prUrl, fetchImpl = globalThis.fetch, env = globalThis.process?.env ?? {}) {
  const number = pullNumber(prUrl);
  if (!number) return null;
  const res = await githubGet(`https://api.github.com/repos/rambodc/uniq/pulls/${number}`, null, fetchImpl, env);
  if (!res?.data) return null;
  return slimPr(res.data);
}

/** A follow-up stays on the open pull request. A merged or closed one starts a new agent from production. */
export async function needsFreshAgent(record, fetchImpl = globalThis.fetch, env = globalThis.process?.env ?? {}) {
  if (!record?.agentId || !record.prUrl) return false;
  try {
    const pr = await lookupPullRequest(record.prUrl, fetchImpl, env);
    if (pr) return pullRequestSettled(pr);
  } catch { /* the saved ship is the fallback */ }
  return shipMeansSettled(record.ship);
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

/** How long one watch holds the Cursor stream open, and how long that claim blocks a second stream. */
export const STREAM_WINDOW_MS = 45_000;
export const STREAM_HOLD_MS = 55_000;
const STREAM_TERMINAL = new Set(["FINISHED", "COMPLETE", "COMPLETED", "CANCELLED", "ERROR", "FAILED", "EXPIRED"]);

const TOOL_STEPS = new Map([
  ["read_file", "Reading files"],
  ["read_file_v2", "Reading files"],
  ["list_dir", "Reading files"],
  ["list_directory", "Reading files"],
  ["file_search", "Searching"],
  ["glob", "Searching"],
  ["glob_file_search", "Searching"],
  ["grep_search", "Searching"],
  ["grep", "Searching"],
  ["codebase_search", "Searching"],
  ["semantic_search", "Searching"],
  ["web_search", "Searching"],
  ["edit_file", "Editing files"],
  ["search_replace", "Editing files"],
  ["apply_patch", "Editing files"],
  ["write", "Editing files"],
  ["delete_file", "Editing files"],
  ["edit_notebook", "Editing files"],
]);

export function cursorAgentId(value) {
  return typeof value === "string" && /^bc-[A-Za-z0-9-]{8,80}$/.test(value) ? value : "";
}

export function cursorRunId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(value) ? value : "";
}

/** Opaque SSE id. Anything else is dropped so it cannot be sent as a header. */
export function eventCursor(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : "";
}

export function streamHoldOpen(live, now = Date.now()) {
  const until = Date.parse(live?.holdUntil || "");
  return Number.isFinite(until) && until > now;
}

export function blankLive(runId, now = new Date().toISOString()) {
  return { step: "", text: "", eventId: "", runId: cursorRunId(runId), updatedAt: now, holdUntil: null, open: false };
}

function terminalDescription(args) {
  const raw = args && typeof args === "object" && !Array.isArray(args) ? args.description : "";
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text || /api[_-]?key|authorization|bearer\s|cursor_api_key/i.test(text)) return "";
  return clipLine(text, 72);
}

/** The short label for one tool call. A shell command prefers its description. */
export function toolStepLabel(name, args) {
  const tool = String(name || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (tool === "run_terminal_cmd" || tool === "run_terminal_command") {
    const description = terminalDescription(args);
    return description ? `Running ${description}` : "Running a command";
  }
  if (tool === "mcp") return "Using a tool";
  return TOOL_STEPS.get(tool) || "";
}

export function emptyStream() {
  return { step: "", text: "", segment: "", eventId: "", tools: {}, done: false, status: "", open: false };
}

/** Fold one SSE event into the live step and the latest assistant text. */
export function foldStreamEvent(state, event) {
  const current = state && typeof state === "object" ? state : emptyStream();
  const next = {
    step: current.step || "",
    text: current.text || "",
    segment: current.segment || "",
    eventId: event?.id ? eventCursor(event.id) || current.eventId || "" : (current.eventId || ""),
    tools: { ...(current.tools || {}) },
    done: Boolean(current.done),
    status: current.status || "",
    open: Boolean(current.open),
  };
  const type = String(event?.event || "");
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  if (type === "status") {
    next.status = String(data.status || "");
    if (STREAM_TERMINAL.has(next.status.toUpperCase())) next.done = true;
  } else if (type === "assistant") {
    const piece = typeof data.text === "string" ? data.text : "";
    next.segment = `${next.segment}${piece}`.slice(-8000);
    next.text = next.segment;
    next.open = true;
  } else if (type === "thinking") {
    if (typeof data.text === "string" && data.text.trim()) next.step = "Thinking";
  } else if (type === "tool_call") {
    const callId = String(data.callId || "").slice(0, 120);
    const label = toolStepLabel(data.name, data.args);
    if (data.status === "running") {
      if (next.segment.trim()) next.text = next.segment;
      next.segment = "";
      next.open = false;
      if (callId) next.tools[callId] = label;
      if (label) next.step = label;
    } else if (data.status === "completed") {
      if (callId) delete next.tools[callId];
      const still = Object.values(next.tools).filter(Boolean);
      if (still.length) next.step = still.at(-1);
      else if (label) next.step = label;
    }
  } else if (type === "result") {
    if (typeof data.text === "string" && data.text.trim()) {
      next.segment = data.text.slice(-8000);
      next.text = next.segment;
      next.open = true;
    }
    next.status = String(data.status || next.status);
    next.done = true;
  } else if (type === "error" || type === "done") {
    next.done = true;
  }
  return next;
}

export function liveRecord(state, runId, now, holdUntil = null) {
  return {
    step: clipLine(state?.step, 96),
    text: clipLine(state?.text, 240),
    eventId: eventCursor(state?.eventId),
    runId: cursorRunId(runId),
    updatedAt: now,
    holdUntil,
    open: Boolean(state?.open),
  };
}

export function liveChanged(previous, next) {
  return (previous?.step || "") !== (next?.step || "")
    || (previous?.text || "") !== (next?.text || "")
    || (previous?.eventId || "") !== (next?.eventId || "")
    || Boolean(previous?.open) !== Boolean(next?.open);
}

/** Split a Server-Sent Events buffer. The trailing partial block stays in `rest`. */
export function takeSseEvents(buffer) {
  const text = String(buffer || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = text.split("\n\n");
  const rest = parts.pop() ?? "";
  const events = [];
  for (const block of parts) {
    if (!block.trim() || block.trim().startsWith(":")) continue;
    let id = "";
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("id:")) id = line.slice(3).trim();
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    let payload = null;
    const raw = data.join("\n");
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }
    events.push({ id, event, data: payload });
  }
  return { events, rest };
}

export function streamPath(agentId, runId) {
  const id = encodeURIComponent(agentId);
  const run = cursorRunId(runId);
  return run ? `/v1/agents/${id}/runs/${encodeURIComponent(run)}/stream` : `/v1/agents/${id}/stream`;
}

export function streamFailure(status, data) {
  const code = String(data?.code || data?.error?.code || "");
  if (status === 410 || code === "stream_expired") return "expired";
  if (status === 400 && (code === "invalid_last_event_id" || /last[_ ]event/i.test(code))) return "bad-cursor";
  if (status === 429) return "limited";
  if (status === 409) return "closed";
  if (status === 200) return "";
  return "failed";
}

export async function readEventStream(response, onEvent, signal) {
  const reader = response?.body?.getReader?.();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal?.aborted) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const parsed = takeSseEvents(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) onEvent(event);
    }
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") return;
    throw error;
  } finally {
    try { reader.releaseLock?.(); } catch { /* the lock is already gone */ }
  }
}

async function openCursorStream(apiKey, { agentId, runId, lastEventId, signal }, fetchImpl) {
  const headers = {
    Authorization: `Basic ${globalThis.Buffer.from(`${apiKey}:`).toString("base64")}`,
    Accept: "text/event-stream",
  };
  const cursor = eventCursor(lastEventId);
  if (cursor) headers["Last-Event-ID"] = cursor;
  try {
    return await fetchImpl(`${API}${streamPath(agentId, runId)}`, { method: "GET", headers, signal });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") return { status: 200, aborted: true, body: null, text: async () => "" };
    throw new BuilderError("Cursor could not be reached. Try again.", "unavailable");
  }
}

/** Read one run stream, resuming from Last-Event-ID. A stale cursor is retried once from the start. */
export async function followCursorStream(apiKey, { agentId, runId, lastEventId, signal }, onEvent, fetchImpl = globalThis.fetch) {
  const agent = cursorAgentId(agentId);
  if (!agent) return { failure: "failed", eventId: "" };
  let cursor = eventCursor(lastEventId);
  const attempt = async (resume) => {
    const response = await openCursorStream(apiKey, { agentId: agent, runId, lastEventId: resume, signal }, fetchImpl);
    if (response?.aborted) return { failure: "" };
    if (response.status !== 200) {
      let data = null;
      const raw = typeof response.text === "function" ? await response.text() : "";
      if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
      return { failure: streamFailure(response.status, data) || "failed" };
    }
    await readEventStream(response, (event) => {
      const id = eventCursor(event.id);
      if (id) cursor = id;
      onEvent(event);
    }, signal);
    return { failure: "" };
  };
  let result = await attempt(cursor);
  if ((result.failure === "expired" || result.failure === "bad-cursor") && cursor && !signal?.aborted) {
    cursor = "";
    result = await attempt("");
  }
  return { failure: result.failure, eventId: cursor };
}

export function liveNoticeId(prUrl) {
  const number = pullNumber(prUrl);
  return number ? `live-${number}` : "";
}

/** The done card is only for a deploy that actually went live. */
export function shouldPostLiveNotice(ship) {
  return ship?.phase === "live" && ship?.detail !== "No changes.";
}

export function liveNotice(prUrl, messages, at) {
  const id = liveNoticeId(prUrl);
  if (!id) return null;
  return { id, kind: "notice", tone: "live", text: LIVE_TEXT, href: liveHref(messages), prUrl, at };
}
