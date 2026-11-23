// Decides which pull requests Builder may merge, and performs that merge when executed on the runner.
// A pull request qualifies only when it targets production from this repository, is not a draft,
// carries the label builder-auto-deploy, and its body has the exact line "Builder-Auto-Deploy: yes".
// The job polls the current head until checks finish. A GITHUB_TOKEN merge does not start push
// workflows, so the three production deploys are started with workflow_dispatch.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const MARKER = "Builder-Auto-Deploy: yes";
export const LABEL = "builder-auto-deploy";
export const WAIT_MS = 20 * 60 * 1000;
const INTERVAL_MS = 20 * 1000;
const DEPLOYS = ["firebase-hosting-merge.yml", "firebase-functions-merge.yml", "firebase-rules-merge.yml"];
const DONE = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const PENDING = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED", ""]);

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

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function view(number) {
  return JSON.parse(gh(["pr", "view", String(number), "--repo", "rambodc/uniq", "--json", "number,baseRefName,headRepository,headRepositoryOwner,isDraft,state,labels,body,statusCheckRollup"]));
}

function commentOnce(number, body) {
  const comments = JSON.parse(gh(["api", `repos/rambodc/uniq/issues/${number}/comments?per_page=100`]));
  if (comments.some((comment) => comment.body === body)) return;
  gh(["pr", "comment", String(number), "--repo", "rambodc/uniq", "--body", body]);
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
    const result = await waitForChecks(() => view(number).statusCheckRollup, { waitMs });
    if (result.decision === "fail") {
      const note = failureNote(result.checks.failed);
      console.log(`PR ${number}: ${note}`);
      commentOnce(number, note);
      continue;
    }
    if (result.decision !== "merge") { console.log(`PR ${number} checks did not finish within 20 minutes.`); continue; }
    const again = view(number);
    if (!builderPullRequest(again) || !checksReady(again.statusCheckRollup).ready) { console.log(`PR ${number} changed before merge.`); continue; }
    console.log(`Squash-merging PR ${number}.`);
    try {
      gh(["pr", "merge", String(number), "--repo", "rambodc/uniq", "--squash"]);
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
