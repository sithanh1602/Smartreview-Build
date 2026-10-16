import { severity } from '../../core/risk/engine.ts';
import type { CombinedFinding } from '../../core/risk/label-verify.ts';
import type { Finding } from '../../core/risk/types.ts';
import type { Case, LoadedDataset } from '../types.ts';

// Puts what a label scan found into the review queue of a loaded dataset. The Risk Engine's
// report is not run again: a box the scan gave points to gets one more finding and the
// combined score, and joins the queue when that score reaches the queue's own minimum.
// Applying the same scan twice changes nothing. Returns the queued cases it changed, for the
// database.
export function addToQueue(dataset: LoadedDataset, scan: CombinedFinding[]): Case[] {
  const minScore = dataset.report.min_score;
  const queued = new Map(dataset.cases.map((c) => [c.id, c]));
  const every = new Map(dataset.allCases.map((c) => [c.annotation_id, c]));
  const changed: Case[] = [];
  for (const found of scan) {
    const item = every.get(found.annotation_id);
    // A warning carries no points, so it is not an error to review.
    if (!item || !found.verifier_score || item.check_ids.includes(found.check_id)) continue;
    const finding = {
      check_id: found.check_id,
      rule_id: found.rule_id,
      score: found.verifier_score,
      reason: found.reason,
      error_type: found.error_type,
      suggested_label: found.suggested_label,
      evidence: {
        label: found.label,
        label_score: found.label_score,
        predicted: found.predicted,
        predicted_score: found.predicted_score,
        lead: found.lead,
        risk_engine_score: found.risk_score,
        ...(found.second && { second_look: found.second }),
      },
    } as unknown as Finding;
    // The queue and the full list hold their own copy of a case.
    for (const copy of new Set([item, queued.get(item.id)]))
      if (copy)
        Object.assign(copy, {
          score: found.score,
          risk_score: found.score,
          severity: severity(found.score),
          risk_level: severity(found.score),
          findings: [...copy.findings, finding],
          reasons: [...copy.reasons, found.reason],
          check_ids: [...copy.check_ids, found.check_id],
          suspected_error: copy.suspected_error ?? found.error_type,
          suggested_label: copy.suggested_label ?? found.suggested_label,
        });
    if (found.score < minScore) continue;
    if (!queued.has(item.id)) {
      queued.set(item.id, item);
      dataset.cases.push(item);
    }
    changed.push(queued.get(item.id)!);
  }
  if (!changed.length) return changed;
  // The Risk Engine's own order: highest score first.
  dataset.cases.sort(
    (a, b) =>
      b.score - a.score ||
      a.reference.frame_index - b.reference.frame_index ||
      a.id.localeCompare(b.id),
  );
  dataset.meta.total_cases = dataset.cases.length;
  dataset.meta.levels = Object.fromEntries(
    ['high', 'medium', 'low'].map((level) => [
      level,
      dataset.cases.filter((c) => c.severity === level).length,
    ]),
  );
  return changed;
}
