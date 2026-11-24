// Decides which pull requests Builder may merge, and performs that merge when executed on the runner.
// A pull request qualifies only when it targets production from this repository, is not a draft,
// carries the label builder-auto-deploy, and its body has the exact line "Builder-Auto-Deploy: yes".
// An empty diff against production, or a head commit that already belongs to a merged pull request, is skipped.
// The job waits until checks finish and the Cursor agent is idle. Without a Cursor key, the head commit
// must be at least two minutes old and unchanged on a re-check. A GITHUB_TOKEN merge does not start push
// workflows, so the three production deploys are started with workflow_dispatch.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const MARKER = "Builder-Auto-Deploy: yes";
export const LABEL = "builder-auto-deploy";
export const WAIT_MS = 20 * 60 * 1000;
export const HEAD_SETTLE_MS = 2 * 60 * 1000;
const INTERVAL_MS = 20 * 1000;
const DEPLOYS = ["firebase-hosting-merge.yml", "firebase-functions-merge.yml", "firebase-rules-merge.yml"];
const DONE = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const PENDING = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED", ""]);
const ACTIVE_RUN = new Set(["CREATING", "RUNNING", "WAITING_FOR_BACKGROUND_WORK", "ACTIVE"]);
const API = "https://api.cursor.com";

export function builderPullRequest(pr) {
  const labels = (pr.labels || []).map((label) => label.name || label);
  const owner = pr.headRepositoryOwner?.login || pr.headRepository?.owner?.login;
  const name = pr.headRepository?.name;
  const sameRepo = owner === "rambodc" && name === "uniq";
  const marked = typeof pr.body === "string" && pr.body.split("\n").some((line) => line.trim() === MARKER);
  return pr.baseRefName === "production" && String(pr.state).toUpperCase() === "OPEN" && !pr.isDraft && sameRepo && labels.includes(LABEL) && marked;
}

export function checksReady(rollups) {
  // "merge" is this workflow's own job. It is still in progress while this script decides, so it must not count.
  const checks = (rollups || []).map((check) => ({
    name: check.name || check.context || "",
    status: String(check.status || (check.conclusion || check.state ? "COMPLETED" : "")).toUpperCase(),
    conclusion: String(check.conclusion || check.state || "").toUpperCase(),
  })).filter((check) => check.name !== "Builder auto deploy" && check.name !== "merge");
  if (!checks.length) return { ready: false, failed: [] };
  const failed = checks.filter((check) => check.conclusion && !DONE.has(check.conclusion)).map((check) => check.name);
  const pending = checks.some((check) => PENDING.has(check.status) || !check.conclusion);
  return { ready: failed.length === 0 && !pending, failed };
}

/** fail, merge, timeout, or wait. A failed check stops the wait even if another check is still running. */
export function pollDecision(checks, waitedMs, waitMs = WAIT_MS) {
  if (checks.failed.length) return "fail";
  if (checks.ready) return "merge";
  if (waitedMs >= waitMs) return "timeout";
  return "wait";
}

export function failureNote(names) {
  return `Checks failed: ${names.join(", ")}. Left this pull request open.`;
}

export function emptyNote() {
  return "No file changes against production. Left this pull request open.";
}

export function staleNote() {
  return "This head commit is already in a merged pull request. Left this pull request open.";
}

/** True when the compare against production has no file changes. Missing data is not empty. */
export function diffEmpty(compare) {
  if (!compare || typeof compare !== "object") return false;
  if (String(compare.status || "").toLowerCase() === "identical") return true;
  if (typeof compare.files === "number") return compare.files === 0;
  if (Array.isArray(compare.files)) return compare.files.length === 0;
  return false;
}

/** True when this commit is already on a merged pull request other than the one we are looking at. */
export function headAlreadyMerged(pulls, number) {
  return (Array.isArray(pulls) ? pulls : []).some((pr) => Number(pr.number) !== Number(number) && (pr.merged_at || pr.merged === true));
}

/** The Cursor agent id Cursor writes into the pull request body, or null. */
export function agentIdFromText(text) {
  const match = /(?:cursor\.com\/agents\/|bcId=)(bc-[A-Za-z0-9-]{8,80})/.exec(String(text || ""));
  return match ? match[1] : null;
}

export function runIsActive(status) {
  return ACTIVE_RUN.has(String(status || "").toUpperCase());
}

/** Prefer the run. An agent status is enough when the run was not returned. Unknown when both are missing. */
export function activityFrom({ agentStatus, runStatus } = {}) {
  if (runStatus) return { known: true, active: runIsActive(runStatus) };
  if (agentStatus) return { known: true, active: runIsActive(agentStatus) };
  return { known: false, active: false };
}

export function headIsSettled(committedAt, now, minMs = HEAD_SETTLE_MS) {
  const at = Date.parse(committedAt || "");
  return Number.isFinite(at) && now - at >= minMs;
}

