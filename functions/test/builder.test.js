import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { BUILDER_MODEL, BuilderError, NOT_CONFIGURED, REPO_URL, STARTING_REF, UNTITLED, artifactRef, chatSummary, continuationBody, continuationPrompt, createAgent, createBody, cursorImages, emptyStream, eventCursor, fetchArtifact, foldStreamEvent, followBody, followCursorStream, followPrompt, generatedTitle, githubAuthToken, githubGet, liveNotice, liveNoticeId, liveRecord, loadRemote, messageView, messageWithFiles, modelRejected, needsFreshAgent, nextState, normalizeBuilderFiles, patchChanged, promptFiles, promptFor, publicCursorError, pullRequestFrom, pullRequestSettled, readCursorKey, repliesToWrite, requestText, sendFollowUp, shipFromGitHub, shipMeansSettled, shouldPostLiveNotice, shouldRefresh, streamFailure, streamPath, summaryView, takeSseEvents, titleFrom, toolStepLabel, viewStatus } from "../builder.js";
import { LIVE_TEXT, latestAdminHelp, liveHref, openPreview, parseAdminHelp, parseQuestion, publicLive, questionViews, withoutAdminHelp, withoutStoredFiles } from "../builderHelp.js";
import { EMAIL_FROM, RESEND_SINK, buildBuilderAdminEmail, builderNotifyAddress, sendBuilderAdminEmail } from "../mailer.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const json = (status, data) => ({ status, text: async () => JSON.stringify(data) });
const ask = "Add a green-only notes mini app for super admins.";

test("every Cursor prompt starts with the standing instructions and then the request", () => {
  const prompt = promptFor(`  ${ask}  `);
  assert.ok(prompt.startsWith("Standing instructions"));
  assert.ok(prompt.indexOf(REPO_URL) < prompt.indexOf(ask));
  assert.match(prompt, /Do not merge or push to production yourself\. The automation does that\. Do not read or change secrets or IAM\./);
  assert.match(prompt, /Builder-Auto-Deploy: yes/);
  assert.match(prompt, /builder-auto-deploy/);
  assert.match(prompt, /production branch/);
  assert.match(prompt, /Mini app: Wells/);
  assert.match(prompt, /Do not ask that again/);
  assert.match(prompt, /Also change other mini apps/);
  assert.match(prompt, /Everything goes in one pull request/);
  assert.match(prompt, /one Firestore top-level collection per mini app/);
  assert.doesNotMatch(prompt, /one mini app per chat/i);
  assert.doesNotMatch(prompt, /:::builder-new-chat/);
  assert.match(prompt, /Ask at most one question at a time/);
  assert.match(prompt, /each option on its own line/);
  assert.match(prompt, /QUESTION:\n<one question>\nA\) <choice>\nB\) <choice>\nC\) <choice>/);
  assert.match(prompt, /TITLE:/);
  assert.match(prompt, /IDEAS:\n<one line>\n- <idea>/);
  assert.match(prompt, /BUILD:\nWhat: <what you will build>\nParts: <every mini app or app-wide area this touches>\nData: <no change, or the schema change; data that will not fit is deleted, with no conversion>\nCONTINUE:/);
  assert.match(prompt, /PREVIEW:\n<short list of planned changes>\nAPPROVE:/);
  assert.match(prompt, /No code until the plan is approved/);
  assert.match(prompt, /If they tell you to build it, that is the approval/);
  assert.match(prompt, /Only make a screenshot when they explicitly ask for one/);
  assert.match(prompt, /Do not create a screenshot, a mockup, or a visual preview unless they ask/);
  assert.match(prompt, /only permanent branch/);
  assert.doesNotMatch(prompt, /required step|before building, (make|create) a screenshot/i);
  assert.doesNotMatch(prompt, /dark-theme/);
  assert.match(prompt, /There is no final question/);
  assert.match(prompt, /Do not say the change is live, done, or on production/);
  assert.match(prompt, /The app posts that message after the production deploy succeeds/);
  assert.match(prompt, /That line is the page path/);
  assert.ok(prompt.indexOf("Mini app: Wells") < prompt.indexOf("After approval"));
  assert.doesNotMatch(prompt, /dark and light/);
  assert.doesNotMatch(prompt, /Cursor's question tool/);
  assert.doesNotMatch(prompt, /git fetch/);
  assert.match(prompt, /Live route: \/path/);
  assert.match(prompt, /Read AGENTS\.md first\. Only open code when that guide is not enough\./);
  assert.doesNotMatch(prompt, /docs\/mini-apps\/wells\.md/);
  assert.match(prompt, /update its docs\/mini-apps\/<id>\.md/);
  assert.match(prompt, /update the list in AGENTS\.md/);
  assert.match(prompt, /fully blocked/);
  assert.match(prompt, /:::builder-admin-help/);
  assert.ok(prompt.indexOf(":::builder-admin-help") < prompt.indexOf("The request:"));
  assert.ok(prompt.endsWith(ask));
  assert.equal(promptFor(ask).split(ask).length, 2, "the request is included once");
});

test("the first prompt names the mini-app docs to read, and a new mini app creates one", () => {
  const wells = promptFor("Mini app: Wells\n\nShow the spud date.");
  assert.match(wells, /Read AGENTS\.md and docs\/mini-apps\/wells\.md first\. Only open code when those docs are not enough\./);
  assert.ok(wells.endsWith("Mini app: Wells\n\nShow the spud date."));
  const both = promptFor("Mini app: Wells, Inventory Bot");
  assert.match(both, /Read AGENTS\.md and docs\/mini-apps\/inventoryBot\.md and docs\/mini-apps\/wells\.md first/);
  const created = promptFor("Mini app: New mini app");
  assert.match(created, /Read AGENTS\.md first\. This is a new mini app: create docs\/mini-apps\/<id>\.md/);
  assert.match(created, /add that app to the list in AGENTS\.md/);
  assert.doesNotMatch(created, /docs\/mini-apps\/[a-z]+\.md/);
});

test("a new agent is limited to this repo, branches from production, and opens a pull request", () => {
  const body = createBody(ask);
  assert.equal(body.prompt.text, promptFor(ask));
  assert.deepEqual(body.repos, [{ url: REPO_URL, startingRef: STARTING_REF }]);
  assert.equal(STARTING_REF, "production");
  assert.equal(body.autoCreatePR, true);
  assert.deepEqual(body.model, BUILDER_MODEL);
  assert.equal(body.workOnCurrentBranch, false);
  assert.equal(Object.hasOwn(body, "envVars"), false);
  assert.doesNotMatch(JSON.stringify(body), /CURSOR_API_KEY|api[_-]?key/i);
});

