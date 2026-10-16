import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';

type Summary = {
  id: string;
  job_id: number;
  annotation_hash: string;
  engine_version: string;
  annotation_count: number;
  risk_count: number;
  duration_ms: number;
  scanned_by_name: string;
  scanned_at: string;
  changed?: boolean;
};
type Risk = {
  id: string;
  frame: number | null;
  object_id: string | null;
  label: string | null;
  severity: string;
  score: number;
  reasons: string[];
  check_ids: string[];
};
type Scan = Summary & {
  dimension?: '2d' | '3d';
  notes?: string[];
  skipped: { object_id: string; frame: number; reason: string }[];
  risks: Risk[];
};
const SEVERITY: Record<string, string> = {
  high: 'text-rose-700',
  medium: 'text-amber-700',
  low: 'text-muted',
};
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN');

// The annotator's Scan QA, shown on their own screen: scan a CVAT job, see its risks, fix in
// CVAT, scan again. Every scan is stored for the annotator, and a re-scan says whether the
// annotation changed since the last one.
export function CvatScanPanel() {
  const [history, setHistory] = useState<Summary[] | null>(null),
    [scan, setScan] = useState<Scan | null>(null),
    [jobId, setJobId] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const base = '/cvat';
  const open = useCallback(
    (id: string) =>
      request<Scan>(`${base}/scans/${id}`)
        .then((s) => {
          setScan(s);
          setJobId(String(s.job_id));
        })
        .catch((e) => setError(e.message)),
    [base],
  );
  const load = useCallback(
    () =>
      request<{ scans: Summary[] }>(`${base}/scans`)
        .then((r) => {
          setHistory(r.scans);
          return r.scans;
        })
        .catch((e) => {
          setError(e.message);
          return [] as Summary[];
        }),
    [base],
  );
  useEffect(() => {
    load().then((list) => list[0] && open(list[0].id));
  }, [load, open]);
  async function run() {
    setBusy(true);
    setError('');
    try {
      const s = await request<Scan>(`${base}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: Number(jobId) }),
      });
      setScan(s);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const latest = history?.find((h) => h.id === scan?.id);
  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">Scan QA · CVAT</h2>
      {
        <section className="panel mb-5 p-5" aria-label="Quét job CVAT">
          <p className="text-sm text-muted">
            Nhập Job ID trong CVAT, bấm quét. Sau khi sửa và Save trong CVAT, bấm quét lại để so
            sánh. SmartReview chỉ đọc, không sửa annotation trong CVAT.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              className="field w-40"
              inputMode="numeric"
              placeholder="Job ID"
              aria-label="Job ID CVAT"
              value={jobId}
              disabled={busy}
              onChange={(e) => setJobId(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="sr-button border-accent text-accent"
              disabled={!jobId || busy}
              onClick={run}
            >
              {busy && <Spinner />}
              {busy ? 'Đang quét…' : scan?.job_id === Number(jobId) ? 'Quét lại' : 'Scan QA'}
            </button>
          </div>
        </section>
      }
      {error && (
        <p role="alert" className="panel mb-5 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      {!history ? (
        !error && (
          <p role="status" className="panel p-6">
            <Spinner /> Đang tải…
          </p>
        )
      ) : !scan ? (
        <p className="panel p-6 text-sm text-muted">Chưa có lần quét nào.</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="panel p-5" aria-label="Kết quả quét">
            <h2 className="font-semibold">
              Job {scan.job_id} · {scan.risk_count} cảnh báo / {scan.annotation_count} annotation
            </h2>
            <p className="mt-1 text-sm text-muted">
              {scan.scanned_by_name} quét lúc {when(scan.scanned_at)} · {scan.duration_ms} ms ·
              engine {scan.engine_version}
              {latest?.changed === true && ' · Annotation đã thay đổi so với lần quét trước'}
              {latest?.changed === false && ' · Annotation không đổi so với lần quét trước'}
            </p>
            {scan.notes?.map((note) => (
              <p key={note} className="mt-2 text-sm text-muted">
                {note}
              </p>
            ))}
            {scan.skipped.length > 0 && (
              <p className="mt-3 text-sm text-amber-800">
                Bỏ qua {scan.skipped.length} mục:{' '}
                {[...new Set(scan.skipped.map((s) => s.reason))].join('; ')}
              </p>
            )}
            {scan.risks.length === 0 ? (
              <p className="mt-4 text-sm">Không có cảnh báo nào ở lần quét này.</p>
            ) : (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2">Frame</th>
                    <th>Object</th>
                    <th>Label</th>
                    <th>Mức</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.risks.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="py-2">{r.frame}</td>
                      <td>{r.object_id}</td>
                      <td>{r.label}</td>
                      <td className={`font-semibold ${SEVERITY[r.severity] ?? ''}`}>
                        {r.severity} ({Math.round(r.score)})
                      </td>
                      <td>{r.reasons.join('; ') || r.check_ids.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <aside className="panel max-h-[70vh] overflow-auto" aria-label="Lịch sử quét">
            <h2 className="p-4 font-semibold">Lịch sử quét</h2>
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => open(h.id)}
                aria-current={h.id === scan.id ? 'true' : undefined}
                className={`block w-full border-t border-line p-4 text-left text-sm ${h.id === scan.id ? 'bg-teal-50' : ''}`}
              >
                <strong>Job {h.job_id}</strong> · {h.risk_count} cảnh báo
                <p className="mt-1 text-xs text-muted">
                  {h.scanned_by_name} · {when(h.scanned_at)}
                  {h.changed === true && ' · đã sửa'}
                </p>
              </button>
            ))}
          </aside>
        </div>
      )}
    </>
  );
}
