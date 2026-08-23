# UniqEnergy Website and FluidLab

UniqEnergy's Vite/React website and the FluidLab AI-assisted 3D wellbore workspace.

## Architecture

- React, TypeScript, Vite, Three.js/React Three Fiber
- Firebase Hosting, Email/Password Authentication, Firestore, Storage, and Cloud Functions
- OpenAI Responses API from server-side Functions only
- App Check with reCAPTCHA Enterprise in monitor-only mode

Uploaded source documents remain temporary. Guest designs recover from device-local IndexedDB; signed-in users can store projects and immutable named versions in Firestore through ownership-checked callable Functions. Client access to Firestore and Storage remains denied by rules.

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

Firebase Authentication must have both Email/Password and Anonymous providers enabled. Production callable Functions enforce App Check; use a registered App Check debug token for local calls against deployed Functions.

## Authentication and routes

- `/` — public homepage
- `/fluidlab` — public 3D workspace with a one-analysis guest AI trial
- `/fluidlab/projects` — signed-in project library
- `/signin` — Email/Password sign in
- `/signup` — public registration and missing-profile completion
- `/forgot-password` — Firebase password reset

## Deployment

Pull requests run separate Hosting, Functions, and Firebase Rules validation workflows. Pushes to the protected `production` branch deploy those surfaces through the GitHub `Prod` environment using Google Workload Identity Federation; no service-account JSON keys are stored.

The Firebase project is `uniqenergy-de71c`. Manual release checks should use a Hosting preview channel before production.