test("a chat stays New build until one title line, and files stay in the signed-in folder", () => {
  assert.equal(generatedTitle(UNTITLED, [{ kind: "assistant", text: "Looking.\nTITLE: Update Safety" }]), "Update Safety");
  assert.equal(generatedTitle("Fleet board", [{ kind: "assistant", text: "TITLE: Something else" }]), "");
  assert.equal(generatedTitle("New build", [{ kind: "assistant", text: "TITLE: New build" }]), "");
  assert.equal(withoutAdminHelp("Done.\nTITLE: Update Safety\nLive route: /safety"), "Done.\nLive route: /safety");
  const files = normalizeBuilderFiles("uid-1", [{ path: "builder/uid-1/new/a.png", name: "a.png", size: 12, contentType: "image/png" }]);
  assert.equal(files[0].name, "a.png");
  assert.throws(() => normalizeBuilderFiles("uid-1", [{ path: "builder/other/a.png", name: "a.png", size: 12, contentType: "image/png" }]), /not in your builder folder/);
  assert.throws(() => normalizeBuilderFiles("uid-1", [{ path: "builder/uid-1/a.png", name: "a.png", size: 21 * 1024 * 1024, contentType: "image/png" }]), /20 MB/);
  const stored = messageWithFiles("Mini app: Safety", files);
  assert.match(stored, /:::builder-files/);
  assert.match(promptFiles("Mini app: Safety", [{ name: "a.png", contentType: "image/png", url: "https://example.test/a.png" }]), /Open each URL and use the file/);
  const shot = { data: "aGVsbG8=", mimeType: "image/jpeg" };
  const body = createBody(ask, [shot, "https://example.test/a.png", { url: "http://example.test/nope.png" }]);
  assert.deepEqual(body.prompt.images, [shot, { url: "https://example.test/a.png" }]);
  assert.equal(cursorImages([{ data: "abc", mimeType: "image/jpg" }])[0].mimeType, "image/jpeg");
  assert.equal(Object.hasOwn(createBody(ask).prompt, "images"), false);
  const steered = followBody(ask, true, { images: [shot] });
  assert.equal(steered.delivery, "steer");
  assert.deepEqual(steered.prompt.images, [shot]);
  assert.deepEqual(Object.keys(steered).sort(), ["delivery", "prompt"]);
  assert.match(promptFiles("See this", [{ name: "notes.pdf", contentType: "application/pdf", url: "https://example.test/notes.pdf" }]), /Open each URL and use the file/);
  const storage = read("../../storage.rules");
  assert.match(storage, /request\.auth\.uid == uid/);
  assert.match(storage, /20 \* 1024 \* 1024/);
  const builderStart = storage.indexOf("match /builder/{uid}");
  const builderEnd = storage.indexOf("match /{allPaths=**}", builderStart);
  assert.ok(builderStart >= 0 && builderEnd > builderStart);
  assert.doesNotMatch(storage.slice(builderStart, builderEnd), /firestore\.(get|exists)\(/, "a Firestore lookup on the Builder path denies uploads");
  const views = questionViews([
    { id: "a", kind: "assistant", text: "QUESTION:\nWhich one?\nA) Safety\nB) Party" },
    { id: "b", kind: "assistant", text: "QUESTION:\nHow many?\nA) Ten\nB) All" },
  ]);
  assert.equal(views[0].hidden, false);
  assert.equal(views[1].hidden, true);
  const next = questionViews([
    { id: "a", kind: "assistant", text: "QUESTION:\nWhich one?\nA) Safety\nB) Party" },
    { id: "c", kind: "user", text: "A) Safety" },
    { id: "b", kind: "assistant", text: "QUESTION:\nHow many?\nA) Ten\nB) All" },
  ]);
  assert.equal(next[0].answered, true);
  assert.equal(next[1].hidden, false);
});

test("an inline question still becomes a card", () => {
  const inline = "QUESTION: Which view should this be? A) Executive dashboard B) Internal notes C) Something else";
  const parsed = parseQuestion(inline);
  assert.equal(parsed.prompt, "Which view should this be?");
  assert.deepEqual(parsed.options.map((option) => option.label), ["Executive dashboard", "Internal notes", "Something else"]);
  assert.equal(parsed.options.map((option) => option.key).join(""), "ABC");
  const bold = parseQuestion("**QUESTION:** Which view should this be? **A)** Executive dashboard **B.** Internal notes **C:** Something else");
  assert.equal(bold.prompt, "Which view should this be?");
  assert.deepEqual(bold.options.map((option) => `${option.key} ${option.label}`), ["A Executive dashboard", "B Internal notes", "C Something else"]);
  const lines = parseQuestion("Intro.\nQUESTION:\nWhich one?\nA) Safety\nB) Party\n\nAfter.");
  assert.equal(lines.prompt, "Which one?");
  assert.equal(withoutAdminHelp(`Intro. ${inline}`), "Intro.");
  assert.equal(withoutAdminHelp("Intro.\nQUESTION:\nWhich one?\nA) Safety\nB) Party\n\nAfter."), "Intro.\n\nAfter.");
  assert.equal(parseQuestion("No options here."), null);
});

test("a build title is the first user message", () => {
  const wrapped = ":::builder-files\nbuilder/uid/a.png|a.png|12|image/png\n:::\nMini app: Safety";
  assert.equal(withoutStoredFiles(wrapped), "Mini app: Safety");
  assert.equal(titleFrom(wrapped), "Mini app: Safety");
  assert.equal(promptFiles(wrapped, []), "Mini app: Safety");
  assert.equal(questionViews([{ id: "q", kind: "assistant", text: "QUESTION:\nWhich one?\nA) Safety\nB) Party" }, { id: "u", kind: "user", text: wrapped.replace("Mini app: Safety", "Use the logo") }])[0].answer, "Use the logo");
  assert.equal(openPreview([{ id: "q", kind: "assistant", text: "PREVIEW:\nChange the header.\nAPPROVE:" }, { id: "u", kind: "user", text: wrapped.replace("Mini app: Safety", "Approved, build it") }]).approved, true);
  assert.equal(titleFrom("Hello"), "Hello");
  assert.equal(titleFrom("Please add a green-only notes mini app for super admins."), "Please add a green-only notes mini app for super admins");
  const long = titleFrom(`${"word ".repeat(40)}`);
  assert.ok(long.length <= 56, long);
  assert.equal(long.startsWith("word "), true);
  assert.equal(createBody(ask).name, titleFrom(ask));
  assert.equal(summaryView("abc", { title: "Notes mini app", status: "running", askedBy: "a@uniquem.ca", adminNotice: { at: "2026-11-22T18:10:00.000Z", by: "a@uniquem.ca" } }).adminNotice.by, "a@uniquem.ca");
  assert.equal(summaryView("abc", { title: "Notes", status: "running", askedBy: "a@uniquem.ca" }).adminNotice, null);
});

const helpBlock = ["Done what I can.", "", ":::builder-admin-help", "blocked: The DNS record is missing.", "why: Only the Grok Bot admin can change DNS.", "action: Add the TXT record at the host.", "and wait for it to propagate.", "context: Build abc.", ":::"].join("\n");

test("a help block is recognized only when all four lines are present", () => {
  assert.equal(parseAdminHelp("Opened the pull request."), null);
  assert.equal(parseAdminHelp(":::builder-admin-help\nblocked: x\n:::"), null);
  const help = parseAdminHelp(helpBlock);
  assert.equal(help.blocked, "The DNS record is missing.");
  assert.equal(help.action, "Add the TXT record at the host. and wait for it to propagate.");
  assert.equal(withoutAdminHelp(helpBlock), "Done what I can.");
  assert.deepEqual(latestAdminHelp([{ kind: "assistant", text: "No block here." }, { kind: "user", text: helpBlock }, { kind: "assistant", text: helpBlock }]).blocked, "The DNS record is missing.");
  assert.equal(latestAdminHelp([{ kind: "assistant", text: "All set." }]), null);
});

test("an admin notification uses the existing sender and the test sink never leaves Resend", async () => {
  assert.equal(builderNotifyAddress({ BUILDER_NOTIFY_SINK: "test" }), RESEND_SINK);
  assert.equal(builderNotifyAddress({}), "rambodr@uniquem.ca");
  const help = parseAdminHelp(helpBlock);
  const message = buildBuilderAdminEmail({ to: builderNotifyAddress({ BUILDER_NOTIFY_SINK: "test" }), askedByName: "Rambod R", askedByEmail: "rambod@uniquem.ca", title: "Notes mini app", link: "https://uniqenergy.com/builder/abc", request: "Please add a notes mini app.", help, prUrl: "https://github.com/rambodc/uniq/pull/70" });
  assert.deepEqual(message.to, [RESEND_SINK]);
  assert.equal(message.from, EMAIL_FROM);
  assert.match(message.text, /Who asked: Rambod R <rambod@uniquem.ca>/);
  assert.match(message.text, /https:\/\/uniqenergy\.com\/builder\/abc/);
  assert.match(message.text, /Please add a notes mini app\./);
  assert.match(message.text, /Add the TXT record at the host\./);
  assert.match(message.text, /https:\/\/github\.com\/rambodc\/uniq\/pull\/70/);
  assert.equal(message.to.includes("rambodr@uniquem.ca"), false);
  let posted = null;
  const sent = await sendBuilderAdminEmail(message, "test-key", { idempotencyKey: "builder-admin/abc", fetchImpl: async (_url, init) => { posted = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ id: "email_123" }), headers: { get: () => null } }; }, wait: async () => {} });
  assert.equal(sent.id, "email_123");
  assert.deepEqual(posted.to, [RESEND_SINK]);
  assert.equal(posted.to.includes("rambodr@uniquem.ca"), false);
  assert.match(read("../builder-functions.js"), /builderNotifyAddress\(\)/);
});

