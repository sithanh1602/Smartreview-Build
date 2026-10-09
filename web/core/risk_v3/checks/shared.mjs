import { POLICY } from '../policy.mjs';
import { iou } from '../../risk/ai-compare.mjs';

export { iou };
export const skip = (reason) => ({ status: 'skipped', reason });
export const pass = () => ({ status: 'passed' });
export const flag = (score, reason, evidence, error_type = null, suggested_label = null) => ({
  status: 'flagged',
  score,
  reason,
  evidence,
  ...(error_type && { error_type }),
  ...(suggested_label && { suggested_label }),
});
export function temporalReady({ previous, current, next, frames }) {
  if (current.track_id === undefined) return 'missing_track_id';
  if (!previous || !next) return 'missing_neighbors';
  if (
    frames.get(current.frame_id).index - frames.get(previous.frame_id).index > 3 ||
    frames.get(next.frame_id).index - frames.get(current.frame_id).index > 3
  )
    return 'frame_gap_exceeds_3';
  return null;
}
// A lies inside B when nearly all of A's area belongs to B.
export function inside(a, b) {
  const overlap =
    Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) *
    Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return overlap / (a.width * a.height) >= POLICY.containment;
}
// Of a pair drawn for one object the points go to the weaker box: lower score, then drawn later.
// A box without score is human work and outranks any model box.
export function weaker(box, peer) {
  const a = box.confidence ?? Infinity,
    b = peer.confidence ?? Infinity;
  return a < b || (a === b && box.index > peer.index);
}
const UNAVAILABLE = {
  unsupported: 'unsupported_geometry',
  invalid: 'invalid_bbox',
  ignored: 'below_minimum',
  grey: 'grey_zone',
};
// Static rules judge labels only: boxes that are valid, large enough and not grey-zone.
// `only` narrows a rule to model drafts or to human-drawn boxes.
export function staticCheck({ id, labels, only, relational = false, test }) {
  return {
    id,
    version: '1.0.0',
    relational,
    run(context) {
      const { box } = context;
      if (UNAVAILABLE[box.state]) return skip(UNAVAILABLE[box.state]);
      if (labels && !labels.includes(box.label)) return skip('unsupported_label');
      if (only === 'draft' && box.state !== 'draft') return skip('missing_confidence');
      if (only === 'manual' && box.state !== 'manual') return skip('not_manual');
      return test(context) || pass();
    },
  };
}
