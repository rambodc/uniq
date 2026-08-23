import test from "node:test";
import assert from "node:assert/strict";
import { extractionSchema, normalizeDraft } from "../extraction.js";
import { DAILY_ANALYSIS_LIMIT, DAILY_REFINEMENT_LIMIT, GUEST_ANALYSIS_LIMIT, GUEST_REFINEMENT_LIMIT, nextUtcReset, quotaStatus, utcDay } from "../access.js";

test("schema separates trajectory, holes, tubulars, and cement with bounded collections", () => {
  const draft=extractionSchema.properties.draft.properties;
  assert.deepEqual(draft.trajectory.items.properties.type.enum, ["vertical","inclined-hold","build","drop","turn","compound","horizontal","survey"]);
  assert.equal(draft.holes.maxItems,24);
  assert.equal(draft.tubulars.maxItems,32);
  assert.equal(draft.cement.maxItems,32);
});

test("guest AI trial limits stay intentionally smaller than account quotas", () => {
  assert.equal(GUEST_ANALYSIS_LIMIT, 1);
  assert.equal(GUEST_REFINEMENT_LIMIT, 3);
  assert.ok(GUEST_ANALYSIS_LIMIT < DAILY_ANALYSIS_LIMIT);
  assert.ok(GUEST_REFINEMENT_LIMIT < DAILY_REFINEMENT_LIMIT);
});
test("normalizer rejects incomplete and unsupported construction drafts", () => {
  assert.throws(() => normalizeDraft({ draft: { trajectory:[] } }), /incomplete/);
  assert.throws(() => normalizeDraft({ draft: { trajectory:[{type:"multilateral"}],holes:[],tubulars:[],cement:[] } }), /unsupported/);
});

test("daily quota status is deterministic and clamps at zero", () => {
  const now = new Date("2026-08-22T22:15:00.000Z");
  assert.equal(utcDay(now), "2026-08-22");
  assert.equal(nextUtcReset(now), "2026-08-23T00:00:00.000Z");
  assert.deepEqual(quotaStatus({ analyses: 2, refinements: 8 }, now), { analysesRemaining: DAILY_ANALYSIS_LIMIT - 2, refinementsRemaining: DAILY_REFINEMENT_LIMIT - 8, resetsAt: "2026-08-23T00:00:00.000Z" });
  assert.equal(quotaStatus({ analyses: 99, refinements: 99 }, now).analysesRemaining, 0);
});
