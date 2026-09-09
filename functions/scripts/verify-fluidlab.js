import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { extractFiles } from "../apps/fluidlab/extraction.js";
import { summarize } from "../apps/fluidlab/model.js";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: node functions/scripts/verify-fluidlab.js <workbook> [--live]",
  );
const dir = process.env.FLUIDLAB_CHECK_DIR || "/tmp/fluidlab-check";
await mkdir(dir, { recursive: true });
if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to explicitly run the paid OpenAI integration check.",
  );
const checkpoints = {};
for (const f of await readdir(dir))
  if (f.endsWith(".checkpoint.json"))
    checkpoints[f.replace(".checkpoint.json", "")] = JSON.parse(
      await readFile(dir + "/" + f, "utf8"),
    );
const apiKey =
  process.env.OPENAI_API_KEY ||
  execFileSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "access",
      "latest",
      "--secret=OPENAI_API_KEY",
      "--project=uniqenergy-de71c",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
try {
  const result = await extractFiles(
    [
      {
        name: "All reports.xlsx",
        id: "sample-workbook",
        buffer: await readFile(source),
      },
    ],
    {
      apiKey,
      checkpoints,
      onCheckpoint: async (k, v) =>
        writeFile(dir + "/" + k + ".checkpoint.json", JSON.stringify(v)),
      onProgress: async (p) => console.log(p.message),
    },
  );
  await writeFile(dir + "/result.json", JSON.stringify(result));
  const s = summarize(result.dataset);
  if (process.argv.includes("--sample-acceptance")) {
    assert.equal(s.reports, 11);
    assert.equal(s.branches, 33);
    assert.equal(
      result.dataset.records.filter((r) => r.kind === "product").length,
      27,
    );
    assert.equal(
      result.dataset.records.filter(
        (r) =>
          r.kind === "branch" &&
          r.facts.lossesM3?.value !== null &&
          r.facts.lossesM3?.value !== undefined,
      ).length,
      33,
    );
    assert.equal(s.productCost, "99787.10");
    assert.equal(s.serviceCost, "7000.00");
    assert.ok(
      result.dataset.issues.some(
        (i) => i.code === "check:well-cost" && i.message.includes("25.60"),
      ),
    );
    assert.ok(result.dataset.issues.some((i) => i.code === "check:negative"));
    assert.ok(result.dataset.issues.some((i) => i.code === "check:balance"));
    const ids = new Set(result.dataset.sources.map((s) => s.id));
    for (const r of result.dataset.records)
      for (const f of Object.values(r.facts))
        assert.ok(
          f.sources.length && f.sources.every((id) => ids.has(id)),
          "Facts must cite retained sources",
        );
    console.log(
      "PASS: sample counts, costs, 33 leg losses, discrepancies, and source references.",
    );
  }

  console.log(
    JSON.stringify(
      {
        records: result.dataset.records.length,
        products: result.dataset.records.filter((r) => r.kind === "product")
          .length,
        branches: s.branches,
        reports: s.reports,
        currencies: s.currencies,
        issues: result.dataset.issues.length,
        usage: result.usage,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("Integration check failed:", e.message);
  process.exitCode = 1;
}