test("a follow-up steers with only prompt and delivery, and an idle follow-up starts a run", () => {
  assert.deepEqual(Object.keys(followBody(ask, true)).sort(), ["delivery", "prompt"]);
  assert.equal(followBody(ask, true).delivery, "steer");
  assert.equal(Object.hasOwn(followBody(ask, false), "delivery"), false);
  assert.deepEqual(followBody(ask, false).model, BUILDER_MODEL);
  assert.equal(followBody(ask, false).prompt.text, followPrompt(ask));
  assert.equal(followPrompt(ask).includes("Standing instructions"), false);
  assert.equal(followPrompt(ask).includes(":::builder-admin-help"), false);
  assert.match(followPrompt(ask), /QUESTION:\n<one question>\nA\) <choice>/);
  assert.match(followPrompt(ask), /IDEAS:\n<one line>\n- <idea>/);
  assert.match(followPrompt(ask), /BUILD:\nWhat:/);
  assert.match(followPrompt(ask), /Parts: <every mini app or app-wide area this touches>/);
  assert.match(followPrompt(ask), /Everything goes in one pull request/);
  assert.doesNotMatch(followPrompt(ask), /one mini app per chat/i);
  assert.doesNotMatch(followPrompt(ask), /:::builder-new-chat/);
  assert.match(followPrompt(ask), /CONTINUE:/);
  assert.match(followPrompt(ask), /PREVIEW:\n<short list of planned changes>\nAPPROVE:/);
  assert.match(followPrompt(ask), /Only make a screenshot when they explicitly ask for one/);
  assert.match(followPrompt(ask), /Do not create a screenshot, a mockup, or a visual preview unless they ask/);
  assert.doesNotMatch(followPrompt(ask), /dark-theme/);
  assert.match(followPrompt(ask), /TITLE:/);
  assert.match(followPrompt(ask), /until the plan is approved/);
  assert.match(followPrompt(ask), /If they tell you to build it, that is the approval/);
  assert.match(followPrompt(ask), /builder-auto-deploy/);
  assert.match(followPrompt(ask), /Do not merge or push to production yourself/);
  assert.match(followPrompt(ask), /Do not say the change is live, done, or on production/);
  assert.match(followPrompt(ask), /The app posts that message after the production deploy succeeds/);
  assert.match(followPrompt(ask), /Do not read or change secrets or IAM/);
  assert.match(followPrompt(ask), /update its docs\/mini-apps\/<id>\.md/);
  assert.match(followPrompt(ask), /update the list in AGENTS\.md/);
  assert.equal(followPrompt(ask).includes("PLAN:"), false);
  assert.doesNotMatch(followPrompt(ask), /Cursor's question tool/);
  assert.match(read("../builder-functions.js"), /warmBuilderCall = \{ \.\.\.builderCall, minInstances: 1 \}/);
  const sendSource = read("../builder-functions.js").split("export const sendBuilderMessage")[1].split("export const renameBuilderConversation")[0];
  assert.match(sendSource, /warmBuilderCall/);
  assert.doesNotMatch(sendSource, /await refresh/);
  assert.match(sendSource, /needsFreshAgent\(data\)/);
  assert.match(sendSource, /chatSummary\(/);
  assert.match(sendSource, /prUrl: null/);
  assert.match(sendSource, /ship: FieldValue\.delete\(\)/);
  assert.match(read("../builder-functions.js").split("export const getBuilderConversation")[1].split("export const ")[0], /warmBuilderCall/);
  assert.match(read("../builder-functions.js").split("export const startBuilderConversation")[1].split("export const ")[0], /warmBuilderCall/);
  assert.equal(Object.hasOwn(followBody(ask, true), "model"), false);
});

test("the secret must be present, and a missing one is a clear configuration error", () => {
  assert.equal(readCursorKey({ value: () => "  cursor-key  " }), "cursor-key");
  for (const secret of [undefined, {}, { value: () => "" }, { value: () => "   " }, { value: () => { throw new Error("secret CURSOR_API_KEY not found"); } }]) {
    assert.throws(() => readCursorKey(secret), (error) => error instanceof BuilderError && error.message === NOT_CONFIGURED && !/cursor-key|not found/i.test(error.message));
  }
});

test("request text is required and capped", () => {
  assert.equal(requestText("  Hello  "), "Hello");
  assert.throws(() => requestText(""), /Enter what you want built/);
  assert.throws(() => requestText("x".repeat(8001)), /8000/);
  assert.throws(() => requestText(null), /Enter what you want built/);
});

test("run status becomes running, finished, or error", () => {
  assert.equal(viewStatus("CREATING", "IDLE"), "running");
  assert.equal(viewStatus("RUNNING", "ACTIVE"), "running");
  assert.equal(viewStatus("WAITING_FOR_BACKGROUND_WORK", "ACTIVE"), "running");
  assert.equal(viewStatus("FINISHED", "IDLE"), "finished");
  assert.equal(viewStatus("CANCELLED", "IDLE"), "finished");
  assert.equal(viewStatus("ERROR", "IDLE"), "error");
  assert.equal(viewStatus("EXPIRED", "IDLE"), "error");
  assert.equal(viewStatus(undefined, "ACTIVE"), "running");
  assert.equal(viewStatus(undefined, "ARCHIVED"), "finished");
});

test("the pull request url has to be a pull request on this repo", () => {
  const run = { git: { branches: [
    { repoUrl: "github.com/other/repo", branch: "cursor/nope", prUrl: "https://github.com/other/repo/pull/4" },
    { repoUrl: "https://github.com/rambodc/uniq.git", branch: "cursor/notes-a140", prUrl: "https://github.com/rambodc/uniq/pull/61" },
  ] } };
  assert.deepEqual(pullRequestFrom(run), { prUrl: "https://github.com/rambodc/uniq/pull/61", branch: "cursor/notes-a140" });
  assert.deepEqual(pullRequestFrom({ git: { branches: [{ repoUrl: "github.com/rambodc/uniq", prUrl: "javascript:alert(1)" }] } }), { prUrl: null, branch: null });
});

test("creating an agent sends the standing prompt and keeps the key out of the body", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return json(201, { agent: { id: "bc-00000000-0000-0000-0000-000000000001", url: "https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000001" }, run: { id: "run-1", status: "CREATING" } });
  };
  const created = await createAgent("top-secret", ask, fetchImpl);
  assert.equal(seen.url, "https://api.cursor.com/v1/agents");
  assert.equal(seen.options.headers.Authorization, `Basic ${globalThis.Buffer.from("top-secret:").toString("base64")}`);
  const body = JSON.parse(seen.options.body);
  assert.equal(body.prompt.text, promptFor(ask));
  assert.equal(body.repos[0].url, REPO_URL);
  assert.doesNotMatch(seen.options.body, /top-secret/);
  assert.equal(created.agentId, "bc-00000000-0000-0000-0000-000000000001");
  assert.equal(created.runStatus, "CREATING");
});

test("a busy agent is steered instead of left on 409, and the steer body has no extra fields", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return json(409, { code: "agent_busy" });
    return json(202, { delivery: "steered", runId: "run-2" });
  };
  const sent = await sendFollowUp("top-secret", "bc-00000000-0000-0000-0000-000000000001", ask, false, fetchImpl);
  assert.equal(calls[0].delivery, undefined);
  assert.deepEqual(Object.keys(calls[1]).sort(), ["delivery", "prompt"]);
  assert.equal(calls[1].delivery, "steer");
  assert.equal(sent.runId, "run-2");
  assert.doesNotMatch(JSON.stringify(calls), /top-secret/);
});

