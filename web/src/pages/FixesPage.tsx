import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { hint } from '../lib/englishHints';
import { request } from '../lib/api';
import { FrameViewer } from '../features/review/FrameViewer';
import { ERROR_TYPES } from '../../shared/review.ts';
import { readZip } from '../lib/zip';
import { useProject } from '../features/projects/useProject';
import type {
  Handoff,
  HandoffError,
  HandoffMissing,
  HandoffReport,
  HandoffResult,
  Outcome,
} from '../types.ts';

type Sent = { handoff: Handoff; report: HandoffReport; result: HandoffResult | null };
// Once the annotator has returned a file, every item also says what became of it.
type After = { outcome?: Outcome; now?: HandoffResult['errors'][number]['now'] };
type Item = ((HandoffError & { kind: 'error' }) | (HandoffMissing & { kind: 'missing' })) & After;
const OUTCOMES: Record<Outcome, [string, string]> = {
  changed: ['Đã sửa', 'text-emerald-700'],
  removed: ['Đã xoá nhãn', 'text-emerald-700'],
  added: ['Đã thêm nhãn', 'text-emerald-700'],
  unchanged: ['Chưa đổi', 'text-rose-700'],
  not_added: ['Chưa thêm nhãn', 'text-rose-700'],
};
const IMAGE = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
// The annotation files of what the annotator picked: the file itself, or the text files of
// an export .zip (its images stay in the browser; the project already has them).
async function annotationFiles(file: File) {
  const entries = /\.zip$/i.test(file.name)
    ? (await readZip(file)).filter((e) => !e.name.endsWith('/') && !IMAGE.test(e.name))
    : [{ name: file.name, size: file.size, blob: async () => file as Blob }];
  if (!entries.length) throw new Error('Tệp nén này không có tệp nhãn.');
  if (entries.reduce((n, e) => n + e.size, 0) > MAX_TEXT_BYTES)
    throw new Error('File nhãn tối đa 10 MB.');
  return Promise.all(
    entries.map(async (e) => ({ name: e.name, text: await (await e.blob()).text() })),
  );
}

