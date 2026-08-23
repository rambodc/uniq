# UniqEnergy Website and FluidLab

UniqEnergy's Vite/React website and the FluidLab AI-assisted 3D wellbore workspace.

## Architecture

- React, TypeScript, Vite, Three.js/React Three Fiber
- Firebase Hosting, Email/Password Authentication, Firestore, Storage, and Cloud Functions
- OpenAI Responses API from server-side Functions only
- App Check with reCAPTCHA Enterprise in monitor-only mode

Uploaded documents, extracted well data, chat messages, and 3D designs remain browser-memory-only. Firestore stores only the user's account profile, status, and server-managed daily usage. Client access to Firestore and Storage is denied by rules.

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

Create a local `.env.local` from the Firebase web-app values and `VITE_APPCHECK_SITE_KEY`. Environment files are ignored. Never put `OPENAI_API_KEY` in the frontend or GitHub; it is bound to AI Functions from Firebase Secret Manager.

## Authentication and routes

- `/` — public homepage
- `/fluidlab` — 3D workspace; AI import requires an active account
- `/signin` — Email/Password sign in
- `/signup` — public registration and missing-profile completion
- `/forgot-password` — Firebase password reset

## Deployment

Pull requests run separate Hosting, Functions, and Firebase Rules validation workflows. Pushes to the protected `production` branch deploy those surfaces through the GitHub `Prod` environment using Google Workload Identity Federation; no service-account JSON keys are stored.

The Firebase project is `uniqenergy-de71c`. Manual release checks should use a Hosting preview channel before production.
