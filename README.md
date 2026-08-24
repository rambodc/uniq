# UniqEnergy Website and FluidLab

UniqEnergy's Vite/React website and the FluidLab conceptual MD-only well workspace.

## Architecture

- React, TypeScript, Vite, Three.js/React Three Fiber
- Firebase Hosting, Email/Password Authentication, Firestore, Storage, and Cloud Functions
- App Check with reCAPTCHA Enterprise in monitor-only mode

UniqEnergy Account is the parent platform. Authentication and a version-one account profile are required before users can create cloud projects. FluidLab is its first project type and builds a sequential hole program from section-bottom MDs, bit sizes, and section colors. Projects autosave through ownership-checked callable Functions; there is no guest editor or manual save flow. Client access to Firestore and Storage remains denied by rules.

## Local development

Use Node.js 22 and Java 21 for the Firebase rules emulators.

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules
```

Functions are validated separately:

```bash
npm ci --prefix functions
npm test --prefix functions
npm run lint --prefix functions
```

Create a local `.env.local` from the Firebase web-app values and `VITE_APPCHECK_SITE_KEY`. Environment files are ignored.

Firebase Authentication must have Email/Password enabled. Anonymous authentication is not used. Production callable Functions enforce App Check; use a registered App Check debug token for local calls against deployed Functions.

## Authentication and routes

- `/` — public homepage
- `/fluidlab` — authentication-aware entry to the account platform
- `/account` — protected applications and projects dashboard
- `/account/profile` — protected profile and logout
- `/account/projects/:projectId/fluidlab` — protected FluidLab editor
- `/signin` — Email/Password sign in
- `/signup` — public registration and missing-profile completion
- `/forgot-password` — Firebase password reset

## Deployment

Pull requests run separate Hosting, Functions, and Firebase Rules validation workflows. Pushes to the protected `production` branch deploy those surfaces through the GitHub `Prod` environment using Google Workload Identity Federation; no service-account JSON keys are stored.

The Firebase project is `uniqenergy-de71c`. Manual release checks should use a Hosting preview channel before production.
