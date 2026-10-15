// The label verifier: a second look at each box from the pixels inside it. One of two engines
// (server/verify/verify.py) says how well a crop matches each label; what to ask it and what a
// disagreement is worth are data, in policy/_verifier.json. Nothing here reads a file or calls
// the model, so the same code runs in tests.
import verifierFile from '../../policy/_verifier.json' with { type: 'json' };
import { canonicalLabel, POLICY } from './policy.ts';
import { severity } from './engine.ts';
import type { Severity } from './types.ts';
import { loadPolicy } from './rules.ts';
import type { Annotation, BBox, Dataset, Frame } from '../schema/types.ts';

const policy = verifierFile.verifier_policy;
const { note: _note, ...CAPTIONS } = policy.captions;
const LABELS = Object.keys(CAPTIONS);
const WRONG_LABEL = policy.findings.find((f) => f.id === 'verifier.wrong_label')!;
// Labels the model is not asked to tell apart stand together: a rider's box holds part of the
// two-wheeler and the other way round, so the model's belief is split between the two names.
const GROUPS = policy.not_distinguished.pairs;
const groupOf = (label: string) => GROUPS.find((group) => group.includes(label)) ?? [label];

// A box below its label's own minimum size is neither right nor wrong to the Risk Engine, so
// the verifier does not judge it either.
const labelPolicy = loadPolicy();

export type VerifierEngine = 'siglip' | 'qwen';
const { note: _engines, default: defaultEngine, ...engines } = policy.engines;
const ENGINES: Record<VerifierEngine, { model: string; calibrated: boolean; pool?: string }> =
  engines;
export const VERIFIER_ENGINES = Object.keys(ENGINES) as VerifierEngine[];
export const VERIFIER_ENGINE = defaultEngine as VerifierEngine;
// The engine a person can ask for on top of the default one, to look again at doubted boxes.
export const SECOND_ENGINE = policy.second_look.engine as VerifierEngine;
const SKIP_STATES: readonly string[] = policy.with_risk_engine.skip_states;
export interface VerifierRequest {
  engine: VerifierEngine;
  model: string;
  // Set by the caller that knows the machine: the folder the model is loaded from.
  model_dir?: string;
  margin: number;
  shape: string;
  pool?: string;
  labels: Record<string, string[]>;
  boxes: { id: string; image: string; x: number; y: number; width: number; height: number }[];
}
export interface VerifierResponse {
  engine?: VerifierEngine;
  model: string;
  device?: string;
  results: { id: string; scores: Record<string, number>; caption?: string }[];
  skipped: { id: string; reason: string }[];
}
export interface VerifiedBox {
  annotation_id: string;
  frame_id: string;
  label: string;
  // The label the model matched best outside the label's own group. The two scores are the
  // belief in each side's whole group, so they are what `lead` compares.
  predicted: string;
  label_score: number;
  predicted_score: number;
  lead: number;
  score: number;
  level?: 'warning';
  rule_id?: string;
  error_type?: string;
  suggested_label?: string;
  reason?: string;
  caption?: string;
}
export interface VerifierReport {
  schema_version: '1.0.0';
  dataset_id: string;
  engine: VerifierEngine;
  model: string;
  // False when the score table was not measured with this engine: its scores are for
  // comparison, not yet grounds for queueing a box.
  calibrated: boolean;
  checked: number;
  skipped: { annotation_id: string; reason: string }[];
  results: VerifiedBox[];
  // Boxes scored at or above `min_score`, highest first.
  min_score: number;
  cases: VerifiedBox[];
  warnings: VerifiedBox[];
}

