import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { getBuilderConversation, listBuilderConversations, notifyBuilderAdmin, renameBuilderConversation, sendBuilderMessage, startBuilderConversation, watchBuilderRun, type BuilderConversation, type BuilderLive, type BuilderShip, type BuilderStatus, type BuilderSummary } from "../core/api";
import { MINI_APPS } from "../../functions/miniApps.js";
import { LIVE_SITE, LIVE_TEXT, clipLine, elapsedLabel, latestAdminHelp, liveHref, openIdeas, openPreview, openQuestion, openSummary, parsePreview, parseQuestion, parseStoredFiles, publicLive, questionViews, withoutAdminHelp, withoutStoredFiles, workingStep } from "../../functions/builderHelp.js";
import { auth, db, storage } from "../core/firebase";
import { messageOf } from "../core/api";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../auth/Theme";
import { AssistantMessage } from "./RichMessage";
import { takePendingReport } from "../report/report";
import "./builder.css";

const BUILD_LIST_START = 2;
const BUILD_LIST_MORE = 5;

/** Reload conversation data when the tab comes back after being hidden for a minute. */
function useResume(reload: () => unknown) {
  const latest = useRef(reload);
  useEffect(() => { latest.current = reload; });
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? Date.now() : null;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt != null && Date.now() - hiddenAt >= 60_000) void latest.current();
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}

function BuilderBar() {
  const { profile } = useAuth();
  return (
    <header className="portal-bar bd-bar">
      <Link to="/dashboard" className="portal-brand">
        <img src="/brand/uniqenergy-mark-64.png" alt="" width={32} height={32} />
        <span>UniqEnergy</span>
      </Link>
      <div className="portal-bar-actions">
        <ThemeToggle />
        {profile?.firstName && <span className="portal-firstname">{profile.firstName}</span>}
      </div>
    </header>
  );
}

const STATUS_LABEL: Record<BuilderStatus, string> = { running: "Running", finished: "Finished", error: "Error" };
const SHIP_LABEL = { pr: "PR opened", checks: "Checks", merged: "Merged", deploying: "Deploying", live: "Live", failed: "Failed" } as const;

/** The ship line in the header and the build list. An empty merge says so. */
export function shipLabel(ship: BuilderShip | null) {
  if (!ship) return "";
  if (ship.detail === "No changes.") return "No changes";
  return SHIP_LABEL[ship.phase];
}
const STARTER = [...MINI_APPS.map((app) => app.name), "New mini app"].map((label, index) => ({ key: String.fromCharCode(65 + index), label }));
const BUILDER_ACCENT = MINI_APPS.find((app) => app.id === "builder")?.accent ?? "#0c9a78";

/** A finished chat keeps asking Cursor while it stays open. Fast enough to catch a later run, slow enough to stay quiet. */
export const IDLE_POLL_MS = 40_000;

/** How often to ask the server while the chat is open. A running turn stays fast. */
export function pollDelay(status: BuilderStatus, prUrl: string | null, updatedAt: string | null, now = Date.now(), hasAssistant = true, shipPhase: BuilderShip["phase"] | null = null, shipDetail: string | null = null) {
  const age = updatedAt ? now - Date.parse(updatedAt) : Infinity;
  if (status === "running") return age < 30_000 ? 1500 : 5000;
  if (!hasAssistant && age < 30 * 60 * 1000) return 5000;
  if (shipDetail === "No changes.") return IDLE_POLL_MS;
  if (shipPhase && shipPhase !== "live" && shipPhase !== "failed") return 8000;
  if (status === "finished" && !prUrl && age < 10 * 60 * 1000) return 8000;
  return IDLE_POLL_MS;
}

/** A hidden tab does not poll. Coming back syncs immediately. */
export function pollEvery(delay: number, hidden: boolean) {
  return hidden ? 0 : delay;
}

/** What the failed banner says. A start that never got an agent can be sent again from this chat. */
export function startFailureNote(error: string | null, status: BuilderStatus, agentUrl: string | null) {
  if (!error || status !== "error") return "";
  return agentUrl ? error : `${error} Send a message to start this build.`;
}

export function pillOf(status: BuilderStatus, ship: BuilderShip | null, waiting = false) {
  if (waiting) return { label: "Waiting for you", kind: "wait" };
  if (ship?.detail === "No changes.") return { label: "No changes", kind: "" };
  if (ship?.phase === "failed" || status === "error") return { label: ship?.phase === "failed" ? "Failed" : "Error", kind: "bad" };
  if (ship?.phase === "live") return { label: "Live", kind: "" };
  if (status === "running") return { label: "Running", kind: "run" };
  if (ship) return { label: SHIP_LABEL[ship.phase], kind: "" };
  return { label: STATUS_LABEL[status], kind: "" };
}

export function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

type StoredFile = { path?: string; name: string; size: number; contentType: string; previewUrl?: string };
type Row = { id: string; kind: "user" | "assistant" | "notice"; text: string; at: string; pending?: "sending" | "failed"; localAck?: boolean; files?: StoredFile[]; error?: string; tone?: "live" | "note"; href?: string | null; prUrl?: string | null };

/** Keep the newer live line when a poll and the document listener overlap. */
export function preferLive(current: BuilderLive | null | undefined, next: BuilderLive | null | undefined): BuilderLive | null {
  const a = Date.parse(current?.updatedAt || "");
  const b = Date.parse(next?.updatedAt || "");
  if (Number.isFinite(a) && (!Number.isFinite(b) || a > b)) return current ?? null;
  return next ?? null;
}