/**
 * empty and stale skip immediately. A known active Cursor run waits.
 * Without a Cursor result, the head commit must be two minutes old, and the same sha must be seen again.
 */
export function mergeDecision(snap, { waitedMs = 0, waitMs = WAIT_MS, now = 0, seenSha = "" } = {}) {
  if (!snap?.qualifies) return "skip";
  if (snap.empty) return "empty";
  if (snap.alreadyMerged) return "stale";
  const checks = snap.checks || { ready: false, failed: [] };
  if (checks.failed?.length) return "fail";
  const expired = waitedMs >= waitMs;
  if (!checks.ready) return expired ? "timeout" : "wait";
  const headMoved = Boolean(seenSha && snap.sha && snap.sha !== seenSha);
  if (snap.agentKnown) return snap.agentActive || headMoved ? (expired ? "timeout" : "wait") : "merge";
  const settled = headIsSettled(snap.committedAt, now);
  const seenBefore = Boolean(snap.sha && snap.sha === seenSha);
  if (headMoved || !settled || !seenBefore) return expired ? "timeout" : "wait";
  return "merge";
}

export function candidateNumbers(event, env = process.env) {
  const numbers = [];
  const add = (value) => {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0) numbers.push(number);
  };
  add(env.PR_NUMBER);
  add(event.inputs?.pull_request);
  add(event.pull_request?.number);
  for (const pr of event.workflow_run?.pull_requests || []) add(pr.number);
  return [...new Set(numbers)];
}

export function headSha(event, env = process.env) {
  return env.CHECK_SHA || event.workflow_run?.head_sha || event.pull_request?.head?.sha || "";
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until checks pass, a check fails, or the wait is over. `load` returns the current rollup. */
export async function waitForChecks(load, { waitMs = WAIT_MS, intervalMs = INTERVAL_MS, sleep = delay, now = Date.now } = {}) {
  const start = now();
  for (;;) {
    const checks = checksReady(await load());
    const decision = pollDecision(checks, now() - start, waitMs);
    if (decision !== "wait") return { decision, checks };
    await sleep(intervalMs);
  }
}

/** Polls until the pull request may merge, must be skipped, or the wait is over. `load` returns one snapshot. */
export async function waitUntilMerge(load, { waitMs = WAIT_MS, intervalMs = INTERVAL_MS, sleep = delay, now = Date.now } = {}) {
  const start = now();
  let seenSha = "";
  for (;;) {
    const snap = await load();
    const decision = mergeDecision(snap, { waitedMs: now() - start, waitMs, now: now(), seenSha });
    if (snap?.sha) seenSha = snap.sha;
    if (decision !== "wait") return { decision, snap };
    await sleep(intervalMs);
  }
}

function listedAgents(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.agents)) return payload.agents;
  return [];
}

/** The agent for this pull request, from a prUrl filter, an id, or a branch name on a v0 list. */
export function agentMatching(payload, { prUrl, branch, agentId, filtered = false } = {}) {
  const items = listedAgents(payload);
  if (agentId) {
    const found = items.find((item) => item?.id === agentId);
    if (found) return found;
  }
  if (prUrl) {
    const found = items.find((item) => item?.target?.prUrl === prUrl);
    if (found) return found;
  }
  if (branch) {
    const found = items.find((item) => item?.target?.branchName === branch);
    if (found) return found;
  }
  return filtered ? items[0] || null : null;
}

/** Cursor run activity for this pull request. Unknown when the key is missing or Cursor cannot be read. */
export async function readCursorActivity(apiKey, { prUrl, branch, body }, fetchImpl = globalThis.fetch) {
  if (!apiKey) return { known: false, active: false };
  const headers = { Authorization: `Basic ${globalThis.Buffer.from(`${apiKey}:`).toString("base64")}`, Accept: "application/json" };
  const agentId = agentIdFromText(body);
  async function getJson(url) {
    const response = await fetchImpl(url, { headers });
    if (!response?.ok) return null;
    return response.json();
  }
  try {
    let agent = null;
    if (agentId) agent = await getJson(`${API}/v1/agents/${encodeURIComponent(agentId)}`);
    if (!agent?.id && prUrl) {
      const listed = await getJson(`${API}/v1/agents?limit=20&prUrl=${encodeURIComponent(prUrl)}`);
      agent = agentMatching(listed, { prUrl, filtered: true });
    }
    if (!agent?.id && branch) {
      const listed = await getJson(`${API}/v0/agents?limit=100`);
      agent = agentMatching(listed, { prUrl, branch, agentId });
    }
    if (!agent?.id) return { known: false, active: false };
    if (agent.latestRunId) {
      const run = await getJson(`${API}/v1/agents/${encodeURIComponent(agent.id)}/runs/${encodeURIComponent(agent.latestRunId)}`);
      if (run?.status) return activityFrom({ agentStatus: agent.status, runStatus: run.status });
    }
    return activityFrom({ agentStatus: agent.status });
  } catch {
    return { known: false, active: false };
  }
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ghJson(args) {
  try {
    return JSON.parse(gh(args));
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).replace(/\s+/g, " ").trim().slice(0, 240);
    if (detail) console.log(detail);
    return null;
  }
}