// What to send the model: every box it can judge, with the image file it sits in. A box it
// cannot judge is listed with the reason, never dropped silently.
export function verifierRequest(
  data: Dataset,
  imagePath: (frame: Frame) => string | undefined,
  engine: VerifierEngine = VERIFIER_ENGINE,
  // Inside a project: the state the Risk Engine gave each box, so that only boxes it scores
  // are judged; and, for a second look, the boxes to look at again.
  scope: { state?: (annotationId: string) => string | undefined; only?: Set<string> } = {},
): { request: VerifierRequest; skipped: VerifierReport['skipped'] } {
  const frames = new Map(data.frames.map((frame) => [frame.id, frame]));
  const boxes: VerifierRequest['boxes'] = [];
  const skipped: VerifierReport['skipped'] = [];
  for (const annotation of data.annotations) {
    const skip = (reason: string) => skipped.push({ annotation_id: annotation.id, reason });
    if (scope.only && !scope.only.has(annotation.id)) continue;
    if (annotation.geometry.type !== 'bbox') {
      skip('not_a_bbox');
      continue;
    }
    const label = canonicalLabel(annotation.label);
    if (!LABELS.includes(label)) {
      skip('unsupported_label');
      continue;
    }
    const { x, y, width, height } = annotation.geometry;
    if (!(width > 0 && height > 0)) {
      skip('invalid_box');
      continue;
    }
    if (
      Math.max(width, height) < policy.crop.min_side_px ||
      labelPolicy.belowMinimum(label, width, height)
    ) {
      skip('below_minimum_size');
      continue;
    }
    if (SKIP_STATES.includes(scope.state?.(annotation.id) ?? '')) {
      skip('not_scored_by_engine');
      continue;
    }
    const frame = frames.get(annotation.frame_id);
    const image = frame && imagePath(frame);
    if (!image) {
      skip('missing_image');
      continue;
    }
    boxes.push({ id: annotation.id, image, x, y, width, height });
  }
  return {
    request: {
      engine,
      model: ENGINES[engine].model,
      margin: policy.crop.margin,
      shape: policy.crop.shape,
      ...(ENGINES[engine].pool && { pool: ENGINES[engine].pool }),
      labels: CAPTIONS,
      boxes,
    },
    skipped,
  };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
// Reads one box: the model's scores against the label it carries, scored by the policy.
function verify(
  annotation: Annotation & { geometry: BBox },
  scores: Record<string, number>,
  caption?: string,
): VerifiedBox {
  const label = canonicalLabel(annotation.label);
  const belief = (name: string) => groupOf(name).reduce((sum, l) => sum + (scores[l] ?? 0), 0);
  const own = (name: string) => scores[name] ?? 0;
  // The label keeps its name unless a group other than its own is believed more; of that
  // group, the member the model matched best is the one suggested.
  const rival = LABELS.filter((other) => !groupOf(label).includes(other)).reduce(
    (best, other) => (belief(other) > belief(best) ? other : best),
    label,
  );
  const predicted =
    rival === label ? label : groupOf(rival).reduce((a, b) => (own(b) > own(a) ? b : a));
  const label_score = belief(label);
  const predicted_score = predicted === label ? label_score : belief(predicted);
  const lead = Math.max(0, predicted_score - label_score);
  const box: VerifiedBox = {
    annotation_id: annotation.id,
    frame_id: annotation.frame_id,
    label,
    predicted,
    label_score,
    predicted_score,
    lead,
    score: 0,
    ...(caption && { caption }),
  };
  // The first tier the lead reaches decides; below the last tier the box is left alone.
  const tier =
    lead > 0 ? WRONG_LABEL.score_by_lead.find((step) => lead >= step.lead_at_least) : undefined;
  if (!tier) return box;
  return {
    ...box,
    score: tier.score ?? 0,
    ...(tier.level === 'warning' && { level: 'warning' as const }),
    rule_id: WRONG_LABEL.id,
    error_type: WRONG_LABEL.error_type,
    suggested_label: predicted,
    reason: `Phần ảnh trong box giống ${groupOf(predicted).join(' hoặc ')} (${percent(predicted_score)}) hơn ${label} (${percent(label_score)}).`,
  };
}

export function verifierReport(
  data: Dataset,
  response: VerifierResponse,
  skippedBefore: VerifierReport['skipped'] = [],
  // The verifier queues a box at the score the Risk Engine queues one.
  minScore = POLICY.tier.flagged,
): VerifierReport {
  const annotations = new Map(data.annotations.map((a) => [a.id, a]));
  const results: VerifiedBox[] = [];
  for (const result of response.results) {
    const annotation = annotations.get(result.id);
    if (!annotation || annotation.geometry.type !== 'bbox')
      throw new Error(`verifier: the model answered for an unknown box ${result.id}`);
    results.push(
      verify(annotation as Annotation & { geometry: BBox }, result.scores, result.caption),
    );
  }
  const engine = response.engine ?? VERIFIER_ENGINE;
  const byScore = (a: VerifiedBox, b: VerifiedBox) => b.score - a.score || b.lead - a.lead;
  return {
    schema_version: '1.0.0',
    dataset_id: data.dataset.id,
    engine,
    model: response.model,
    calibrated: ENGINES[engine].calibrated,
    checked: results.length,
    skipped: [
      ...skippedBefore,
      ...response.skipped.map(({ id, reason }) => ({ annotation_id: id, reason })),
    ],
    results,
    min_score: minScore,
    cases: results.filter((r) => r.score >= minScore).sort(byScore),
    warnings: results.filter((r) => r.level === 'warning').sort(byScore),
  };
}

// A box the engine doubts at all: scored, or only warned about.
export const doubted = (box: VerifiedBox) => box.score > 0 || box.level === 'warning';
// The boxes a second engine is asked to look at again.
export const secondLook = (report: VerifierReport) =>
  new Set(
    report.results
      .filter((box) => (policy.second_look.from === 'warning' ? doubted(box) : box.score > 0))
      .map((box) => box.annotation_id),
  );

export interface CombinedFinding extends VerifiedBox {
  id: string;
  check_id: string;
  // What the verifier alone gives the box, what the Risk Engine alone gives it, and the two
  // together: `score` is what the list is ordered by.
  verifier_score: number;
  risk_score: number;
  severity: Severity;
  // The Risk Engine alone already queued the box.
  in_queue: boolean;
  second?: {
    engine: VerifierEngine;
    predicted: string;
    lead: number;
    score: number;
    confirmed: boolean;
  };
}
export interface CombinedReport {
  engine: VerifierEngine;
  model: string;
  second_engine?: VerifierEngine;
  second_model?: string;
  min_score: number;
  checked: number;
  skipped: Record<string, number>;
  // Boxes at or above min_score; those the Risk Engine had not queued; those the second
  // engine confirmed.
  flagged: number;
  added_to_queue: number;
  confirmed?: number;
  findings: CombinedFinding[];
}

// The default way the verifier runs in a project: next to the Risk Engine. Every box the
// default engine doubts is listed with the engine's own score added, and, when a second engine
// looked again, whether it agrees. Nothing the Risk Engine stored is changed.
export function combineWithRisk(
  first: VerifierReport,
  riskScore: (annotationId: string) => number,
  second?: VerifierReport,
): CombinedReport {
  const again = new Map(second?.results.map((box) => [box.annotation_id, box]));
  const findings = first.results.filter(doubted).map((box): CombinedFinding => {
    const risk_score = riskScore(box.annotation_id);
    const score = Math.min(policy.with_risk_engine.max_score, risk_score + box.score);
    const look = again.get(box.annotation_id);
    return {
      ...box,
      id: `verifier:${box.annotation_id}`,
      check_id: WRONG_LABEL.id,
      verifier_score: box.score,
      risk_score,
      score,
      severity: severity(score),
      in_queue: risk_score >= first.min_score,
      ...(second &&
        look && {
          second: {
            engine: second.engine,
            predicted: look.predicted,
            lead: look.lead,
            score: look.score,
            confirmed: look.score >= first.min_score,
          },
        }),
    };
  });
  findings.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.second?.confirmed ?? false) - Number(a.second?.confirmed ?? false) ||
      b.lead - a.lead,
  );
  const skipped: Record<string, number> = {};
  for (const { reason } of first.skipped) skipped[reason] = (skipped[reason] ?? 0) + 1;
  const flagged = findings.filter((f) => f.score >= first.min_score);
  return {
    engine: first.engine,
    model: first.model,
    ...(second && { second_engine: second.engine, second_model: second.model }),
    min_score: first.min_score,
    checked: first.checked,
    skipped,
    flagged: flagged.length,
    added_to_queue: flagged.filter((f) => !f.in_queue).length,
    ...(second && { confirmed: findings.filter((f) => f.second?.confirmed).length }),
    findings,
  };
}
