"""Prepare Invoice QB's configuration secret through production GitHub Actions."""
import json
import os
import subprocess

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Run this configuration through GitHub Actions, not a local shell.")

PROJECT = "uniqenergy-de71c"
RUNTIME = "357883281274-compute@developer.gserviceaccount.com"
SECRET = "INVOICE_QB_CONFIG"


def run(*args):
    subprocess.run(["gcloud", *args, "--project", PROJECT, "--quiet"], check=True)


def read(*args):
    return json.loads(subprocess.check_output(["gcloud", *args, "--project", PROJECT, "--format=json"], text=True))


enabled = {s["config"]["name"] for s in read("services", "list", "--enabled")}
missing = {"secretmanager.googleapis.com", "gmail.googleapis.com"} - enabled
if missing:
    run("services", "enable", *sorted(missing))
secrets = read("secrets", "list", "--filter=name:INVOICE_QB_CONFIG")
if not any(s["name"].endswith("/" + SECRET) for s in secrets):
    run("secrets", "create", SECRET, "--replication-policy=automatic")
member = f"serviceAccount:{RUNTIME}"
policy = read("secrets", "get-iam-policy", SECRET)
if not any(b["role"] == "roles/secretmanager.secretAccessor" and member in b.get("members", []) for b in policy.get("bindings", [])):
    run("secrets", "add-iam-policy-binding", SECRET, f"--member={member}", "--role=roles/secretmanager.secretAccessor")
print("Invoice QB secret prepared. Add its configuration version in Secret Manager to enable Gmail connection.")
