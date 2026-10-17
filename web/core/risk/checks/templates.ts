import { canonicalLabel } from '../policy.ts';
import { BUILTINS } from './builtin.ts';
import { skip, flag, iou, inside, container, weaker, temporalReady } from './shared.ts';
import type { StaticContext } from './shared.ts';
import { top2, visibilityOf, weakSignals } from '../visibility.ts';
import type { Visibility } from '../visibility.ts';
import type { ActiveRule, Policy } from '../rules.ts';
import type { BBoxAnnotation, Annotation } from '../../schema/types.ts';
import type {
  Box,
  CheckContext,
  CheckResult,
  DraftBox,
  Evidence,
  LabelBox,
  MeasuredBox,
  TemporalContext,
} from '../types.ts';

// One template per kind of rule in docs/policy-format.md. A template reads every number from the
// rule's params and its score and error type from the rule; nothing about a label lives here.
type Falsy = false | 0 | '' | null | undefined;
export interface Template {
  // box: judges labels only (valid, large enough, not grey-zone). raw: every bbox, since a box
  // the label rules ignore can still be broken. track: every observation, grey-zone included,
  // because the evidence is the track rather than the single box.
  scope: 'box' | 'raw' | 'track';
  // Needs a confidence, so the rule must be written with applies_to "model".
  modelOnly?(rule: ActiveRule): boolean;
  // Looks at other boxes, so it runs after boxes suspected of being no object are known.
  relational?(rule: ActiveRule): boolean;
  // What an active rule asks for that this template cannot do, if anything.
  unsupported?(rule: ActiveRule): string | Falsy;
  test(rule: ActiveRule, context: any, policy: Policy): CheckResult | Falsy;
}

// What a reviewer reads, per check. A rule whose check has no wording here shows its own text.
type Details = Record<string, any>;
const versus = ({ current, second }: Details) =>
  `${current.label} ${current.confidence.toFixed(2)} / ${second.label} ${second.score.toFixed(2)}`;
