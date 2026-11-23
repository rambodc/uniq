# UniqEnergy app guide

Read this before you change the site. It is the map of UniqEnergy (uniqenergy.com): what the company is, how the site is put together, every mini app, and what a Builder agent is not allowed to do.

When you change the app's structure — a route, a mini app, a Firestore collection or the shape of its documents, a Cloud Function, auth, or how a deploy works — update this file in the same pull request. A change that leaves this guide wrong is incomplete.

## What UniqEnergy is

UniqEnergy is a Calgary drilling fluids company: customized drilling fluid systems, specialty additives, and field support for Western Canadian wellbores. The public site is the catalogue and the contact form. The private workspace (signed-in staff and super admins) is a set of mini apps: contact inbox, Inventory Bot, Wells, UniqGroup Logo, User Access, profiles, and Builder.

The repo is `github.com/rambodc/uniq`. Production deploys come from the `production` branch (the GitHub default branch is `main`; do not treat `main` as the live branch). The live site is https://uniqenergy.com. The Firebase project is `uniqenergy-de71c` (`.firebaserc`). Cloud Functions run in `us-central1`.

## How the code is split

- `src/` is the Vite/React site. Public pages live in `src/public/`. The private workspace lives under `src/auth/`, `src/contact/`, `src/inventory/`, `src/wells/`, `src/uniqgroup/`, `src/users/`, `src/profile/`, `src/builder/`, and `src/voice/`.
- `functions/` is Cloud Functions (Node 22). `functions/index.js` exports every callable.
- `functions/miniApps.js` is the one registry of mini apps. The browser imports it (`src/auth/miniApps.ts` only adds icons). Add a mini app in that file, then guard its callables, add its routes, and add a noindex header in `firebase.json`. Tests fail if one of those is missing.
- `firestore.rules` deny client access except: a Wells user may read `wellsApp`; an Inventory Bot user may read the published Inventory Xpress and Product Usage counts; a super admin may read `builder`. The browser talks to Cloud Functions for everything else. `storage.rules` allow Inventory Bot ticket PDF reads and Builder uploads under `builder/{uid}/…` (signed-in, email-verified, own folder only, 20 MB). Profile photos and every other path stay closed. Builder callables still require a super admin before a file is sent on.
- There is no custom-claims map. Access is a document at `users/{Firebase Auth uid}`.

## Public site

Routes in `src/public/PublicSite.tsx`:

| Path | What it is |
| --- | --- |
| `/` | Home |
| `/about-us` | About UniqEnergy |
| `/drilling-fluid-systems` and product pages | Drilling fluid systems and specialty additives |
| `/technology` | Technology |
| `/health-safety` | Health and safety |
| `/locations` | Locations |
| `/contact-us` | Public contact form. It calls `submitContactInquiry`. |

Private paths are noindex in `firebase.json` and listed in `public/robots.txt`.

## Private workspace

Sign-in is `/signin` (email and password, Firebase Auth, verified email required). After sign-in everyone lands on `/dashboard`.

The dashboard is one tile per mini app the account may open. Tile order is the order in `functions/miniApps.js`. Profile is always first. Each tile's colour is that entry's `accent`. The portal chrome is `src/auth/Shell.tsx` and the theme is `src/auth/Theme.tsx` (`portal.css` tokens). The choice is stored in `localStorage` under `uniqenergy-portal-theme`. Do not change brand marks or logos unless the request asks for it.

The account bar at the top of every private page links to the dashboard. Log out exists only on the Profile page.

Access:

- `super_admin` — every mini app, including User Access and Builder.
- `staff` — Profile, plus the assignable mini apps listed on their `users/{uid}` record (`contact`, `inventoryBot`, `wells`, `uniqGroupLogo`).

`requireMiniApp(request, "<id>")` in `functions/core.js` is the check every private callable uses. It loads `users/{uid}` and allows the call only when the verified email matches the record, both names are present, the type is known, the record is not disabled, and that mini app is in `miniAppsFor(type, assigned)`. `isSuperAdmin(access)` is `access.type === "super_admin"`. Super-admin-only callables check that after `requireMiniApp` (Builder) or call `requireSuperAdmin` (User Access). Hiding a tile is not the check.

### Profile — `/profile` — everyone

