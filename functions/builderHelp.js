// Shared by the Builder functions and the browser. No Node APIs, so the site bundle can import it.
// The agent adds this block only when a Grok Bot admin has to do something the agent cannot.

export const ADMIN_HELP_MARK = ":::builder-admin-help";

/** The four fields, or null when the reply has no complete block. A partial block is not a request for help. */
export function parseAdminHelp(text) {
  if (typeof text !== "string" || !text.includes(ADMIN_HELP_MARK)) return null;
  const match = /:::builder-admin-help\s*([\s\S]*?)\s*:::/.exec(text);
  if (!match) return null;
  const fields = { blocked: "", why: "", action: "", context: "" };
  let current = "";
  for (const raw of match[1].split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const found = /^(blocked|why|action|context):\s*(.*)$/.exec(line);
    if (found) { current = found[1]; fields[current] = found[2].trim(); }
    else if (current) fields[current] = `${fields[current]} ${line}`.trim();
  }
  if (!fields.blocked || !fields.why || !fields.action || !fields.context) return null;
  return fields;
}

const IDEAS_BLOCK = /(?:^|\n)IDEAS:[\s\S]*?(?:\n- [^\n]*)+(?=\n(?:BUILD:|QUESTION:|PREVIEW:)|$)/g;
const BUILD_BLOCK = /(?:^|\n)BUILD:\s*[\s\S]*?\nCONTINUE:\s*/g;
const PREVIEW_BLOCK = /(?:^|\n)PREVIEW:\s*[\s\S]*?\nAPPROVE:\s*/g;
const QUESTION_HEAD = /(?:^|[\n\s])(?:\*\*|__|`)*QUESTION(?:\*\*|__|`)*\s*:/i;
const OPTION_HEAD = /(?:^|[\s])(?:\*\*|__|`)*([A-H])(?:\*\*|__|`)*\s*[).:]/g;

function plain(value) {
  return String(value || "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
}

/** Where a question sits in the reply. Options may be on their own lines or inline, with A) A. or A:, and the marker may be bold. */
export function locateQuestion(text) {
  if (typeof text !== "string") return null;
  const head = QUESTION_HEAD.exec(text);
  if (!head) return null;
  const from = head.index + head[0].length;
  const rest = text.slice(from);
  const hits = [];
  OPTION_HEAD.lastIndex = 0;
  let match = OPTION_HEAD.exec(rest);
  while (match) {
    const between = rest.slice(hits.length ? hits[hits.length - 1].after : 0, match.index);
    if (hits.length && (/\n\s*\n/.test(between) || /\n\s*(?:BUILD|IDEAS|PREVIEW|TITLE)\s*:|\n\s*:::/.test(between))) break;
    hits.push({ key: match[1], at: match.index, after: match.index + match[0].length });
    match = OPTION_HEAD.exec(rest);
  }
  if (hits.length < 2) return null;
  const prompt = plain(rest.slice(0, hits[0].at).replace(/(?:^|\n)\s*MULTI:\s*[^\n]*/gi, " "));
  if (!prompt) return null;
  const options = [];
  for (let i = 0; i < hits.length; i += 1) {
    let slice = rest.slice(hits[i].after, hits[i + 1] ? hits[i + 1].at : rest.length);
    if (!hits[i + 1]) {
      const stop = /\n\s*\n|\n\s*(?:BUILD|IDEAS|PREVIEW|TITLE)\s*:|\n\s*:::/.exec(slice);
      if (stop) slice = slice.slice(0, stop.index);
    }
    const label = plain(slice.replace(/(?:^|\n)\s*MULTI:\s*[^\n]*/gi, " ")).replace(/[.,;:]+$/, "").trim();
    if (!label) return null;
    options.push({ key: hits[i].key, label });
  }
  let end = from + hits[hits.length - 1].after;
  const tail = rest.slice(hits[hits.length - 1].after);
  const tailStop = /\n\s*\n|\n\s*(?:BUILD|IDEAS|PREVIEW|TITLE)\s*:|\n\s*:::/.exec(tail);
  end += tailStop ? tailStop.index : tail.length;
  const multiLine = /^\s*\n?\s*MULTI:\s*[^\n]*/i.exec(text.slice(end));
  if (multiLine) end += multiLine[0].length;
  return { prompt, options, multi: /MULTI:\s*yes\b/i.test(text.slice(head.index, end)), start: head.index, end };
}

function stripQuestions(text) {
  let rest = text;
  for (let i = 0; i < 4; i += 1) {
    const found = locateQuestion(rest);
    if (!found) break;
    rest = `${rest.slice(0, found.start)}${rest.slice(found.end)}`;
  }
  return rest;
}

/** A QUESTION block the chat renders as its own card, or null. */
export function parseQuestion(text) {
  const found = locateQuestion(text);
  if (!found) return null;
  return { prompt: found.prompt, options: found.options, multi: found.multi };
}

/** Every question card. Later unanswered cards stay hidden until the earlier one is answered. */
export function questionViews(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let waiting = false;
  const views = [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]?.kind !== "assistant") continue;
    const parsed = parseQuestion(list[i].text);
    if (!parsed) continue;
    const later = list.slice(i + 1).find((message) => message?.kind === "user");
    const answered = Boolean(later);
    const hidden = !answered && waiting;
    if (!answered) waiting = true;
    views.push({ ...parsed, id: list[i].id, answered, answer: later ? withoutStoredFiles(later.text) : "", hidden });
  }
  return views;
}

