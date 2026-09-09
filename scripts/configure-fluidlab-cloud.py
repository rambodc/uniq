"""Configure FluidLab only inside the authorized production Actions workflow."""
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

if "--after-deploy" in sys.argv:
    run("tasks", "queues", "add-iam-policy-binding", "processFluidImport", f"--location={REGION}", f"--project={PROJECT}", f"--member=serviceAccount:{RUNTIME}", "--role=roles/cloudtasks.enqueuer")
    run("run", "services", "add-iam-policy-binding", "processfluidimport", f"--region={REGION}", f"--project={PROJECT}", f"--member=serviceAccount:{RUNTIME}", "--role=roles/run.invoker")
    run("iam", "service-accounts", "add-iam-policy-binding", RUNTIME, f"--project={PROJECT}", f"--member=serviceAccount:{RUNTIME}", "--role=roles/iam.serviceAccountUser")
else:
    run("services", "enable", "cloudtasks.googleapis.com", "secretmanager.googleapis.com", "run.googleapis.com", "cloudscheduler.googleapis.com", f"--project={PROJECT}")
    run("secrets", "add-iam-policy-binding", "OPENAI_API_KEY", f"--project={PROJECT}", f"--member=serviceAccount:{RUNTIME}", "--role=roles/secretmanager.secretAccessor")
