#!/usr/bin/env bash
# One-time project setup, separate from Firebase deployments. Run only after approval.
set -euo pipefail
if [[ "${1:-}" != "--apply" ]]; then
  echo 'One-time setup: enable Cloud Scheduler, grant its deploy role to GitHub, and let Storage rules consult Firestore.'
  echo 'Use --apply with an authorized project-owner Google account. Firebase releases still run only through GitHub Actions.'
  exit 0
fi
project=uniqenergy-de71c
gcloud services enable cloudscheduler.googleapis.com --project="$project"
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:github-deployer@uniqenergy-de71c.iam.gserviceaccount.com" --role="roles/cloudscheduler.admin" --condition=None --quiet
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:service-357883281274@gcp-sa-firebasestorage.iam.gserviceaccount.com" --role="roles/firebaserules.firestoreServiceAgent" --condition=None --quiet
