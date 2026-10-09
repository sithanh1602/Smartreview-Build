import { temporalReady, skip, pass, flag } from './shared.ts';
import type { BBoxAnnotation, Annotation } from '../../schema/types.ts';
import type { Check, CheckContext, TemporalContext } from '../types.ts';

// Track-consistency rules carried over unchanged from risk_v1. They run on every observation,
// grey-zone included: the evidence is the track, not the single box.
const positiveBox = (a: Annotation) =>
  a.geometry.type === 'bbox' && a.geometry.width > 0 && a.geometry.height > 0;
// The three observations of a track once bboxReady() has returned null.
const triple = (context: CheckContext) =>
  [context.previous, context.current, context.next] as BBoxAnnotation[];
function bboxReady(context: CheckContext) {
  const unavailable = temporalReady(context);
  if (unavailable) return unavailable;
  if (!triple(context).every(positiveBox)) return 'missing_valid_bbox';
  return null;
}
const classInconsistency: Check = {
  id: 'temporal.class_inconsistency',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous: p, current: c, next: n } = context as TemporalContext;
    return p.label === n.label && c.label !== p.label
      ? flag(
          50,
          `Temporal class anomaly: ${p.label} → ${c.label} → ${n.label}`,
          { labels: [p.label, c.label, n.label], annotation_ids: [p.id, c.id, n.id] },
          'CLASS',
          p.label,
        )
      : pass();
  },
};
const neighborDrop: Check = {
  id: 'confidence.neighbor_drop',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous, current, next } = context as TemporalContext;
    const [p, c, n] = [previous.confidence, current.confidence, next.confidence];
    if (!Number.isFinite(p) || !Number.isFinite(c) || !Number.isFinite(n))
      return skip('missing_confidence');
    const [before, value, after] = [p, c, n] as number[];
    const mean = (before + after) / 2,
      drop = mean - value;
    return drop >= 0.2
      ? flag(20, `Confidence thấp hơn frame xung quanh: ${mean.toFixed(2)} → ${value.toFixed(2)}`, {
          values: [before, value, after],
          neighbor_mean: mean,
          drop,
          threshold: 0.2,
        })
      : pass();
  },
};
const bboxArea: Check = {
  id: 'geometry.bbox_area',
  version: '1.0.0',
  run(context) {
    const unavailable = bboxReady(context);
    if (unavailable) return skip(unavailable);
    const [p, c, n] = triple(context).map((a) => a.geometry.width * a.geometry.height);
    const mean = (p + n) / 2,
      ratio = Math.abs(c - mean) / mean;
    return ratio >= 0.5
      ? flag(
          15,
          `BBox area bất thường: ${(ratio * 100).toFixed(1)}%`,
          { areas: [p, c, n], ratio, threshold: 0.5 },
          'BBOX',
        )
      : pass();
  },
};
const bboxPosition: Check = {
  id: 'geometry.bbox_position',
  version: '1.0.0',
  run(context) {
    const unavailable = bboxReady(context);
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
      Math.hypot(boxes[1].geometry.width, boxes[1].geometry.height);
    return ratio >= 0.5
      ? flag(
          15,
          `BBox position bất thường: ${ratio.toFixed(2)}x bbox diagonal`,
          { centers, expected, ratio, threshold: 0.5 },
          'BBOX',
        )
      : pass();
  },
};
export const temporalChecks: Check[] = [classInconsistency, neighborDrop, bboxArea, bboxPosition];
