# Repository operating rules

Short map for this repo. Read the matching page in [docs/mini-apps/](docs/mini-apps/) before opening code. Public site, email, and blocked actions stay in [docs/APP_GUIDE.md](docs/APP_GUIDE.md).

When a pull request changes a mini app, update `docs/mini-apps/<id>.md` in that pull request. When a mini app is added, renamed, or removed, update the list below. Update `docs/APP_GUIDE.md` when the public site, email, auth, or deploy behavior changes.

## App rules

- This is the UniqEnergy portal (uniqenergy.com, Firebase project `uniqenergy-de71c`). Keep the theme and branding that already exist: tokens in `src/auth/portal.css`, chrome in `src/auth/Shell.tsx`, and the light/dark switch in `src/auth/Theme.tsx`. The stored choice is `localStorage` key `uniqenergy-portal-theme`. A tile's colour is that mini app's `accent` in `functions/miniApps.js`. Marks and logos live under `public/brand/`. Do not change them unless the request asks.
- On viewports up to 800px, inputs, textareas, and selects are 16px (`src/styles.css`) so phones do not zoom.
- One top-level Firestore collection per mini app that stores data: `contactInquiries`, `inventoryBot`, `wellsApp`, `users` (User Access and Profile share it), `builder`. UniqGroup Logo stores nothing. Subcollections stay under that one collection. The browser does not write Firestore.
- No legacy code. When you replace something, delete the old code in the same change.
- `functions/miniApps.js` is the only mini-app registry. The browser imports it; `src/auth/miniApps.ts` only adds icons. To add a mini app: add the entry, guard its callables with `requireMiniApp`, add its routes in `src/App.tsx`, add a noindex header in `firebase.json`, add a new icon in `src/auth/miniApps.ts`, and add `docs/mini-apps/<id>.md` plus a line in the list below.

## Deployment

- Never deploy Firebase Hosting, Functions, Firestore rules, indexes, or Storage directly from a local shell.
- Do not run `npm run deploy`, `firebase deploy`, or any equivalent local production command.
- Publish production changes by committing the intended files and pushing the `production` branch. The matching GitHub Actions workflow is the only authorized deployment path.
- `production` is the default branch and the only permanent branch. Do not recreate `main` or open a pull request into any other long-lived branch.
- Every change uses a short-lived branch and a pull request into `production`. The branch is deleted when the pull request merges.
- Do not open pull requests or create preview/test deployments unless the user explicitly requests them, or the task is from the Builder mini app (see below).
- Run focused checks once and repeat only for relevant changes or failures. Run paid AI checks only when AI behavior changes. Deploy only affected components; coordinate dependent backend/rules changes before Hosting.
- After publishing, monitor the relevant GitHub Actions run and report its final result and URL.

Pull requests run `.github/workflows/firebase-hosting-pull-request.yml` (PR: Firebase Hosting), `firebase-functions-pull-request.yml` (PR: Firebase Functions), and `firebase-rules-pull-request.yml` (PR: Firebase Rules), each on its own path filter. A push to `production` runs `firebase-hosting-merge.yml` (Production: Firebase Hosting), `firebase-functions-merge.yml` (Production: Firebase Functions), and `firebase-rules-merge.yml` (Production: Firebase Rules). Those three production workflows also run on `workflow_dispatch`.

## Builder exception

A task from the Builder mini app includes the line `Builder-Auto-Deploy: yes`. For that task only, open a pull request into `production`, put that line in the pull request body, add the label `builder-auto-deploy`, and fix checks until they are green. A green pull request with that label and that line squash-merges into `production` and the production workflows deploy it. The merge matches the current head commit and deletes the branch. The workflow skips a pull request with no file changes against `production`, and a pull request whose head commit is already in a merged pull request. It does not merge while that pull request's Cursor agent run is still active. Do not merge it yourself. Do not deploy. Do not read or change secrets or IAM. Do not say a change is live or done. The Builder posts that message after the production deploy succeeds. Any other pull request stops when it is open.

`.github/workflows/builder-auto-deploy.yml` is the workflow that squash-merges that pull request, deletes its branch, and starts the three production workflows.

Do not make a screenshot, a mockup, or a visual preview a required step. Only make a screenshot when the person explicitly asks for one. A plan and an approval still come before code, unless they already said to build it.

## Mini apps

Order and ids are `functions/miniApps.js`. One line each; the page has the screens, data, and files.

- **Profile** (`profile`, everyone, `/profile`) — name, email, photo, and password. [docs/mini-apps/profile.md](docs/mini-apps/profile.md)
- **Contact Form** (`contact`, assigned, `/contact-inbox`) — public-site messages. [docs/mini-apps/contact.md](docs/mini-apps/contact.md)
- **Inventory Bot** (`inventoryBot`, assigned, `/inventory-bot`) — warehouse tickets, rig inventory, and the morning checks. [docs/mini-apps/inventoryBot.md](docs/mini-apps/inventoryBot.md)
- **Wells** (`wells`, assigned, `/wells`) — completed wells copied from the mud man app. [docs/mini-apps/wells.md](docs/mini-apps/wells.md)
- **UniqGroup Logo** (`uniqGroupLogo`, assigned, `/uniqgroup-logo`) — the Uniq Group in 3D. [docs/mini-apps/uniqGroupLogo.md](docs/mini-apps/uniqGroupLogo.md)
- **User Access** (`users`, super admins, `/users`, `/users/new`, `/users/:uid/edit`) — invites and which mini apps each person can open. [docs/mini-apps/users.md](docs/mini-apps/users.md)
- **Builder** (`builder`, super admins, `/builder`) — a cloud agent opens a pull request. Also owns the super-admin "Report" screenshot button on every portal page (`src/report/`). [docs/mini-apps/builder.md](docs/mini-apps/builder.md)
