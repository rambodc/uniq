# Repository operating rules

## Deployment

- Never deploy Firebase Hosting, Functions, Firestore rules, indexes, or Storage directly from a local shell.
- Do not run `npm run deploy`, `firebase deploy`, or any equivalent local production command.
- Publish production changes by committing the intended files and pushing the `production` branch. The matching GitHub Actions workflow is the only authorized deployment path.
- Production is the default target. Do not open PRs or create preview/test deployments unless the user explicitly requests them.
- Run focused checks once and repeat only for relevant changes or failures. Run paid AI checks only when AI behavior changes. Deploy only affected components; coordinate dependent backend/rules changes before Hosting.
- After publishing, monitor the relevant GitHub Actions run and report its final result and URL.
