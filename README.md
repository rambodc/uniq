# UniqEnergy Website and Enterprise Portal

UniqEnergy’s public website and invitation-only enterprise mini-app portal.

## Architecture

- React 19, TypeScript, Vite, React Router, Three.js
- Firebase Hosting, Email/Password Authentication, callable Functions, Firestore, Storage, and App Check
- Public marketing site under `src/public`
- Enterprise authentication and invitation acceptance under `src/auth`
- Portal launcher, layout, guards, and mini-app registry under `src/portal`
- Product surfaces under `src/mini-apps/<app-id>`
- Callable backend handlers under `functions/apps/<app-id>`, with explicitly exported handlers
- Shared backend infrastructure under `functions/core` and integrations under `functions/services`

`functions/index.js` is deployment-only and explicitly re-exports every handler. Browser Firestore access is denied. Library metadata and other application operations use authenticated callable Functions. Well ZIP transfers use owner-restricted Storage rules tied to active portal access.

## Mini apps and access

- **FluidLab** — owner-private spreadsheet imports, saved schematic 3D wells, inventory/cost analysis, source review, and AI chat at `/apps/fluidlab/wells/:wellId`
- **User Access** — administrator-only invitation and access management
- **Account** — always available to authenticated users

Administrators automatically receive every managed mini app. Ordinary users need explicit grants for each managed app, including `fluidlab`. There is no public signup route.

## Enterprise and FluidLab data

```text
users/{uid}
users/{uid}/miniApps/fluidlab/wells/{wellId}
users/{uid}/miniApps/fluidlab/wells/{wellId}/versions/{versionId}
users/{uid}/miniApps/fluidlab/imports/{importId}
invitations/{invitationId}
contactInquiries/{inquiryId}
```

Enterprise account records use `schemaVersion: 1`; the rebuilt FluidLab uses schema version 2. Legacy FluidLab project data is inactive and is not migrated. Original spreadsheets and immutable dataset snapshots live in private Storage, and versioned normalized records and job metadata live in Firestore.

Fluid Labs extracts the survey TXT, ETS XML, and drilling CSV locally from a well ZIP package. Raw files and normalized engineering data are never uploaded or persisted.

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

## Controlled enterprise reset

The reset utility is never run by deployment. It first reports every Auth user, top-level Firestore collection count, and Storage object without deleting anything:

```bash
npm run reset:enterprise --prefix functions
```

Permanent deletion requires both an exact environment acknowledgement and explicit confirmation flag:

```bash
ALLOW_ENTERPRISE_RESET=YES_DELETE_ALL_UNIQENERGY_DATA npm run reset:enterprise --prefix functions -- --confirm-permanent-reset
```

After the verified reset, create the first user in Firebase Authentication through Firebase Console. Then create `users/{uid}` with:

```json
{
  "schemaVersion": 1,
  "uid": "AUTH_UID",
  "email": "admin@example.com",
  "firstName": "Admin",
  "lastName": "User",
  "role": "admin",
  "status": "active",
  "enabledMiniApps": ["fluidlab"]
}
```

Use Firestore timestamps for `createdAt` and `updatedAt`. All subsequent accounts must be created through the User Access invitation workflow.

## Deployment

Deploy only through the existing GitHub Actions workflows. Pull requests create a Firebase Hosting preview and validate Hosting, Functions, and rules independently. Production deployments occur from the protected `production` branch using Workload Identity Federation. Never deploy or reset production automatically from a local development action.

Production release procedure:

1. Run the relevant local validation commands without deploying.
2. Commit only the intended changes and push them to `production` through the repository's normal Git workflow.
3. Let `.github/workflows/firebase-hosting-merge.yml`, `firebase-functions-merge.yml`, or `firebase-rules-merge.yml` perform the applicable deployment.
4. Monitor the GitHub Actions run through completion and report its result.

Do not run `npm run deploy`, `firebase deploy`, or any other local command that changes production. The npm script exists for legacy compatibility only and is not an authorized release path.

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
