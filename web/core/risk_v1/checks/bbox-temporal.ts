import { temporalReady, positiveBox, skip, pass, flag } from './shared.ts';
import type { BBoxAnnotation } from '../../schema/types.ts';
import type { LegacyCheck, LegacyContext } from '../types.ts';

// The three observations of a track once ready() has returned null.
const triple = (context: LegacyContext) =>
  [context.previous, context.current, context.next] as BBoxAnnotation[];
function ready(context: LegacyContext) {
  const unavailable = temporalReady(context);
  if (unavailable) return unavailable;
  if (!triple(context).every(positiveBox)) return 'missing_valid_bbox';
  return null;
}
export const areaCheck: LegacyCheck = {
  id: 'geometry.bbox_area',
  version: '1.0.0',
  run(context) {
    const unavailable = ready(context);
    if (unavailable) return skip(unavailable);
    const [p, c, n] = triple(context).map((a) => a.geometry.width * a.geometry.height);
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
export const positionCheck: LegacyCheck = {
  id: 'geometry.bbox_position',
  version: '1.0.0',
  run(context) {
    const unavailable = ready(context);
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
      ? flag(15, `BBox position bất thường: ${ratio.toFixed(2)}x bbox diagonal`, {
          centers,
          expected,
          ratio,
          threshold: 0.5,
        })
      : pass();
  },
};