Name, email, photo, and password. Photo uploads go through `setMyPhoto` / `getMyPhoto` / `removeMyPhoto`. Passwords change in the browser with Firebase Auth and never touch our functions.

### Contact form — `/contact-inbox` — assigned staff and super admins

Inbox of public website enquiries. Callables: `listContactInquiries`, `archiveContactInquiry`, `restoreContactInquiry`. Collection: `contactInquiries`.

### Inventory Bot — `/inventory-bot` — assigned staff and super admins

Warehouse tickets, rig inventory, and related tools. Document shapes and collector rules are in `docs/inventory-bot.md`. Do not change Inventory Bot routines or data unless the request is specifically about that mini app.

### Wells — `/wells` — assigned staff and super admins

Completed wells copied from the mud man app. Client read of `wellsApp` is allowed for people who can open this mini app. Browsers cannot write it.

### UniqGroup Logo — `/uniqgroup-logo` — assigned staff and super admins

A 3D scene of the Uniq Group companies in orbit around the UniqEnergy globe.

### User Access — `/users` — super admins only

Invite people, edit their details, and choose which assignable mini apps a staff user can open. Callables use `requireSuperAdmin`.

### Builder — `/builder` and `/builder/:conversationId` — super admins only

Purpose: a super admin describes a change. A Cursor cloud agent works in this repo and opens a pull request into `production`. The agent does not merge and does not deploy. A pull request that meets the Builder rules merges and deploys on its own (see Deploy).

Files: `src/builder/` (`BuilderApp.tsx`, `builder.css`, `RichMessage.tsx`, `rich.ts`), `functions/builder.js`, `functions/builder-functions.js`, `functions/builderHelp.js`.

One top-level collection, `builder`. The browser does not write it. Super admins may read it; Firestore rules deny every client write. Messages are a subcollection.

`builder/{id}`:

```
title, agentId, agentUrl, runId,
status: "running" | "finished" | "error",
error, prUrl, branch, awaitingSince,
askedBy, askedByUid,
ship: { phase, detail } | absent,
shipCache: { at, etags },
adminNotice: { at, by, resendId } | absent,
createdAt, updatedAt
```

`title` is the first user message of that build, trimmed and cut on a word. It is not rewritten. The list, the chat header, and the Cursor agent name all use it.

`ship.phase` is `pr`, `checks`, `merged`, `deploying`, `live`, or `failed`. The server reads the GitHub API for `rambodc/uniq` (a token is used when `BUILDER_GITHUB_TOKEN`, `GITHUB_TOKEN`, or `GH_TOKEN` is present; otherwise the public API, which works while the repo is public), caches the result about 20 seconds on the document, and ignores the check named "Builder auto deploy". Production deploy workflow files are `firebase-hosting-merge.yml`, `firebase-functions-merge.yml`, and `firebase-rules-merge.yml`.

`builder/{id}/messages/{id}`: `kind` (`user` or `assistant`), `text`, `runId`, `at`. Assistant text may end with a `builder-admin-help` block or a question / ideas / preview block. The chat strips those and shows cards. A question block is plain text, never Cursor's question tool:

```
QUESTION:
<one question>
A) <choice>
B) <choice>
MULTI: yes
```

Idea chips, the build summary, and the preview use `IDEAS:`, `BUILD:` / `CONTINUE:`, and `PREVIEW:` / `APPROVE:` blocks as in the standing prompt. Continue to preview sends `Continue to preview`. Approve sends `Approved, build it`. The mini-app options are the names in `functions/miniApps.js`, in that order, plus "New mini app".

Callables, every one `requireMiniApp(request, "builder")` then `isSuperAdmin`:

- `listBuilderConversations`, `getBuilderConversation`, `startBuilderConversation`, `sendBuilderMessage`, `renameBuilderConversation`
- `getBuilderArtifact` — a 15-minute Cursor URL for one file under the agent's artifacts directory. Nothing is copied into Storage.
- `notifyBuilderAdmin` — sends the admin email described below, and only when a complete help block is stored on an assistant message.

The Cursor key is the secret `CURSOR_API_KEY`. It stays on the server. A missing key returns "Builder is not configured yet." The agent is created with `POST /v1/agents` on `https://api.cursor.com` for `https://github.com/rambodc/uniq` at `production`, with `autoCreatePR: true` and model `composer-2.5` with `fast: true`. If Cursor rejects that model, the same request is sent once more with no model field, and the error Cursor returned is logged without secrets. A build whose start failed stays in the chat: the next message starts the agent. Follow-ups use `POST /v1/agents/{id}/runs`. `startBuilderConversation` and `sendBuilderMessage` return as soon as that create or follow-up is queued. Those three callables set `minInstances: 1`.

