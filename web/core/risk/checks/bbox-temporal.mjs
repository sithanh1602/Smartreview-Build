import { temporalReady, skip, pass, flag } from './shared.mjs';

function ready(context) {
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
export const areaCheck = {
  id: 'geometry.bbox_area',
  version: '1.0.0',
  run(context) {
    const unavailable = ready(context);
    if (unavailable) return skip(unavailable);
    const [p, c, n] = [context.previous, context.current, context.next].map(
      (a) => a.geometry.width * a.geometry.height,
    );
    const mean = (p + n) / 2,
      ratio = Math.abs(c - mean) / mean;
    return ratio >= 0.5
      ? flag(15, `BBox area bất thường: ${(ratio * 100).toFixed(1)}%`, {
          areas: [p, c, n],
          ratio,
          threshold: 0.5,
        })
      : pass();
  },
};
export const positionCheck = {
  id: 'geometry.bbox_position',
  version: '1.0.0',
  run(context) {
    const unavailable = ready(context);
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
      ? flag(15, `BBox position bất thường: ${ratio.toFixed(2)}x bbox diagonal`, {
          centers,
          expected,
          ratio,
          threshold: 0.5,
        })
      : pass();
  },
};
