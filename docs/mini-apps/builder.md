# Builder (`builder`)

Super admins only. Routes `/builder` and `/builder/:conversationId`. A super admin describes a change. A Cursor cloud agent works in `https://github.com/rambodc/uniq`, starting from `production`, and opens a pull request. `production` is the only permanent branch. The agent's branch is deleted when the pull request merges. The agent does not merge and does not deploy.

## Screens

`src/builder/BuilderApp.tsx` (lazy-loaded). A new build starts with "Which mini app should this live in?" The options are the names in `functions/miniApps.js`, in that order, plus "New mini app". The first user message is `Mini app: {name}`. The thread then shows questions, idea chips, the plan, and the approval card from assistant text. Continue sends `Continue to preview`. Approve sends `Approved, build it`. Those cards are text. A screenshot is not a required step; the agent makes one only when the person asks. The composer attaches up to eight files, 20 MB each. The header shows status and, once a pull request exists, the ship phase. An empty merge shows "No changes".

Assistant text may end with a `builder-admin-help` block. The screen then shows "Notify admin", which calls `notifyBuilderAdmin` once.

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
- `createdAt`, `updatedAt`

`title` is the first user message, trimmed and cut on a word. It is not rewritten.

`builder/{id}/messages/{id}`: `kind` (`user` or `assistant`), `text`, `runId`, `at`. A user message with files is wrapped in a `builder-files` block (`path|name|size|contentType`).

The server reads the GitHub API for `rambodc/uniq` when it refreshes `ship`. `BUILDER_GITHUB_TOKEN` is optional and read-only: it is used when set, and the call stays unauthenticated when it is missing. A missing token does not fail the refresh. The server ignores the check named "Builder auto deploy". It treats the build as live when every Production deploy workflow that actually ran on the merge commit succeeded: Production: Firebase Hosting, Production: Firebase Functions, and Production: Firebase Rules. A workflow that did not run is not required.

## Storage

Uploads land at `builder/{uid}/{conversationId or "new"}/{id}-{filename}`. `storage.rules` allow a signed-in, email-verified user to read and write only `builder/{their uid}/…`, under 20 MB. The Builder callables still require a super admin before a file is sent on. Images of 15 MB or less also go to Cursor as base64; other files go as download URLs. `getBuilderArtifact` returns a 15-minute Cursor URL for one file under the agent's artifacts directory. Nothing is copied into Storage from Cursor.

## Code

- Frontend: `src/builder/BuilderApp.tsx`, `builder.css`, `RichMessage.tsx`, `rich.ts`. Helpers shared with the server: `functions/builderHelp.js`.
- Callables in `functions/builder-functions.js`, each `requireMiniApp(request, "builder")` then `isSuperAdmin`: `listBuilderConversations`, `getBuilderConversation`, `startBuilderConversation`, `sendBuilderMessage`, `renameBuilderConversation`, `getBuilderArtifact`, `notifyBuilderAdmin`. The first three of the chat callables (`get`, `start`, `send`) set `minInstances: 1`.
- Cursor API helpers: `functions/builder.js`. The agent is `POST /v1/agents` with `autoCreatePR: true` and model `composer-2.5` (`fast: true`), starting at `production`. While the latest pull request is open, follow-ups are `POST /v1/agents/{id}/runs`. When that pull request is merged or closed, the next message starts a new agent from `production` with a short summary of the chat and the new request, and the same conversation stores the new `agentId`. The key is the secret `CURSOR_API_KEY`. A missing key returns "Builder is not configured yet."
- Auto-merge: `.github/workflows/builder-auto-deploy.yml` and `builder-auto-deploy.mjs`. Squash merge, `--match-head-commit`, and `--delete-branch`. It skips an empty diff against `production` and a head commit that is already in a merged pull request. It waits while the Cursor agent run for that pull request is still active (`CURSOR_API_KEY` when Actions has it; otherwise the head commit must be at least two minutes old and unchanged on a re-check).

The first Cursor prompt is `promptFor` in `functions/builder.js`. It tells the agent to read `AGENTS.md` and, when the opening message names one or more mini apps, `docs/mini-apps/<id>.md`, and to open code only when those files are not enough. "New mini app" tells it to create `docs/mini-apps/<id>.md` and add the app to the list in `AGENTS.md`. A pull request that changes a mini app must update that page. The prompt does not require a screenshot, a mockup, or a visual preview. The plan and its approval stay. Only make a screenshot when the person explicitly asks.

## Connections

The chat is limited to this repository. `production` is the only permanent branch. A pull request into `production` with the label `builder-auto-deploy` and a body line `Builder-Auto-Deploy: yes` is squash-merged by the workflow above when its diff is not empty, its head commit is new, and its Cursor agent is idle. The merge deletes the branch and starts the three production Firebase workflows. Mail for "Notify admin" goes only to the Builder notify address (`functions/mailer.js`, `buildBuilderAdminEmail`). User Access does not assign Builder to staff.
