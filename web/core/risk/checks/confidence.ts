import { POLICY, canonicalLabel, TWO_WHEEL } from '../policy.ts';
import { staticCheck, skip, flag } from './shared.ts';
import type { StaticContext } from './shared.ts';
import type { Annotation } from '../../schema/types.ts';
import type { Check, DraftBox } from '../types.ts';

type Scored = Annotation & { confidence: number };
type Top2 = { label: string; score: number; margin: number };

const VEHICLE_NEIGHBORS: Record<string, string[]> = {
  car: ['truck', 'bus'],
  truck: ['car', 'bus'],
  bus: ['truck', 'car'],
  motorcycle: ['bicycle'],
  bicycle: ['motorcycle'],
};
const RIDER_NEIGHBORS: Record<string, string[]> = {
  person: TWO_WHEEL,
  motorcycle: ['person'],
  bicycle: ['person'],
};
// The second-best class is optional model output carried in attributes; never inferred.
function top2({ current }: StaticContext<DraftBox>): Top2 | null {
  const { label_top2: label, score_top2: score } = current.attributes || {};
  if (typeof label !== 'string' || typeof score !== 'number' || !Number.isFinite(score))
    return null;
  return { label, score, margin: current.confidence - score };
}
const versus = (current: Scored, second: Top2) =>
  `${current.label} ${current.confidence.toFixed(2)} / ${second.label} ${second.score.toFixed(2)}`;
const marginEvidence = (current: Scored, second: Top2, threshold: number) => ({
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
function confusionCheck(id: string, neighbors: Record<string, string[]>, title: string) {
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
export const confidenceChecks: Check[] = [
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
