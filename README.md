# UniqEnergy and UniqAccount

Public website, passwordless member accounts, employee tools, and UEX parties.

## Architecture and access

React, TypeScript, Vite and Firebase Hosting. All account/application data access is through App Check-protected Functions; browser Firestore access is denied. Firebase custom authentication follows verification of a six-digit code delivered through the existing SMTP sender.

- `/signin`: public signup and signin. Codes last 10 minutes, permit five attempts, and work once. Email resend cooldown is 60 seconds, with email/IP hourly limits.
- `/member`: focused member home, LSD Finder, and individually invited parties. Employees/admins can switch here from `/portal`.
- `/portal`: employee tools. Admins have all tools; employees require grants for FluidLab, Invoice QB, Contact Form, and UEX management.
- `/apps/user-access`: admins promote already-registered members, set grants, and disable accounts. The last active admin cannot be removed.
- `/member/parties/:id`: named guest RSVP and ticket; a URL never grants admission. Only the verified invited email can open the page.

Account records use schema version 2 and roles `member`, `employee`, `admin`. Signup always creates a member. Sessions last at most 365 days, subject to revocation/disable; roles and grants are read server-side on each request. Member names are collected once after email verification.

UEX managers share all parties. Parties have manually assigned names, timezone-aware dates, descriptions, locations, and optional covers. Invitation emails and updates are explicit actions, with per-recipient delivery status. Duplicate guest emails do not create duplicate tickets. Guests see only their own RSVP/ticket; past and archived parties are read-only. Archived parties leave the home feed. No payments, games, plus-ones, QR codes, or check-in in v1.

Key data: `users/{uid}`, `loginChallenges/{id}`, `loginLimits/{key}`, `uexParties/{id}/guests/{emailHash}`, `fluidWells/{id}`, `contactInquiries`, and `invoiceQbQueue`. Gmail connection authorization remains in `invoiceQbPrivate/connection`.

## Local validation

Use Node.js 22 and Java 21 for Firebase rule emulators.

```bash
npm ci
npm run lint
npm test
npm run build
npm ci --prefix functions
npm run lint --prefix functions
npm test --prefix functions
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules
```

Frontend environment values are the existing `VITE_FIREBASE_*` values and `VITE_APPCHECK_SITE_KEY`. Function secrets required before deployment are:

```text
SMTP_USER
SMTP_PASSWORD
EMAIL_FROM_ADDRESS
OPENAI_API_KEY
```

Optional function environment values are `SMTP_HOST`, `SMTP_PORT`, and `PUBLIC_APP_URL`. Defaults target Gmail SMTP, port 465, and the production Firebase Hosting URL.

## One-time account cutover

The production Functions workflow runs the guarded `functions/platform/account-cutover.js` phases. This replaces the old unrestricted reset utility. It locks account services, disables old identities, deploys replacement handlers, drains old requests, deletes the listed account/app collections and app-owned file prefixes, and bootstraps `rambodr@uniquem.ca` as the sole admin. This admin must verify an emailed code before entering and supply their name.

`platform/accountCutover` records reset/completion progress. A rerun after completion cannot delete new data. SMTP secrets, infrastructure, and Gmail mailbox authorization are preserved. Hosting opens account access only after the matching backend/rules workflows succeed and the new frontend is deployed. On failure, leave maintenance enabled and rerun the failed workflow; do not delete the marker or run a local reset.

Authentication setup grants the runtime permission to sign Firebase custom tokens and private cover URLs, and disables the Firebase password provider. Old invite/password endpoints are removed from deployed Functions.

Run the reset/account integration rehearsal against demo-project emulators only:

```bash
FIREBASE_CONFIG='{"projectId":"demo-uex","storageBucket":"demo-uex.appspot.com"}' firebase emulators:exec --project demo-uex --only auth,firestore,storage 'UEX_INTEGRATION=1 node --test functions/test/uex-account.test.js'
```

## Deployment

Commit intended changes and push `production`. GitHub Actions is the only deployment path. Never deploy or reset from a local shell, and do not create preview deployments or PRs unless requested. Hosting waits for affected backend/rules workflows, including the one-time reset. Monitor all matching runs and report their final URLs and results.

## Pason attachments

Fluid Labs owns the ZIP parser, worker, survey renderer, and controls. Shared original ZIPs live under `fluidlab/{wellId}/pason/`; attachment reservations and metadata live under `fluidWells/{wellId}`. Every active Fluid Labs user can manage the shared wells, while chat histories remain personal. Parsed packages are cached for the current well session.

ZIP uploads are limited to 1 GB and exact uploader reservations. Storage rules are checked in the emulator; production rendering and worker parsing are checked during the frontend build.

## FluidLab import and analysis

FluidLab opens a persistent 3D workspace with Wells, Costs, Mud, Review, and Chat in a resizable overlay sidebar (a bottom sheet on mobile). Well selection and uploads live in Wells. Existing datasets, original sources, accepted corrections, and version snapshots remain readable.

The backend parses XLSX/XLS/CSV/TSV with pinned SheetJS CE. A compact workbook-wide AI request maps tables; code expands rows and columns, converts supported units, and performs decimal calculations. Each bounded batch permits one essential-mapping repair. Large inputs use at most two concurrent mapping requests. Original notes remain unchanged and are retrieved by Chat when relevant. Table import does not interpret narratives. There is no second AI audit, geometry editor, or estimated branch-cost allocation.

Jobs live under `fluidWells/{wellId}/imports` and have `kind: import | geometry | losses`. After a successful import without existing geometry, publication atomically creates a linked geometry job and transfers the well lock. The completed import acts as a durable dispatch outbox: task redelivery dispatches its queued child rather than rerunning extraction. Data is available before generation. Existing geometry is reused until the user chooses Update 3D from reports. Opening a well never triggers AI generation. Geometry uses the selected dataset version and fails on stale revisions. Both kinds retain checkpoints, cancellation, worker ownership checks, and private Firebase task processing. The default model remains `gpt-5.4`.

Uploads remain limited to five files, 20 MiB each, 50 MiB combined, and 100,000 populated cells. Unknown prices, currencies, units, and conflicting inventory values are flagged; usable data opens without a confirmation wizard.

A fresh, explicitly paid benchmark (requires available API credits):

```bash
FLUIDLAB_CHECK_DIR=/tmp/fluidlab-fresh-check node functions/scripts/verify-fluidlab.js /path/to/sample.xlsx --live --sample-acceptance
```

Use a new checkpoint directory for each fresh benchmark. The acceptance flag expects 11 reports, 27 products, product cost 99,787.10, services 7,000.00, and no narrative-generated branches during import. The target is under two minutes, measured rather than guaranteed. The separate variants script exercises unusual formats; the chat integration script runs only with local emulators. Never print API keys.

Production is published only by pushing `production`; GitHub Actions deploys affected components and Hosting waits for matching backend/rules changes. Do not create PR previews unless requested.
