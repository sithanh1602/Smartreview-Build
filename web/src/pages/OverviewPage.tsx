import { hint } from '../lib/englishHints';
import React from 'react';
import { Link } from 'react-router-dom';
import { useLoadedDataset } from '../app/DatasetProvider';
import { DataBoundary } from '../components/DataBoundary';
import { ReviewSummary } from '../components/ReviewSummary';
import { Icon } from '../components/Icon';
import { RiskBadge } from '../components/RiskBadge';
import { objectText, contextLabel } from '../lib/format';
function Overview() {
  const {
    data: { meta, cases },
    scope,
  } = useLoadedDataset();
  const query = scope === 'all' ? '?scope=all' : '';
  return (
    <main className="mx-auto max-w-[1600px] px-5 py-9 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-3 text-accent">{hint('ANNOTATION QUALITY ASSURANCE')}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {hint('Chất lượng annotation, trong một workspace.')}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Kiểm tra dữ liệu từ người gán nhãn hoặc model. Mỗi cảnh báo có bằng chứng để bạn đối
            chiếu và quyết định.
          </p>
        </div>
        <Link
          to={`/review${query}`}
          className="sr-button border-accent/30 bg-accent text-ink hover:bg-accent/90"
        >
          {hint('Bắt đầu review ')}
          <Icon name="arrow" />
        </Link>
      </div>
      <ReviewSummary />
      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-5">
            <div>
              <p className="eyebrow mb-1">{hint('PRIORITY QUEUE')}</p>
              <h2 className="font-semibold">Cần bạn kiểm tra</h2>
            </div>
            <Link to={`/review${query}`} className="text-xs text-accent">
              Xem tất cả →
            </Link>
          </div>
          <div className="divide-y divide-line">
            {[...cases]
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((c) => (
                <Link
                  key={c.id}
                  to={`/review/${encodeURIComponent(c.id)}${query}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
                >
                  <RiskBadge level={c.severity} score={c.score} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.media_name}
                      {hint(' · Frame ')}
                      {c.frame_id}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {objectText(c)} · {contextLabel(c)}
                    </p>
                  </div>
                  <Icon name="chevron" className="text-muted" />
                </Link>
              ))}
            {!cases.length && (
              <div className="p-8 text-sm text-muted">
                <p>{hint('Không có suspicious case trong các check hiện tại.')}</p>
                <Link to="/review?scope=all" className="sr-button mt-4">
                  {hint('Xem tất cả annotations')}
                </Link>
              </div>
            )}
          </div>
        </section>
        <section className="panel p-6">
          <p className="eyebrow mb-4">{hint('ACTIVE DATASET')}</p>
          <h2 className="text-xl font-semibold">{meta.name}</h2>
          <p className="mt-2 text-xs leading-5 text-muted">
            {meta.source?.name || 'SmartReview dataset'} · {meta.source?.kind || 'unknown source'}
          </p>
          <dl className="my-6 grid grid-cols-2 gap-5">
            {[
              [hint('Media'), meta.media_count],
              [hint('Frames'), meta.frame_count],
              [hint('Annotations'), meta.total_annotations],
              [hint('Tracks'), meta.total_tracks || hint('N/A')],
            ].map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-muted">{key}</dt>
                <dd className="mt-1 text-xl font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <span className="rounded-md border border-line px-2 py-1 text-[10px] text-muted">
              {hint('SCHEMA ')}
              {meta.schema_version}
            </span>
            <span className="rounded-md border border-line px-2 py-1 text-[10px] text-muted">
              {hint('ENGINE ')}
              {meta.engine_version}
            </span>
          </div>
        </section>
      </div>
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-line p-5">
          <h2 className="font-semibold">{hint('Engine Diagnostics · Check coverage')}</h2>
          <p className="mt-2 text-xs text-muted">
            {hint(
              'Mức bao phủ kiểm tra. Thiếu confidence hoặc track không đồng nghĩa annotation có lỗi.',
            )}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[550px] text-left text-xs">
            <thead className="border-b border-line bg-slate-50 text-muted">
              <tr>
                {[hint('CHECK MODULE'), hint('PASSED'), hint('FLAGGED'), hint('SKIPPED')].map(
                  (v) => (
                    <th key={v} className="px-5 py-3 font-medium">
                      {v}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(meta.checks).map(([id, c]) => (
                <tr key={id}>
                  <td className="px-5 py-4">
                    <span className="font-mono text-slate-700">{id}</span>
                    {c.skipped > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-muted">
                          Lý do bỏ qua
                        </summary>
                        {Object.entries(c.skip_reasons).map(([reason, count]) => (
                          <p key={reason} className="mt-1 text-[10px] text-muted">
                            {reason}: {count}
                          </p>
                        ))}
                      </details>
                    )}
                  </td>
                  <td className="px-5 py-4 text-accent">{c.passed}</td>
                  <td className="px-5 py-4 text-amber-800">{c.flagged}</td>
                  <td className="px-5 py-4 text-muted">{c.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
export function OverviewPage() {
  return (
    <DataBoundary>
      <Overview />
    </DataBoundary>
  );
}
