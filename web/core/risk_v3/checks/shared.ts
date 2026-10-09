import { POLICY } from '../policy.ts';
import { iou } from '../../risk/ai-compare.ts';
import type { Annotation, Frame } from '../../schema/types.ts';
import type {
  Box,
  Check,
  CheckContext,
  CheckResult,
  DraftBox,
  Evidence,
  Flagged,
  LabelBox,
  ManualBox,
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
export function temporalReady({
  previous,
  current,
  next,
  frames,
}: {
  previous?: Annotation;
  current: Annotation;
  next?: Annotation;
  frames: Map<string, Frame>;
}) {
  if (current.track_id === undefined) return 'missing_track_id';
  if (!previous || !next) return 'missing_neighbors';
  if (
    frames.get(current.frame_id)!.index - frames.get(previous.frame_id)!.index > 3 ||
    frames.get(next.frame_id)!.index - frames.get(current.frame_id)!.index > 3
  )
    return 'frame_gap_exceeds_3';
  return null;
}
// A lies inside B when nearly all of A's area belongs to B.
export function inside(a: MeasuredBox, b: MeasuredBox) {
  const overlap =
    Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) *
    Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return overlap / (a.width * a.height) >= POLICY.containment;
}
// Of a pair drawn for one object the points go to the weaker box: lower score, then drawn later.
// A box without score is human work and outranks any model box.
export function weaker(box: MeasuredBox, peer: MeasuredBox) {
  const a = box.confidence ?? Infinity,
    b = peer.confidence ?? Infinity;
  return a < b || (a === b && box.index > peer.index);
}
const UNAVAILABLE: Partial<Record<Box['state'], string>> = {
  unsupported: 'unsupported_geometry',
  invalid: 'invalid_bbox',
  ignored: 'below_minimum',
  grey: 'grey_zone',
};
type Only = 'draft' | 'manual' | undefined;
// A draft is a model box at or above the working score, so its annotation carries a confidence.
export type StaticContext<B extends LabelBox = LabelBox> = Omit<CheckContext, 'box' | 'current'> & {
  box: B;
  current: B extends DraftBox ? Annotation & { confidence: number } : Annotation;
};
type BoxFor<O extends Only> = O extends 'draft'
  ? DraftBox
  : O extends 'manual'
    ? ManualBox
    : LabelBox;
type Falsy = false | 0 | '' | null | undefined;
// Static rules judge labels only: boxes that are valid, large enough and not grey-zone.
// `only` narrows a rule to model drafts or to human-drawn boxes.
export function staticCheck<O extends Only = undefined>({
  id,
  labels,
  only,
  relational = false,
  test,
}: {
  id: string;
  labels?: readonly string[];
  only?: O;
  relational?: boolean;
  test(context: StaticContext<BoxFor<O>>): CheckResult | Falsy;
}): Check {
  return {
    id,
    version: '1.0.0',
    relational,
    run(context) {
      const { box } = context;
      const unavailable = UNAVAILABLE[box.state];
      if (unavailable) return skip(unavailable);
      if (labels && !labels.includes(box.label)) return skip('unsupported_label');
      if (only === 'draft' && box.state !== 'draft') return skip('missing_confidence');
      if (only === 'manual' && box.state !== 'manual') return skip('not_manual');
      // The guards above are what the narrower context type promises.
      return test(context as unknown as StaticContext<BoxFor<O>>) || pass();
    },
  };
}
