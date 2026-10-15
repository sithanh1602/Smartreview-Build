// How the 3D Risk Engine's cases fared with the reviewers: for each rule, how many of the
// cuboids it put in the queue a review called wrong (the rule was right), right (it was not) or
// unsure; and the cuboids reviewed as wrong that no case pointed at, which the engine missed.
// Pure: the report and the reviews in, the tally out.
import type { Risk3DReport } from './engine.ts';

export interface RuleTally {
  cases: number;
  reviewed: number;
  errors: number;
  correct: number;
  unsure: number;
  // errors / (errors + correct); null until a case of the rule has a sure decision.
  precision: number | null;
}
export interface Precision3D {
  engine_version: string;
  policy_version: string;
  total: RuleTally;
  checks: Record<string, RuleTally>;
  // Cuboids reviewed as wrong with no case on them, by the error the reviewer chose.
  missed: { count: number; by_error_type: Record<string, number> };
}
const empty = (): RuleTally => ({
  cases: 0,
  reviewed: 0,
  errors: 0,
  correct: 0,
  unsure: 0,
  precision: null,
});
const add = (tally: RuleTally, decision?: string) => {
  tally.cases++;
  if (!decision) return;
  tally.reviewed++;
  if (decision === 'ERROR') tally.errors++;
  else if (decision === 'CORRECT') tally.correct++;
  else tally.unsure++;
  const sure = tally.errors + tally.correct;
  tally.precision = sure ? Math.round((tally.errors / sure) * 1000) / 1000 : null;
};

export function precisionOf(
  report: Risk3DReport,
  reviews: Record<string, { decision: string; error_type: string | null }>,
): Precision3D {
  const total = empty();
  const checks: Record<string, RuleTally> = {};
  for (const c of report.cases) {
    const decision = reviews[c.id]?.decision;
    add(total, decision);
    // Each rule that added to the case's score answers for it.
    for (const f of c.findings) if (f.score > 0) add((checks[f.check_id] ??= empty()), decision);
  }
  const queued = new Set(report.cases.map((c) => c.id));
  const missed = { count: 0, by_error_type: {} as Record<string, number> };
  for (const [key, review] of Object.entries(reviews)) {
    if (review.decision !== 'ERROR' || queued.has(key)) continue;
    missed.count++;
    const type = review.error_type ?? 'OTHER';
    missed.by_error_type[type] = (missed.by_error_type[type] ?? 0) + 1;
  }
  return {
    engine_version: report.engine_version,
    policy_version: report.policy_version,
    total,
    checks,
    missed,
  };
}
