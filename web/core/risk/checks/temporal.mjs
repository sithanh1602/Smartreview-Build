import { temporalReady, skip, pass, flag } from './shared.mjs';

// Track-consistency rules carried over unchanged from risk_v1. They run on every observation,
// grey-zone included: the evidence is the track, not the single box.
function bboxReady(context) {
  const unavailable = temporalReady(context);
  if (unavailable) return unavailable;
  if (
    ![context.previous, context.current, context.next].every(
      (a) => a.geometry.type === 'bbox' && a.geometry.width > 0 && a.geometry.height > 0,
    )
  )
    return 'missing_valid_bbox';
  return null;
}
const classInconsistency = {
  id: 'temporal.class_inconsistency',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous: p, current: c, next: n } = context;
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
const neighborDrop = {
  id: 'confidence.neighbor_drop',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous: p, current: c, next: n } = context;
    if (![p, c, n].every((a) => Number.isFinite(a.confidence))) return skip('missing_confidence');
    const mean = (p.confidence + n.confidence) / 2,
      drop = mean - c.confidence;
    return drop >= 0.2
      ? flag(
          20,
          `Confidence thấp hơn frame xung quanh: ${mean.toFixed(2)} → ${c.confidence.toFixed(2)}`,
          {
            values: [p.confidence, c.confidence, n.confidence],
            neighbor_mean: mean,
            drop,
            threshold: 0.2,
          },
        )
      : pass();
  },
};
const bboxArea = {
  id: 'geometry.bbox_area',
  version: '1.0.0',
  run(context) {
    const unavailable = bboxReady(context);
    if (unavailable) return skip(unavailable);
    const [p, c, n] = [context.previous, context.current, context.next].map(
      (a) => a.geometry.width * a.geometry.height,
    );
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
const bboxPosition = {
  id: 'geometry.bbox_position',
  version: '1.0.0',
  run(context) {
    const unavailable = bboxReady(context);
    if (unavailable) return skip(unavailable);
    const centers = [context.previous, context.current, context.next].map((a) => [
      a.geometry.x + a.geometry.width / 2,
      a.geometry.y + a.geometry.height / 2,
    ]);
    const [p, c, n] = centers;
    const expected = [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2];
    const ratio =
      Math.hypot(c[0] - expected[0], c[1] - expected[1]) /
      Math.hypot(context.current.geometry.width, context.current.geometry.height);
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
export const temporalChecks = [classInconsistency, neighborDrop, bboxArea, bboxPosition];