function view(number) {
  return JSON.parse(gh(["pr", "view", String(number), "--repo", "rambodc/uniq", "--json", "number,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,isDraft,state,labels,body,statusCheckRollup"]));
}

function commentOnce(number, body) {
  const comments = JSON.parse(gh(["api", `repos/rambodc/uniq/issues/${number}/comments?per_page=100`]));
  if (comments.some((comment) => comment.body === body)) return;
  gh(["pr", "comment", String(number), "--repo", "rambodc/uniq", "--body", body]);
}

async function snapshot(number) {
  const pr = view(number);
  const sha = /^[0-9a-f]{7,64}$/i.test(pr.headRefOid || "") ? pr.headRefOid : "";
  const qualifies = builderPullRequest(pr);
  if (!qualifies || !sha) return { qualifies, checks: checksReady(pr.statusCheckRollup), empty: false, alreadyMerged: false, agentKnown: false, agentActive: false, committedAt: "", sha };
  const compare = ghJson(["api", `repos/rambodc/uniq/compare/production...${sha}`, "--jq", "{status:.status,files:(.files//[]|length)}"]);
  const pulls = ghJson(["api", `repos/rambodc/uniq/commits/${sha}/pulls`, "-H", "Accept: application/vnd.github+json"]);
  const commit = ghJson(["api", `repos/rambodc/uniq/commits/${sha}`, "--jq", "{date:(.commit.committer.date // .commit.author.date)}"]);
  const cursor = await readCursorActivity(process.env.CURSOR_API_KEY || "", {
    prUrl: `https://github.com/rambodc/uniq/pull/${number}`,
    branch: pr.headRefName || "",
    body: pr.body || "",
  });
  return {
    qualifies,
    checks: checksReady(pr.statusCheckRollup),
    empty: diffEmpty(compare),
    alreadyMerged: headAlreadyMerged(pulls, number),
    agentKnown: cursor.known,
    agentActive: cursor.active,
    committedAt: commit?.date || "",
    sha,
  };
}

export async function run() {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  let numbers = candidateNumbers(event);
  const sha = headSha(event);
  if (!numbers.length && sha) {
    const found = JSON.parse(gh(["api", `repos/rambodc/uniq/commits/${sha}/pulls`, "-H", "Accept: application/vnd.github+json"]));
    numbers = found.map((pr) => pr.number);
  }
  const waitMs = Number(process.env.CHECK_WAIT_MS || WAIT_MS);
  for (const number of numbers) {
    const pr = view(number);
    if (!builderPullRequest(pr)) { console.log(`PR ${number} is not a Builder auto-deploy pull request.`); continue; }
    const result = await waitUntilMerge(() => snapshot(number), { waitMs });
    if (result.decision === "empty") {
      console.log(`PR ${number}: ${emptyNote()}`);
      commentOnce(number, emptyNote());
      continue;
    }
    if (result.decision === "stale") {
      console.log(`PR ${number}: ${staleNote()}`);
      commentOnce(number, staleNote());
      continue;
    }
    if (result.decision === "fail") {
      const note = failureNote(result.snap.checks.failed);
      console.log(`PR ${number}: ${note}`);
      commentOnce(number, note);
      continue;
    }
    if (result.decision !== "merge") { console.log(`PR ${number} is not ready to merge (${result.decision}).`); continue; }
    const again = await snapshot(number);
    const head = again.sha;
    if (!again.qualifies || again.empty || again.alreadyMerged || !again.checks.ready || again.sha !== result.snap.sha || !head) {
      console.log(`PR ${number} changed before merge.`);
      continue;
    }
    if (again.agentKnown && again.agentActive) { console.log(`PR ${number} Cursor agent is still running.`); continue; }
    console.log(`Squash-merging PR ${number} at ${head}.`);
    try {
      gh(["pr", "merge", String(number), "--repo", "rambodc/uniq", "--squash", "--match-head-commit", head, "--delete-branch"]);
    } catch (error) {
      if (String(view(number).state).toUpperCase() === "OPEN") throw error;
      console.log(`PR ${number} is no longer open.`);
      continue;
    }
    for (const file of DEPLOYS) {
      console.log(`Starting ${file} on production.`);
      gh(["workflow", "run", file, "--repo", "rambodc/uniq", "--ref", "production"]);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("builder-auto-deploy.mjs")) {
  run().catch((error) => { console.error(error); process.exit(1); });
}
