import { hint } from '../lib/englishHints';
import React from 'react';
export const levelNames = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};
const styles = {
  high: 'border-rose-400/25 bg-rose-400/10 text-rose-700',
  medium: 'border-amber-400/25 bg-amber-400/10 text-amber-800',
  low: 'border-sky-400/25 bg-sky-400/10 text-sky-700',
};
export function RiskBadge({ level, score }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-none border px-2 py-1 text-[11px] font-semibold ${styles[level]}`}
    >
      <span className="h-1.5 w-1.5 rounded-none bg-current" />
      {score === undefined ? levelNames[level] : hint(`Risk ${score}`)}
    </span>
  );
}
