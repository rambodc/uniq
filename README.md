# UniqEnergy Website and Enterprise Portal

UniqEnergy’s public website and invitation-only enterprise mini-app portal.

## Architecture

- React 19, TypeScript, Vite, React Router, Three.js
- Firebase Hosting, Email/Password Authentication, callable Functions, Firestore, Storage, and App Check
- Public marketing site under `src/public`
- Enterprise authentication and invitation acceptance under `src/auth`
- Portal launcher, layout, guards, and mini-app registry under `src/portal`
- Product surfaces under `src/mini-apps/<app-id>`
- Callable backend handlers under `functions/apps/<app-id>`, with one deployed handler per file
- Shared backend infrastructure under `functions/core` and integrations under `functions/services`

`functions/index.js` is deployment-only and explicitly re-exports every handler. Browser Firestore and Storage access is denied; all application operations pass through authenticated, authorized callable Functions.

## Mini apps and access

- **FluidLab** — owner-private conceptual well projects
- **Pason Viewer** — session-only 3D visualization of locally imported Pason deviation surveys
- **User Access** — administrator-only invitation and access management
- **Account** — always available to authenticated users

Administrators automatically receive every mini app. Ordinary users receive explicit `fluidlab` and/or `pason-viewer` grants. There is no public signup route.

## Version-one data

```text
users/{uid}
users/{uid}/miniApps/fluidlab/projects/{projectId}
invitations/{invitationId}
contactInquiries/{inquiryId}
```

All records created by the enterprise system use `schemaVersion: 1`. There is no migration or legacy compatibility layer.

Pason Viewer reads survey TXT files locally. Raw files and normalized stations are never uploaded or persisted.

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
  "enabledMiniApps": ["fluidlab", "pason-viewer"]
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