The composer has a paperclip. Any file type, up to eight files, 20 MB each. The browser uploads them to Storage at `builder/{uid}/{conversation or new}/{id}-{name}`. Images of 15 MB or less also go to Cursor as base64; other files go as download URLs.

A chat still starts by asking which mini app to work on, and may also change other mini apps or app-wide parts in the same pull request. No code until the preview is approved. After approval the agent opens the pull request with the auto-deploy label and line, and fixes CI. The pull request merges and goes live on its own.

## Email

Email goes out through Resend (`functions/mailer.js`). The secret is `RESEND_API_KEY`. The only From address is `UniqEnergy Website <website@uniquem.ca>`. Inquiry mail goes to `rambodr@uniquem.ca` and `hrad@uniquem.ca`. Invites go to the new person, reply-to `rambodr@uniquem.ca`. Builder admin mail goes to `rambodr@uniquem.ca` only. Tests that send mail go to `delivered@resend.dev` and nowhere else.

## Deploy

Production deploys happen only from the `production` branch, through GitHub Actions: `Production: Firebase Hosting` (`firebase-hosting-merge.yml`), `Production: Firebase Functions` (`firebase-functions-merge.yml`), and `Production: Firebase Rules` (`firebase-rules-merge.yml`). Pull requests run `PR: Firebase Hosting`, `PR: Firebase Functions`, and `PR: Firebase Rules`. Do not deploy from a local shell.

Builder pull requests are the exception that merges themselves. All of these are required: base branch `production`, this repo (not a fork), not a draft, the label `builder-auto-deploy`, and a pull-request body line that is exactly `Builder-Auto-Deploy: yes`. `.github/workflows/builder-auto-deploy.yml` runs when a PR checks workflow completes, and as a backup when a pull request is opened, labeled, synchronized, or marked ready. It polls the current head until the other checks finish, for up to 20 minutes. If they are all green it squash-merges with `GITHUB_TOKEN` and `workflow_dispatch`s the three production workflows. A failed check leaves the pull request open and posts a short comment. Builder agents do not merge, do not push to `production`, and do not read or change secrets or IAM. They fix failing checks and then stop.

## What Builder agents cannot do

Do not do any of these, and do not ask the user to paste a secret into the chat:

- Secrets and IAM. Do not read, set, or rotate Secret Manager values (`CURSOR_API_KEY`, `RESEND_API_KEY`, `XAI_API_KEY`, WIF provider secrets). Do not change service accounts or IAM.
- DNS.
- Billing, and any external account (GitHub settings, Resend, Firebase console, Cursor).
- Merging or deploying by hand, pushing to `production`, or opening a pull request in any other repository.

When you are fully blocked on one of those, or on a failure you have already tried to fix and cannot, end your reply with this block and nothing after it. All four lines are required. Do not add the block for anything you can still do yourself.

```
:::builder-admin-help
blocked: <what is blocked>
why: <why you cannot do it>
action: <the exact steps the Grok Bot admin must take>
context: <the build, the files, and the error>
:::
```

The Builder screen shows "Your main admin needs to fix this" and a "Notify admin" button only when that complete block is present. The button calls `notifyBuilderAdmin`, which emails `rambodr@uniquem.ca` with who asked (name and email), the build title, a link to `/builder/<id>`, the original request, the four fields, and the pull-request link when there is one. The send is stored as `adminNotice` on the build. The button then reads "Admin notified" and does not send again.

## Coding rules

- No legacy code. When you replace something, delete the old code in the same change.
- One top-level Firestore collection per mini app (`contactInquiries`, `inventoryBot`, `wellsApp`, `users` for the Users app and for auth, `builder`). Subcollections belong to that one collection.
- Super-admin checks live in Cloud Functions and, for Builder reads, in `firestore.rules`.
- Keep a pull request small. Open it into `production`.
- Use the existing portal theme. Form inputs use at least 16px type so phones do not auto-zoom.
- A task from Builder includes the auto-deploy line and the label, and it updates this guide when the structure changes. Any other task leaves the pull request open.
