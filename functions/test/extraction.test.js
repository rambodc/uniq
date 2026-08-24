import test from "node:test";
import assert from "node:assert/strict";
import { extractionSchema, normalizeDraft } from "../extraction.js";
import {
  DAILY_ANALYSIS_LIMIT,
  DAILY_REFINEMENT_LIMIT,
  GUEST_ANALYSIS_LIMIT,
  GUEST_REFINEMENT_LIMIT,
  nextUtcReset,
  quotaStatus,
  utcDay,
} from "../access.js";

test("schema returns bounded hole sections and survey stations", () => {
  const sections = extractionSchema.properties.draft.properties.holeSections;
  assert.deepEqual(sections.items.properties.category.enum, [
    "surface",
    "intermediate",
    "main",
  ]);
  assert.equal(sections.maxItems, 20);
  assert.equal(
    extractionSchema.properties.draft.properties.surveyStations.maxItems,
    300,
  );
});

test("guest AI trial limits stay intentionally smaller than account quotas", () => {
  assert.equal(GUEST_ANALYSIS_LIMIT, 1);
  assert.equal(GUEST_REFINEMENT_LIMIT, 3);
  assert.ok(GUEST_ANALYSIS_LIMIT < DAILY_ANALYSIS_LIMIT);
  assert.ok(GUEST_REFINEMENT_LIMIT < DAILY_REFINEMENT_LIMIT);
});
test("normalizer rejects incomplete and unsupported construction drafts", () => {
  assert.throws(() => normalizeDraft({ draft: {} }), /incomplete/);
  assert.throws(
    () =>
      normalizeDraft({
        draft: { holeSections: [{ category: "branch" }], surveyStations: [] },
      }),
    /unsupported/,
  );
});

test("daily quota status is deterministic and clamps at zero", () => {
  const now = new Date("2026-08-22T22:15:00.000Z");
  assert.equal(utcDay(now), "2026-08-22");
  assert.equal(nextUtcReset(now), "2026-08-23T00:00:00.000Z");
  assert.deepEqual(quotaStatus({ analyses: 2, refinements: 8 }, now), {
    analysesRemaining: DAILY_ANALYSIS_LIMIT - 2,
    refinementsRemaining: DAILY_REFINEMENT_LIMIT - 8,
    resetsAt: "2026-08-23T00:00:00.000Z",
  });
  assert.equal(
    quotaStatus({ analyses: 99, refinements: 99 }, now).analysesRemaining,
    0,
  );
});
