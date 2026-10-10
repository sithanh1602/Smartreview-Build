import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { hint } from '../../lib/englishHints';
import { useLoadedDataset } from '../../app/DatasetProvider';
import { RiskBadge } from '../../components/RiskBadge';
import { levelText } from './grouping';
import type { Case } from '../../types.ts';

const QUICK: [string, string][] = [
  ['CORRECT', 'Nhãn đúng'],
  ['ERROR', 'Lỗi gán nhãn…'],
  ['UNSURE', 'Chưa chắc'],
];

// Every flagged case of one image, each decidable in place. "Annotation error" needs an error
// type and often a corrected label, so it opens that case on its own instead of saving here.
export function ImageCaseList({
  cases,
  currentId,
  onOpen,
  onDetail,
  onNextImage,
}: {
  cases: Case[];
  currentId: string;
  onOpen: (id: string) => void;
  onDetail: (id: string) => void;
  onNextImage?: () => void;
}) {
  const { data, saveDecision } = useLoadedDataset();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rest = cases.filter((c) => !data.reviews[c.id]);
  async function decide(targets: Case[], decision: string) {
    setBusy(true);
    setError('');
    try {
      for (const c of targets) {
        const existing = data.reviews[c.id];
        await saveDecision(
          c.id,
          { decision, error_type: null, corrected_value: null, note: existing?.note ?? null },
          existing,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {cases.length} {hint('cases')} trong ảnh này
          </h3>
          <span className="text-[11px] text-muted">
            đã xem {cases.length - rest.length}/{cases.length}
          </span>
        </div>
        <p className="mt-1 mb-3 text-[11px] leading-4 text-muted">
          Quyết định ngay trên từng thẻ. Lỗi gán nhãn cần nhập chi tiết nên sẽ mở riêng mục đó.
        </p>
        {cases.map((c, i) => {
          const decision = data.reviews[c.id]?.decision;
          return (
            <section
              key={c.id}
              className={`mb-2.5 rounded-xl border p-3 ${c.id === currentId ? 'border-accent shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-accent)_25%,transparent)]' : 'border-line'}`}
            >
              <button
                className="flex w-full items-center gap-2 text-left"
                aria-current={c.id === currentId}
                onClick={() => onOpen(c.id)}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[1.5px] border-current text-xs font-bold ${levelText[c.risk_level]}`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {c.class_name}
                </span>
                <RiskBadge level={c.risk_level} score={c.risk_score} />
              </button>
              <ul className="mt-2 space-y-0.5 text-[11px] leading-4 text-muted">
                {c.findings.map((f) => (
                  <li key={f.check_id}>
                    +{f.score} · {hint(f.reason)}
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {QUICK.map(([value, label]) => (
                  <button
                    key={value}
                    className={`min-h-8 rounded-lg border px-1 text-xs font-semibold ${decision === value ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent'}`}
                    aria-pressed={decision === value}
                    disabled={busy}
                    onClick={() => (value === 'ERROR' ? onDetail(c.id) : decide([c], value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {error && (
          <p role="alert" className="text-xs leading-5 text-rose-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line p-3">
        <Button
          size="sm"
          variant="outline"
          isDisabled={busy || !rest.length}
          onPress={() => decide(rest, 'CORRECT')}
        >
          {rest.length} còn lại: nhãn đúng
        </Button>
        {onNextImage && (
          <Button size="sm" variant="primary" isDisabled={busy} onPress={onNextImage}>
            Sang ảnh kế →
          </Button>
        )}
      </div>
    </>
  );
}
