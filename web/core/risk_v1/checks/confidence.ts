import { temporalReady, skip, pass, flag } from './shared.ts';
import type { LegacyCheck, LegacyTemporalContext } from '../types.ts';

const check: LegacyCheck = {
  id: 'confidence.neighbor_drop',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous, current, next } = context as LegacyTemporalContext;
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
export default check;