const REASONS: Record<string, (details: Details) => string> = {
  'temporal.class_inconsistency': ({ p, c, n }) =>
    `Temporal class anomaly: ${p.label} → ${c.label} → ${n.label}`,
  'confidence.neighbor_drop': ({ mean, value }) =>
    `Confidence thấp hơn frame xung quanh: ${mean.toFixed(2)} → ${value.toFixed(2)}`,
  'geometry.bbox_area': ({ ratio }) => `BBox area bất thường: ${(ratio * 100).toFixed(1)}%`,
  'geometry.bbox_position': ({ ratio }) =>
    `BBox position bất thường: ${ratio.toFixed(2)}x bbox diagonal`,
  'confidence.low_score': ({ box }) => `Confidence thấp: ${box.confidence.toFixed(2)}`,
  'confidence.rescore_low': ({ value }) =>
    `Model chấm lại box này rất thấp cho nhãn của nó: ${value.toFixed(3)}`,
  'confidence.class_margin': (d) => `Model phân vân giữa hai nhãn: ${versus(d)}`,
  'confidence.vehicle_confusion': (d) => `Phân vân với nhãn xe gần giống: ${versus(d)}`,
  'confidence.person_vs_two_wheeler': (d) => `Phân vân giữa người và xe hai bánh: ${versus(d)}`,
  'geometry.bbox_validity': ({ require }) =>
    require === 'positive_size'
      ? 'BBox có chiều rộng hoặc chiều cao không dương.'
      : 'BBox nằm ngoài giới hạn ảnh.',
  'geometry.cross_class_overlap': ({ peer }) =>
    `Gần trùng với box “${peer.label}” (${peer.confidence.toFixed(2)}).`,
  'geometry.edge_truncated': () => 'Vật bị khung hình cắt quá nửa và confidence thấp.',
  'geometry.manual_overlap': () => 'Hai box vẽ tay cùng nhãn chồng nhau quá nửa.',
  'context.vehicle_in_large_vehicle': ({ peer }) => `Box nằm trọn trong một box “${peer.label}”.`,
  'geometry.vehicle_aspect': () => 'Box xe đứng hoặc dẹt bất thường.',
  'geometry.two_wheeler_aspect': () => 'Box xe hai bánh quá cao.',
  'context.person_two_wheeler': ({ peer }) => `Box người gần trùng với box “${peer.label}”.`,
  'geometry.person_aspect': () => 'Box người rộng hơn cao.',
  'context.light_in_vehicle': ({ peer }) =>
    `“Đèn tín hiệu” nằm trọn trong một box “${peer.label}”.`,
  'geometry.light_position': () => '“Đèn tín hiệu” ở sát mặt đường.',
  'geometry.light_below_vehicles': ({ below, objects }) =>
    `“Đèn tín hiệu” nằm thấp hơn nóc của ${below.length}/${objects.length} xe trong ảnh.`,
  'geometry.light_aspect': () => 'Hình dạng không giống hộp đèn.',
  'geometry.light_overlap': () => 'Hai box cho một hộp đèn.',
  'context.sign_in_vehicle': ({ peer }) => `“Biển báo” nằm trọn trong một box “${peer.label}”.`,
  'geometry.stop_sign_aspect': () => 'Hình dạng không giống biển stop.',
  'geometry.sign_position': () => '“Biển báo” ở sát mặt đường.',
  'geometry.sign_overlap': () => 'Hai box cho một biển.',
  'geometry.barrier_aspect': () => 'Box rào chắn cao hơn rộng.',
  'geometry.pole_aspect': () => 'Box cột không mảnh.',
  'context.pole_covers_objects': ({ covered }) =>
    `Box cột chứa ${covered.length} box đèn hoặc biển.`,
  'visibility.mostly_hidden': ({ seen, signals, threshold }) =>
    `Chỉ còn thấy ${percent(seen.value)} vật (${seenFrom(seen)}), dưới ngưỡng ${percent(threshold)}; kèm ${signals.length} dấu hiệu khó xác nhận: ${signals.map((id: string) => SIGNALS[id] ?? id).join(', ')}.`,
  'visibility.barely_visible': ({ seen, threshold }) =>
    `Chỉ còn thấy ${percent(seen.value)} vật (${seenFrom(seen)}), dưới ngưỡng ${percent(threshold)}: quá ít để xác nhận có vật thật.`,
  'attribute.required': ({ missing, invalid }) =>
    [
      missing.length && `Thiếu attribute ${missing.join(', ')}.`,
      invalid.length && `Giá trị không hợp lệ ở attribute ${invalid.join(', ')}.`,
    ]
      .filter(Boolean)
      .join(' '),
  'attribute.truncated_edge': ({ touches, attribute }) =>
    touches
      ? `Box chạm mép ảnh nhưng ${attribute} không phải true.`
      : `Box không chạm mép ảnh nhưng ${attribute} là true.`,
  'geometry.duplicate_draft': ({ peer }) =>
    `Trùng với một box “${peer.label}” khác (${peer.confidence.toFixed(2)}).`,
  'geometry.stronger_duplicate': ({ peer }) =>
    `Gần trùng với box “${peer.label}” yếu hơn (${peer.confidence.toFixed(2)}): tên nhãn còn đáng ngờ.`,
  'pair.same_place': ({ peer }) =>
    `Gần trùng chỗ với box “${peer.label}” (${peer.confidence.toFixed(2)}).`,
  'pair.second_opinion_margin': ({ opinion }) =>
    `Mô hình nghiêng về “${opinion.label}” (${opinion.score.toFixed(2)}).`,
  'pair.unsupported_name': ({ box }) =>
    `Tên nhãn chưa đủ căn cứ: confidence ${box.confidence.toFixed(2)}, không có ý kiến thứ hai.`,
  'pair.relative_size': ({ ratio, neighbours, rival }) =>
    `Chỉ cao gấp ${ratio.toFixed(2)} lần ${neighbours.length} box “${rival}” đứng cùng tầm xa.`,
};
// A share that rounds to 0% but is not zero would read as "nothing visible".
const percent = (share: number) =>
  share > 0 && share < 0.005 ? 'dưới 1%' : `${Math.round(share * 100)}%`;
