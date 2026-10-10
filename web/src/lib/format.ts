import { hint } from './englishHints';
import type { Case } from '../types.ts';

export const confidenceText = (value: number | null | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : hint('N/A');
export const objectText = (item: {
  track_id?: string;
  object_id?: string;
  annotation_id?: string | null;
  id: string;
}) =>
  item.track_id !== undefined
    ? `${hint('Track')} #${item.track_id}`
    : `${hint('Object')} ${item.object_id || item.annotation_id || item.id}`;
export const contextLabel = (item: Pick<Case, 'context'>) =>
  Object.values(item.context)
    .map((o) => o.class_name)
    .join(' → ');
