"""Configure passwordless authentication only in the production Actions workflow."""
import json
import os
import subprocess
import urllib.request

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Run authentication configuration through GitHub Actions.")
project = "uniqenergy-de71c"
runtime = "357883281274-compute@developer.gserviceaccount.com"
enabled = json.loads(subprocess.check_output(["gcloud", "services", "list", "--enabled", "--project=" + project, "--format=json"], text=True))
missing = {"iamcredentials.googleapis.com", "identitytoolkit.googleapis.com"} - {service["config"]["name"] for service in enabled}
if missing:
    subprocess.run(["gcloud", "services", "enable", *sorted(missing), "--project=" + project, "--quiet"], check=True)
policy = json.loads(subprocess.check_output(["gcloud", "iam", "service-accounts", "get-iam-policy", runtime, "--project=" + project, "--format=json"], text=True))
if not any(binding["role"] == "roles/iam.serviceAccountTokenCreator" and "serviceAccount:" + runtime in binding.get("members", []) and not binding.get("condition") for binding in policy.get("bindings", [])):
    subprocess.run(["gcloud", "iam", "service-accounts", "add-iam-policy-binding", runtime, "--project=" + project, "--member=serviceAccount:" + runtime, "--role=roles/iam.serviceAccountTokenCreator", "--quiet"], check=True)
token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
request = urllib.request.Request(
    f"https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config?updateMask=signIn.email.enabled",
    data=json.dumps({"signIn": {"email": {"enabled": False}}}).encode(),
    headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "X-Goog-User-Project": project}, method="PATCH")
with urllib.request.urlopen(request) as response:
    response.read()
print("Custom-token signing enabled; password provider disabled.")
