"""Check optional Gmail setup without requiring deployment to administer Workspace."""
import os
import subprocess

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("Run this configuration through GitHub Actions, not a local shell.")

PROJECT = "uniqenergy-de71c"
RUNTIME = "357883281274-compute@developer.gserviceaccount.com"
SECRET = "INVOICE_QB_CONFIG"


result = subprocess.run(["gcloud", "secrets", "describe", SECRET, "--project", PROJECT, "--format=value(name)"], capture_output=True, text=True)
if result.returncode:
    print("::warning::Invoice QB Google configuration is not available to this workflow. Publish the disconnected app; complete docs/invoice-qb-setup.md before connecting Gmail.")
else:
    print(f"Invoice QB configuration secret exists. Its administrator must grant Secret Accessor to {RUNTIME} and supply a valid configuration version.")
