# Builder (`builder`)

Super admins only. Routes `/builder` and `/builder/:conversationId`. A super admin describes a change. A Cursor cloud agent works in `https://github.com/rambodc/uniq`, starting from `production`, and opens a pull request. `production` is the only permanent branch. The agent's branch is deleted when the pull request merges. The agent does not merge and does not deploy. The agent does not say a change is live or done. The app posts that message after the production deploy succeeds.

## Screens

`src/builder/BuilderApp.tsx` (lazy-loaded). The sidebar loads the two most recent builds first, then a **Load more** button fetches five older builds at a time. A new build starts with "Which mini app should this live in?" The options are the names in `functions/miniApps.js`, in that order, plus "New mini app". The first user message is `Mini app: {name}`. The thread then shows questions, idea chips, the plan, and the approval card from assistant text. Continue sends `Continue to preview`. Approve sends `Approved, build it`. Those cards are text. A screenshot is not a required step; the agent makes one only when the person asks. The composer attaches up to eight files, 20 MB each. The header shows status and, once a pull request exists, the ship phase. An empty merge shows "No changes".

Assistant text may end with a `builder-admin-help` block. The screen then shows "Notify admin", which calls `notifyBuilderAdmin` once.

While a run is active, the thread shows one compact line: the elapsed time, the latest assistant text (cut on a word), and the current step (`Thinking`, `Reading files`, `Searching`, `Editing files`, or `Running` plus the command description). The step text has a slow accent shimmer, and the dot pulses. Both stay still when the reader prefers reduced motion. On a narrow screen the line stays one row and the long parts ellipsize. If the stream cannot be read, the line is the timer and the latest assistant sentence.

When `ship.phase` is `live`, the chat shows one done card: "It's live on uniqenergy.com — your change is ready." and a link to the site, or to the `Live route` path when the reply has one. The card is stored once per pull request as message `live-{number}`, so a reload does not add another. A merge that is still waiting, a deploy that is still running, a failed deploy, and an empty merge ("No changes") do not get that card. Those show a short neutral note instead. The header pill is unchanged.

## Report to Builder

Every portal page (not `/signin` or the public site) shows a floating "Report" camera button at the bottom-right, only to super admins: `src/report/ReportButton.tsx`, mounted once in `PortalFrame` in `src/App.tsx`, shown when the signed-in, email-verified account can open `builder` (the same `can("builder")` check as the `/builder` route). On phones it is a 46px round icon. On `/builder…`, `/users/new`, and `/users/:uid/edit` it sits higher so it does not cover the composer or the Save bar.

1. Tap: `src/report/capture.ts` redraws the visible viewport with `modern-screenshot` (`domToCanvas`, loaded on demand) at up to 2× pixel ratio. There is no permission prompt, and it works in iPhone Safari. Anything marked `data-report-ignore` (the button, its toast, the editor) is left out. Scrolled inner panels keep their scroll position.
2. `src/report/MarkupEditor.tsx` opens full screen over the shot: Arrow, Circle, Box, Pen, Text note, Undo (also Ctrl/Cmd+Z), colours red (default), amber, teal, white, and an optional "Describe the fix" field. Drawing is a plain canvas with pointer events (`touch-action: none`), so mouse, touch, and pen all work. `src/report/draw.ts` draws the editor and the flattened image with the same code.
3. Send to Builder flattens to PNG (JPEG at 0.86 if the PNG is over 6 MB), at most 2000px on the longest side, hands it to the Builder in memory (`src/report/report.ts`, `setPendingReport`), and navigates to `/builder`. The Builder takes it once and starts a new build straight away through the normal send path: the image is uploaded to `builder/{uid}/new/{id}-report-{route}-{yyyymmdd-hhmm}.png`, and `startBuilderConversation` gets the text and the file. The user message shows the screenshot thumbnail; tapping it opens the full image.

The first line of the message is the description (or `Fix what is marked on {route}`), so it becomes the build title. Then `Mini app: {name}` from the route (or `Dashboard (portal home)`), `Page: {route} ({origin}{route})`, and a line telling the agent the marks are part of the request and to build the fix. The image reaches Cursor as base64 in `prompt.images` (see Storage). Capture or prepare failures show an error toast or an inline error; upload or start failures show on the message with Retry, as for any Builder message.

