// The label verifier: a second look at each box from the pixels inside it. A model outside this
// repo (label-verifier, next to SmartReview) says how well a crop matches each label; what to
// ask it and what a disagreement is worth are data, in policy/_verifier.json. Nothing here
// reads a file or calls the model, so the same code runs in tests.
import verifierFile from '../../policy/_verifier.json' with { type: 'json' };
import { canonicalLabel } from './policy.ts';
import type { Annotation, BBox, Dataset, Frame } from '../schema/types.ts';

const policy = verifierFile.verifier_policy;
const { note: _note, ...CAPTIONS } = policy.captions;
const LABELS = Object.keys(CAPTIONS);
const WRONG_LABEL = policy.findings.find((f) => f.id === 'verifier.wrong_label')!;
// Labels the model is not asked to tell apart stand together: a rider's box holds part of the
// two-wheeler and the other way round, so the model's belief is split between the two names.
const GROUPS = policy.not_distinguished.pairs;
const groupOf = (label: string) => GROUPS.find((group) => group.includes(label)) ?? [label];

export const VERIFIER_MODEL = policy.model;
export interface VerifierRequest {
  model: string;
  margin: number;
  shape: string;
  pool: string;
  labels: Record<string, string[]>;
  boxes: { id: string; image: string; x: number; y: number; width: number; height: number }[];
}
export interface VerifierResponse {
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
  model: string;
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
): { request: VerifierRequest; skipped: VerifierReport['skipped'] } {
  const frames = new Map(data.frames.map((frame) => [frame.id, frame]));
  const boxes: VerifierRequest['boxes'] = [];
  const skipped: VerifierReport['skipped'] = [];
  for (const annotation of data.annotations) {
    const skip = (reason: string) => skipped.push({ annotation_id: annotation.id, reason });
    if (annotation.geometry.type !== 'bbox') {
      skip('not_a_bbox');
      continue;
    }
    if (!LABELS.includes(canonicalLabel(annotation.label))) {
      skip('unsupported_label');
      continue;
    }
    const { x, y, width, height } = annotation.geometry;
    if (!(width > 0 && height > 0)) {
      skip('invalid_box');
      continue;
    }
    if (Math.max(width, height) < policy.crop.min_side_px) {
      skip('below_minimum_size');
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
      model: policy.model,
      margin: policy.crop.margin,
      shape: policy.crop.shape,
      pool: policy.pool,
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
  minScore = 30,
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
  const byScore = (a: VerifiedBox, b: VerifiedBox) => b.score - a.score || b.lead - a.lead;
  return {
    schema_version: '1.0.0',
    dataset_id: data.dataset.id,
    model: response.model,
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