const seenFrom = (seen: Visibility) =>
  seen.source === 'measured'
    ? 'theo thuộc tính che / cắt của dataset'
    : `ước tính từ box: còn ${percent(seen.in_frame!)} trong khung hình, ${percent(seen.covered!)} bị box gần camera hơn che`;
const SIGNALS: Record<string, string> = {
  low_confidence: 'mô hình kém tự tin',
  poor_image: 'ảnh tối, mưa hoặc mờ',
  small: 'box nhỏ',
  second_label_close: 'phân vân với nhãn thứ hai',
};
// `tier` replaces the rule's score and level where a rule scores by steps (score_by_margin).
const hit = (
  rule: ActiveRule,
  details: Details,
  evidence: Evidence,
  error = rule.error_type,
  suggested: string | null = rule.suggests ?? null,
  tier: { score?: number; level?: string } = {},
): CheckResult => ({
  ...flag(
    tier.score ?? rule.score!,
    REASONS[rule.check]?.(details) ?? rule.text,
    evidence,
    error,
    suggested,
  ),
  ...((tier.level ?? rule.level) === 'warning' && { level: 'warning' }),
});
const oneOf = (name: string, value: unknown, allowed: unknown[]) =>
  !allowed.includes(value) && `${name} "${value}" is not supported`;
const area = (box: MeasuredBox) => box.width * box.height;

const scored = (
  box: Box,
): box is DraftBox | (MeasuredBox & { state: 'grey'; confidence: number }) =>
  box.state === 'draft' || box.state === 'grey';
