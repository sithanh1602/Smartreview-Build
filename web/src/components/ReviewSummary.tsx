import { hint } from '../lib/englishHints';
import React from 'react';
import { useLoadedDataset } from '../app/DatasetProvider';
const short: Record<string, string> = {
  'Confirmed Errors': 'Errors',
  'Correct / False Alarm': 'Correct',
};
export function ReviewSummary({ compact = false }: { compact?: boolean }) {
  const {
    data: { metrics: m },
  } = useLoadedDataset();
  const stats: [string, number, string][] = [
    ['Total Risk Cases', m.total_risk_cases, 'text-slate-900'],
    ['High', m.high, 'text-rose-700'],
    ['Medium', m.medium, 'text-amber-800'],
    ['Reviewed', m.reviewed, 'text-accent'],
    ['Unreviewed', m.unreviewed, 'text-slate-900'],
    ['Confirmed Errors', m.confirmed_errors, 'text-rose-700'],
    ['Correct / False Alarm', m.correct, 'text-accent'],
    ['Unsure', m.unsure, 'text-amber-800'],
  ];
  if (compact)
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums">{m.review_progress}%</span>
          <progress
            aria-label={hint('Review progress')}
            value={m.reviewed}
            max={m.total_risk_cases || 1}
            className="h-1.5 w-28 accent-accent"
          />
        </div>
        {stats.slice(1).map(([label, value, color]) => (
          <section
            className="flex items-baseline gap-1 text-[11px] text-muted"
            aria-label={hint(label)}
            key={label}
          >
            <span className={`text-[13px] font-semibold tabular-nums ${color}`}>{value}</span>
            {short[label] ?? hint(label)}
          </section>
        ))}
      </div>
    );
  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(([label, value, color]) => (
          <section className="panel px-4 py-3" aria-label={hint(label)} key={label}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted">{hint(label)}</p>
              <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 text-[11px] text-muted">
          {hint('Review progress · ')}
          {m.review_progress}%
        </span>
        <progress
          aria-label={hint('Review progress')}
          value={m.reviewed}
          max={m.total_risk_cases || 1}
          className="h-1.5 w-full accent-accent"
        />
      </div>
      <p className="mt-2 text-[10px] text-muted">
        {hint(
          'Metrics từ MySQL · suspicious cases của dataset hiện tại · không đổi theo bộ lọc hàng đợi.',
        )}
      </p>
    </div>
  );
}
