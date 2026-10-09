import { POLICY, canonicalLabel, TWO_WHEEL } from '../policy.mjs';
import { staticCheck, skip, flag } from './shared.mjs';

const VEHICLE_NEIGHBORS = {
  car: ['truck', 'bus'],
  truck: ['car', 'bus'],
  bus: ['truck', 'car'],
  motorcycle: ['bicycle'],
  bicycle: ['motorcycle'],
};
const RIDER_NEIGHBORS = {
  person: TWO_WHEEL,
  motorcycle: ['person'],
  bicycle: ['person'],
};
// The second-best class is optional model output carried in attributes; never inferred.
function top2({ current }) {
  const { label_top2: label, score_top2: score } = current.attributes || {};
  if (typeof label !== 'string' || !Number.isFinite(score)) return null;
  return { label, score, margin: current.confidence - score };
}
const versus = (current, second) =>
  `${current.label} ${current.confidence.toFixed(2)} / ${second.label} ${second.score.toFixed(2)}`;
const marginEvidence = (current, second, threshold) => ({
  labels: [current.label, second.label],
  values: [current.confidence, second.score],
  margin: second.margin,
  threshold,
});

// N5: most of these boxes are still right, so the points stay below the queue threshold.
const lowScore = staticCheck({
  id: 'confidence.low_score',
  only: 'draft',
  family: 'weak',
  test: ({ box }) =>
    box.confidence < POLICY.lowScore &&
    flag(20, `Confidence thấp: ${box.confidence.toFixed(2)}`, {
      confidence: box.confidence,
      threshold: POLICY.lowScore,
    }),
});
// N11: the model saw an object but is unsure which; the right name is most likely the runner-up.
const classMargin = staticCheck({
  id: 'confidence.class_margin',
  only: 'draft',
  test(context) {
    const second = top2(context);
    if (!second) return skip('missing_top2');
    return (
      second.margin < POLICY.classMargin &&
      flag(
        30,
        `Model phân vân giữa hai nhãn: ${versus(context.current, second)}`,
        marginEvidence(context.current, second, POLICY.classMargin),
        'CLASS',
        second.label,
      )
    );
  },
});
function confusionCheck(id, neighbors, title) {
  return staticCheck({
    id,
    labels: Object.keys(neighbors),
    only: 'draft',
    test(context) {
      const second = top2(context);
      if (!second) return skip('missing_top2');
      return (
        neighbors[context.box.label].includes(canonicalLabel(second.label)) &&
        second.margin < POLICY.confusionMargin &&
        flag(
          20,
          `${title}: ${versus(context.current, second)}`,
          marginEvidence(context.current, second, POLICY.confusionMargin),
          'CLASS',
          second.label,
        )
      );
    },
  });
}
export const confidenceChecks = [
  lowScore,
  classMargin,
  confusionCheck(
    'confidence.vehicle_confusion',
    VEHICLE_NEIGHBORS,
    'Phân vân với nhãn xe gần giống',
  ),
  confusionCheck(
    'confidence.person_vs_two_wheeler',
    RIDER_NEIGHBORS,
    'Phân vân giữa người và xe hai bánh',
  ),
];