/** The first unanswered question, or null when the person has answered them all. */
export function openQuestion(messages) {
  return questionViews(messages).find((view) => !view.hidden && !view.answered) || null;
}

/** Files stored on a user message. The chat renders these as chips, not as raw text. */
export function parseStoredFiles(text) {
  const match = /:::builder-files\s*([\s\S]*?)\s*:::/.exec(String(text || ""));
  if (!match) return [];
  const files = [];
  for (const line of match[1].split("\n")) {
    const [path, name, size, contentType] = line.split("|");
    if (!path || !name) continue;
    files.push({ path: path.trim(), name: name.trim(), size: Number(size) || 0, contentType: (contentType || "application/octet-stream").trim() });
  }
  return files;
}

export function withoutStoredFiles(text) {
  return String(text || "").replace(/:::builder-files[\s\S]*?:::/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Idea chips. At least two lines that start with "- ". */
export function parseIdeas(text) {
  if (typeof text !== "string" || !/(?:^|\n)IDEAS:/.test(text)) return null;
  const start = text.search(/(?:^|\n)IDEAS:\s*/);
  const body = text.slice(start).replace(/^(?:.|\n)*?IDEAS:\s*/, "");
  const prompt = [];
  const options = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { if (options.length) break; continue; }
    if (line.startsWith("- ")) { options.push(line.slice(2).trim()); continue; }
    if (/^(QUESTION|BUILD|PREVIEW):/.test(line)) break;
    if (!options.length) prompt.push(line.replace(/^IDEAS:\s*/, ""));
  }
  if (!prompt.length || options.length < 2) return null;
  return { prompt: prompt.join(" "), options };
}

function latestBlock(messages, parse) {
  const list = Array.isArray(messages) ? messages : [];
  let found = null;
  let at = -1;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i]?.kind !== "assistant") continue;
    const parsed = parse(list[i].text);
    if (!parsed) continue;
    found = parsed;
    at = i;
  }
  if (!found) return null;
  const later = list.slice(at + 1).find((message) => message?.kind === "user");
  return { ...found, id: list[at].id, answered: Boolean(later), answer: later ? withoutStoredFiles(later.text) : "" };
}

/** The latest chip list, and whether a user message already chose. */
export function openIdeas(messages) {
  return latestBlock(messages, parseIdeas);
}

/** The "Here is what I'll build" summary. */
export function parseSummary(text) {
  if (typeof text !== "string" || !/(?:^|\n)BUILD:/.test(text)) return null;
  const match = /(?:^|\n)BUILD:\s*([\s\S]*?)\nCONTINUE:\s*/.exec(text);
  if (!match) return null;
  const body = match[1].trim();
  if (!body) return null;
  const fields = { what: "", parts: "", data: "" };
  const extra = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const found = /^(what|parts|data):\s*(.*)$/i.exec(line);
    if (found) fields[found[1].toLowerCase()] = found[2].trim();
    else extra.push(line);
  }
  return { what: fields.what, parts: fields.parts, data: fields.data, extra: extra.join(" ") };
}

export function openSummary(messages) {
  return latestBlock(messages, parseSummary);
}

/** The plan approval card. A screenshot is shown only when the reply already has one. */
export function parsePreview(text) {
  if (typeof text !== "string" || !/(?:^|\n)PREVIEW:/.test(text)) return null;
  const match = /(?:^|\n)PREVIEW:\s*([\s\S]*?)\nAPPROVE:\s*/.exec(text);
  if (!match || !match[1].trim()) return null;
  return { detail: match[1].trim() };
}

export function openPreview(messages) {
  const found = latestBlock(messages, parsePreview);
  if (!found) return null;
  return { ...found, approved: /^approved\b/i.test(found.answer.trim()) };
}

/** The reply the chat shows. Marker blocks stay out of the bubble. A live-route line stays, so the message itself says where it went. */
export function withoutAdminHelp(text) {
  if (typeof text !== "string") return "";
  return withoutStoredFiles(stripQuestions(text.replace(/:::builder-admin-help[\s\S]*?:::/g, "")).replace(IDEAS_BLOCK, "").replace(BUILD_BLOCK, "").replace(PREVIEW_BLOCK, "").replace(/(?:^|\n)\s*TITLE:\s*.+/g, ""));
}

/** Local status when the agent has gone quiet. "five" at 5s, "ten" at 10s, or null while text is fresh. */
export function fillerPhase(elapsedSec, quietSec) {
  if (quietSec != null && quietSec < 5) return null;
  if (elapsedSec >= 10) return "ten";
  if (elapsedSec >= 5) return "five";
  return null;
}

/** The one line under Working…. The latest assistant sentence, or Starting. */
export function workingStep(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.kind !== "assistant") continue;
    const line = withoutAdminHelp(list[i].text).split("\n").map((part) => part.trim()).find(Boolean);
    if (!line) continue;
    return line.length > 90 ? `${line.slice(0, 87).trim()}…` : line;
  }
  return "Starting";
}

/** m:ss since the latest user message, or since `from`. */
export function elapsedLabel(from, now = Date.now()) {
  const start = typeof from === "string" ? Date.parse(from) : NaN;
  const sec = Math.max(0, Math.floor(((Number.isFinite(now) ? now : Date.now()) - (Number.isFinite(start) ? start : now)) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** The newest complete block in the conversation, or null. */
export function latestAdminHelp(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.kind !== "assistant") continue;
    const help = parseAdminHelp(messages[i].text);
    if (help) return help;
  }
  return null;
}
