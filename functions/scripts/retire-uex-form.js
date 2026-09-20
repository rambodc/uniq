import { execFileSync } from "node:child_process";
if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error(
    "Obsolete production endpoints may be retired only by GitHub Actions.",
  );
const raw = execFileSync(
  "firebase",
  ["functions:list", "--project", "uniqenergy-de71c", "--json"],
  { encoding: "utf8" },
);
const start = raw.indexOf('{\n  "status"');
const inventory = JSON.parse(start < 0 ? raw : raw.slice(start));
if (inventory.status !== "success" || !Array.isArray(inventory.result))
  throw new Error("Could not verify deployed function inventory.");
const retired = ["uexSaveParty", "uexUploadCover"].filter((id) =>
  inventory.result.some((f) => f.id === id && f.region === "us-central1"),
);
if (retired.length)
  execFileSync(
    "firebase",
    [
      "functions:delete",
      ...retired,
      "--region",
      "us-central1",
      "--project",
      "uniqenergy-de71c",
      "--force",
      "--non-interactive",
    ],
    { stdio: "inherit" },
  );
else console.log("Superseded UEX form endpoints are already absent.");
