"""Hold Hosting until changed backend/rules workflows succeed for the same commit."""
import json
import os
import subprocess
import time

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise SystemExit("This coordination runs only in GitHub Actions.")
sha = os.environ["GITHUB_SHA"]
with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as event_file:
    event = json.load(event_file)
before = event.get("before")
if before and before != "0" * 40:
    command = ["git", "diff", "--name-only", before, sha]
else:
    command = ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha]
paths = subprocess.check_output(command, text=True).splitlines()
wanted = []
if any(p.startswith("functions/") or p in ("scripts/configure-fluidlab-cloud.py", "firebase.json", ".firebaserc", ".github/workflows/firebase-functions-merge.yml") for p in paths):
    wanted.append("Production: Firebase Functions")
if any(p in ("functions/scripts/verify-fluid-well-indexes.js", "firestore.rules", "storage.rules", "storage.cors.json", "scripts/configure-fluid-storage.py", "firestore.indexes.json", "tests/rules.test.mjs", "firebase.json", "package.json", "package-lock.json", ".github/workflows/firebase-rules-merge.yml") for p in paths):
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
