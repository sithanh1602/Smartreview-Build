import { temporalReady, skip, pass, flag } from './shared.mjs';

// The queue keeps cases scoring >= 30 (engine.mjs minScore), so a confidence
// signal worth less than that can never surface a case on its own - it only
// ever adds to a case some other check already found. Both checks below are
// therefore floored at 30 and scale with how bad the signal is.
export const LOW_CONFIDENCE = 0.5;
export const LOW_SCORE_RANGE = [30, 70];
export const DROP_THRESHOLD = 0.2;
export const DROP_SCORE_RANGE = [30, 80];

const scale = ([floor, ceiling], ratio) =>
  Math.round(floor + (ceiling - floor) * Math.min(1, Math.max(0, ratio)));

// "confidence thap" - the absolute half of the requirement. Needs no track_id and
// no neighbours, so unlike neighbour_drop it also covers plain image datasets
// (BDD100K detection, COCO, CVAT images) where every temporal check skips.
export const lowConfidence = {
  id: 'confidence.low',
  version: '1.0.0',
  run({ current }) {
    if (!Number.isFinite(current.confidence)) return skip('missing_confidence');
    if (current.confidence >= LOW_CONFIDENCE) return pass();
    return flag(
      scale(LOW_SCORE_RANGE, (LOW_CONFIDENCE - current.confidence) / LOW_CONFIDENCE),
      `Model không chắc chắn: confidence ${current.confidence.toFixed(2)} < ${LOW_CONFIDENCE}`,
      { confidence: current.confidence, threshold: LOW_CONFIDENCE },
    );
  },
};

// "confidence bat thuong" - relative to the same track's neighbours. Shared by
// every profile; the score differs, so v1 stays frozen for engine 2.0.0/2.1.0
// and v2 (scaled, floored at 30) is used from 2.2.0 on.
function neighborDrop(context) {
  const unavailable = temporalReady(context);
  if (unavailable) return skip(unavailable);
  const { previous: p, current: c, next: n } = context;
  if (![p, c, n].every((a) => Number.isFinite(a.confidence))) return skip('missing_confidence');
  const mean = (p.confidence + n.confidence) / 2;
  const drop = mean - c.confidence;
  if (drop < DROP_THRESHOLD) return pass();
  return {
    drop,
    mean,
    evidence: {
      values: [p.confidence, c.confidence, n.confidence],
      neighbor_mean: mean,
      drop,
      threshold: DROP_THRESHOLD,
    },
  };
}

const dropReason = (mean, current) =>
  `Confidence thấp hơn frame xung quanh: ${mean.toFixed(2)} → ${current.toFixed(2)}`;

export default {
  id: 'confidence.neighbor_drop',
  version: '1.0.0',
  run(context) {
    const result = neighborDrop(context);
    if (!('drop' in result)) return result;
    return flag(20, dropReason(result.mean, context.current.confidence), result.evidence);
  },
};

export const neighborDropScaled = {
  id: 'confidence.neighbor_drop',
  version: '2.0.0',
  run(context) {
    const result = neighborDrop(context);
    if (!('drop' in result)) return result;
    return flag(
      scale(DROP_SCORE_RANGE, (result.drop - DROP_THRESHOLD) / (1 - DROP_THRESHOLD)),
      dropReason(result.mean, context.current.confidence),
      result.evidence,
    );
  },
};
