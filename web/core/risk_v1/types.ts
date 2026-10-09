import type { Annotation, Frame, Media } from '../schema/types.ts';
import type { CheckResult } from '../risk/types.ts';

export interface LabelSizeStat {
  n: number;
  median: number;
  mad: number;
}
export interface LegacyContext {
  current: Annotation;
  previous?: Annotation;
  next?: Annotation;
  frames: Map<string, Frame>;
  media: Media;
  siblings?: Annotation[];
  // Only computed for profiles that include the single-image checks.
  stats?: Map<string, LabelSizeStat>;
}
// What a check may rely on once temporalReady() has returned null.
export type LegacyTemporalContext = LegacyContext & { previous: Annotation; next: Annotation };
export interface LegacyCheck {
  id: string;
  version: string;
  run(context: LegacyContext): CheckResult;
}