// The annotator's page: what the reviewers sent back, one label to fix at a time.
export function FixesPage() {
  const { projectId } = useParams();
  return <Fixes key={projectId} projectId={projectId} />;
}
function Fixes({ projectId }: { projectId: string | undefined }) {
  const [sent, setSent] = useState<Sent | null>(null),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [attempt, setAttempt] = useState(0),
    [fixed, setFixed] = useState<File | null>(null),
    [returning, setReturning] = useState(false),
    [failure, setFailure] = useState('');
  const role = useProject(projectId).data?.my_role;
  async function giveBack() {
    if (!fixed) return;
    setReturning(true);
    setFailure('');
    try {
      await request(`/projects/${projectId}/handoff/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: await annotationFiles(fixed) }),
      });
      setFixed(null);
      setSelected(null);
      setAttempt((a) => a + 1);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setReturning(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    request<Sent>(`/projects/${projectId}/handoff`, { signal: c.signal })
      .then((data) => !c.signal.aborted && setSent(data))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [projectId, attempt]);
  const back = (
    <Link className="text-sm text-muted" to={`/projects/${projectId}`}>
      ← Về dự án
    </Link>
  );
  if (!sent)
    return (
      <>
        {back}
        <p role={error ? 'alert' : 'status'} className="panel mt-6 p-6">
          {!error && <Spinner />}
          {error || 'Đang tải kết quả review…'}
        </p>
      </>
    );
  const { handoff, report, result } = sent;
  const returned = handoff.status === 'RETURNED' && result !== null;
  // After a return the items sit on the images of the returned dataset.
  const source = returned ? result : report;
  const all: Item[] = [
    ...source.errors.map((e) => ({ ...e, kind: 'error' as const })),
    ...source.missing.map((m) => ({ ...m, kind: 'missing' as const })),
  ];
  const open = (i: Item) => i.outcome === 'unchanged' || i.outcome === 'not_added';
  const items = all.filter(
    (i) => filter === 'all' || i.kind === filter || (filter === 'open' && open(i)),
  );
  const canReturn = handoff.status === 'SENT' && (role === 'leader' || handoff.for_me);
  const current = items.find((i) => i.id === selected) || items[0];
  const index = items.findIndex((i) => i.id === current?.id);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ ...handoff, ...report, result }, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.project.name.replace(/[^\w.-]+/g, '_') || 'project'}-review.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      {back}
      <div className="my-6 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {returned ? 'Kiểm tra lại' : 'Lỗi cần sửa'} · {report.project.name}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {handoff.sent_by_name} gửi lúc {new Date(handoff.sent_at).toLocaleString('vi-VN')} cho{' '}
            {handoff.recipients.map((r) => r.username).join(', ')}.
          </p>
          {handoff.note && <p className="mt-2 text-sm">“{handoff.note}”</p>}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {!returned && (
            <a
              className="sr-button border-accent text-accent"
              href={`/api/projects/${projectId}/handoff/dataset.zip`}
              download
              title="Toàn bộ ảnh và nhãn, dạng CVAT for images 1.1, để nhập vào CVAT"
            >
              Tải dataset cho CVAT (.zip)
            </a>
          )}
          <button className="sr-button" onClick={download}>
            Tải danh sách lỗi (.json)
          </button>
        </div>
      </div>
      {handoff.status === 'SENT' && !handoff.current && (
        <p className="panel mb-5 p-4 text-sm text-amber-800">
          Dataset đã thay đổi sau khi gửi; danh sách này là của bản dataset trước.
        </p>
      )}
      {returned && (
        <p className="panel mb-5 p-4 text-sm" data-testid="return-summary">
          {handoff.returned_by_name} đã gửi lại bản đã sửa lúc{' '}
          {new Date(handoff.returned_at ?? '').toLocaleString('vi-VN')}.{' '}
          <strong>{all.filter((i) => !open(i)).length}</strong> mục đã được sửa,{' '}
          <strong>{all.filter(open).length}</strong> mục chưa đổi.
        </p>
      )}
      {canReturn && (
        <section className="panel mb-5 p-5" aria-label="Gửi lại bản đã sửa">
          <h2 className="font-semibold">Gửi lại bản đã sửa</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Tải dataset cho CVAT (.zip) ở trên, nhập vào CVAT và sửa nhãn.</li>
            <li>Trong CVAT, xuất nhãn (Export task dataset, không cần kèm ảnh).</li>
            <li>
              Chọn file vừa xuất ở đây (.zip, .xml hoặc .json). SmartReview tự nhận định dạng và
              chuyển về dạng của mình.
            </li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              aria-label="File đã sửa"
              accept=".zip,.xml,.json,.txt"
              disabled={returning}
              onChange={(e) => {
                setFixed(e.target.files?.[0] ?? null);
                setFailure('');
              }}
            />
            <button
              className="sr-button border-accent text-accent"
              disabled={!fixed || returning}
              onClick={giveBack}
            >
              {returning && <Spinner />}
              {returning ? 'Đang gửi…' : 'Gửi lại cho Reviewer'}
            </button>
          </div>
          {failure && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {failure}
            </p>
          )}
        </section>
      )}
      <div className="mb-5 flex flex-wrap items-end gap-6">
        <strong data-testid="fix-count">
          {report.errors.length} nhãn sai · {report.missing.length} đối tượng thiếu nhãn
        </strong>
        <label className="grid gap-2 text-sm">
          Lọc
          <select
            className="field"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            <option value="all">Tất cả</option>
            <option value="error">Nhãn sai</option>
            <option value="missing">Thiếu nhãn</option>
            {returned && <option value="open">Chưa đổi</option>}
          </select>
        </label>
      </div>
      {!current ? (
        <section className="panel p-8">Không có lỗi nào trong mục này.</section>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="panel max-h-[75vh] overflow-auto" aria-label="Danh sách lỗi cần sửa">
            {items.map((i) => (
              <button
                key={i.id}
                onClick={() => setSelected(i.id)}
                aria-current={current.id === i.id ? 'true' : undefined}
                className={`block w-full border-b border-line p-4 text-left ${current.id === i.id ? 'bg-teal-50' : ''}`}
              >
                <strong className={i.kind === 'error' ? 'text-rose-700' : 'text-violet-700'}>
                  {i.kind === 'error' ? hint(ERROR_TYPES[i.error_type ?? 'OTHER']) : 'Thiếu nhãn'}
                </strong>
                {i.outcome && (
                  <span className={`ml-2 text-xs font-semibold ${OUTCOMES[i.outcome][1]}`}>
                    {OUTCOMES[i.outcome][0]}
                  </span>
                )}
                <p className="mt-2 break-all text-sm">{i.media_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {hint('Frame')} {i.frame_id}
                  {i.class_name ? ` · ${i.class_name}` : ''}
                </p>
              </button>
            ))}
          </aside>
          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="break-all font-semibold">
                {index + 1}/{items.length} · {current.media_name} · {hint('Frame')}{' '}
                {current.frame_id}
              </h2>
              <div className="flex gap-2">
                <button
                  className="sr-button"
                  disabled={index === 0}
                  onClick={() => setSelected(items[index - 1].id)}
                >
                  ← Trước
                </button>
                <button
                  className="sr-button"
                  disabled={index === items.length - 1}
                  onClick={() => setSelected(items[index + 1].id)}
                >
                  Sau →
                </button>
              </div>
            </div>
            {current.outcome && (
              <p className="mb-3 text-sm">
                <strong className={OUTCOMES[current.outcome][1]}>
                  {OUTCOMES[current.outcome][0]}
                </strong>
                {current.now && (
                  <>
                    {' '}
                    · Khung liền: lúc gửi · Khung xanh nét đứt: hiện tại ({current.now.class_name})
                  </>
                )}
              </p>
            )}
            <FrameViewer
              key={current.id}
              observation={current}
              maxHeight="60vh"
              proposal={current.now}
            />
            {returned && current.now && role !== 'annotator' && (
              <Link
                className="sr-button mt-4"
                to={`/projects/${projectId}/review/${encodeURIComponent(current.now.id)}?scope=all`}
              >
                Mở nhãn hiện tại trong Review →
              </Link>
            )}
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
              {current.kind === 'error' ? (
                <>
                  <dt className="text-muted">Loại lỗi</dt>
                  <dd>{hint(ERROR_TYPES[current.error_type ?? 'OTHER'])}</dd>
                  <dt className="text-muted">Nhãn hiện tại</dt>
                  <dd>{current.class_name}</dd>
                  {current.corrected_value && (
                    <>
                      <dt className="text-muted">Sửa thành</dt>
                      <dd className="font-semibold text-accent">{current.corrected_value}</dd>
                    </>
                  )}
                  <dt className="text-muted">Annotation</dt>
                  <dd className="break-all">{current.annotation_id}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted">Loại lỗi</dt>
                  <dd>Thiếu nhãn: cần vẽ thêm khung tại vùng được đánh dấu</dd>
                  {current.class_name && (
                    <>
                      <dt className="text-muted">Đối tượng</dt>
                      <dd className="font-semibold text-accent">{current.class_name}</dd>
                    </>
                  )}
                </>
              )}
              {current.geometry.type === 'bbox' && (
                <>
                  <dt className="text-muted">Vị trí (px)</dt>
                  <dd className="tabular-nums">
                    x {Math.round(current.geometry.x)}, y {Math.round(current.geometry.y)},{' '}
                    {Math.round(current.geometry.width)} × {Math.round(current.geometry.height)}
                  </dd>
                </>
              )}
              {current.note && (
                <>
                  <dt className="text-muted">Ghi chú của Reviewer</dt>
                  <dd>{current.note}</dd>
                </>
              )}
            </dl>
            {current.kind === 'error' && current.reasons.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold">Why Flagged (Lý do cảnh báo)</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {current.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
