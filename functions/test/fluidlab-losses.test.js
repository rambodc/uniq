import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataset } from "../apps/fluidlab/model.js";
import {
  lossEntries,
  reconcileLosses,
  analyzeLosses,
} from "../apps/fluidlab/losses.js";
import { applyReview } from "../apps/fluidlab/review.js";
const f = (v, unit = null, sources = []) => ({
  value: v === null ? null : String(v),
  unit,
  sources,
  status: "reported",
});
const loss = (
  id,
  amount,
  measure = "daily",
  unit = "m3",
  category = "downhole",
  report = "R1",
  sources = [id],
) => ({
  id,
  kind: "loss",
  label: id,
  report,
  facts: {
    lossAmount: f(amount, unit, sources),
    lossMeasure: f(measure),
    lossCategory: f(category),
  },
});
test("loss totals separate daily, event, cumulative, rates, currencies/units and unknown classification", () => {
  const d = emptyDataset();
  d.records = [
    loss("daily", 10),
    loss("event", 3, "event"),
    loss("cumulative", 70, "cumulative"),
    loss("rate", 2, "rate", "m3/h"),
    loss("surface", 4, "daily", "m3", "surface"),
    loss("unknown", 5, "daily", "m3", "unspecified"),
    loss("barrels", 6, "daily", "bbl"),
    loss("signed", -1, "daily", "m3", "downhole", "R2"),
    loss("no-unit", 8, "daily", null),
  ];
  const e = lossEntries(d);
  assert.deepEqual(
    e.filter((x) => x.includedInTotal).map((x) => x.id),
    ["daily", "barrels", "signed"],
  );
  assert.equal(e.find((x) => x.id === "daily").mdM, null);
  assert.equal(
    reconcileLosses(d).issues.filter((x) => x.code.startsWith("loss:")).length,
    2,
  );
});
test("deduplicates overlapping table/narrative evidence but preserves distinct equal events", () => {
  const d = emptyDataset();
  d.records = [
    {
      id: "report",
      kind: "report",
      label: "R1",
      facts: {
        totalDrillingLossesM3: f(10, "m3", ["table"]),
        mdM: f(500, "m"),
      },
    },
    loss("note", 10, "daily", "m3", "downhole", "R1", ["table", "note"]),
    loss("event1", 3, "event"),
    loss("event2", 3, "event"),
  ];
  const e = lossEntries(d);
  assert.equal(e.length, 3);
  assert.equal(e.filter((x) => x.amount === 10).length, 1);
  assert.equal(e[0].mdM, 500);
  assert.equal(e[0].measure, "daily");
});
test("conflicting daily totals are excluded; corrections resolve conflict and preserve unrelated reviews", () => {
  let d = emptyDataset();
  d.records = [loss("first", 10), loss("second", 12)];
  d = reconcileLosses(d);
  assert.equal(lossEntries(d).filter((e) => e.includedInTotal).length, 0);
  const issue = d.issues[0];
  d = applyReview(d, { review: { issueId: issue.id, action: "kept" } }, "user");
  d = reconcileLosses(d);
  assert.equal(d.issues.find((i) => i.id === issue.id).status, "kept");
  applyReview(
    d,
    {
      correction: {
        recordId: "second",
        field: "lossAmount",
        value: "10",
        unit: "m3",
      },
    },
    "user",
  );
  assert.equal(lossEntries(d).filter((e) => e.includedInTotal).length, 1);
  assert.throws(
    () =>
      applyReview(
        d,
        {
          correction: {
            recordId: "first",
            field: "lossAmount",
            value: "2",
            unit: "m",
          },
        },
        "user",
      ),
    /volume unit/,
  );
});
test("loss extraction grounds amounts/units, caches results and includes numeric table neighbours", async () => {
  const d = emptyDataset();
  d.sources = [
    {
      id: "header",
      file: "a",
      sheet: "s",
      row: 1,
      column: 1,
      raw: "Daily downhole losses (m3)",
      display: "Daily downhole losses (m3)",
    },
    {
      id: "number",
      file: "a",
      sheet: "s",
      row: 1,
      column: 2,
      raw: 8,
      display: "8",
    },
  ];
  d.records = [
    {
      id: "r",
      kind: "report",
      label: "R1",
      facts: { totalDrillingLossesM3: f(8, "m3", ["number"]) },
    },
  ];
  let calls = 0;
  const client = {
    responses: {
      parse: async ({ input }) => {
        calls++;
        assert.match(input, /"text":8/);
        return {
          output_parsed: {
            losses: [
              {
                report: "R1",
                amount: 8,
                unit: "m3",
                category: "downhole",
                measure: "daily",
                date: null,
                mdM: null,
                endMdM: null,
                sources: ["header", "number"],
                description: "Daily loss",
              },
              {
                report: "R1",
                amount: 999,
                unit: "m3",
                category: "downhole",
                measure: "daily",
                date: null,
                mdM: null,
                endMdM: null,
                sources: ["number"],
                description: "invented",
              },
            ],
          },
          usage: { total_tokens: 25 },
        };
      },
    },
  };
  const first = await analyzeLosses(d, { client });
  assert.equal(first.usage.calls, 1);
  assert.equal(
    first.dataset.records.filter((r) => r.kind === "loss").length,
    1,
  );
  assert.equal(lossEntries(d).length, 1);
  assert.equal(lossEntries(d)[0].measure, "daily");
  await analyzeLosses(d, { client });
  assert.equal(calls, 1);
});

test("same-day daily totals across reports are not summed twice", () => {
  const d = emptyDataset();
  const a = loss("a", 8, "daily", "m3", "downhole", "R1"),
    b = loss("b", 8, "daily", "m3", "downhole", "R2");
  a.facts.date = f("2026-09-01");
  b.facts.date = f("2026-09-01");
  d.records = [a, b];
  assert.equal(lossEntries(d).length, 1);
});

test("equal daily and cumulative numbers from the same note keep distinct meaning", () => {
  const d = emptyDataset();
  d.records = [
    loss("daily", 8, "daily", "m3", "downhole", "R1", ["note"]),
    loss("cumulative", 8, "cumulative", "m3", "downhole", "R1", ["note"]),
  ];
  const e = lossEntries(d);
  assert.equal(e.length, 2);
  assert.equal(e.filter((x) => x.includedInTotal).length, 1);
});
