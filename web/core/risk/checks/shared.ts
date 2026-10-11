import { iou } from '../ai-compare.ts';
import type { Annotation, Frame } from '../../schema/types.ts';
import type {
  Box,
  CheckContext,
  DraftBox,
  Evidence,
  Flagged,
  LabelBox,
  MeasuredBox,
  Passed,
  Skipped,
} from '../types.ts';

export { iou };
export const skip = (reason: string): Skipped => ({ status: 'skipped', reason });
export const pass = (): Passed => ({ status: 'passed' });
export const flag = (
  score: number,
  reason: string,
  evidence: Evidence,
  error_type: string | null = null,
  suggested_label: string | null = null,
): Flagged => ({
  status: 'flagged',
  score,
  reason,
  evidence,
  ...(error_type && { error_type }),
  ...(suggested_label && { suggested_label }),
});
export const isLabel = (box: Box): box is LabelBox =>
  box.state === 'draft' || box.state === 'manual';
export function temporalReady(
  {
    previous,
    current,
    next,
    frames,
  }: {
    previous?: Annotation;
    current: Annotation;
    next?: Annotation;
    frames: Map<string, Frame>;
  },
  maxGap: number,
) {
  if (current.track_id === undefined) return 'missing_track_id';
  if (!previous || !next) return 'missing_neighbors';
  if (
    frames.get(current.frame_id)!.index - frames.get(previous.frame_id)!.index > maxGap ||
    frames.get(next.frame_id)!.index - frames.get(current.frame_id)!.index > maxGap
  )
    return `frame_gap_exceeds_${maxGap}`;
  return null;
}
// A lies inside B when nearly all of A's area (the `containment` share) belongs to B.
export function inside(a: MeasuredBox, b: MeasuredBox, containment: number) {
  const overlap =
    Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) *
    Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return overlap / (a.width * a.height) >= containment;
}
// Two near-identical boxes contain each other; that is a duplicate, not a part inside a whole.
// (Two boxes that also overlap like duplicates are left to the overlap rules.)
export const container = (
  box: LabelBox,
  peers: LabelBox[],
  labels: string[],
  containment: number,
  duplicateIou = Infinity,
) =>
  peers.find(
    (p) =>
      labels.includes(p.label) &&
      inside(box, p, containment) &&
      !inside(p, box, containment) &&
      iou(box.geometry, p.geometry) < duplicateIou,
  );
// Of a pair drawn for one object the points go to the weaker box: lower score, then drawn later.
// A box without score is human work and outranks any model box.
export function weaker(box: MeasuredBox, peer: MeasuredBox) {
  const a = box.confidence ?? Infinity,
    b = peer.confidence ?? Infinity;
  return a < b || (a === b && box.index > peer.index);
}
// Rules of scope "box" judge labels only: boxes that are valid, large enough and not grey-zone.
export const UNAVAILABLE: Partial<Record<Box['state'], string>> = {
  unsupported: 'unsupported_geometry',
  invalid: 'invalid_bbox',
  ignored: 'below_minimum',
  grey: 'grey_zone',
};
// A draft is a model box at or above the working score, so its annotation carries a confidence.
export type StaticContext<B extends LabelBox = LabelBox> = Omit<CheckContext, 'box' | 'current'> & {
  box: B;
  current: B extends DraftBox ? Annotation & { confidence: number } : Annotation;
};