Limits: the capture is a DOM redraw, so cross-origin images without CORS, video, WebGL canvases (UniqGroup Logo's 3D scene), and some CSS effects (backdrop blur) may look blank or flat. It captures the portal page only, not other apps or browser chrome.

## Firestore

One collection, `builder`. Super admins may read it (`firestore.rules`). The browser cannot write it.

`builder/{id}`:

- `title`, `agentId`, `agentUrl`, `runId`
- `status`: `running`, `finished`, or `error`
- `error`, `prUrl`, `branch`, `awaitingSince`
- `askedBy`, `askedByUid`
- `ship`: `{ phase, detail }` or absent. `phase` is `pr`, `checks`, `merged`, `deploying`, `live`, or `failed`. `live` means every production deploy workflow that actually ran on the merge commit succeeded. Detail `No changes.` means the merge changed no files. A new agent clears `ship` so the header follows the new pull request.
- `shipCache`: `{ at, etags }`
- `adminNotice`: `{ at, by, resendId }` or absent
- `live`: `{ step, text, updatedAt, eventId, runId, holdUntil, open }` while a run is streaming, or absent. `step` is the short label. `text` is the latest assistant line. `eventId` resumes the Cursor stream. `holdUntil` is the lease so only one stream is open. The browser is given `step`, `text`, and `updatedAt` only.
- `createdAt`, `updatedAt`

`title` is the first user message, trimmed and cut on a word. It is not rewritten.

`builder/{id}/messages/{id}`: `kind` (`user`, `assistant`, or `notice`), `text`, `runId`, `at`. A user message with files is wrapped in a `builder-files` block (`path|name|size|contentType`). A notice with `tone: live` also has `href` and `prUrl`. Its id is `live-{pull number}`. It is written once, when `ship.phase` becomes `live`, and not for a failed deploy, a merge that is still deploying, or an empty merge.

The server reads the GitHub API for `rambodc/uniq` when it refreshes `ship`. `BUILDER_GITHUB_TOKEN` is optional and read-only: it is used when set, and the call stays unauthenticated when it is missing. A missing token does not fail the refresh. The server ignores the check named "Builder auto deploy". It treats the build as live when every Production deploy workflow that actually ran on the merge commit succeeded: Production: Firebase Hosting, Production: Firebase Functions, and Production: Firebase Rules. A workflow that did not run is not required.

## Storage

Uploads land at `builder/{uid}/{conversationId or "new"}/{id}-{filename}`, including Report to Builder screenshots. `storage.rules` allow only a super admin (an email-verified account whose `users/{uid}` record is `super_admin`, not disabled, with a matching email) to read and write, only under `builder/{their uid}/…`, under 20 MB. The Builder callables still require a super admin before a file is sent on. Images of 15 MB or less also go to Cursor as base64; other files go as download URLs. `getBuilderArtifact` returns a 15-minute Cursor URL for one file under the agent's artifacts directory. Nothing is copied into Storage from Cursor.

## Code

- Frontend: `src/builder/BuilderApp.tsx`, `builder.css`, `RichMessage.tsx`, `rich.ts`. Report to Builder: `src/report/` (`ReportButton.tsx`, `capture.ts`, `MarkupEditor.tsx`, `draw.ts`, `report.ts`, `report.css`, tests in `report.test.ts`). Helpers shared with the server: `functions/builderHelp.js`.
- Callables in `functions/builder-functions.js`, each `requireMiniApp(request, "builder")` then `isSuperAdmin`: `listBuilderConversations`, `getBuilderConversation`, `watchBuilderRun`, `startBuilderConversation`, `sendBuilderMessage`, `renameBuilderConversation`, `getBuilderArtifact`, `notifyBuilderAdmin`. The first three of the chat callables (`get`, `start`, `send`) set `minInstances: 1`. `watchBuilderRun` does not. It is the live-step reader.
- Cursor API helpers: `functions/builder.js`. The agent is `POST /v1/agents` with `autoCreatePR: true` and model `composer-2.5` (`fast: true`), starting at `production`. While the latest pull request is open, follow-ups are `POST /v1/agents/{id}/runs`. When that pull request is merged or closed, the next message starts a new agent from `production` with a short summary of the chat and the new request, and the same conversation stores the new `agentId`. The key is the secret `CURSOR_API_KEY`. A missing key returns "Builder is not configured yet." Saved replies still come from `GET /v0/agents/{id}/conversation`. While a run is active, the Builder calls `watchBuilderRun`. That callable opens `GET /v1/agents/{id}/runs/{runId}/stream` (or the agent stream when there is no run id) for about 45 seconds, with `Accept: text/event-stream` and `Last-Event-ID` when one is stored. It maps tool calls to the step label (`run_terminal_cmd` uses `args.description`), keeps the latest assistant text, and writes `live` on the conversation. The screen listens to that document and calls the callable again until the run stops. A `410 stream_expired` or a bad cursor reconnects once without `Last-Event-ID`. A rate limit does not open a second stream. The key never goes to the browser. Ship status is not written by this callable.
- Auto-merge: `.github/workflows/builder-auto-deploy.yml` and `builder-auto-deploy.mjs`. Squash merge, `--match-head-commit`, and `--delete-branch`. It skips an empty diff against `production` and a head commit that is already in a merged pull request. It waits while the Cursor agent run for that pull request is still active (`CURSOR_API_KEY` when Actions has it; otherwise the head commit must be at least two minutes old and unchanged on a re-check).

The first Cursor prompt is `promptFor` in `functions/builder.js`. It tells the agent to read `AGENTS.md` and, when the opening message names one or more mini apps, `docs/mini-apps/<id>.md`, and to open code only when those files are not enough. "New mini app" tells it to create `docs/mini-apps/<id>.md` and add the app to the list in `AGENTS.md`. A pull request that changes a mini app must update that page. The prompt does not require a screenshot, a mockup, or a visual preview. The plan and its approval stay. Only make a screenshot when the person explicitly asks. The prompt also says not to claim a change is live, done, or on production. A `Live route: /path` line is the page path. The app posts the completion message after the production deploy succeeds.

## Connections

The chat is limited to this repository. `production` is the only permanent branch. A pull request into `production` with the label `builder-auto-deploy` and a body line `Builder-Auto-Deploy: yes` is squash-merged by the workflow above when its diff is not empty, its head commit is new, and its Cursor agent is idle. The merge deletes the branch and starts the three production Firebase workflows. Mail for "Notify admin" goes only to the Builder notify address (`functions/mailer.js`, `buildBuilderAdminEmail`). User Access does not assign Builder to staff.
