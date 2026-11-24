# Builder (`builder`)

Super admins only. Routes `/builder` and `/builder/:conversationId`. A super admin describes a change. A Cursor cloud agent works in `https://github.com/rambodc/uniq` at `production` and opens a pull request. The agent does not merge and does not deploy.

## Screens

`src/builder/BuilderApp.tsx` (lazy-loaded). A new build starts with "Which mini app should this live in?" The options are the names in `functions/miniApps.js`, in that order, plus "New mini app". The first user message is `Mini app: {name}`. The thread then shows questions, idea chips, the build summary, and the preview from assistant text. Continue sends `Continue to preview`. Approve sends `Approved, build it`. The composer attaches up to eight files, 20 MB each. The header shows status and, once a pull request exists, the ship phase.

Assistant text may end with a `builder-admin-help` block. The screen then shows "Notify admin", which calls `notifyBuilderAdmin` once.

## Firestore

One collection, `builder`. Super admins may read it (`firestore.rules`). The browser cannot write it.

`builder/{id}`:

- `title`, `agentId`, `agentUrl`, `runId`
- `status`: `running`, `finished`, or `error`
- `error`, `prUrl`, `branch`, `awaitingSince`
- `askedBy`, `askedByUid`
- `ship`: `{ phase, detail }` or absent. `phase` is `pr`, `checks`, `merged`, `deploying`, `live`, or `failed`
- `shipCache`: `{ at, etags }`
- `adminNotice`: `{ at, by, resendId }` or absent
- `createdAt`, `updatedAt`

`title` is the first user message, trimmed and cut on a word. It is not rewritten.

`builder/{id}/messages/{id}`: `kind` (`user` or `assistant`), `text`, `runId`, `at`. A user message with files is wrapped in a `builder-files` block (`path|name|size|contentType`).

The server reads the GitHub API for `rambodc/uniq` when it refreshes `ship`. It ignores the check named "Builder auto deploy". Production deploy workflow names it watches are Production: Firebase Hosting, Production: Firebase Functions, and Production: Firebase Rules.

## Storage

Uploads land at `builder/{uid}/{conversationId or "new"}/{id}-{filename}`. `storage.rules` allow a signed-in, email-verified user to read and write only `builder/{their uid}/…`, under 20 MB. The Builder callables still require a super admin before a file is sent on. Images of 15 MB or less also go to Cursor as base64; other files go as download URLs. `getBuilderArtifact` returns a 15-minute Cursor URL for one file under the agent's artifacts directory. Nothing is copied into Storage from Cursor.

## Code

- Frontend: `src/builder/BuilderApp.tsx`, `builder.css`, `RichMessage.tsx`, `rich.ts`. Helpers shared with the server: `functions/builderHelp.js`.
- Callables in `functions/builder-functions.js`, each `requireMiniApp(request, "builder")` then `isSuperAdmin`: `listBuilderConversations`, `getBuilderConversation`, `startBuilderConversation`, `sendBuilderMessage`, `renameBuilderConversation`, `getBuilderArtifact`, `notifyBuilderAdmin`. The first three of the chat callables (`get`, `start`, `send`) set `minInstances: 1`.
- Cursor API helpers: `functions/builder.js`. The agent is `POST /v1/agents` with `autoCreatePR: true` and model `composer-2.5` (`fast: true`). Follow-ups are `POST /v1/agents/{id}/runs`. The key is the secret `CURSOR_API_KEY`. A missing key returns "Builder is not configured yet."
- Auto-merge: `.github/workflows/builder-auto-deploy.yml` and `builder-auto-deploy.mjs`.

The first Cursor prompt is `promptFor` in `functions/builder.js`. It tells the agent to read `AGENTS.md` and, when the opening message names one or more mini apps, `docs/mini-apps/<id>.md`, and to open code only when those files are not enough. "New mini app" tells it to create `docs/mini-apps/<id>.md` and add the app to the list in `AGENTS.md`. A pull request that changes a mini app must update that page.

## Connections

The chat is limited to this repository. A pull request into `production` with the label `builder-auto-deploy` and a body line `Builder-Auto-Deploy: yes` is squash-merged by the workflow above, which then starts the three production Firebase workflows. Mail for "Notify admin" goes only to the Builder notify address (`functions/mailer.js`, `buildBuilderAdminEmail`). User Access does not assign Builder to staff.
