import { temporalReady, skip, pass, flag } from './shared.ts';
import type { CheckResult, Evidence } from '../../risk/types.ts';
import type { LegacyCheck, LegacyContext, LegacyTemporalContext } from '../types.ts';

// The queue keeps cases scoring >= 30 (engine.ts minScore), so a confidence
// signal worth less than that can never surface a case on its own - it only
// ever adds to a case some other check already found. Both checks below are
// therefore floored at 30 and scale with how bad the signal is.
export const LOW_CONFIDENCE = 0.5;
export const LOW_SCORE_RANGE: [number, number] = [30, 70];
export const DROP_THRESHOLD = 0.2;
export const DROP_SCORE_RANGE: [number, number] = [30, 80];

const scale = ([floor, ceiling]: [number, number], ratio: number) =>
  Math.round(floor + (ceiling - floor) * Math.min(1, Math.max(0, ratio)));

// "confidence thap" - the absolute half of the requirement. Needs no track_id and
// no neighbours, so unlike neighbour_drop it also covers plain image datasets
// (BDD100K detection, COCO, CVAT images) where every temporal check skips.
export const lowConfidence: LegacyCheck = {
  id: 'confidence.low',
  version: '1.0.0',
  run({ current }) {
    const value = current.confidence;
    if (!Number.isFinite(value)) return skip('missing_confidence');
    const confidence = value as number;
    if (confidence >= LOW_CONFIDENCE) return pass();
    return flag(
      scale(LOW_SCORE_RANGE, (LOW_CONFIDENCE - confidence) / LOW_CONFIDENCE),
      `Model không chắc chắn: confidence ${confidence.toFixed(2)} < ${LOW_CONFIDENCE}`,
      { confidence, threshold: LOW_CONFIDENCE },
    );
  },
};

interface Drop {
  drop: number;
  mean: number;
  value: number;
  evidence: Evidence;
}

// "confidence bat thuong" - relative to the same track's neighbours. Shared by
// every profile; the score differs, so v1 stays frozen for engine 2.0.0/2.1.0
// and v2 (scaled, floored at 30) is used from 2.2.0 on.
function neighborDrop(context: LegacyContext): CheckResult | Drop {
  const unavailable = temporalReady(context);
  if (unavailable) return skip(unavailable);
  const { previous, current, next } = context as LegacyTemporalContext;
  const [p, c, n] = [previous.confidence, current.confidence, next.confidence];
  if (!Number.isFinite(p) || !Number.isFinite(c) || !Number.isFinite(n))
    return skip('missing_confidence');
  const [before, value, after] = [p, c, n] as number[];
  const mean = (before + after) / 2,
    drop = mean - value;
  if (drop < DROP_THRESHOLD) return pass();
  return {
    drop,
    mean,
    value,
    evidence: {
      values: [before, value, after],
      neighbor_mean: mean,
      drop,
      threshold: DROP_THRESHOLD,
    },
  };
}

const dropReason = (mean: number, value: number) =>
  `Confidence thấp hơn frame xung quanh: ${mean.toFixed(2)} → ${value.toFixed(2)}`;

const check: LegacyCheck = {
  id: 'confidence.neighbor_drop',
  version: '1.0.0',
  run(context) {
    const result = neighborDrop(context);
    if (!('drop' in result)) return result;
    return flag(20, dropReason(result.mean, result.value), result.evidence);
  },
};
export default check;

export const neighborDropScaled: LegacyCheck = {
  id: 'confidence.neighbor_drop',
  version: '2.0.0',
  run(context) {
    const result = neighborDrop(context);
    if (!('drop' in result)) return result;
    return flag(
      scale(DROP_SCORE_RANGE, (result.drop - DROP_THRESHOLD) / (1 - DROP_THRESHOLD)),
      dropReason(result.mean, result.value),
      result.evidence,
    );
  },
};