/** Timer text, the latest assistant line, and the live step. A missing stream falls back to the saved reply. */
export function workLine(messages: { kind: string; text: string }[], live: BuilderLive | null | undefined) {
  const streamed = clipLine(live?.text || "", 240);
  const fallback = workingStep(messages);
  const text = streamed || (fallback === "Starting" ? "" : fallback);
  const step = clipLine(live?.step || "", 96);
  return { text, step: step || (text ? "" : "Starting"), live: Boolean(step) };
}

export function liveLinkLabel(href: string) {
  try {
    const url = new URL(href);
    if (url.hostname !== "uniqenergy.com") return "uniqenergy.com";
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `uniqenergy.com${path}`;
  } catch {
    return "uniqenergy.com";
  }
}

export function LiveCard({ text, href }: { text: string; href: string }) {
  const link = href || LIVE_SITE;
  return <div className="bd-done" role="status">
    <span className="bd-done-mark" aria-hidden="true">✓</span>
    <div><p>{text}</p><a href={link} target="_blank" rel="noopener noreferrer">{liveLinkLabel(link)}</a></div>
  </div>;
}

function StoredFileChip({ file }: { file: StoredFile }) {
  const [url, setUrl] = useState(file.previewUrl || "");
  useEffect(() => {
    if (url || !file.path) return;
    let live = true;
    getDownloadURL(storageRef(storage, file.path)).then((next) => { if (live) setUrl(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [file.path, url]);
  return <span className="bd-file">{file.contentType.startsWith("image/") && url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`}><img src={url} alt="" /></a> : null}<b>{file.name}</b>{file.size ? <small>{Math.max(1, Math.round(file.size / 1024))} KB</small> : null}</span>;
}

function otherChoice(label: string) {
  return /^(something else|other)\b/i.test(label.trim());
}

/** A tapped option list, or empty when the person typed their own reply. */
function choiceText(options: { key: string; label: string }[], answer: string) {
  const clean = withoutStoredFiles(answer);
  const parts = clean.split(",").map((part) => part.trim()).filter(Boolean);
  const known = parts.length > 0 && parts.every((part) => options.some((option) => part === option.key || part === `${option.key}) ${option.label}`));
  return known ? clean : "";
}

export function QuestionCard({ prompt, options, multi, answer, settled = false, onSubmit, onOther }: { prompt: string; options: { key: string; label: string }[]; multi: boolean; answer: string; settled?: boolean; onSubmit?: (text: string) => void; onOther?: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  if (settled) {
    const line = choiceText(options, answer);
    const chosen = options.find((option) => line === `${option.key}) ${option.label}` || line === option.key);
    if (!line) return <div className="bd-q"><b>{prompt}</b><span className="bd-chosen">Answered below.</span></div>;
    return <div className="bd-q"><b>{prompt}</b>{chosen ? <div className="bd-opt on"><i>{chosen.key}</i>{chosen.label}</div> : null}<span className="bd-chosen">You chose {line}.</span></div>;
  }
  function toggle(key: string) { setPicked((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function choose(option: { key: string; label: string }) {
    if (otherChoice(option.label)) { onOther?.(); return; }
    if (multi) { toggle(option.key); return; }
    onSubmit?.(`${option.key}) ${option.label}`);
  }
  function submit() {
    const choice = other.trim() ? `Other: ${other.trim()}` : picked.map((key) => { const option = options.find((item) => item.key === key); return option ? `${option.key}) ${option.label}` : key; }).join(", ");
    if (choice && onSubmit) onSubmit(choice);
  }
  return <div className="bd-q">
    <b>{prompt}</b>
    <div className="bd-opts">{options.map((option) => <button key={option.key} type="button" className={`bd-opt${picked.includes(option.key) ? " on" : ""}`} onClick={() => choose(option)}><i>{option.key}</i>{option.label}</button>)}</div>
    <input className="bd-other" value={other} placeholder="Other" aria-label="Other" onChange={(event) => setOther(event.target.value)} />
    <button className="bd-submit" type="button" disabled={(multi ? !picked.length : true) && !other.trim()} onClick={submit}>Submit</button>
  </div>;
}

export function IdeasCard({ prompt, options, answer, settled = false, onSubmit }: { prompt: string; options: string[]; answer: string; settled?: boolean; onSubmit?: (text: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const clean = withoutStoredFiles(answer);
  const chosen = clean.split(",").map((item) => item.trim()).filter(Boolean);
  const known = chosen.length > 0 && chosen.every((label) => options.includes(label));
  if (settled) {
    if (!known) return <div className="bd-q"><b>{prompt}</b><span className="bd-chosen">Answered below.</span></div>;
    return <div className="bd-q"><b>{prompt}</b><div className="chips">{chosen.map((label) => <span key={label} className="chip on">{label}</span>)}</div></div>;
  }
  function toggle(label: string) { setPicked((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]); }
  return <div className="bd-q">
    <b>{prompt}</b>
    <div className="chips">{options.map((label) => <button key={label} type="button" className={`chip${picked.includes(label) ? " on" : ""}`} onClick={() => toggle(label)}>{label}</button>)}</div>
    <button className="bd-submit" type="button" disabled={!picked.length} onClick={() => onSubmit?.(picked.join(", "))}>Submit</button>
  </div>;
}

export function SummaryCard({ what, parts, data, extra, answered, onContinue }: { what: string; parts: string; data: string; extra: string; answered: boolean; onContinue?: () => void }) {
  return <div className="bd-q bd-plan">
    <b>Here is what I will build</b>
    {what && <p><span>What</span>{what}</p>}
    {parts && <p><span>Parts</span>{parts}</p>}
    {data && <p><span>Data</span>{data}</p>}
    {extra && <p>{extra}</p>}
    {answered ? <span className="bd-chosen">Continuing to preview.</span> : <div className="bd-plan-actions"><button className="bd-submit" type="button" onClick={onContinue}>Continue to preview</button></div>}
  </div>;
}

export function PreviewCard({ detail, answered, approved, onApprove, onFix }: { detail: string; answered: boolean; approved: boolean; onApprove?: () => void; onFix?: () => void }) {
  const [title, ...rest] = detail.split("\n").map((line) => line.trim()).filter(Boolean);
  return <div className="bd-q">
    <b>{title}</b>
    {rest.length > 0 && <p className="meta">{rest.join(" ")}</p>}
    {approved && <span className="bd-chosen">Approved. Building it.</span>}
    {answered && !approved && <span className="bd-chosen">You asked for a change.</span>}
    {!answered && <div className="bd-plan-actions"><button className="bd-submit" type="button" onClick={onApprove}>Approve</button><button className="bd-change" type="button" onClick={onFix}>Fix</button></div>}
  </div>;
}

export function BuildList({ items, current }: { items: BuilderSummary[]; current: string }) {
  if (!items.length) return <div className="ws-empty">No builds yet.</div>;
  return <ul className="bd-builds">{items.map((item) => <li key={item.id}><Link className="bd-build" to={`/builder/${item.id}`} aria-current={item.id === current ? "page" : undefined}>
    <strong>{item.title || "New build"}</strong>
    <small>{item.ship ? shipLabel(item.ship) : STATUS_LABEL[item.status]} · {item.askedBy}</small>
  </Link></li>)}</ul>;
}

export function ChatColumn({ conversation, extras = [], now, busy = false, refreshing = false, onRefresh, onFix, onAnswer, onRetry, onContinue, onApprove, onPreviewFix, onOther }: { conversation: BuilderConversation; extras?: Row[]; now: number; busy?: boolean; refreshing?: boolean; onRefresh?: () => void; onFix?: () => void; onAnswer?: (text: string) => void; onRetry?: (text: string, id: string) => void; onContinue?: () => void; onApprove?: () => void; onPreviewFix?: () => void; onOther?: () => void }) {
  const messages: Row[] = [...conversation.messages, ...extras];
  const questions = questionViews(messages);
  const question = questions.find((item) => !item.hidden && !item.answered) || null;
  const ideas = openIdeas(messages);
  const summary = openSummary(messages);
  const preview = openPreview(messages);
  const waiting = Boolean((question && !question.answered) || (ideas && !ideas.answered) || (summary && !summary.answered) || (preview && !preview.answered));
  const anchor = [...messages].reverse().find((message) => message.kind === "user")?.at ?? conversation.updatedAt;
  const line = workLine(conversation.messages, conversation.live);
  const liveNotes = messages.filter((message) => message.kind === "notice" && message.tone === "live");
  const ship = conversation.ship;
  const showDone = ship?.phase === "live" && Boolean(conversation.prUrl) && !liveNotes.some((message) => message.prUrl === conversation.prUrl);
  return <div className="bd-col">
    {messages.map((message) => {
      if (message.kind === "notice" && message.tone === "live") return <div key={message.id} className="bd-turn"><LiveCard text={message.text || LIVE_TEXT} href={message.href || liveHref(conversation.messages)} /></div>;
      const text = message.kind === "assistant" ? withoutAdminHelp(message.text) : withoutStoredFiles(message.text);
      const files = message.kind === "user" ? (message.files?.length ? message.files : parseStoredFiles(message.text)) : [];
      const card = questions.find((item) => item.id === message.id && !item.hidden);
      const showQuestion = Boolean(card);
      const showIdeas = Boolean(ideas && message.id === ideas.id);
      const showSummary = Boolean(summary && message.id === summary.id);
      const showPreview = Boolean(preview && message.id === preview.id);
      if (!text && !files.length && !showQuestion && !showIdeas && !showSummary && !showPreview) return null;
      return <div key={message.id} className="bd-turn">
        {(text || files.length > 0) && <div className={`bd-msg ${message.kind}${message.pending === "sending" ? " sending" : ""}`}>
          {text && (message.kind === "assistant" && !message.localAck ? <AssistantMessage text={text} conversationId={conversation.id} /> : text)}
          {message.pending === "sending" && <span className="bd-time">Sending</span>}
          {message.pending !== "sending" && message.pending !== "failed" && <span className="bd-time">{clock(message.at)}</span>}
          {files.length > 0 && <div className="bd-files">{files.map((file) => <StoredFileChip key={file.path || file.name} file={file} />)}</div>}
          {message.pending === "failed" && message.error && <p className="bd-file-error">{message.error}</p>}
          {message.pending === "failed" && onRetry && <button type="button" className="bd-retry" onClick={() => onRetry(message.text, message.id)}>Not sent, Retry</button>}
        </div>}
        {showQuestion && card && <QuestionCard prompt={card.prompt} options={card.options} multi={card.multi} answer={card.answer} settled={card.answered} onSubmit={card.answered ? undefined : onAnswer} onOther={card.answered ? undefined : onOther} />}
        {showIdeas && ideas && <IdeasCard prompt={ideas.prompt} options={ideas.options} answer={ideas.answer} settled={ideas.answered} onSubmit={ideas.answered ? undefined : onAnswer} />}
        {showSummary && summary && <SummaryCard what={summary.what} parts={summary.parts} data={summary.data} extra={summary.extra} answered={summary.answered} onContinue={summary.answered ? undefined : onContinue} />}
        {showPreview && preview && <PreviewCard detail={preview.detail} answered={preview.answered} approved={preview.approved} onApprove={preview.answered ? undefined : onApprove} onFix={preview.answered ? undefined : onPreviewFix} />}
      </div>;
    })}
    {onRefresh && <button type="button" className={refreshing ? "bd-refresh spin" : "bd-refresh"} aria-label="Check for new messages" title="Check for new messages" disabled={refreshing} onClick={onRefresh}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></svg></button>}
    {conversation.status === "running" && !waiting && <div className="bd-work" role="status" aria-live="polite">
      <span className="bd-dot" aria-hidden="true" />
      <p className="bd-work-line">
        <span className="bd-work-time">{elapsedLabel(anchor, now)}</span>
        {line.text ? <span className="bd-work-text" title={line.text}>{line.text}</span> : null}
        {line.step ? <span className={line.live ? "bd-work-step" : "bd-work-quiet"}>{line.step}</span> : null}
      </p>
    </div>}
    {showDone && <LiveCard text={LIVE_TEXT} href={liveHref(conversation.messages)} />}
    {ship?.detail === "No changes." && <div className="bd-note"><div><b>No changes</b><small>The merge did not change production.</small></div></div>}
    {ship?.phase === "merged" && ship.detail !== "No changes." && <div className="bd-note"><div><b>Merged</b><small>{ship.detail || "Waiting for the production deploy."}</small></div></div>}
    {ship?.phase === "deploying" && <div className="bd-note"><div><b>Deploying</b><small>{ship.detail || "Deploying to production."}</small></div></div>}
    {ship?.phase === "failed" && <div className="bd-note bad"><div><b>Failed</b><small>{ship.detail || "The deploy did not finish."}</small></div>{onFix && <button className="ws-button" type="button" disabled={busy} onClick={onFix}>{busy ? "Sending…" : "Ask Builder to fix"}</button>}</div>}
  </div>;
}

/** Keep message objects that did not change so a send does not remount the thread. */
export function mergeConversation(current: BuilderConversation | null, next: BuilderConversation): BuilderConversation {
  if (!current || current.id !== next.id) return next;
  const byId = new Map(current.messages.map((message) => [message.id, message]));
  return { ...next, messages: next.messages.map((message) => {
    const previous = byId.get(message.id);
    return previous && previous.text === message.text && previous.kind === message.kind ? previous : message;
  }) };
}

const NEAR_BOTTOM = 80;

/** True when the reader is within about 80px of the end of the log. */
export function isNearBottom(node: { scrollHeight: number; scrollTop: number; clientHeight: number }, slack = NEAR_BOTTOM) {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= slack;
}

/** A poll that brought the same messages and status. Skip the state update so the log does not re-render. */
export function sameThread(current: BuilderConversation | null, next: BuilderConversation) {
  if (!current || current.id !== next.id) return false;
  if (current.status !== next.status || (current.error ?? "") !== (next.error ?? "")) return false;
  if ((current.ship?.phase ?? "") !== (next.ship?.phase ?? "") || (current.ship?.detail ?? "") !== (next.ship?.detail ?? "")) return false;
  if ((current.live?.step ?? "") !== (next.live?.step ?? "") || (current.live?.text ?? "") !== (next.live?.text ?? "")) return false;
  if (current.messages.length !== next.messages.length) return false;
  for (let i = 0; i < current.messages.length; i += 1) if (current.messages[i].id !== next.messages[i].id) return false;
  const previous = current.messages.at(-1);
  const latest = next.messages.at(-1);
  return (previous?.text ?? "") === (latest?.text ?? "") && (previous?.kind ?? "") === (latest?.kind ?? "");
}

/** The jump pill. A question or a design shot wins over a plain count. */
export function arrivalLabel(items: { kind: string; text: string }[]) {
  const newest = [...items].reverse().find((item) => item.kind === "assistant");
  if (newest && parseQuestion(newest.text)) return "New question";
  if (newest && (parsePreview(newest.text) || /!\[[^\]]*\]\(/.test(newest.text) || /\.(png|jpe?g|gif|webp)\b/i.test(newest.text))) return "Design ready";
  return items.length > 1 ? `${items.length} new messages` : "New message";
}

/** Drop a local bubble once the server has that user text, and the local ack once a real reply exists. */
export function dropSent(rows: Row[], next: BuilderConversation): Row[] {
  return rows.filter((row) => {
    if (row.localAck) return !next.messages.some((message) => message.kind === "assistant" && Date.parse(message.at) >= Date.parse(row.at) - 1000);
    if (row.pending === "failed") return true;
    return !next.messages.some((message) => message.kind === "user" && (message.text === row.text || withoutStoredFiles(message.text) === row.text) && Date.parse(message.at) >= Date.parse(row.at) - 5000);
  });
}

function localTitle(text: string) {
  const line = withoutStoredFiles(text).split("\n").map((part) => part.trim()).find(Boolean) || "New build";
  const flat = line.replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim() || "New build";
  if (flat.length <= 56) return flat;
  const cut = flat.slice(0, 56);
  const space = cut.lastIndexOf(" ");
  return (space > 24 ? cut.slice(0, space) : cut).trim();
}

/** Super-admin chat. The agent opens a pull request and does not merge it. */
export default function BuilderApp() {
  const { conversationId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<BuilderSummary[] | null>(null);
  const [conversation, setConversation] = useState<BuilderConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [outgoing, setOutgoing] = useState<Row[]>([]);
  const [fixing, setFixing] = useState(false);
  const [attached, setAttached] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [hold, setHold] = useState<BuilderConversation | null>(null);
  const flight = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const [checking, setChecking] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const owned = useRef(conversationId);
  const log = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const compose = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const heldFiles = useRef(new Map<string, { id: string; file: File; previewUrl: string }[]>());
  const pinned = useRef(true);
  const followOwn = useRef(false);
  const opened = useRef("");
  const known = useRef<Set<string>>(new Set());
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState<Row[]>([]);
  const [hasMoreBuilds, setHasMoreBuilds] = useState(false);
  const [loadingMoreBuilds, setLoadingMoreBuilds] = useState(false);
  const listLimit = useRef(BUILD_LIST_START);

  const loadList = useCallback(async () => {
    try {
      const { conversations, hasMore } = await listBuilderConversations(listLimit.current);
      setItems(conversations);
      setHasMoreBuilds(hasMore);
    } catch (cause) { setError(messageOf(cause, "Builds could not be loaded. Try again.")); }
  }, []);
  const loadMoreBuilds = useCallback(() => {
    if (loadingMoreBuilds || !hasMoreBuilds) return;
    listLimit.current += BUILD_LIST_MORE;
    setLoadingMoreBuilds(true);
    void loadList().finally(() => setLoadingMoreBuilds(false));
  }, [hasMoreBuilds, loadList, loadingMoreBuilds]);
  const loadOne = useCallback(async (id: string, force = false) => {
    if (!id) return;
    if (flight.current?.id === id) return force ? flight.current.promise : undefined;
    const run = (async () => {
      try {
        const next = (await getBuilderConversation(id, force)).conversation;
        if (owned.current !== id) return;
        setConversation((current) => {
          const live = preferLive(current?.id === next.id ? current.live : null, next.live);
          const merged = { ...next, live };
          return sameThread(current, merged) ? current : mergeConversation(current, merged);
        });
        setOutgoing((rows) => {
          const kept = dropSent(rows, next);
          return kept.length === rows.length && kept.every((row, index) => row === rows[index]) ? rows : kept;
        });
        setItems((current) => {
          if (!current) return current;
          const item = current.find((entry) => entry.id === next.id);
          if (item && item.title === next.title && item.status === next.status && item.prUrl === next.prUrl && item.error === next.error && (item.ship?.phase ?? "") === (next.ship?.phase ?? "") && (item.ship?.detail ?? "") === (next.ship?.detail ?? "") && (item.adminNotice?.at ?? "") === (next.adminNotice?.at ?? "")) return current;
          return current.map((entry) => entry.id === next.id ? { ...entry, title: next.title, status: next.status, prUrl: next.prUrl, error: next.error, updatedAt: next.updatedAt, ship: next.ship, adminNotice: next.adminNotice } : entry);
        });
        setError("");
      } catch (cause) { if (owned.current === id) setError(messageOf(cause, "That build could not be loaded. Try again.")); }
    })();
    const ticket = { id, promise: run };
    flight.current = ticket;
    try { await run; } finally { if (flight.current === ticket) flight.current = null; }
  }, []);

  useEffect(() => {
    if (owned.current === conversationId) return;
    if (owned.current) { setOutgoing([]); setHold(null); }
    owned.current = conversationId;
  }, [conversationId]);
  useEffect(() => { document.title = "Builder | UniqEnergy"; }, []);
  useEffect(() => { void loadList(); }, [loadList]);
  useResume(loadList);
  useEffect(() => { if (conversationId) void loadOne(conversationId, true); else setConversation(null); }, [conversationId, loadOne]);
  useResume(() => { if (conversationId) void loadOne(conversationId, true); });
  useEffect(() => {
    const onChange = () => {
      const isHidden = document.hidden;
      setHidden(isHidden);
      if (!isHidden && conversationId) void loadOne(conversationId, true);
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [conversationId, loadOne]);
  const shown = conversation?.id === conversationId ? conversation : null;
  useEffect(() => {
    const hasAssistant = Boolean(shown?.messages.some((message) => message.kind === "assistant"));
    const delay = shown ? pollEvery(pollDelay(shown.status, shown.prUrl, shown.updatedAt, Date.now(), hasAssistant, shown.ship?.phase ?? null, shown.ship?.detail ?? null), hidden) : 0;
    if (!delay) return;
    const timer = window.setInterval(() => { void loadOne(conversationId, true); }, delay);
    return () => window.clearInterval(timer);
  }, [shown, conversationId, loadOne, hidden]);
  useEffect(() => { if (shown?.status === "running" || outgoing.length) { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); } }, [shown?.status, outgoing.length]);

  function refreshNow() {
    if (!conversationId || checking) return;
    setChecking(true);
    void loadOne(conversationId, true).finally(() => setChecking(false));
  }
  function addFiles(list: File[]) {
    const accepted = list.filter((file) => file.size <= 20 * 1024 * 1024);
    if (accepted.length !== list.length) setError("Each file must be 20 MB or smaller.");
    setAttached((current) => [...current, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" }))].slice(0, 8));
  }
  function uploadError(cause: unknown) {
    const code = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: string }).code || "") : "";
    if (code === "storage/unauthorized" || code === "storage/unauthenticated") return "Storage refused this file. Sign in as a super admin and retry.";
    return messageOf(cause, "That file could not be uploaded.");
  }
  function send(text = draft, retryId?: string, given?: { id: string; file: File; previewUrl: string }[]) {
    const body = text.trim();
    const files = retryId ? heldFiles.current.get(retryId) || [] : given ?? attached;
    if (!body && !files.length) return;
    const id = retryId || `local-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    const at = new Date().toISOString();
    const user: Row = { id, kind: "user", text: body || "Attached files.", at, pending: "sending", files: files.map((item) => ({ name: item.file.name, size: item.file.size, contentType: item.file.type || "application/octet-stream", previewUrl: item.previewUrl })) };
    heldFiles.current.set(id, files);
    const ack: Row = { id: `ack-${id}`, kind: "assistant", text: "Got it. Starting now.", at, localAck: true };
    if (!retryId && !given) { setDraft(""); setAttached([]); }
    setFixing(false);
    followOwn.current = true;
    pinned.current = true;
    setOutgoing((rows) => [...rows.filter((row) => row.id !== id && row.id !== ack.id), user, ack]);
    setError("");
    setMenu(false);
    const target = conversationId;
    void (async () => {
      try {
        const uid = auth.currentUser?.uid || "";
        if (files.length && !uid) throw new Error("Sign in again before attaching a file.");
        const uploaded = [];
        for (const item of files) {
          const path = `builder/${uid}/${target || "new"}/${item.id}-${item.file.name.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
          await uploadBytes(storageRef(storage, path), item.file, { contentType: item.file.type || "application/octet-stream" });
          uploaded.push({ path, name: item.file.name, size: item.file.size, contentType: item.file.type || "application/octet-stream" });
        }
        const next = target ? (await sendBuilderMessage(target, body || "Attached files.", uploaded)).conversation : (await startBuilderConversation(body || "Attached files.", uploaded)).conversation;
        if (!target) { owned.current = next.id; setHold(next); }
        setConversation((current) => mergeConversation(current, next));
        heldFiles.current.delete(id);
        setOutgoing((rows) => dropSent(rows, next));
        void loadList();
        if (!target) { setDrawer(false); navigate(`/builder/${next.id}`); }
      } catch (cause) {
        setOutgoing((rows) => rows.filter((row) => row.id !== ack.id).map((row) => row.id === id ? { ...row, pending: "failed" as const, error: uploadError(cause) } : row));
      }
    })();
  }
  // A "Report" screenshot from another page: start a new build with the marked-up image attached.
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  useEffect(() => {
    if (conversationId) return;
    const report = takePendingReport();
    if (!report) return;
    sendRef.current(report.text, undefined, [{ id: crypto.randomUUID(), file: report.file, previewUrl: URL.createObjectURL(report.file) }]);
  }, [conversationId, location.key]);
  function startWithChoice(choice: string) {
    const label = choice.replace(/^[A-H]\)\s*/, "").replace(/^Other:\s*/, "");
    const extra = draft.trim();
    send(`Mini app: ${label}${extra ? `\n\n${extra}` : ""}`);
  }
  async function notify() {
    if (!conversationId || notifying) return;
    setNotifying(true); setError("");
    try { const next = (await notifyBuilderAdmin(conversationId)).conversation; setConversation(next); setMenu(false); }
    catch (cause) { setError(messageOf(cause, "The admin could not be notified. Try again.")); }
    finally { setNotifying(false); }
  }
  async function saveName() {
    const title = rename.trim();
    if (!title || !conversationId || busy) return;
    setBusy(true); setError("");
    try {
      const next = (await renameBuilderConversation(conversationId, title)).conversation;
      setConversation(next); setRenaming(false); setMenu(false);
      setItems((current) => current?.map((item) => item.id === next.id ? { ...item, title: next.title } : item) ?? current);
    } catch (cause) { setError(messageOf(cause, "The name could not be saved. Try again.")); }
    finally { setBusy(false); }
  }

  const firstOutgoing = outgoing.find((row) => row.kind === "user");
  const preview: BuilderConversation | null = !conversationId && !hold && firstOutgoing ? { id: "local", title: localTitle(firstOutgoing.text), status: "running", prUrl: null, branch: null, error: null, askedBy: "", updatedAt: firstOutgoing.at, ship: null, adminNotice: null, agentUrl: null, messages: [] } : null;
  const view = shown ?? (!conversationId ? hold : null) ?? preview;
  const thread: Row[] = view ? [...view.messages, ...outgoing] : outgoing;
  const threadKey = `${view?.id ?? ""}:${view?.status ?? ""}:${view?.ship?.phase ?? ""}:${thread.map((message) => `${message.id}:${message.pending ?? ""}:${message.text}`).join("|")}`;
  useEffect(() => {
    const root = log.current;
    const target = bottom.current;
    if (!root || !target) return;
    const mark = (near: boolean) => { pinned.current = near; setAtBottom((current) => current === near ? current : near); };
    const observer = new IntersectionObserver(([entry]) => mark(entry.isIntersecting || isNearBottom(root)), { root, rootMargin: "0px 0px 80px 0px", threshold: 0 });
    observer.observe(target);
    const onScroll = () => mark(isNearBottom(root));
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => { observer.disconnect(); root.removeEventListener("scroll", onScroll); };
  }, [view?.id]);
  useEffect(() => {
    const node = log.current;
    if (!node) return;
    const observer = new ResizeObserver(() => { if (pinned.current) node.scrollTop = node.scrollHeight; });
    for (const child of node.querySelectorAll(".bd-col")) observer.observe(child);
    return () => observer.disconnect();
  }, [view?.id, threadKey]);
  useEffect(() => {
    const node = log.current;
    if (!node || !view) return;
    const fresh = thread.filter((message) => message.kind === "assistant" && !message.localAck && !known.current.has(message.id));
    const remember = () => { for (const message of thread) known.current.add(message.id); setUnseen((current) => current.length ? [] : current); };
    if (followOwn.current) {
      followOwn.current = false;
      pinned.current = true;
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      setAtBottom(true);
      remember();
      return;
    }
    if (opened.current !== view.id) {
      if (!thread.length) return;
      opened.current = view.id;
      pinned.current = true;
      node.scrollTop = node.scrollHeight;
      setAtBottom(true);
      remember();
      return;
    }
    if (pinned.current) { node.scrollTop = node.scrollHeight; remember(); return; }
    if (fresh.length) setUnseen((current) => { const ids = new Set(current.map((message) => message.id)); const more = fresh.filter((message) => !ids.has(message.id)); return more.length ? [...current, ...more] : current; });
    // threadKey is the message snapshot. The array itself is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey, view?.id]);
  useEffect(() => {
    if (!atBottom) return;
    for (const message of thread) known.current.add(message.id);
    setUnseen((current) => current.length ? [] : current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atBottom, threadKey]);
  const asked = openQuestion(thread);
  const ideas = openIdeas(thread);
  const summary = openSummary(thread);
  const previewCard = openPreview(thread);
  const waiting = Boolean((asked && !asked.answered) || (ideas && !ideas.answered) || (summary && !summary.answered) || (previewCard && !previewCard.answered));
  useEffect(() => {
    if (!conversationId) return undefined;
    return onSnapshot(doc(db, "builder", conversationId), (snap) => {
      const live = publicLive(snap.data()?.live);
      setConversation((current) => {
        if (!current || current.id !== conversationId) return current;
        const next = preferLive(current.live, live);
        if ((next?.step ?? "") === (current.live?.step ?? "") && (next?.text ?? "") === (current.live?.text ?? "") && (next?.updatedAt ?? "") === (current.live?.updatedAt ?? "")) return current;
        return { ...current, live: next };
      });
    }, () => undefined);
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId || hidden || shown?.status !== "running" || waiting) return undefined;
    let stop = false;
    const pump = async () => {
      while (!stop) {
        try {
          const result = await watchBuilderRun(conversationId);
          if (stop) return;
          if (result.live) setConversation((current) => {
            if (!current || current.id !== conversationId) return current;
            const live = preferLive(current.live, result.live);
            if ((live?.step ?? "") === (current.live?.step ?? "") && (live?.text ?? "") === (current.live?.text ?? "")) return current;
            return { ...current, live };
          });
          if (result.status !== "running") return;
          if (result.done) void loadOne(conversationId, true);
          const remain = result.held && result.holdUntil ? Date.parse(result.holdUntil) - Date.now() : 0;
          const wait = result.held ? Math.min(20_000, Math.max(1_500, remain || 1_500)) : result.done ? 4_000 : 400;
          await new Promise((resolve) => setTimeout(resolve, wait));
        } catch {
          if (stop) return;
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    };
    void pump();
    return () => { stop = true; };
  }, [conversationId, hidden, shown?.status, waiting, loadOne]);
  const placeholder = fixing ? "Tell me what to change" : (asked && !asked.answered) || (ideas && !ideas.answered) ? "Answer the question above or type your own" : "Message";
  const help = view ? latestAdminHelp(view.messages) : null;
  const pill = view ? pillOf(view.status, view.ship, waiting) : null;
  return <main className={`bd-app${drawer ? " is-drawer" : ""}`} style={{ "--accent": BUILDER_ACCENT } as CSSProperties}>
    <BuilderBar />
    {error && <div className="ws-status error bd-alert" role="alert">{error}</div>}
    <div className="bd-body">
      <button className="bd-backdrop" type="button" aria-label="Close builds" onClick={() => setDrawer(false)} />
      <aside className="bd-side" aria-label="Builds">
        <div className="bd-side-top"><button className="bd-new" type="button" onClick={() => { setDrawer(false); setMenu(false); navigate("/builder"); }}>+ New build</button></div>
        {!items && !error && <div className="ws-empty">Loading builds…</div>}
        {items && <BuildList items={items} current={conversationId} />}
        {items && hasMoreBuilds && <button type="button" className="bd-more-builds" disabled={loadingMoreBuilds} onClick={loadMoreBuilds}>{loadingMoreBuilds ? "Loading…" : "Load more"}</button>}
        <div className="bd-side-foot"><Link className="bd-dash" to="/dashboard">← Dashboard</Link></div>
      </aside>
      <section className="bd-main" aria-label="Build conversation">
        <header className="bd-head">
          <button className="bd-icon" type="button" aria-label="Builds" onClick={() => setDrawer(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4.5h12M3 9h12M3 13.5h12" /></svg>
          </button>
          <b className="bd-title">{view?.title || "New build"}</b>
          {pill && <span className={`bd-pill ${pill.kind}`}>{pill.label}</span>}
          <span className="bd-grow" />
          <div className="bd-menu-wrap">
            <button className="bd-more" type="button" aria-label="More" aria-expanded={menu} onClick={() => { setMenu((open) => !open); setRenaming(false); setRename(shown?.title || ""); }}>⋯</button>
            {menu && <div className="bd-menu" role="menu">
              {shown?.prUrl && <a href={shown.prUrl} target="_blank" rel="noopener noreferrer">Open pull request</a>}
              {shown?.agentUrl && <a href={shown.agentUrl} target="_blank" rel="noopener noreferrer">View in Cursor</a>}
              {shown?.branch && <button type="button" onClick={() => { void navigator.clipboard?.writeText(shown.branch || ""); setCopied(true); }}>Branch <span className="hint">{shown.branch}</span> <span className="copy">{copied ? "Copied" : "Copy"}</span></button>}
              {help && (shown?.adminNotice ? <button type="button" disabled>Admin notified</button> : <button type="button" disabled={notifying} onClick={() => void notify()}>{notifying ? "Sending…" : "Notify admin"}</button>)}
              {shown && (renaming ? <form onSubmit={(event) => { event.preventDefault(); void saveName(); }}><input value={rename} aria-label="Build name" onChange={(event) => setRename(event.target.value)} /></form> : <button type="button" onClick={() => { setRenaming(true); setRename(shown.title); }}>Rename</button>)}
              <p className="bd-about">A green Builder pull request merges and deploys on its own. Anything else waits for you. Work stays in this repository.</p>
            </div>}
          </div>
        </header>
        {!conversationId && !view && <div className="bd-log"><div className="bd-col"><QuestionCard prompt="Which mini app should this live in?" options={STARTER} multi={false} answer="" onSubmit={(choice) => startWithChoice(choice)} /></div></div>}
        {conversationId && !view && !error && <div className="bd-fill">Loading the build…</div>}
        {conversationId && !view && error && <div className="bd-fill">That build could not be loaded.</div>}
        {view && <div className="bd-log" ref={log}><ChatColumn conversation={view} extras={outgoing} now={now} busy={busy} refreshing={checking} onRefresh={conversationId ? refreshNow : undefined} onAnswer={(text) => send(text)} onContinue={() => send("Continue to preview")} onApprove={() => send("Approved, build it")} onPreviewFix={() => { setFixing(true); compose.current?.focus(); }} onOther={() => compose.current?.focus()} onRetry={(text, id) => send(text, id)} onFix={view.ship?.phase === "failed" ? () => send(`The deploy failed: ${view.ship?.detail || "it did not finish"}. Fix it and get the pull request green.`) : undefined} />
          {shown && startFailureNote(shown.error, shown.status, shown.agentUrl) && shown.ship?.phase !== "failed" && <div className="bd-col"><div className="bd-banner bad"><div><b>Failed</b><small>{startFailureNote(shown.error, shown.status, shown.agentUrl)}</small></div></div></div>}
          <div className="bd-end" ref={bottom} />
        </div>}
        {unseen.length > 0 && !atBottom && <button className="bd-jump" type="button" onClick={() => { const node = log.current; if (!node) return; pinned.current = true; node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); setAtBottom(true); }}>{arrivalLabel(unseen)} ↓</button>}
        <div className="bd-compose-wrap">
          <form className={`bd-compose${dragging ? " over" : ""}`} onSubmit={(event) => { event.preventDefault(); send(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]); }}>
            {attached.length > 0 && <div className="bd-files">{attached.map((item) => <span key={item.id} className="bd-file">{item.previewUrl && <img src={item.previewUrl} alt="" />}<b>{item.file.name}</b><small>{Math.max(1, Math.round(item.file.size / 1024))} KB</small><button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setAttached((current) => current.filter((file) => file.id !== item.id))}>×</button></span>)}</div>}
            <input ref={picker} type="file" multiple hidden onChange={(event) => { addFiles([...(event.target.files || [])]); event.target.value = ""; }} />
            <button className="bd-clip" type="button" aria-label="Attach files" onClick={() => picker.current?.click()}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7.2 9.6 11.8 5a2.2 2.2 0 0 1 3.1 3.1l-6.2 6.2a3.2 3.2 0 0 1-4.5-4.5l6-6" /></svg></button>
            <textarea ref={compose} value={draft} rows={1} placeholder={placeholder} aria-label="Message" onChange={(event) => setDraft(event.target.value)} onPaste={(event) => { const files = [...event.clipboardData.files]; if (files.length) { event.preventDefault(); addFiles(files); } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
            <button className="bd-send" type="submit" disabled={!draft.trim() && !attached.length} aria-label="Send">↑</button>
          </form>
        </div>
      </section>
    </div>
  </main>;
}
