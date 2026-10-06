import { hint } from './englishHints';
export const confidenceText = (value, digits = 2) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : hint('N/A');
export const objectText = (item) =>
  item.track_id !== undefined
    ? hint(`Track #${item.track_id}`)
    : hint(`Object ${item.object_id || item.annotation_id || item.id}`);
export const contextLabel = (item) =>
  Object.values(item.context)
    .map((o) => o.class_name)
    .join(' → ');
