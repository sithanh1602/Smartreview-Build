import React from 'react';
import { POLICY_RULES } from '../../../shared/policy-rules.ts';
import type { DatasetMeta } from '../../types.ts';

const KIND: Record<string, string> = {
  check: 'So với policy',
  reviewer: 'Cần người kiểm tra',
  definition: 'Định nghĩa',
};
const CHOICE: Record<string, string> = { guideline: 'Theo guideline', policy: 'Giữ policy' };

// What the project's guideline changed, as stored with the project at import: the checks it
// switched off, the checks it added, and the rules left to people. Choices are fixed once the
// dataset is scored; changing them means importing again.
export function GuidelinePanel({ meta }: { meta: DatasetMeta }) {
  const summary = meta.guideline,
    waivers = Object.entries(meta.guideline_waivers ?? {});
  const added = new Map<string, { labels: string[]; text: string; from?: string }>();
  for (const patch of meta.guideline_patches ?? [])
    if (patch.op === 'add') {
      const check = patch.rule.check ?? patch.rule.id,
        entry = added.get(check) ?? {
          labels: [],
          text: patch.rule.text,
          from: (patch.from as { quote?: string } | undefined)?.quote,
        };
      entry.labels.push(patch.label);
      added.set(check, entry);
    }
  if (!summary && !waivers.length && !added.size) return null;
  const reviewer = summary?.rules.filter((r) => r.kind === 'reviewer') ?? [],
    captions = Object.entries(summary?.captions ?? {});
  return (
    <section className="panel mt-6 p-6" data-testid="guideline-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Guideline</h2>
        <p className="text-xs text-muted">
          {summary?.name ?? 'Không rõ tên file'} · {summary?.rules.length ?? 0} quy tắc ·{' '}
          {summary?.conflicts ?? 0} mâu thuẫn
        </p>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Check bị tắt ({waivers.length})</h3>
          {waivers.length ? (
            <ul className="mt-2 space-y-2 text-sm" data-testid="guideline-waived">
              {waivers.map(([check, labels]) => (
                <li key={check}>
                  <p>{POLICY_RULES[check] ?? check}</p>
                  <p className="text-xs text-muted">
                    {check} · nhãn: {labels.includes('*') ? 'mọi nhãn' : labels.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Không check nào của policy bị tắt.</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Check thêm từ guideline ({added.size})</h3>
          {added.size ? (
            <ul className="mt-2 space-y-2 text-sm" data-testid="guideline-checks">
              {[...added].map(([check, { labels, text, from }]) => (
                <li key={check}>
                  <p>{text}</p>
                  <p className="text-xs text-muted">
                    {check} · nhãn: {labels.includes('*') ? 'mọi nhãn' : labels.join(', ')}
                  </p>
                  {from && <p className="text-xs text-muted italic">“{from}”</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Guideline không thêm check nào.</p>
          )}
        </div>
      </div>
      {reviewer.length > 0 && (
        <p className="mt-4 text-sm">
          {reviewer.length} quy tắc cần người kiểm tra: hiện ở màn review, cạnh box có nhãn tương
          ứng.
        </p>
      )}
      {captions.length > 0 && (
        <p className="mt-2 text-sm">
          Caption thêm cho model xét box:{' '}
          {captions.map(([label, list]) => `${label} (${list.length})`).join(', ')}.
        </p>
      )}
      {summary && summary.rules.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Toàn bộ quy tắc và lựa chọn
          </summary>
          <div className="mt-2 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="eyebrow">
                  <th className="px-3 py-2 text-left">Quy tắc</th>
                  <th className="px-3 py-2 text-left">Loại</th>
                  <th className="px-3 py-2 text-left">Lựa chọn</th>
                </tr>
              </thead>
              <tbody>
                {summary.rules.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">
                      <p>{r.condition}</p>
                      <p className="text-xs text-muted">
                        {r.id} · § {r.section} · {r.classes.join(', ')}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{KIND[r.kind]}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {r.choice ? CHOICE[r.choice] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="mt-3 text-xs text-muted">
        Lựa chọn đã cố định khi chấm điểm dataset. Muốn đổi thì nhập lại dữ liệu với lựa chọn mới.
      </p>
    </section>
  );
}
