export const DAILY_ANALYSIS_LIMIT = 5;
export const DAILY_REFINEMENT_LIMIT = 25;

export function utcDay(date = new Date()) { return date.toISOString().slice(0, 10); }
export function nextUtcReset(date = new Date()) { const reset = new Date(date); reset.setUTCHours(24, 0, 0, 0); return reset.toISOString(); }
export function quotaStatus(data = {}, date = new Date()) {
  return { analysesRemaining: Math.max(0, DAILY_ANALYSIS_LIMIT - Number(data.analyses || 0)), refinementsRemaining: Math.max(0, DAILY_REFINEMENT_LIMIT - Number(data.refinements || 0)), resetsAt: nextUtcReset(date) };
}
