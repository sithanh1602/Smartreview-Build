import type { Annotation, BBoxAnnotation } from '../../schema/types.ts';
import type { Evidence, Flagged, Passed, Skipped } from '../../risk/types.ts';
import type { LegacyContext } from '../types.ts';

export const skip = (reason: string): Skipped => ({ status: 'skipped', reason });
export const pass = (): Passed => ({ status: 'passed' });
export const flag = (score: number, reason: string, evidence: Evidence): Flagged => ({
  status: 'flagged',
  score,
  reason,
  evidence,
});
export const positiveBox = (a: Annotation): a is BBoxAnnotation =>
  a.geometry.type === 'bbox' && a.geometry.width > 0 && a.geometry.height > 0;
export function temporalReady({ previous, current, next, frames }: LegacyContext) {
  if (current.track_id === undefined) return 'missing_track_id';
  if (!previous || !next) return 'missing_neighbors';
  if (
    frames.get(current.frame_id)!.index - frames.get(previous.frame_id)!.index > 3 ||
    frames.get(next.frame_id)!.index - frames.get(current.frame_id)!.index > 3
  )
    return 'frame_gap_exceeds_3';
  return null;
}
