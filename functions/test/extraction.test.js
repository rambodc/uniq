import test from "node:test";
import assert from "node:assert/strict";
import { extractionSchema, normalizeDraft } from "../extraction.js";
import { DAILY_ANALYSIS_LIMIT, DAILY_REFINEMENT_LIMIT, nextUtcReset, quotaStatus, utcDay } from "../access.js";

test("schema supports only vertical and horizontal output", () => {
  assert.deepEqual(extractionSchema.properties.draft.properties.type.properties.value.enum, ["vertical", "horizontal", null]);
});
test("normalizer rejects unsupported architecture", () => {
  assert.throws(() => normalizeDraft({ draft: { type: { value: "multilateral" } } }), /unsupported/);
});

test("daily quota status is deterministic and clamps at zero", () => {
  const now = new Date("2026-08-22T22:15:00.000Z");
  assert.equal(utcDay(now), "2026-08-22");
  assert.equal(nextUtcReset(now), "2026-08-23T00:00:00.000Z");
  assert.deepEqual(quotaStatus({ analyses: 2, refinements: 8 }, now), { analysesRemaining: DAILY_ANALYSIS_LIMIT - 2, refinementsRemaining: DAILY_REFINEMENT_LIMIT - 8, resetsAt: "2026-08-23T00:00:00.000Z" });
  assert.equal(quotaStatus({ analyses: 99, refinements: 99 }, now).analysesRemaining, 0);
});