// A second opinion on the name of one object: the model's runner-up class, or failing that a
// box of the pair's other label drawn on the same place, grey-zone boxes included.
export function secondOpinion(
  rule: ActiveRule,
  { current, box, frameBoxes }: StaticContext<DraftBox>,
) {
  const own = top2(current);
  if (own) return { label: canonicalLabel(own.label), score: own.score };
  if (!rule.opinion) return null;
  const { min_overlap, min_rival_confidence } = rule.opinion;
  const rival = frameBoxes
    .filter(scored)
    .filter(
      (b) =>
        b.id !== box.id &&
        b.label === rule.rival &&
        b.confidence >= min_rival_confidence &&
        iou(box.geometry, b.geometry) >= min_overlap,
    )
    .sort((a, b) => b.confidence - a.confidence)[0];
  return rival ? { label: rival.label, score: rival.confidence, id: rival.id } : null;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const touchesEdge = (box: MeasuredBox, media: { width: number; height: number }, edge: number) =>
  box.x1 <= edge || box.y1 <= edge || box.x2 >= media.width - edge || box.y2 >= media.height - edge;
// The peers a two-box rule may point at: a rule about model drafts compares drafts with drafts,
// a rule about hand-drawn boxes compares those, any other rule takes every label box.
const comparable = (rule: ActiveRule, peers: LabelBox[]) =>
  rule.applies_to === 'model'
    ? peers.filter((p) => p.state === 'draft')
    : rule.applies_to === 'human'
      ? peers.filter((p) => p.state === 'manual')
      : peers;

const positiveBox = (a: Annotation) =>
  a.geometry.type === 'bbox' && a.geometry.width > 0 && a.geometry.height > 0;
// The three observations of a track once bboxReady() has returned null.
const triple = (context: CheckContext) =>
  [context.previous, context.current, context.next] as BBoxAnnotation[];
function bboxReady(context: CheckContext, maxGap: number) {
  const unavailable = temporalReady(context, maxGap);
  if (unavailable) return unavailable;
  if (!triple(context).every(positiveBox)) return 'missing_valid_bbox';
  return null;
}
// How far one observation of a track sits from what its two neighbours predict.
const TRACK_QUANTITIES: Record<
  string,
  (rule: ActiveRule, context: CheckContext) => CheckResult | Falsy
> = {
  confidence(rule, context) {
    const unavailable = temporalReady(context, rule.params.max_frame_gap);
    if (unavailable) return skip(unavailable);
    const { previous, current, next } = context as TemporalContext;
    const [p, c, n] = [previous.confidence, current.confidence, next.confidence];
    if (!Number.isFinite(p) || !Number.isFinite(c) || !Number.isFinite(n))
      return skip('missing_confidence');
    const [before, value, after] = [p, c, n] as number[];
    const mean = (before + after) / 2,
      drop = mean - value,
      threshold = rule.params.max_change;
    return (
      drop >= threshold &&
      hit(
        rule,
        { mean, value },
        { values: [before, value, after], neighbor_mean: mean, drop, threshold },
      )
    );
  },
  area(rule, context) {
    const unavailable = bboxReady(context, rule.params.max_frame_gap);
    if (unavailable) return skip(unavailable);
    const [p, c, n] = triple(context).map((a) => a.geometry.width * a.geometry.height);
    const mean = (p + n) / 2,
      ratio = Math.abs(c - mean) / mean,
      threshold = rule.params.max_change;
    return ratio >= threshold && hit(rule, { ratio }, { areas: [p, c, n], ratio, threshold });
  },
  position(rule, context) {
    const unavailable = bboxReady(context, rule.params.max_frame_gap);
    if (unavailable) return skip(unavailable);
    const boxes = triple(context);
    const centers = boxes.map((a) => [
      a.geometry.x + a.geometry.width / 2,
      a.geometry.y + a.geometry.height / 2,
    ]);
    const [p, c, n] = centers;
    const expected = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
    const ratio =
        Math.hypot(c[0] - expected[0], c[1] - expected[1]) /
        Math.hypot(boxes[1].geometry.width, boxes[1].geometry.height),
      threshold = rule.params.max_change;
    return ratio >= threshold && hit(rule, { ratio }, { centers, expected, ratio, threshold });
  },
};
const TRACK_RELATIVE_TO: Record<string, string | undefined> = {
  confidence: undefined,
  area: 'mean_of_neighbours',
  position: 'box_diagonal',
};

export const TEMPLATES: Record<string, Template> = {
  // Track
  constant_in_track: {
    scope: 'track',
    unsupported: ({ params }) =>
      oneOf('field', params.field, ['label']) || oneOf('mode', params.mode, ['blip']),
    test(rule, context: CheckContext) {
      const unavailable = temporalReady(context, rule.params.max_frame_gap);
      if (unavailable) return skip(unavailable);
      const { previous: p, current: c, next: n } = context as TemporalContext;
      return (
        p.label === n.label &&
        c.label !== p.label &&
        hit(
          rule,
          { p, c, n },
          { labels: [p.label, c.label, n.label], annotation_ids: [p.id, c.id, n.id] },
          rule.error_type,
          p.label,
        )
      );
    },
  },
  smooth_in_track: {
    scope: 'track',
    unsupported: ({ params }) =>
      oneOf('quantity', params.quantity, Object.keys(TRACK_QUANTITIES)) ||
      oneOf('relative_to', params.relative_to, [TRACK_RELATIVE_TO[params.quantity]]) ||
      oneOf('direction', params.direction, [params.quantity === 'confidence' ? 'drop' : undefined]),
    test: (rule, context: CheckContext) => TRACK_QUANTITIES[rule.params.quantity](rule, context),
  },

  // One box
  valid_box: {
    scope: 'raw',
    unsupported: ({ params }) =>
      oneOf('require', params.require, ['positive_size', 'inside_image']),
    test(rule, { current, media }: CheckContext) {
      const g = current.geometry;
      if (g.type !== 'bbox') return skip('unsupported_geometry');
      const { require, tolerance_px: slack = 0 } = rule.params;
      const broken =
        require === 'positive_size'
          ? g.width <= 0 || g.height <= 0
          : g.x < -slack ||
            g.y < -slack ||
            g.x + g.width > media.width + slack ||
            g.y + g.height > media.height + slack;
      return (
        broken &&
        hit(rule, { require }, { bbox: g, image_width: media.width, image_height: media.height })
      );
    },
  },
  low_confidence: {
    scope: 'box',
    modelOnly: () => true,
    // `only_without_second_opinion` (pair files): nothing else speaks for the name either.
    test: (rule, context: StaticContext<DraftBox>) =>
      context.box.confidence < rule.params.below &&
      !(rule.params.only_without_second_opinion && secondOpinion(rule, context)) &&
      hit(
        rule,
        { box: context.box },
        { confidence: context.box.confidence, threshold: rule.params.below },
      ),
  },
  // A model's score for a box a person drew (attributes.rescore, ai-service/score_boxes.py): how
  // sure it is that an object of the box's label sits there. A right box often scores 0.1 to
  // 0.3 on this scale, so its threshold sits far below a draft's low_confidence. The model can
  // hardly judge a box whose short side is under `warning_side_below_px`: there it only warns.
  rescore_low: {
    scope: 'box',
    test(rule, { current, box, rescore_floor }: StaticContext) {
      const value = current.attributes?.rescore;
      if (typeof value !== 'number') return skip('missing_rescore');
      // A model measured on its own rescore scale brings its floor along; the rest reuse the
      // policy number the YOLO11s measure set.
      const below = rescore_floor ?? rule.params.below;
      const { warning_side_below_px: tiny = 0 } = rule.params;
      return (
        value < below &&
        hit(
          rule,
          { value },
          { rescore: value, threshold: below },
          rule.error_type,
          rule.suggests ?? null,
          Math.min(box.width, box.height) < tiny ? { level: 'warning' } : {},
        )
      );
    },
  },
  // The model saw an object but is unsure which; the right name is most likely the runner-up.
  // With `confusable_with` only a runner-up from that list counts. A pair file asks about one
  // rival instead: `second_opinion` names it, and `margin_below` may be negative (the rival has
  // to lead by that much).
  class_margin: {
    scope: 'box',
    modelOnly: () => true,
    test(rule, context: StaticContext<DraftBox>) {
      const { current, box } = context,
        { margin, confusable_with: rivals, second_opinion: rival, margin_below } = rule.params;
      if (rival) {
        const opinion = secondOpinion(rule, context);
        if (!opinion) return skip('missing_second_opinion');
        const lead = box.confidence - opinion.score;
        return (
          opinion.label === rival &&
          lead < margin_below &&
          hit(
            rule,
            { opinion },
            {
              labels: [box.label, opinion.label],
              values: [box.confidence, opinion.score],
              margin: lead,
              threshold: margin_below,
            },
          )
        );
      }
      const runnerUp = top2(current);
      if (!runnerUp) return skip('missing_top2');
      const second = { ...runnerUp, margin: current.confidence - runnerUp.score };
      return (
        (!rivals || rivals.includes(canonicalLabel(second.label))) &&
        second.margin < margin &&
        hit(
          rule,
          { current, second },
          {
            labels: [current.label, second.label],
            values: [current.confidence, second.score],
            margin: second.margin,
            threshold: margin,
          },
          rule.error_type,
          second.label,
        )
      );
    },
  },
  // Cut by the frame so far that at least about half of the object lies outside the image.
  // Vehicles entering or leaving the frame are normal; only a sliver is hard to name and to box.
  edge_sliver: {
    scope: 'box',
    modelOnly: () => true,
    test(rule, { box, media }: StaticContext<DraftBox>) {
      const p = rule.params;
      const side = box.x1 <= p.edge_px || box.x2 >= media.width - p.edge_px,
        vertical = box.y1 <= p.edge_px || box.y2 >= media.height - p.edge_px;
      return (
        box.confidence < p.max_confidence &&
        ((side && box.ratio > p.side_cut_ratio_over) ||
          (vertical && box.ratio < p.vertical_cut_ratio_under)) &&
        hit(rule, {}, { bbox: box.geometry, confidence: box.confidence, aspect_ratio: box.ratio })
      );
    },
  },
  aspect_ratio: {
    scope: 'box',
    test: (rule, { box }: StaticContext) =>
      (box.ratio < (rule.params.min ?? -Infinity) || box.ratio > (rule.params.max ?? Infinity)) &&
      hit(rule, { box }, { bbox: box.geometry, aspect_ratio: box.ratio }),
  },
  position_band: {
    scope: 'box',
    unsupported: ({ params }) =>
      oneOf('relative_to', params.relative_to, ['image', undefined]) ||
      oneOf('anchor', params.anchor, ['center', 'top', 'bottom']),
    test(rule, { box, media }: StaticContext) {
      const { anchor, min_y: min = -Infinity, max_y: max = Infinity } = rule.params;
      const y = anchor === 'top' ? box.y1 : anchor === 'bottom' ? box.y2 : (box.y1 + box.y2) / 2;
      const low = y < min * media.height;
      return (
        (low || y > max * media.height) &&
        hit(
          rule,
          { box },
          {
            bbox: box.geometry,
            [`${anchor}_ratio`]: y / media.height,
            threshold: low ? min : max,
          },
        )
      );
    },
  },

  // Where a box sits against other objects of the frame rather than against the frame itself:
  // flagged when its anchor lies below the chosen edge of at least `min_share` of them.
  below_objects: {
    scope: 'box',
    relational: () => true,
    unsupported: ({ params }) =>
      oneOf('anchor', params.anchor, ['center', 'top', 'bottom']) ||
      oneOf('their_edge', params.their_edge, ['top', 'bottom']),
    test(rule, { box, peers }: StaticContext) {
      const {
        objects: labels,
        anchor,
        their_edge: edge,
        min_share: share,
        min_objects: atLeast = 1,
      } = rule.params;
      const objects = peers.filter((p) => labels.includes(p.label));
      if (objects.length < atLeast) return skip('too_few_objects');
      const y = anchor === 'top' ? box.y1 : anchor === 'bottom' ? box.y2 : (box.y1 + box.y2) / 2;
      const below = objects.filter((p) => y > (edge === 'top' ? p.y1 : p.y2));
      return (
        below.length >= share * objects.length &&
        hit(
          rule,
          { below, objects },
          {
            bbox: box.geometry,
            below: below.length,
            objects: objects.length,
            threshold: share,
          },
        )
      );
    },
  },

  // Two boxes in one image
  forbidden_inside: {
    scope: 'box',
    relational: () => true,
    test(rule, { box, peers }: StaticContext) {
      const { container: labels, containment, not_duplicate_iou } = rule.params;
      const peer = container(box, peers, labels, containment, not_duplicate_iou);
      return (
        peer && hit(rule, { peer }, { annotation_ids: [box.id, peer.id], container: peer.label })
      );
    },
  },
  // One object drawn twice. `flag` says which of the two boxes takes the points: the weaker or
  // the stronger one, the one drawn later, or (with `between`, in a pair file) the box of one
  // label whatever the scores are.
  forbidden_overlap: {
    scope: 'box',
    relational: () => true,
    modelOnly: ({ params }) => !!params.between,
    unsupported: ({ params, label }) =>
      params.between
        ? oneOf('flag', params.flag, [label])
        : oneOf('flag', params.flag, ['weaker', 'stronger', 'later', label]) ||
          (!Array.isArray(params.with) && oneOf('with', params.with, ['same', 'other_labels'])),
    test(rule, { box, peers, frameBoxes }: StaticContext, policy) {
      const {
        with: others,
        except_with: exempt = [],
        iou: threshold,
        min_area_ratio: similar = 0,
        flag: who,
        class_error_within_margin: tie,
        min_rival_confidence: floor = 0,
        score_by_margin: tiers,
      } = rule.params;
      const overlaps = (p: MeasuredBox) =>
        iou(box.geometry, p.geometry) >= threshold &&
        Math.min(area(box), area(p)) / Math.max(area(box), area(p)) >= similar;
      const evidence = (p: MeasuredBox) => ({
        annotation_ids: [box.id, p.id],
        iou: iou(box.geometry, p.geometry),
        threshold,
      });
      if (rule.params.between) {
        // The rival may be a grey-zone box: a weak second name is still a second name.
        const rival = frameBoxes
          .filter(scored)
          .filter((p) => p.label === rule.rival && p.confidence >= floor && overlaps(p))
          .sort((a, b) => b.confidence - a.confidence)[0];
        if (!rival) return null;
        const lead = box.confidence! - rival.confidence;
        const tier = (tiers as Details[] | undefined)?.find(
          (t) => t.lead_below === undefined || lead < t.lead_below,
        );
        return hit(
          rule,
          { peer: rival },
          { ...evidence(rival), lead },
          rule.error_type,
          rule.suggests ?? rival.label,
          tier,
        );
      }
      const peer = comparable(rule, peers).find(
        (p) =>
          (others === 'same'
            ? p.label === box.label
            : others === 'other_labels'
              ? p.label !== box.label
              : others.includes(p.label)) &&
          !exempt.includes(p.label) &&
          !policy.replaced(rule.check, box.label, p.label) &&
          overlaps(p) &&
          (who === 'weaker'
            ? weaker(box, p)
            : who === 'stronger'
              ? weaker(p, box)
              : who === 'later'
                ? p.index < box.index
                : true),
      );
      if (!peer) return null;
      // Two names for one object at nearly the same score: the name is in doubt, not the object.
      const close =
        tie !== undefined &&
        box.confidence !== undefined &&
        peer.confidence !== undefined &&
        Math.abs(box.confidence - peer.confidence) < tie;
      const error = close ? 'CLASS' : rule.error_type;
      return hit(
        rule,
        { peer },
        evidence(peer),
        error,
        error === 'CLASS' && peer.label !== box.label ? peer.label : null,
      );
    },
  },
  must_not_cover: {
    scope: 'box',
    relational: () => true,
    test(rule, { box, peers }: StaticContext) {
      const { objects, containment, min_objects: atLeast = 1 } = rule.params;
      const covered = peers.filter((p) => objects.includes(p.label) && inside(p, box, containment));
      return (
        covered.length >= atLeast &&
        hit(rule, { covered }, { annotation_ids: [box.id, ...covered.map((p) => p.id)] })
      );
    },
  },

  // A box of this label should stand clearly taller than boxes of another label at the same
  // distance (same bottom line); with too few such neighbours there is nothing to compare.
  relative_size: {
    scope: 'box',
    relational: () => true,
    test(rule, { box, peers, media }: StaticContext) {
      const {
        compare_to: rival,
        same_depth_within_bottom_fraction: band,
        min_neighbours: atLeast = 1,
        height_ratio_below: threshold,
      } = rule.params;
      const neighbours = peers.filter(
        (p) => p.label === rival && Math.abs(p.y2 - box.y2) <= band * media.height,
      );
      if (neighbours.length < atLeast) return skip('too_few_neighbours');
      const ratio = box.height / median(neighbours.map((p) => p.height));
      return (
        ratio < threshold &&
        hit(
          rule,
          { ratio, neighbours, rival },
          {
            annotation_ids: [box.id, ...neighbours.map((p) => p.id)],
            height_ratio: ratio,
            threshold,
          },
        )
      );
    },
  },

  // Visibility: is there enough of the object left to believe the box?
  visibility_risk: {
    scope: 'box',
    relational: () => true,
    test(rule, context: StaticContext, policy) {
      const seen = visibilityOf(context, policy.visibilityOf(context.box.label));
      if (!seen) return skip('missing_visibility');
      const signals = weakSignals(context, policy.confirmabilityOf(context.box.label));
      return (
        seen.value < rule.params.visibility_below &&
        signals.length >= rule.params.weak_signals_at_least &&
        hit(
          rule,
          { seen, signals, threshold: rule.params.visibility_below },
          {
            visibility: seen.value,
            visibility_source: seen.source,
            ...(seen.source === 'estimated' && { in_frame: seen.in_frame, covered: seen.covered }),
            threshold: rule.params.visibility_below,
            weak_signals: signals,
          },
        )
      );
    },
  },
  // What happens below the minimum depends on where the number comes from. A measured value
  // with action "ignore" never gets here: the engine sets such a box aside before any check.
  min_visibility: {
    scope: 'box',
    relational: () => true,
    unsupported: ({ params }) =>
      oneOf('action_when_measured', params.action_when_measured, ['ignore', 'warning', 'queue']) ||
      oneOf('action_when_estimated', params.action_when_estimated, ['warning', 'queue']),
    test(rule, context: StaticContext, policy) {
      const seen = visibilityOf(context, policy.visibilityOf(context.box.label));
      if (!seen) return skip('missing_visibility');
      const action = rule.params[`action_when_${seen.source}`];
      return (
        seen.value < rule.params.visibility_below &&
        hit(
          rule,
          { seen, threshold: rule.params.visibility_below },
          {
            visibility: seen.value,
            visibility_source: seen.source,
            ...(seen.source === 'estimated' && { in_frame: seen.in_frame, covered: seen.covered }),
            threshold: rule.params.visibility_below,
          },
          rule.error_type,
          null,
          { level: action === 'warning' ? 'warning' : rule.level },
        )
      );
    },
  },

  // Attributes and tracks
  required_attribute: {
    scope: 'box',
    test(rule, { current, attributeNames }: StaticContext) {
      const { names, values, only_when_dataset_has_them: optional } = rule.params;
      const expected = (names as string[]).filter((name) => !optional || attributeNames?.has(name));
      if (!expected.length) return skip('missing_attribute');
      const missing = expected.filter((name) => current.attributes?.[name] === undefined);
      const invalid = expected.filter(
        (name) => !missing.includes(name) && values && !values.includes(current.attributes![name]),
      );
      return (
        missing.length + invalid.length > 0 && hit(rule, { missing, invalid }, { missing, invalid })
      );
    },
  },
  // A box at the frame edge is cut by it, and a box away from the edge is not.
  attribute_matches_edge: {
    scope: 'box',
    test(rule, { current, box, media }: StaticContext) {
      const { attribute, edge_px: edge } = rule.params,
        value = current.attributes?.[attribute];
      if (typeof value !== 'boolean') return skip('missing_attribute');
      const touches = touchesEdge(box, media, edge);
      return (
        touches !== value &&
        hit(
          rule,
          { touches, attribute },
          { bbox: box.geometry, [attribute]: value, touches_edge: touches },
        )
      );
    },
  },
  required_track: {
    scope: 'box',
    test: (rule, { current }: StaticContext) =>
      current.track_id === undefined && hit(rule, {}, { annotation_id: current.id }),
  },
  // min_size with action "ignore" is a box state, not a rule that flags; see rules.ts.
  min_size: {
    scope: 'box',
    unsupported: ({ params }) =>
      oneOf('action', params.action, ['flag']) ||
      oneOf('side', params.side, ['long', 'width', 'height']),
    test(rule, { box }: StaticContext) {
      const { side, px } = rule.params;
      const size =
        side === 'height'
          ? box.height
          : side === 'width'
            ? box.width
            : Math.max(box.width, box.height);
      return size < px && hit(rule, { box }, { bbox: box.geometry, side: size, threshold: px });
    },
  },
  // A track that disappears and comes back after too many frames.
  max_gap: {
    scope: 'track',
    test(rule, { current, previous, frames }: CheckContext) {
      if (current.track_id === undefined) return skip('missing_track_id');
      if (!previous) return skip('missing_neighbors');
      const gap = frames.get(current.frame_id)!.index - frames.get(previous.frame_id)!.index - 1;
      return (
        gap > rule.params.frames &&
        hit(
          rule,
          { gap },
          { annotation_ids: [previous.id, current.id], gap, threshold: rule.params.frames },
        )
      );
    },
  },

  builtin: {
    scope: 'box',
    modelOnly: (rule) => !!BUILTINS[rule.params.check].modelOnly,
    relational: (rule) => !!BUILTINS[rule.params.check].relational,
    unsupported: ({ params, check }) =>
      (!BUILTINS[params.check] && `builtin "${params.check}" does not exist`) ||
      (params.check !== check && `params.check differs from check "${check}"`),
    test(rule, context: StaticContext) {
      const result = BUILTINS[rule.params.check].test(context);
      if (!result) return null;
      if ('status' in result) return result;
      return flag(rule.score!, result.reason, result.evidence, rule.error_type);
    },
  },
};
