// Explicit, bounded live check: a single synthetic source batch. No production data writes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { emptyDataset } from "../apps/fluidlab/model.js";
import { analyzeLosses, lossEntries } from "../apps/fluidlab/losses.js";
if (!process.argv.includes("--live"))
  throw new Error("Pass --live to authorize the bounded AI check.");
const apiKey = execFileSync(
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
const d = emptyDataset(),
  raw =
    "Report R1, 2026-09-01: Daily downhole losses were 8 m3 at 500 m MD. Cumulative downhole losses to date were 30 m3. The downhole loss rate was 2 m3/h. Surface transfer losses today were 3 m3. An additional loss of 4 was mentioned without a unit or classification.";
d.sources = [
  {
    id: "a".repeat(32),
    file: "verification.csv",
    sheet: "Report",
    cell: "A1",
    row: 1,
    column: 1,
    raw,
    display: raw,
    formula: null,
  },
];
d.records = [
  {
    id: "report",
    kind: "report",
    label: "R1",
    report: null,
    product: null,
    branch: null,
    facts: {
      activitySummary: {
        value: raw,
        unit: null,
        status: "reported",
        sources: [d.sources[0].id],
      },
    },
  },
];
const result = await analyzeLosses(d, { apiKey });
const entries = lossEntries(result.dataset);
assert.equal(result.usage.calls, 1);
assert.ok(
  entries.some(
    (e) =>
      e.amount === 8 &&
      e.category === "downhole" &&
      e.measure === "daily" &&
      e.includedInTotal,
  ),
);
assert.ok(
  entries.some(
    (e) => e.amount === 30 && e.measure === "cumulative" && !e.includedInTotal,
  ),
);
assert.ok(
  entries.some(
    (e) => e.amount === 2 && e.measure === "rate" && !e.includedInTotal,
  ),
);
assert.ok(
  entries.some(
    (e) => e.amount === 3 && e.category === "surface" && !e.includedInTotal,
  ),
);
assert.ok(
  entries.some((e) => e.amount === 4 && e.unit === null && !e.includedInTotal),
);
console.log(
  JSON.stringify(
    {
      passed: true,
      calls: result.usage.calls,
      tokens: result.usage.tokens,
      entries: entries.map((e) => ({
        amount: e.amount,
        unit: e.unit,
        category: e.category,
        measure: e.measure,
        includedInTotal: e.includedInTotal,
      })),
    },
    null,
    2,
  ),
);
