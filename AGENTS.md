# Repository operating rules

## Deployment

- Never deploy Firebase Hosting, Functions, Firestore rules, indexes, or Storage directly from a local shell.
- Do not run `npm run deploy`, `firebase deploy`, or any equivalent local production command.
- Publish production changes by committing the intended files and pushing the `production` branch. The matching GitHub Actions workflow is the only authorized deployment path.
- For pull-request work, use a feature branch and let the PR workflows validate or create previews. Do not create a local Firebase preview deployment.
- After publishing, monitor the relevant GitHub Actions run and report its final result and URL.
