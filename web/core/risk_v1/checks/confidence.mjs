import { temporalReady, skip, pass, flag } from './shared.mjs';
export default {
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
