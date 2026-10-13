import { temporalReady, skip, pass, flag } from './shared.ts';
import type { LegacyCheck, LegacyTemporalContext } from '../types.ts';

const check: LegacyCheck = {
  id: 'temporal.class_inconsistency',
  version: '1.0.0',
  run(context) {
    const unavailable = temporalReady(context);
    if (unavailable) return skip(unavailable);
    const { previous: p, current: c, next: n } = context as LegacyTemporalContext;
    return p.label === n.label && c.label !== p.label
      ? flag(50, `Temporal class anomaly: ${p.label} → ${c.label} → ${n.label}`, {
          labels: [p.label, c.label, n.label],
          annotation_ids: [p.id, c.id, n.id],
        })
      : pass();
  },
};
export default check;
