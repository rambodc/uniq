"""Hold Hosting until changed backend/rules workflows succeed for the same commit."""
import json
import os
import subprocess
import time

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("This coordination runs only in GitHub Actions.")
sha = os.environ["GITHUB_SHA"]
paths = subprocess.check_output(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha], text=True).splitlines()
wanted = []
if any(p.startswith("functions/") or p in ("scripts/configure-fluidlab-cloud.py", "firebase.json", ".firebaserc", ".github/workflows/firebase-functions-merge.yml") for p in paths):
    wanted.append("Production: Firebase Functions")
if any(p in ("firestore.rules", "storage.rules", "storage.cors.json", "scripts/configure-well-storage.py", "firestore.indexes.json", "tests/rules.test.mjs", "firebase.json", "package.json", "package-lock.json", ".github/workflows/firebase-rules-merge.yml") for p in paths):
    wanted.append("Production: Firebase Rules")
end = time.monotonic() + 1800
while wanted and time.monotonic() < end:
    runs = json.loads(subprocess.check_output(["gh", "run", "list", "--commit", sha, "--json", "workflowName,status,conclusion,url", "--limit", "50"], text=True))
    for name in wanted[:]:
        run = next((r for r in runs if r["workflowName"] == name), None)
        if run and run["status"] == "completed":
            if run["conclusion"] != "success":
                raise SystemExit(f"Hosting held: {name} {run['conclusion']}: {run['url']}")
            print(f"Dependency succeeded: {run['url']}", flush=True)
            wanted.remove(name)
    if wanted:
        print("Waiting for " + ", ".join(wanted), flush=True)
        time.sleep(15)
if wanted:
    raise SystemExit("Timed out waiting for backend/rules workflows; Hosting was not published.")