test("an unknown model is retried once without the model field, and the Cursor error is safe to show", async () => {
  assert.equal(BUILDER_MODEL.id, "composer-2.5");
  assert.deepEqual(BUILDER_MODEL.params, [{ id: "fast", value: "true" }]);
  const rejected = { error: { message: "Unknown model composer-2" } };
  assert.equal(modelRejected(400, rejected), true);
  assert.equal(modelRejected(400, { error: { message: "prompt is required" } }), false);
  assert.equal(publicCursorError({ error: { message: "bad key top-secret" } }), "");
  const calls = [];
  const logs = [];
  const original = globalThis.console.error;
  globalThis.console.error = (...args) => logs.push(args.join(" "));
  try {
    const created = await createAgent("top-secret", ask, async (_url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) return json(400, rejected);
      return json(201, { agent: { id: "bc-00000000-0000-0000-0000-000000000001", url: "https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000001" }, run: { id: "run-1", status: "CREATING" } });
    });
    assert.equal(calls[0].model.id, "composer-2.5");
    assert.equal(Object.hasOwn(calls[1], "model"), false);
    assert.equal(created.agentId, "bc-00000000-0000-0000-0000-000000000001");
    assert.match(logs.join("\n"), /Unknown model composer-2/);
    assert.doesNotMatch(logs.join("\n"), /top-secret/);
    const follow = [];
    await sendFollowUp("top-secret", "bc-00000000-0000-0000-0000-000000000001", ask, false, async (_url, options) => {
      follow.push(JSON.parse(options.body));
      if (follow.length === 1) return json(400, rejected);
      return json(200, { run: { id: "run-9" } });
    });
    assert.equal(follow[0].model.id, "composer-2.5");
    assert.equal(Object.hasOwn(follow[1], "model"), false);
  } finally { globalThis.console.error = original; }
  await assert.rejects(createAgent("top-secret", ask, async () => json(400, rejected)), (error) => error instanceof BuilderError && /Unknown model composer-2/.test(error.message) && !error.message.includes("top-secret"));
  const source = read("../builder-functions.js");
  assert.doesNotMatch(source, /This build never started/);
  assert.match(source, /if \(!data\.agentId \|\| fresh\) \{[\s\S]*createAgent\(apiKey, prompt/);
});

test("a refused key and a missing agent become clear errors that do not echo the key", async () => {
  await assert.rejects(createAgent("top-secret", ask, async () => json(401, { code: "unauthorized", message: "bad key top-secret" })), (error) => error.message === "Cursor rejected the API key." && !error.message.includes("top-secret"));
  const missing = await loadRemote("top-secret", "bc-00000000-0000-0000-0000-000000000001", async (url) => json(url.endsWith("/runs?limit=50") ? 200 : 404, {}));
  assert.equal(missing.missing, true);
});

test("a finished run stores the reply and the pull request; a follow-up still in flight stays running", () => {
  const record = { agentUrl: null, runId: "run-1", status: "running", prUrl: null, branch: null, error: null, awaitingSince: null };
  const finished = nextState(record, { agent: { url: "https://cursor.com/agents/bc-abc", latestRunId: "run-1", status: "IDLE" }, runs: [{
    id: "run-1", status: "FINISHED", createdAt: "2026-11-22T00:00:00.000Z", updatedAt: "2026-11-22T00:05:00.000Z", result: "Opened the pull request.",
    git: { branches: [{ repoUrl: "github.com/rambodc/uniq", branch: "cursor/notes", prUrl: "https://github.com/rambodc/uniq/pull/70" }] },
  }] });
  assert.equal(finished.patch.status, "finished");
  assert.equal(finished.patch.prUrl, "https://github.com/rambodc/uniq/pull/70");
  assert.equal(finished.patch.error, null);
  assert.deepEqual(finished.replies.map((reply) => reply.text), ["Opened the pull request."]);
  assert.equal(finished.replies[0].kind, "assistant");
  const waiting = nextState({ ...record, awaitingSince: "2026-11-22T00:10:00.000Z", runId: "run-2" }, { agent: { latestRunId: "run-1", status: "IDLE" }, runs: [{
    id: "run-1", status: "FINISHED", createdAt: "2026-11-22T00:00:00.000Z", updatedAt: "2026-11-22T00:05:00.000Z", result: "Done.",
  }] }, "2026-11-22T00:10:30.000Z");
  assert.equal(waiting.patch.status, "running");
  assert.equal(waiting.patch.runId, "run-2");
  assert.equal(waiting.patch.awaitingSince, "2026-11-22T00:10:00.000Z");
  assert.deepEqual(repliesToWrite(finished.replies, []), finished.replies);
  assert.deepEqual(repliesToWrite(finished.replies, [{ id: "run-1", kind: "assistant", text: "Opened the pull request." }]), []);
  assert.equal(patchChanged(record, finished.patch), true);
  assert.equal(patchChanged({ ...record, ...finished.patch }, finished.patch), false);
});

test("v0 conversation replies show in order when v1 runs have no result text", () => {
  const userAts = ["2026-11-22T00:00:00.000Z", "2026-11-22T00:10:00.000Z"];
  const remote = {
    status: "FINISHED",
    summary: "Opened the pull request.",
    prUrl: "https://github.com/rambodc/uniq/pull/70",
    branch: "cursor/notes",
    agentUrl: "https://cursor.com/agents?id=bc-1",
    messages: [
      { id: "msg_1", type: "user_message", text: "Standing instructions\nAdd notes" },
      { id: "msg_2", type: "assistant_message", text: "I'll add the notes mini app." },
      { id: "msg_3", type: "assistant_message", text: "Opened the pull request." },
      { id: "msg_4", type: "user_message", text: "Also mention the empty state" },
      { id: "msg_5", type: "assistant_message", text: "The empty state is in the pull request." },
    ],
    userAts,
    runs: [{ id: "run-1", status: "FINISHED", createdAt: "2026-11-22T00:00:00.000Z", updatedAt: "2026-11-22T00:05:00.000Z" }],
    agent: { status: "IDLE", latestRunId: "run-1" },
  };
  const next = nextState({ agentUrl: null, runId: null, status: "running", prUrl: null, branch: null, error: null, awaitingSince: null }, remote);
  assert.equal(next.patch.status, "finished");
  assert.equal(next.patch.prUrl, "https://github.com/rambodc/uniq/pull/70");
  assert.equal(next.patch.branch, "cursor/notes");
  assert.deepEqual(next.replies.map((reply) => reply.text), ["I'll add the notes mini app.", "Opened the pull request.", "The empty state is in the pull request."]);
  assert.deepEqual(next.replies.map((reply) => reply.at), [...next.replies.map((reply) => reply.at)].sort());
  assert.ok(next.replies[0].at > userAts[0] && next.replies[1].at < userAts[1] && next.replies[2].at > userAts[1]);
  assert.equal(next.replies[2].id, "msg_5");
});

test("a service token can read the v0 conversation when v1 run reads are refused", async () => {
  const id = "bc-a22aa6fe-0d1f-4b4a-9587-6691c07f0649";
  const fetchImpl = async (url) => {
    if (url.endsWith("/conversation")) return json(200, { id, messages: [{ id: "msg_2", type: "assistant_message", text: "The notes page is ready." }] });
    if (url.includes("/v0/agents/")) return json(200, { id, status: "FINISHED", summary: "The notes page is ready.", target: { branchName: "cursor/notes", prUrl: "https://github.com/rambodc/uniq/pull/62", url: "https://cursor.com/agents?id=bc-a22aa6fe-0d1f-4b4a-9587-6691c07f0649" } });
    return json(403, { code: "key_not_supported", message: "Service tokens are not permitted on this endpoint" });
  };
  const remote = await loadRemote("top-secret", id, fetchImpl);
  assert.equal(remote.missing, false);
  assert.equal(remote.messages.length, 1);
  const next = nextState({ agentUrl: null, runId: null, prUrl: null, branch: null, error: null, awaitingSince: null }, { ...remote, userAts: ["2026-11-22T00:00:00.000Z"] });
  assert.equal(next.patch.status, "finished");
  assert.deepEqual(next.replies.map((reply) => reply.text), ["The notes page is ready."]);
  assert.equal(next.patch.prUrl, "https://github.com/rambodc/uniq/pull/62");
});

test("polling stops once a build is finished with a pull request, and keeps going while it runs", () => {
  assert.equal(shouldRefresh({ agentId: "bc-1", status: "running" }), true);
  assert.equal(shouldRefresh({ agentId: "bc-1", status: "finished", prUrl: "https://github.com/rambodc/uniq/pull/1" }), false);
  assert.equal(shouldRefresh({ agentId: "bc-1", status: "finished", prUrl: "https://github.com/rambodc/uniq/pull/1", updatedAt: new Date().toISOString() }, Date.now(), false), true);
  assert.equal(shouldRefresh({ agentId: "bc-1", status: "error" }), false);
  assert.equal(shouldRefresh({ agentId: null, status: "running" }), false);
  const recent = new Date().toISOString();
  assert.equal(shouldRefresh({ agentId: "bc-1", status: "finished", prUrl: null, updatedAt: recent }), true);
  const source = read("../builder-functions.js");
  const refresh = source.split("async function refresh")[1].split("async function refreshShip")[0];
  const get = source.split("export const getBuilderConversation")[1].split("export const ")[0];
  assert.match(refresh, /if \(!force && !shouldRefresh/);
  assert.match(get, /request\.data\?\.force === true/);
  assert.match(get, /refresh\(id, snap\.data\(\), apiKey, force\)/);
});

test("artifact paths stay inside the agent's artifacts directory", () => {
  const ref = artifactRef("/opt/cursor/artifacts/contact_inbox_mobile_list.png");
  assert.equal(ref.name, "contact_inbox_mobile_list.png");
  assert.equal(ref.v0Path, "/opt/cursor/artifacts/contact_inbox_mobile_list.png");
  assert.equal(ref.v1Path, "artifacts/contact_inbox_mobile_list.png");
  assert.equal(artifactRef("artifacts/shots/a.png").relative, "shots/a.png");
  for (const bad of ["../secret", "/opt/cursor/artifacts/../../etc/passwd", "https://evil.example/a.png", "/tmp/a.png", "javascript:alert(1)"]) assert.equal(artifactRef(bad), null);
});

test("a service token downloads an artifact from v0, and a refused v0 falls through to v1", async () => {
  const ref = artifactRef("/opt/cursor/artifacts/contact_inbox_mobile_list.png");
  const v0 = async (url) => {
    if (url.endsWith("/artifacts")) return json(200, { artifacts: [{ absolutePath: ref.v0Path, sizeBytes: 1200 }] });
    if (url.includes("/v0/") && url.includes("/download")) return json(200, { url: "https://cloud-agent-artifacts.s3.us-east-1.amazonaws.com/a.png?sig=1", expiresAt: "2026-11-22T02:00:00.000Z" });
    return json(403, { code: "key_not_supported" });
  };
  const got = await fetchArtifact("top-secret", "bc-a22aa6fe-0d1f-4b4a-9587-6691c07f0649", ref, v0);
  assert.equal(got.kind, "image");
  assert.equal(got.bytes, 1200);
  assert.equal(got.url.startsWith("https://cloud-agent-artifacts.s3.us-east-1.amazonaws.com/"), true);
  const v1only = async (url) => url.includes("/v1/") && url.includes("/download") ? json(200, { url: "https://cloud-agent-artifacts.s3.us-east-1.amazonaws.com/b.png", expiresAt: "2026-11-22T02:00:00.000Z" }) : json(403, { message: "Service tokens are not permitted on this endpoint" });
  const fallback = await fetchArtifact("top-secret", "bc-1", ref, v1only);
  assert.equal(fallback.kind, "image");
  const none = await fetchArtifact("top-secret", "bc-1", ref, async () => json(404, {}));
  assert.equal(none, null);
  const evil = await fetchArtifact("top-secret", "bc-1", ref, async () => json(200, { url: "javascript:alert(1)" }));
  assert.equal(evil, null);
});


test("ship status uses a GitHub token when one is present, and works without one", async () => {
  assert.equal(githubAuthToken({}), "");
  assert.equal(githubAuthToken({ BUILDER_GITHUB_TOKEN: undefined }), "");
  assert.equal(githubAuthToken({ BUILDER_GITHUB_TOKEN: "" }), "");
  assert.doesNotThrow(() => githubAuthToken({ BUILDER_GITHUB_TOKEN: undefined }));
  assert.equal(githubAuthToken({ GITHUB_TOKEN: "  tok  " }), "tok");
  assert.equal(githubAuthToken({ BUILDER_GITHUB_TOKEN: "a", GITHUB_TOKEN: "b" }), "a");
  let headers = null;
  await githubGet("https://api.github.com/repos/rambodc/uniq/pulls/1", null, async (_url, init) => {
    headers = init.headers;
    return { status: 200, headers: { get: () => null }, json: async () => ({}) };
  }, { GITHUB_TOKEN: "secret-token" });
  assert.equal(headers.Authorization, "Bearer secret-token");
  headers = null;
  await githubGet("https://api.github.com/repos/rambodc/uniq/pulls/1", null, async (_url, init) => {
    headers = init.headers;
    return { status: 200, headers: { get: () => null }, json: async () => ({}) };
  }, {});
  assert.equal(headers.Authorization, undefined);
});

test("ship status follows the pull request from open checks through the production deploys", () => {
  const check = (name, status, conclusion) => ({ name, status, conclusion });
  assert.deepEqual(shipFromGitHub({ pr: { merged: false, state: "open", labeled: true }, checks: [], deploys: [] }), { phase: "pr", detail: "Pull request opened." });
  assert.equal(shipFromGitHub({ pr: { merged: false, state: "open", labeled: true }, checks: [check("frontend", "in_progress", null)], deploys: [] }).phase, "checks");
  assert.match(shipFromGitHub({ pr: { merged: false, state: "open", labeled: true }, checks: [check("frontend", "completed", "failure")], deploys: [] }).detail, /frontend failed/);
  assert.match(shipFromGitHub({ pr: { merged: false, state: "open", labeled: false }, checks: [check("frontend", "completed", "success")], deploys: [] }).detail, /builder-auto-deploy label/);
  assert.equal(shipFromGitHub({ pr: { merged: true, state: "closed", labeled: true }, checks: [check("frontend", "completed", "success")], deploys: [] }).phase, "merged");
  const deploys = [
    { name: "Production: Firebase Hosting", status: "completed", conclusion: "success" },
    { name: "Production: Firebase Functions", status: "in_progress", conclusion: null },
    { name: "Production: Firebase Rules", status: "completed", conclusion: "success" },
  ];
  assert.equal(shipFromGitHub({ pr: { merged: true, labeled: true }, checks: [], deploys }).phase, "deploying");
  deploys[1] = { name: "Production: Firebase Functions", status: "completed", conclusion: "success" };
  assert.equal(shipFromGitHub({ pr: { merged: true, labeled: true }, checks: [], deploys }).phase, "live");
  deploys[1] = { name: "Production: Firebase Functions", status: "completed", conclusion: "failure" };
  assert.equal(shipFromGitHub({ pr: { merged: true, labeled: true }, checks: [], deploys }).phase, "failed");
  assert.equal(shipFromGitHub({ pr: { merged: true, empty: true }, checks: [], deploys: [] }).detail, "No changes.");
  assert.equal(shipFromGitHub({ pr: { merged: true }, checks: [], deploys: [{ name: "Production: Firebase Hosting", status: "completed", conclusion: "success" }] }).phase, "live");
  assert.equal(shipFromGitHub({ pr: { merged: true }, checks: [], deploys: [{ name: "Production: Firebase Hosting", status: "completed", conclusion: "success" }, { name: "Production: Firebase Rules", status: "completed", conclusion: "skipped" }] }).phase, "live");
});

test("a merged or closed pull request starts a new agent from production", async () => {
  const github = (body) => async () => ({ status: 200, headers: { get: () => null }, json: async () => body });
  assert.equal(pullRequestSettled({ merged: true, state: "closed" }), true);
  assert.equal(pullRequestSettled({ merged: false, state: "closed" }), true);
  assert.equal(pullRequestSettled({ merged: false, state: "open" }), false);
  assert.equal(shipMeansSettled({ phase: "live", detail: "Live on uniqenergy.com." }), true);
  assert.equal(shipMeansSettled({ phase: "failed", detail: "The pull request was closed without merging." }), true);
  assert.equal(shipMeansSettled({ phase: "failed", detail: "frontend failed." }), false);
  assert.equal(shipMeansSettled({ phase: "merged", detail: "No changes." }), true);
  const record = { agentId: "bc-00000000-0000-0000-0000-000000000001", prUrl: "https://github.com/rambodc/uniq/pull/70" };
  assert.equal(await needsFreshAgent(record, github({ merged: true, state: "closed", changed_files: 0, additions: 0, deletions: 0, labels: [] }), {}), true);
  assert.equal(await needsFreshAgent(record, github({ merged: false, state: "closed", changed_files: 2, additions: 1, deletions: 1, labels: [] }), {}), true);
  assert.equal(await needsFreshAgent({ ...record, ship: { phase: "checks", detail: "Checks are running." } }, github({ merged: false, state: "open", changed_files: 2, additions: 1, deletions: 1, labels: [{ name: "builder-auto-deploy" }] }), {}), false);
  assert.equal(await needsFreshAgent({ ...record, ship: { phase: "live", detail: "Live on uniqenergy.com." } }, async () => { throw new Error("down"); }, {}), true);
  assert.equal(await needsFreshAgent({ agentId: record.agentId, ship: { phase: "live", detail: "Live on uniqenergy.com." } }, github({}), {}), false);
  const summary = chatSummary([{ kind: "user", text: "Add a notes mini app." }, { kind: "assistant", text: "Opened the pull request." }, { kind: "user", text: ask }]);
  assert.match(summary, /User: Add a notes mini app/);
  assert.match(summary, /Builder: Opened the pull request/);
  const prompt = continuationPrompt(summary, ask);
  assert.match(prompt, /Standing instructions/);
  assert.match(prompt, /Earlier in this chat/);
  assert.match(prompt, /new branch/);
  assert.match(prompt, /Do not reuse the old branch/);
  assert.ok(prompt.endsWith(ask));
  const body = continuationBody(summary, ask);
  assert.equal(body.prompt.text, prompt);
  assert.equal(body.repos[0].startingRef, "production");
  assert.equal(body.autoCreatePR, true);
  assert.equal(body.workOnCurrentBranch, false);
  let seen;
  await createAgent("top-secret", ask, async (url, options) => {
    seen = JSON.parse(options.body);
    return json(201, { agent: { id: "bc-00000000-0000-0000-0000-000000000099", url: "https://cursor.com/agents/bc-00000000-0000-0000-0000-000000000099" }, run: { id: "run-9", status: "CREATING" } });
  }, [], { summary });
  assert.equal(seen.prompt.text, prompt);
  assert.equal(seen.repos[0].startingRef, "production");
  assert.doesNotMatch(JSON.stringify(seen), /top-secret/);
});

test("auto-merge waits for the pull request checks workflow, then squash-merges or comments", async () => {
  const { builderPullRequest, checksReady, candidateNumbers, failureNote, headSha, MARKER, LABEL, pollDecision, WAIT_MS, waitForChecks } = await import("../../.github/workflows/builder-auto-deploy.mjs");
  const pr = { baseRefName: "production", state: "OPEN", isDraft: false, headRepositoryOwner: { login: "rambodc" }, headRepository: { name: "uniq" }, labels: [{ name: LABEL }], body: `Notes\n${MARKER}\n` };
  assert.equal(builderPullRequest(pr), true);
  assert.equal(builderPullRequest({ ...pr, labels: [] }), false);
  assert.equal(builderPullRequest({ ...pr, body: "no marker" }), false);
  assert.equal(builderPullRequest({ ...pr, baseRefName: "main" }), false);
  assert.equal(builderPullRequest({ ...pr, headRepositoryOwner: { login: "someone" } }), false);
  assert.deepEqual(checksReady([{ name: "frontend", status: "COMPLETED", conclusion: "SUCCESS" }]), { ready: true, failed: [] });
  assert.equal(checksReady([{ name: "frontend", status: "IN_PROGRESS", conclusion: "" }]).ready, false);
  assert.deepEqual(checksReady([{ name: "frontend", status: "COMPLETED", conclusion: "FAILURE" }]).failed, ["frontend"]);
  assert.equal(checksReady([]).ready, false);
  assert.equal(checksReady([{ name: "frontend", status: "COMPLETED", conclusion: "SUCCESS" }, { name: "functions", status: "COMPLETED", conclusion: "SUCCESS" }, { name: "merge", status: "IN_PROGRESS", conclusion: "" }]).ready, true);
  assert.equal(pollDecision({ ready: false, failed: [] }, 0), "wait");
  assert.equal(pollDecision({ ready: true, failed: [] }, 0), "merge");
  assert.equal(pollDecision({ ready: false, failed: ["frontend"] }, 0), "fail");
  assert.equal(pollDecision({ ready: false, failed: [] }, WAIT_MS), "timeout");
  assert.equal(failureNote(["frontend", "functions"]), "Checks failed: frontend, functions. Left this pull request open.");
  const event = { workflow_run: { head_sha: "abc", pull_requests: [{ number: 12 }] }, pull_request: { number: 9, head: { sha: "def" } } };
  assert.deepEqual(candidateNumbers(event, {}), [9, 12]);
  assert.deepEqual(candidateNumbers({ inputs: { pull_request: "40" } }, { PR_NUMBER: "41" }), [41, 40]);
  assert.equal(headSha(event, {}), "abc");
  assert.equal(headSha({ pull_request: { head: { sha: "def" } } }, {}), "def");
  let calls = 0;
  const merged = await waitForChecks(() => {
    calls += 1;
    return calls < 3 ? [{ name: "frontend", status: "IN_PROGRESS", conclusion: "" }] : [{ name: "frontend", status: "COMPLETED", conclusion: "SUCCESS" }];
  }, { waitMs: 1000, intervalMs: 1, sleep: async () => {} });
  assert.equal(merged.decision, "merge");
  assert.equal(calls, 3);
  const failed = await waitForChecks(() => [{ name: "frontend", status: "COMPLETED", conclusion: "FAILURE" }], { sleep: async () => {} });
  assert.equal(failed.decision, "fail");
  let clock = 0;
  const timed = await waitForChecks(() => [{ name: "frontend", status: "QUEUED", conclusion: "" }], { waitMs: 50, intervalMs: 10, sleep: async () => {}, now: () => (clock += 25) });
  assert.equal(timed.decision, "timeout");
  const workflow = read("../../.github/workflows/builder-auto-deploy.yml");
  const script = read("../../.github/workflows/builder-auto-deploy.mjs");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /PR: Firebase Hosting/);
  assert.match(workflow, /PR: Firebase Functions/);
  assert.match(workflow, /PR: Firebase Rules/);
  assert.match(workflow, /labeled, opened, synchronize, ready_for_review/);
  assert.doesNotMatch(workflow, /check_suite:/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /secrets\.GITHUB_TOKEN/);
  assert.match(workflow, /secrets\.CURSOR_API_KEY/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /CHECK_WAIT_MS: "1200000"/);
  assert.match(workflow, /builder-auto-deploy-\$\{\{ github\.event\.pull_request\.number/);
  assert.doesNotMatch(workflow, /secrets\.(?!GITHUB_TOKEN|CURSOR_API_KEY)\w+/);
  assert.match(script, /firebase-hosting-merge\.yml/);
  assert.match(script, /firebase-functions-merge\.yml/);
  assert.match(script, /firebase-rules-merge\.yml/);
  assert.match(script, /--squash/);
  assert.match(script, /--match-head-commit/);
  assert.match(script, /--delete-branch/);
  assert.match(script, /"comment"/);
  assert.match(script, /Left this pull request open/);
});

test("auto-merge skips an empty or already-merged head and waits for an active agent", async () => {
  const { HEAD_SETTLE_MS, activityFrom, agentIdFromText, agentMatching, diffEmpty, emptyNote, headAlreadyMerged, headIsSettled, mergeDecision, readCursorActivity, staleNote, waitUntilMerge } = await import("../../.github/workflows/builder-auto-deploy.mjs");
  const ready = { ready: true, failed: [] };
  const base = { qualifies: true, checks: ready, empty: false, alreadyMerged: false, agentKnown: false, agentActive: false, committedAt: "2026-11-24T00:00:00.000Z", sha: "aaa" };
  const now = Date.parse("2026-11-24T00:10:00.000Z");
  assert.equal(diffEmpty({ status: "identical", files: 0 }), true);
  assert.equal(diffEmpty({ status: "ahead", files: 0 }), true);
  assert.equal(diffEmpty({ status: "ahead", files: 3 }), false);
  assert.equal(diffEmpty(null), false);
  assert.equal(headAlreadyMerged([{ number: 70, merged_at: "2026-11-24T00:51:35Z" }, { number: 80 }], 80), true);
  assert.equal(headAlreadyMerged([{ number: 80, merged_at: null }], 80), false);
  assert.equal(agentIdFromText('see https://cursor.com/agents/bc-46e56396-7461-40c8-9ec2-646c9b321b44?x=1 and bcId=bc-46e56396-7461-40c8-9ec2-646c9b321b44'), "bc-46e56396-7461-40c8-9ec2-646c9b321b44");
  assert.equal(agentIdFromText("no agent"), null);
  assert.equal(activityFrom({ runStatus: "RUNNING", agentStatus: "ACTIVE" }).active, true);
  assert.equal(activityFrom({ runStatus: "FINISHED", agentStatus: "ACTIVE" }).active, false);
  assert.equal(activityFrom({ agentStatus: "IDLE" }).active, false);
  assert.equal(activityFrom({}).known, false);
  assert.equal(agentMatching({ items: [{ id: "bc-1" }] }, { filtered: true })?.id, "bc-1");
  assert.equal(agentMatching({ agents: [{ id: "bc-2", target: { branchName: "cursor/notes" } }] }, { branch: "cursor/notes" })?.id, "bc-2");
  assert.equal(headIsSettled(base.committedAt, now, HEAD_SETTLE_MS), true);
  assert.equal(headIsSettled("2026-11-24T00:09:30.000Z", now, HEAD_SETTLE_MS), false);
  assert.equal(mergeDecision({ ...base, empty: true }, { now }), "empty");
  assert.equal(mergeDecision({ ...base, alreadyMerged: true }, { now }), "stale");
  assert.equal(mergeDecision({ ...base, agentKnown: true, agentActive: true }, { now }), "wait");
  assert.equal(mergeDecision({ ...base, agentKnown: true, agentActive: false }, { now }), "merge");
  assert.equal(mergeDecision(base, { now, seenSha: "" }), "wait");
  assert.equal(mergeDecision(base, { now, seenSha: "aaa" }), "merge");
  assert.equal(mergeDecision(base, { now, seenSha: "bbb" }), "wait");
  assert.equal(mergeDecision({ ...base, committedAt: "2026-11-24T00:09:30.000Z" }, { now, seenSha: "aaa" }), "wait");
  assert.equal(mergeDecision({ ...base, checks: { ready: false, failed: ["frontend"] } }, { now }), "fail");
  assert.match(emptyNote(), /No file changes against production/);
  assert.match(staleNote(), /already in a merged pull request/);
  let seen = 0;
  const polled = await waitUntilMerge(() => {
    seen += 1;
    return base;
  }, { waitMs: 5000, intervalMs: 1, sleep: async () => {}, now: () => now });
  assert.equal(polled.decision, "merge");
  assert.equal(seen, 2);
  const active = await readCursorActivity("cursor-key", { prUrl: "https://github.com/rambodc/uniq/pull/80", branch: "cursor/notes", body: "https://cursor.com/agents/bc-46e56396-7461-40c8-9ec2-646c9b321b44" }, async (url) => {
    assert.equal(url.includes("cursor-key"), false);
    if (url.endsWith("/runs/run-1")) return { ok: true, json: async () => ({ status: "RUNNING" }) };
    return { ok: true, json: async () => ({ id: "bc-46e56396-7461-40c8-9ec2-646c9b321b44", status: "ACTIVE", latestRunId: "run-1" }) };
  });
  assert.deepEqual(active, { known: true, active: true });
  assert.deepEqual(await readCursorActivity("", { prUrl: "", branch: "", body: "" }, async () => { throw new Error("no"); }), { known: false, active: false });
});

test("Builder is wired to the secret, one collection, and super-admin reads with no client writes", () => {
  const functions = read("../builder-functions.js"), rules = read("../../firestore.rules"), core = read("../core.js");
  assert.match(core, /defineSecret\("CURSOR_API_KEY"\)/);
  assert.match(functions, /secrets: \[cursorApiKey, resendApiKey\]/);
  assert.match(core, /defineSecret\("RESEND_API_KEY"\)/);
  assert.deepEqual([...functions.matchAll(/db\.collection\("([^"]+)"\)/g)].map((match) => match[1]), ["builder"]);
  assert.match(functions, /\.collection\("messages"\)/);
  assert.match(functions, /requireMiniApp\(request, "builder"\)/);
  assert.match(functions, /isSuperAdmin\(access\)/);
  assert.doesNotMatch(functions, /console\.(log|info|debug)|CURSOR_API_KEY\.value|apiKey\}/);
  assert.match(rules, /match \/builder\/\{document=\*\*\}/);
  assert.match(rules, /allow read: if isSuperAdmin\(\)/);
  assert.match(rules, /allow write: if false/);
  assert.match(rules, /type == "super_admin"/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(functions, /listPageSize\(request\.data\?\.limit, 2\)/);
  assert.match(functions, /limit\(limit \+ 1\)/);
  assert.match(functions, /hasMore: snapshot\.docs\.length > limit/);
});

test("live step labels come from tool calls, and a shell command uses its description", () => {
  assert.equal(toolStepLabel("read_file", { path: "README.md" }), "Reading files");
  assert.equal(toolStepLabel("file_search", {}), "Searching");
  assert.equal(toolStepLabel("grep_search", {}), "Searching");
  assert.equal(toolStepLabel("edit_file", {}), "Editing files");
  assert.equal(toolStepLabel("run_terminal_cmd", { description: "Install deps and run tests" }), "Running Install deps and run tests");
  assert.equal(toolStepLabel("run_terminal_cmd", {}), "Running a command");
  assert.equal(toolStepLabel("run_terminal_cmd", { description: "echo CURSOR_API_KEY" }), "Running a command");
  assert.equal(toolStepLabel("mcp", {}), "Using a tool");
  assert.equal(toolStepLabel("unknown_tool", {}), "");
  let state = emptyStream();
  state = foldStreamEvent(state, { id: "1", event: "thinking", data: { text: "Looking at the tests." } });
  assert.equal(state.step, "Thinking");
  state = foldStreamEvent(state, { id: "2", event: "assistant", data: { text: "I'll update the README now." } });
  assert.equal(state.text, "I'll update the README now.");
  assert.equal(state.open, true);
  state = foldStreamEvent(state, { id: "3", event: "tool_call", data: { callId: "a", name: "read_file", status: "running", args: { path: "README.md" } } });
  assert.equal(state.step, "Reading files");
  assert.equal(state.open, false);
  state = foldStreamEvent(state, { id: "4", event: "tool_call", data: { callId: "b", name: "grep_search", status: "running" } });
  state = foldStreamEvent(state, { id: "5", event: "tool_call", data: { callId: "b", name: "grep_search", status: "completed" } });
  assert.equal(state.step, "Reading files");
  state = foldStreamEvent(state, { id: "6", event: "tool_call", data: { callId: "c", name: "file_search", status: "running" } });
  assert.equal(state.step, "Searching");
  state = foldStreamEvent(state, { id: "7", event: "tool_call", data: { callId: "d", name: "edit_file", status: "running" } });
  assert.equal(state.step, "Editing files");
  state = foldStreamEvent(state, { id: "8", event: "tool_call", data: { callId: "e", name: "run_terminal_cmd", status: "running", args: { description: "Install deps and run tests" } } });
  assert.equal(state.step, "Running Install deps and run tests");
  state = foldStreamEvent(state, { id: "9", event: "assistant", data: { text: "Tests passed." } });
  assert.equal(state.text, "Tests passed.");
  state = foldStreamEvent(state, { id: "10", event: "heartbeat", data: {} });
  assert.equal(state.eventId, "10");
  assert.equal(state.step, "Running Install deps and run tests");
  state = foldStreamEvent(state, { id: "11", event: "result", data: { status: "FINISHED", text: "Added the notes page." } });
  assert.equal(state.done, true);
  assert.equal(state.text, "Added the notes page.");
  const saved = liveRecord(state, "run-1", "2026-11-24T00:00:00.000Z", null);
  assert.equal(saved.text, "Added the notes page.");
  assert.equal(publicLive(saved).eventId, undefined);
  assert.deepEqual(Object.keys(publicLive({ step: "Thinking", text: "Hi", eventId: "cursor-secret", holdUntil: "later", updatedAt: "t" })), ["step", "text", "updatedAt"]);
});

test("the run stream parses SSE, resumes with Last-Event-ID, and does not retry a rate limit", async () => {
  const split = takeSseEvents('event: status\ndata: {"status":"RUNNING"}\n\nid: 1\nevent: assista');
  assert.equal(split.events.length, 1);
  assert.equal(split.events[0].event, "status");
  const rest = takeSseEvents(`${split.rest}nt\ndata: {"text":"Hi"}\n\n`);
  assert.equal(rest.events[0].id, "1");
  assert.equal(rest.events[0].data.text, "Hi");
  assert.equal(eventCursor("bad id"), "");
  assert.equal(streamPath("bc-12345678", "run-1"), "/v1/agents/bc-12345678/runs/run-1/stream");
  assert.equal(streamPath("bc-12345678", ""), "/v1/agents/bc-12345678/stream");
  assert.equal(streamFailure(410, { code: "stream_expired" }), "expired");
  assert.equal(streamFailure(400, { code: "invalid_last_event_id" }), "bad-cursor");
  assert.equal(streamFailure(429, {}), "limited");
  const encoder = new TextEncoder();
  const bodyOf = (text) => ({ getReader() { let sent = false; return { async read() { if (sent) return { done: true, value: undefined }; sent = true; return { done: false, value: encoder.encode(text) }; }, releaseLock() {} }; } });
  const calls = [];
  const resumed = await followCursorStream("test-key", { agentId: "bc-12345678", runId: "run-1", lastEventId: "1-0" }, (event) => calls.push(event), async (url, options) => {
    calls.push({ url, accept: options.headers.Accept, last: options.headers["Last-Event-ID"] || "", auth: options.headers.Authorization });
    if (calls.length === 1) return { status: 410, text: async () => JSON.stringify({ code: "stream_expired" }), body: null };
    return { status: 200, body: bodyOf('id: 2\nevent: tool_call\ndata: {"callId":"c","name":"read_file","status":"running"}\n\n') };
  });
  const opens = calls.filter((item) => item.url);
  assert.equal(opens.length, 2);
  assert.equal(opens[0].last, "1-0");
  assert.equal(opens[1].last, "");
  assert.equal(opens[0].accept, "text/event-stream");
  assert.equal(opens[0].auth, `Basic ${Buffer.from("test-key:").toString("base64")}`);
  assert.match(opens[0].url, /\/v1\/agents\/bc-12345678\/runs\/run-1\/stream$/);
  assert.equal(calls.find((item) => item.event)?.data.name, "read_file");
  assert.equal(resumed.failure, "");
  assert.equal(resumed.eventId, "2");
  const limited = [];
  const blocked = await followCursorStream("test-key", { agentId: "bc-12345678", runId: "run-9" }, () => {}, async (url) => { limited.push(url); return { status: 429, text: async () => "{}", body: null }; });
  assert.equal(limited.length, 1);
  assert.equal(blocked.failure, "limited");
  let header;
  await followCursorStream("test-key", { agentId: "bc-12345678", runId: "run-1", lastEventId: "bad id" }, () => {}, async (_url, options) => { header = options.headers["Last-Event-ID"]; return { status: 200, body: bodyOf("") }; });
  assert.equal(header, undefined);
});

test("a live notice is one message per pull request and only after the production deploy", () => {
  assert.equal(shouldPostLiveNotice({ phase: "live", detail: "Live on uniqenergy.com." }), true);
  assert.equal(shouldPostLiveNotice({ phase: "merged", detail: "No changes." }), false);
  assert.equal(shouldPostLiveNotice({ phase: "merged", detail: "Merged. Waiting for the production deploy." }), false);
  assert.equal(shouldPostLiveNotice({ phase: "deploying", detail: "Deploying to production." }), false);
  assert.equal(shouldPostLiveNotice({ phase: "failed", detail: "Production: Firebase Hosting failure." }), false);
  assert.equal(shouldPostLiveNotice({ phase: "live", detail: "No changes." }), false);
  assert.equal(liveNoticeId("https://github.com/rambodc/uniq/pull/12"), "live-12");
  assert.equal(liveNoticeId("https://evil.example/pull/12"), "");
  const note = liveNotice("https://github.com/rambodc/uniq/pull/12", [{ kind: "assistant", text: "Done.\nLive route: /wells" }], "2026-11-24T00:00:00.000Z");
  assert.equal(note.id, "live-12");
  assert.equal(note.kind, "notice");
  assert.equal(note.text, LIVE_TEXT);
  assert.equal(note.href, "https://uniqenergy.com/wells");
  assert.equal(liveHref([{ kind: "assistant", text: "Live route: https://evil.example" }]), "https://uniqenergy.com");
  const view = messageView("live-12", { kind: "notice", tone: "live", text: LIVE_TEXT, href: "https://evil.example/phish", prUrl: "https://github.com/rambodc/uniq/pull/12", at: "2026-11-24T00:00:00.000Z" });
  assert.equal(view.href, "https://uniqenergy.com");
  assert.equal(view.prUrl, "https://github.com/rambodc/uniq/pull/12");
  const source = read("../builder-functions.js");
  const watch = source.split("export const watchBuilderRun")[1].split("export const ")[0];
  assert.match(watch, /requireMiniApp\(request, "builder"\)/);
  assert.match(watch, /isSuperAdmin\(access\)/);
  assert.match(watch, /followCursorStream/);
  assert.match(watch, /onCall\(watchCall/);
  assert.match(source, /const watchCall = \{ \.\.\.callable, secrets: \[cursorApiKey\], timeoutSeconds: 75 \}/);
  assert.doesNotMatch(watch, /ship/);
  assert.match(source, /shouldPostLiveNotice\(loaded\.ship\)/);
  assert.match(source, /shouldPostLiveNotice\(data\.ship\)/);
  assert.match(source, /kind: "notice", tone: "live"/);
});
