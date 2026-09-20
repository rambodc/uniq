# UniqEnergy and UniqAccount

Public website, passwordless member accounts, employee tools, and UEX parties.

## Architecture and access

React, TypeScript, Vite and Firebase Hosting. All account/application data access is through App Check-protected Functions; browser Firestore access is denied. Firebase custom authentication follows verification of a six-digit code delivered through the existing SMTP sender.

- `/signin`: public signup and signin. Codes last 10 minutes, permit five attempts, and work once. Email resend cooldown is 60 seconds, with email/IP hourly limits.
- `/join/:token`: personalized invitation onboarding. An opaque token identifies the invitation, never authenticates. An App Check-protected POST sends a code; reloads reuse a deduplicated request. Verified guests review first/last names, then enter their party. Member party routes use ordinary signin and verify invitations on every request.
- `/member`: gradient member home, Account, LSD Finder, and individually invited parties. Employees/admins can switch here from `/portal`.
- `/portal`: employee tools. Admins have all tools; employees require grants for FluidLab, Invoice QB, Contact Form, and UEX management.
- `/apps/user-access`: admins promote already-registered members, set grants, and disable accounts. The last active admin cannot be removed.
- `/member/parties/:id`: named guest RSVP and ticket; a URL never grants admission. Only the verified invited email can open the page.

Account records use schema version 2 and roles `member`, `employee`, `admin`. Signup always creates a member. Sessions last at most 365 days, subject to revocation/disable; roles and grants are read server-side on each request. Member names are collected once after email verification.

UEX managers share saved conversations and party drafts. Creation opens chat beside a live preview (Chat/Preview tabs on mobile). The assistant returns validated structured sections, never executable HTML/CSS. The first generated draft saves privately; subsequent revisions require Confirm/Cancel. Revision checks and processing leases prevent concurrent overwrites. Dark, light and gold themes support hero, date/time, venue/map, performers, schedule, gallery, FAQs and text. Uploaded JPEG/PNG/WebP images are limited to 5 MB each, 30 per party. Removed/replaced blobs remain available to published snapshots and historical revisions.

Publish/Update live page atomically replaces the guest-visible document and assets. Title, description, start/end, venue name/address, exact-time confirmation and displayed-map confirmation are required. Changing times or venue invalidates the corresponding confirmation. RSVP/tickets are outside AI control. Events use only the current structured draft/published format. Cards, emails, dates, and covers derive from those documents; no old-event conversion or alternate page renderer exists. Invitation emails and updates are explicit actions, with per-recipient delivery status. Duplicate guest emails do not create duplicate tickets. Guests see only their own RSVP/ticket; past and archived parties are read-only. Archived parties leave the home feed. No payments, games, plus-ones, QR codes, or check-in in v1.

Key data: `users/{uid}`, `loginChallenges/{id}`, `loginLimits/{key}`, `loginRequests/{hash}`, `uexInvitationTokens/{tokenHash}`, `uexLimits/{uid}`, `uexParties/{id}/revisions/{revision}`, `uexParties/{id}/guests/{emailHash}`, `fluidWells/{id}`, `contactInquiries`, and `invoiceQbQueue`. Gmail connection authorization remains in `invoiceQbPrivate/connection`.

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

Optional function environment values are `SMTP_HOST`, `SMTP_PORT`, and `UEX_MODEL` (falls back to `FLUIDLAB_MODEL`, then `gpt-5.4`). Defaults use Gmail SMTP/465. Invitation URLs always use `https://uniqenergy.com`. AI dates must include a timezone and are normalized to UTC, including offset timestamps that cross midnight. Offset-free dates are rejected. Failed messages remain available to retry; structured error categories are logged without conversation content. The assistant cannot browse the web and asks for supplied performer/venue facts. Builder requests have a 55-second AI timeout, no automatic paid retries, 30 requests per manager per hour, bounded output/history, and one pending proposal per party.

A bounded synthetic live check (two paid AI calls, no Firebase writes or email sends) is available with `node functions/scripts/check-uex-ai.js`. It reads the existing key into process memory and never prints it. Run only when AI behavior changes.

## Clean UEX restart

UEX starts with only the current structured event system. Previous event data and images were deleted in the authorized restart; deleted event links return unavailable. Accounts, roles, other mini-app data, SMTP secrets and Gmail authorization are preserved. No reset utilities, migration paths, or maintenance guards remain. Keep the completion audit at `operations/uexRestart20260920` so a historical workflow retry cannot delete new events.

Authentication setup grants the runtime permission to sign Firebase custom tokens and private cover URLs, and disables the Firebase password provider. Old invite/password endpoints are removed from deployed Functions.

Run current account and UEX integration checks against demo-project emulators only:

```bash
FIREBASE_CONFIG='{"projectId":"demo-uex","storageBucket":"demo-uex.appspot.com"}' firebase emulators:exec --project demo-uex --only auth,firestore,storage 'UEX_INTEGRATION=1 node --test --test-concurrency=1 functions/test/uex-account.test.js functions/test/uex-builder.test.js'
```

## Deployment

Commit intended changes and push `production`. GitHub Actions is the only deployment path. Never deploy or reset from a local shell, and do not create preview deployments or PRs unless requested. Hosting waits for affected backend/rules workflows, before publishing Hosting. Monitor all matching runs and report their final URLs and results.

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
