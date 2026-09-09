"""Configure FluidLab only inside the authorized production Actions workflow."""
import json
import os
import subprocess
import sys

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Run this configuration through GitHub Actions, not a local shell.")
PROJECT = "uniqenergy-de71c"
REGION = "us-central1"
RUNTIME = "357883281274-compute@developer.gserviceaccount.com"


def run(*args):
    subprocess.run(["gcloud", *args, "--quiet"], check=True)


def read(*args):
    return json.loads(subprocess.check_output(["gcloud", *args, "--format=json"], text=True))


def ensure_binding(resource, name, role, *flags):
    policy = read(*resource, "get-iam-policy", name, *flags)
    member = f"serviceAccount:{RUNTIME}"
    if not any(b["role"] == role and member in b.get("members", []) and not b.get("condition") for b in policy.get("bindings", [])):
        run(*resource, "add-iam-policy-binding", name, *flags, f"--member={member}", f"--role={role}")


if "--after-deploy" in sys.argv:
    ensure_binding(["tasks", "queues"], "processFluidImport", "roles/cloudtasks.enqueuer", f"--location={REGION}", f"--project={PROJECT}")
    ensure_binding(["run", "services"], "processfluidimport", "roles/run.invoker", f"--region={REGION}", f"--project={PROJECT}")
    ensure_binding(["iam", "service-accounts"], RUNTIME, "roles/iam.serviceAccountUser", f"--project={PROJECT}")
else:
    required = {"cloudtasks.googleapis.com", "secretmanager.googleapis.com", "run.googleapis.com", "cloudscheduler.googleapis.com"}
    enabled = {s["config"]["name"] for s in read("services", "list", "--enabled", f"--project={PROJECT}")}
    missing = sorted(required - enabled)
    if missing:
        run("services", "enable", *missing, f"--project={PROJECT}")
    ensure_binding(["secrets"], "OPENAI_API_KEY", "roles/secretmanager.secretAccessor", f"--project={PROJECT}")
