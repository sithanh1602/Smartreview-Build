import type { Annotation, Media } from '../schema/types.ts';
import type { CheckContext, MeasuredBox } from './types.ts';

type Params = Record<string, any>;
export interface Visibility {
  value: number;
  // measured: a percentage attribute of the dataset. estimated: worked out from the boxes.
  source: 'measured' | 'estimated';
  // estimated only: the share of the box still inside the frame, and the share of it under
  // boxes standing nearer the camera. value = in_frame × (1 − covered).
  in_frame?: number;
  covered?: number;
}

const percent = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
// The share of the object a dataset says is still visible, when it records percentages.
export function measuredVisibility(annotation: Annotation, config: Params): number | null {
  const shares = (config.percent_attributes as string[])
    .map((name) => percent(annotation.attributes?.[name]))
    .filter((value) => value !== null);
  return shares.length ? shares.reduce((seen, hidden) => seen * (1 - hidden / 100), 1) : null;
}
// Area of `box` under the union of `covers`, as a share of the box.
function coveredShare(
  box: MeasuredBox,
  covers: { x1: number; y1: number; x2: number; y2: number }[],
) {
  const clipped = covers
    .map((c) => ({
      x1: Math.max(c.x1, box.x1),
      y1: Math.max(c.y1, box.y1),
      x2: Math.min(c.x2, box.x2),
      y2: Math.min(c.y2, box.y2),
    }))
    .filter((c) => c.x2 > c.x1 && c.y2 > c.y1);
  const xs = [...new Set(clipped.flatMap((c) => [c.x1, c.x2]))].sort((a, b) => a - b),
    ys = [...new Set(clipped.flatMap((c) => [c.y1, c.y2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++)
      if (
        clipped.some(
          (c) => c.x1 <= xs[i] && c.x2 >= xs[i + 1] && c.y1 <= ys[j] && c.y2 >= ys[j + 1],
        )
      )
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  return area / (box.width * box.height);
}
// visibility = share still inside the frame × (1 − share under boxes standing nearer the camera).
// A rectangle is wider than the object in it, so the estimate always overstates what is hidden.
export function estimatedVisibility(
  box: MeasuredBox,
  others: MeasuredBox[],
  media: Media,
  config: Params,
) {
  const {
    typical_ratio: ratio,
    edge_px: edge,
    occluders,
    occluder_shrink: shrink,
  } = config.estimate_from_boxes;
  let inFrame = 1;
  if (box.x1 <= edge || box.x2 >= media.width - edge)
    inFrame *= Math.min(1, (box.width * ratio) / box.height);
  if (box.y1 <= edge || box.y2 >= media.height - edge)
    inFrame *= Math.min(1, box.height / (box.width * ratio));
  // A box whose bottom edge is lower stands nearer the camera.
  const nearer = others
    .filter((o) => o.id !== box.id && occluders.includes(o.label) && o.y2 > box.y2)
    .map((o) => {
      const cx = (o.x1 + o.x2) / 2,
        cy = (o.y1 + o.y2) / 2,
        w = (o.width * shrink) / 2,
        h = (o.height * shrink) / 2;
      return { x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
    });
  const covered = coveredShare(box, nearer);
  return { value: inFrame * (1 - covered), in_frame: inFrame, covered };
}
export function visibilityOf(
  { current, box, peers, media }: CheckContext,
  config: Params | undefined,
): Visibility | null {
  if (!config || !('x1' in box)) return null;
  const measured = measuredVisibility(current, config);
  return measured !== null
    ? { value: measured, source: 'measured' }
    : { ...estimatedVisibility(box, peers, media, config), source: 'estimated' };
}

// The second-best class is optional model output carried in attributes; never inferred.
export function top2(current: Annotation) {
  const { label_top2: label, score_top2: score } = current.attributes || {};
  if (typeof label !== 'string' || typeof score !== 'number' || !Number.isFinite(score))
    return null;
  return { label, score };
}
// The independent signs that a box is hard to confirm. A sign whose data is missing does not
// count: it is neither present nor absent.
export function weakSignals({ current, box, env_risk }: CheckContext, config: Params | undefined) {
  if (!config || !('x1' in box)) return [];
  const second = top2(current),
    confidence = box.confidence;
  return (config.weak_signals as Params[])
    .filter(
      (signal) =>
        (signal.confidence_below !== undefined &&
          confidence !== undefined &&
          confidence < signal.confidence_below) ||
        (signal.env_risk_min !== undefined &&
          env_risk !== undefined &&
          env_risk >= signal.env_risk_min) ||
        (signal.long_side_below_px !== undefined &&
          Math.max(box.width, box.height) < signal.long_side_below_px) ||
        (signal.top2_margin_below !== undefined &&
          second !== null &&
          confidence !== undefined &&
          confidence - second.score < signal.top2_margin_below),
    )
    .map((signal) => signal.id as string);
}
