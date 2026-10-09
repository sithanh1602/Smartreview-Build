import { POLICY, TWO_WHEEL } from '../policy.ts';
import { staticCheck, skip, pass, flag, iou, weaker, cutByFrame } from './shared.ts';
import type { Check, DraftBox, LabelBox, ManualBox } from '../types.ts';

const riderPair = (a: LabelBox, b: LabelBox) =>
  (a.label === 'person' && TWO_WHEEL.includes(b.label)) ||
  (b.label === 'person' && TWO_WHEEL.includes(a.label));

// Runs on every bbox, including boxes the static rules ignore: such a box can never be a label.
const bboxValidity: Check = {
  id: 'geometry.bbox_validity',
  version: '1.0.0',
  run({ current, media }) {
    const g = current.geometry;
    if (g.type !== 'bbox') return skip('unsupported_geometry');
    const evidence = { bbox: g, image_width: media.width, image_height: media.height };
    if (g.width <= 0 || g.height <= 0)
      return flag(70, 'BBox có chiều rộng hoặc chiều cao không dương.', evidence, 'BBOX');
    if (
      g.x < -0.1 ||
      g.y < -0.1 ||
      g.x + g.width > media.width + 0.1 ||
      g.y + g.height > media.height + 0.1
    )
      return flag(40, 'BBox nằm ngoài giới hạn ảnh.', evidence, 'BBOX');
    return pass();
  },
};
// N3: one object drawn twice under two names. A rider on a two-wheeler overlaps it normally.
const crossClassOverlap = staticCheck({
  id: 'geometry.cross_class_overlap',
  only: 'draft',
  relational: true,
  test({ box, peers }) {
    const peer = peers.find(
      (p): p is DraftBox =>
        p.state === 'draft' &&
        p.label !== box.label &&
        !riderPair(box, p) &&
        iou(box.geometry, p.geometry) >= POLICY.duplicateIou &&
        weaker(box, p),
    );
    if (!peer) return null;
    const close = Math.abs(box.confidence - peer.confidence) < POLICY.classMargin;
    return flag(
      40,
      `Gần trùng với box “${peer.label}” (${peer.confidence.toFixed(2)}).`,
      {
        annotation_ids: [box.id, peer.id],
        iou: iou(box.geometry, peer.geometry),
        threshold: POLICY.duplicateIou,
      },
      close ? 'CLASS' : 'EXTRA_OBJECT',
      close ? peer.label : null,
    );
  },
});
// N5, narrowed: cars entering or leaving the frame are normal and their boxes are usually right.
// Only a box cut down to a sliver is hard to name and to box.
const edgeTruncated = staticCheck({
  id: 'geometry.edge_truncated',
  version: '2.0.0',
  only: 'draft',
  family: 'weak',
  test: ({ box, media }) =>
    box.confidence < POLICY.lowScore &&
    cutByFrame(box, media) &&
    flag(
      10,
      'Vật bị khung hình cắt quá nửa và confidence thấp.',
      { bbox: box.geometry, confidence: box.confidence, aspect_ratio: box.ratio },
      'BBOX',
    ),
});
// N6: a weak box in a dark, blurred or rainy frame goes to the queue; in a clear frame it does not.
const poorCondition = staticCheck({
  id: 'env.poor_condition',
  only: 'draft',
  family: 'weak',
  test({ box, env_risk }) {
    if (env_risk === undefined) return skip('missing_env_risk');
    return (
      env_risk >= POLICY.poorEnv &&
      box.confidence < POLICY.lowScore &&
      flag(10, 'Box yếu trong ảnh điều kiện xấu.', {
        env_risk,
        confidence: box.confidence,
        threshold: POLICY.poorEnv,
      })
    );
  },
});
// N3 for human-drawn boxes; the points go to the box drawn later.
const manualOverlap = staticCheck({
  id: 'geometry.manual_overlap',
  only: 'manual',
  relational: true,
  test({ box, peers }) {
    const peer = peers.find(
      (p): p is ManualBox =>
        p.state === 'manual' &&
        p.label === box.label &&
        p.index < box.index &&
        iou(box.geometry, p.geometry) >= 0.5,
    );
    return (
      peer &&
      flag(
        30,
        'Hai box vẽ tay cùng nhãn chồng nhau quá nửa.',
        {
          annotation_ids: [box.id, peer.id],
          iou: iou(box.geometry, peer.geometry),
          threshold: 0.5,
        },
        'EXTRA_OBJECT',
      )
    );
  },
});
export const generalChecks: Check[] = [
  bboxValidity,
  crossClassOverlap,
  edgeTruncated,
  poorCondition,
  manualOverlap,
];
