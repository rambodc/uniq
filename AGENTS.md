# Repository operating rules

Read [docs/APP_GUIDE.md](docs/APP_GUIDE.md) first. It is the map of the site: UniqEnergy, routes, every mini app, Firestore shapes, auth, deploy, and what you cannot do. When you change the app's structure (routes, mini apps, collections, functions, auth, or deploy), update that guide in the same pull request.

## Deployment

- Never deploy Firebase Hosting, Functions, Firestore rules, indexes, or Storage directly from a local shell.
- Do not run `npm run deploy`, `firebase deploy`, or any equivalent local production command.
- Publish production changes by committing the intended files and pushing the `production` branch. The matching GitHub Actions workflow is the only authorized deployment path.
- Production is the default target. Do not open PRs or create preview/test deployments unless the user explicitly requests them, or the task is from the Builder mini app (see below).
- Run focused checks once and repeat only for relevant changes or failures. Run paid AI checks only when AI behavior changes. Deploy only affected components; coordinate dependent backend/rules changes before Hosting.
- After publishing, monitor the relevant GitHub Actions run and report its final result and URL.

## Builder exception

A task from the Builder mini app includes the line `Builder-Auto-Deploy: yes`. For that task only, open a pull request into `production`, put that line in the pull request body, add the label `builder-auto-deploy`, and fix checks until they are green. A green pull request with that label and that line squash-merges into `production` and the production workflows deploy it. Do not merge it yourself. Do not deploy. Do not read or change secrets or IAM. Any other pull request stops when it is open.
