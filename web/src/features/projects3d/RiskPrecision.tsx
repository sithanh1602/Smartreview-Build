import React, { useEffect, useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import { ENGINE_3D_VERSION } from '../../../core/risk3d/engine.ts';
import type { Precision3D } from '../../../core/risk3d/precision.ts';

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const ERROR_NAMES: Record<string, string> = {
  CLASS: 'Sai loại',
  BBOX: 'Cuboid',
  TRACKING: 'Tracking',
  EXTRA_OBJECT: 'Gán thừa',
  OTHER: 'Khác',
};

// How the 3D Risk Engine's cases fared with the reviewers, rule by rule, and what it missed;
// for a leader, scoring the stored scene again when the engine has changed since the import.
export function RiskPrecision({
  projectId,
  leader,
  scoredWith,
  onRescored,
}: {
  projectId: string;
  leader: boolean;
  // The engine version of the stored report; undefined for a project imported before it.
  scoredWith?: string;
  onRescored: () => void;
}) {
  const [data, setData] = useState<Precision3D | null>(null),
    [failed, setFailed] = useState(''),
    [rescoring, setRescoring] = useState(false),
    [rescoreError, setRescoreError] = useState('');
  useEffect(() => {
    if (!scoredWith) return;
    const c = new AbortController();
    request<Precision3D>(`/projects3d/${projectId}/risk/precision`, { signal: c.signal })
      .then(setData)
      .catch((e) => !c.signal.aborted && setFailed((e as Error).message));
    return () => c.abort();
  }, [projectId, scoredWith]);
  async function rescore() {
    setRescoring(true);
    setRescoreError('');
    try {
      await request(`/projects3d/${projectId}/risk/rescore`, { method: 'POST' });
      onRescored();
    } catch (e) {
      setRescoreError((e as Error).message);
    } finally {
      setRescoring(false);
    }
  }
  const outdated = scoredWith !== ENGINE_3D_VERSION;
  const rows = data ? Object.entries(data.checks).sort((a, b) => b[1].cases - a[1].cases) : [];
  return (
    <section className="panel mb-6 p-5" data-testid="risk-precision">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Risk Engine đúng tới đâu</h2>
          <p className="mt-1 text-sm text-muted">
            Đối chiếu từng quy tắc của engine với quyết định review: lỗi thật là reviewer xác nhận
            lỗi, báo nhầm là reviewer nói cuboid đúng.
          </p>
          <p className="mt-1 text-xs text-muted tabular-nums">
            Báo cáo chấm bằng {scoredWith ?? '(chưa có)'} · engine hiện tại {ENGINE_3D_VERSION}
          </p>
        </div>
        {leader && (
          <button
            type="button"
            className={`sr-button text-sm ${outdated ? 'border-accent text-accent' : ''}`}
            onClick={rescore}
            disabled={rescoring}
            title="Chấm lại scene đã lưu bằng engine hiện tại. Các đo đạc mới của exporter chỉ có khi import lại."
            data-testid="rescore"
          >
            {rescoring && <Spinner />}
            {rescoring ? 'Đang chấm lại…' : 'Chấm lại bằng engine hiện tại'}
          </button>
        )}
      </div>
      {rescoreError && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {rescoreError}
        </p>
      )}
      {!scoredWith ? null : failed ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {failed}
        </p>
      ) : !data ? (
        <p role="status" className="mt-3 text-sm text-muted">
          <Spinner />
          Đang đối chiếu…
        </p>
      ) : data.total.reviewed === 0 && data.missed.count === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Chưa có case nào được review, nên chưa đo được. Review vài lỗi trong viewer rồi quay lại.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Quy tắc</th>
                  <th className="py-1 pr-3 font-medium">Case</th>
                  <th className="py-1 pr-3 font-medium">Đã review</th>
                  <th className="py-1 pr-3 font-medium">Lỗi thật</th>
                  <th className="py-1 pr-3 font-medium">Báo nhầm</th>
                  <th className="py-1 font-medium">Đúng (chính xác)</th>
                </tr>
              </thead>
              <tbody>
                {[['Tất cả', data.total] as const, ...rows].map(([id, t]) => (
                  <tr key={id} className="border-t border-line">
                    <td
                      className={`py-1 pr-3 ${id === 'Tất cả' ? 'font-semibold' : 'font-mono text-xs'}`}
                    >
                      {id}
                    </td>
                    <td className="py-1 pr-3">{t.cases}</td>
                    <td className="py-1 pr-3">{t.reviewed}</td>
                    <td className="py-1 pr-3 text-rose-700">{t.errors}</td>
                    <td className="py-1 pr-3">{t.correct}</td>
                    <td className="py-1 font-semibold">{pct(t.precision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm" data-testid="risk-missed">
            Engine bỏ sót:{' '}
            <span className={data.missed.count ? 'font-semibold text-rose-700' : ''}>
              {data.missed.count} lỗi
            </span>{' '}
            reviewer tự tìm thấy
            {data.missed.count > 0 &&
              ` (${Object.entries(data.missed.by_error_type)
                .map(([type, n]) => `${ERROR_NAMES[type] ?? type} ${n}`)
                .join(', ')})`}
            .
          </p>
        </>
      )}
    </section>
  );
}
