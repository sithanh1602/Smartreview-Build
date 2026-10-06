export const skip = (reason) => ({ status: 'skipped', reason });
export const pass = () => ({ status: 'passed' });
export const flag = (score, reason, evidence) => ({ status: 'flagged', score, reason, evidence });
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
