"""Run from the Rules workflow; never performs a local Firebase deployment."""
import json
import subprocess

PROJECT = "uniqenergy-de71c"
STORAGE_AGENT = "serviceAccount:service-357883281274@gcp-sa-firebasestorage.iam.gserviceaccount.com"
ROLE = "roles/firebaserules.firestoreServiceAgent"
policy = json.loads(subprocess.check_output(["gcloud", "projects", "get-iam-policy", PROJECT, "--format=json"], text=True))
if not any(binding["role"] == ROLE and STORAGE_AGENT in binding.get("members", []) and "condition" not in binding for binding in policy.get("bindings", [])):
    subprocess.run(["gcloud", "projects", "add-iam-policy-binding", PROJECT, f"--member={STORAGE_AGENT}", f"--role={ROLE}", "--condition=None", "--quiet"], check=True)
subprocess.run(["gcloud", "storage", "buckets", "update", "gs://uniqenergy-de71c.firebasestorage.app", "--cors-file=storage.cors.json"], check=True)
