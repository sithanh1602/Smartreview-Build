import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import { ERROR_TYPES } from '../../../shared/review.ts';
import { Step } from './AnnotatorSteps';
import { CompleteReviewButton, HandoffNotice } from './CompleteReviewButton';
import { ReopenReviewButton } from './ReopenReviewButton';
import type { Handoff, Project3D } from '../../types.ts';
import type {
  Handoff3DChecked,
  Handoff3DItem,
  Handoff3DMetrics,
  Handoff3DReport,
  Handoff3DResult,
} from '../../../server/projects3d/handoff.ts';

// The round of fixes of a 3D project, as GET /projects3d/:id/handoff answers: nothing sent yet
// (with the counts the send dialog shows), or the sent report and, once returned, its result.
export interface Sent3D {
  handoff: Handoff | null;
  report?: Handoff3DReport;
  result?: Handoff3DResult | null;
  metrics?: Handoff3DMetrics;
}
export function useHandoff3D(projectId: string, enabled = true) {
  const [sent, setSent] = useState<Sent3D | null>(null),
    [error, setError] = useState(''),
    [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    request<Sent3D>(`/projects3d/${projectId}/handoff`, { signal: c.signal })
      .then((data) => {
        setSent(data);
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [projectId, enabled, turn]);
  return { sent, error, reload: useCallback(() => setTurn((t) => t + 1), []) };
}

const pad = (n: number) => String(n).padStart(4, '0');
const frameText = (frames: number[]) =>
  frames.length === 1
    ? `frame ${pad(frames[0])}`
    : `${frames.length} frame (${pad(frames[0])}–${pad(frames[frames.length - 1])})`;
const STATUS: Record<Handoff3DItem['status'], string> = {
  ERROR: 'Lỗi đã xác nhận',
  UNSURE: 'Chưa chắc',
  UNREVIEWED: 'Chưa kiểm tra',
};
// The viewer opened on the item's first frame with its cuboid selected, read-only there for
// annotators.
export const viewerLink = (projectId: string, item: Handoff3DItem) =>
  `/projects3d/${projectId}/viewer?frame=${item.frames[0]}&object=${encodeURIComponent(item.object_id)}`;

function ItemText({ projectId, item }: { projectId: string; item: Handoff3DItem }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-semibold">
        {item.type} · <span className="font-mono text-xs break-all">{item.object_id}</span>
      </p>
      <p className="text-xs text-muted">
        {frameText(item.frames)} · {STATUS[item.status]}
        {item.score > 0 && ` · điểm rủi ro ${item.score}`}
      </p>
      {item.error_type && (
        <p className="mt-1 text-sm">
          Lỗi: <strong>{ERROR_TYPES[item.error_type] ?? item.error_type}</strong>
          {item.corrected_value && (
            <>
              {' '}
              → sửa thành <strong>{item.corrected_value}</strong>
            </>
          )}
        </p>
      )}
      {item.note && <p className="mt-1 text-sm">Reviewer: “{item.note}”</p>}
      {!item.note && item.reasons.length > 0 && (
        <p className="mt-1 text-xs text-muted">{item.reasons.join(' · ')}</p>
      )}
      <Link className="mt-1 inline-block text-sm text-accent" to={viewerLink(projectId, item)}>
        Mở trong trình xem 3D →
      </Link>
    </div>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function itemsCsv(items: Handoff3DItem[]) {
  const head = [
    'object_id',
    'type',
    'status',
    'error_type',
    'corrected_value',
    'note',
    'frames',
    'keys',
  ];
  return [
    head.join(','),
    ...items.map((i) =>
      [
        i.object_id,
        i.type,
        i.status,
        i.error_type,
        i.corrected_value,
        i.note,
        i.frames.join(' '),
        i.keys.join(' '),
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
}

// The annotator's page while a round is sent to them: the list to fix, each item ticked once
// fixed in their tool, then the round sent back. After that, what the reviewers made of it.
export function Annotator3DWork({
  projectId,
  sent,
  onReturned,
}: {
  projectId: string;
  sent: Sent3D;
  onReturned: () => void;
}) {
  const { handoff, report, result } = sent;
  const [fixed, setFixed] = useState<Set<string>>(new Set()),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!handoff || !report) return null;
  const waiting = handoff.status === 'SENT';
  const items = [...report.errors, ...report.review];
  async function send() {
    setBusy(true);
    setError('');
    try {
      await request(`/projects3d/${projectId}/handoff/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixed: [...fixed], answers, note }),
      });
      onReturned();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel mb-5 border-amber-500 p-5" data-testid="handoff-banner">
        <h2 className="font-semibold">
          {waiting ? 'Bạn có lỗi cần sửa' : 'Bạn đã gửi lại bản đã sửa'}
        </h2>
        <p className="mt-2 text-sm">
          {waiting ? (
            <>
              {handoff.sent_by_name} gửi lúc {new Date(handoff.sent_at).toLocaleString('vi-VN')}:{' '}
              {report.errors.length} lỗi
              {report.review.length > 0 && `, ${report.review.length} mục cần xem lại`}. Làm theo ba
              bước dưới đây.
            </>
          ) : (
            <>
              {handoff.returned_by_name} gửi lại lúc{' '}
              {new Date(handoff.returned_at ?? '').toLocaleString('vi-VN')}. Reviewer đang kiểm tra;
              bên dưới là kết quả từng mục.
            </>
          )}
        </p>
        {handoff.note && <p className="mt-2 text-sm text-muted">“{handoff.note}”</p>}
        {waiting && !handoff.current && (
          <p className="mt-2 text-sm text-amber-800">
            Dataset đã thay đổi sau khi gửi; danh sách lỗi là của bản dataset trước.
          </p>
        )}
      </section>
      {waiting ? (
        <>
          <Step n={1} title="Lấy danh sách lỗi">
            <p className="text-sm text-muted">
              Segment <span className="font-mono">{report.segment}</span>. Mỗi mục ghi id đối tượng
              và frame của cuboid cần sửa trong công cụ gán nhãn 3D của bạn.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="sr-button"
                onClick={() =>
                  download(
                    `loi-3d-${report.segment}.csv`,
                    itemsCsv(items),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                Tải CSV
              </button>
              <button
                type="button"
                className="sr-button"
                onClick={() =>
                  download(
                    `loi-3d-${report.segment}.json`,
                    JSON.stringify(report, null, 2),
                    'application/json',
                  )
                }
              >
                Tải JSON
              </button>
            </div>
          </Step>
          <Step n={2} title="Xem và đánh dấu từng cuboid đã sửa">
            <ul className="space-y-3" data-testid="fix-list-3d">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap gap-3 rounded-lg border border-line p-3"
                >
                  <label className="flex shrink-0 items-start gap-2 pt-0.5 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={fixed.has(item.id)}
                      aria-label={`Đã sửa ${item.object_id}`}
                      onChange={(e) => {
                        const next = new Set(fixed);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        setFixed(next);
                      }}
                    />
                    Đã sửa
                  </label>
                  <ItemText projectId={projectId} item={item} />
                  <input
                    className="field min-h-9 w-full py-1 text-sm sm:w-64"
                    placeholder="Ghi chú cho Reviewer (không bắt buộc)"
                    maxLength={500}
                    value={answers[item.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
          </Step>
          <Step n={3} title="Gửi lại cho Reviewer">
            <p className="text-sm text-muted">
              Đã đánh dấu {fixed.size}/{items.length} mục. Mục không đánh dấu được gửi là chưa sửa;
              ghi lý do ở ô ghi chú của mục đó.
            </p>
            <label className="mt-3 block text-sm">
              Ghi chú chung (không bắt buộc)
              <textarea
                className="field mt-2"
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              type="button"
              className="sr-button mt-3 border-accent bg-accent text-white"
              disabled={busy}
              onClick={send}
            >
              {busy && <Spinner />}
              Gửi lại cho Reviewer
            </button>
          </Step>
        </>
      ) : (
        result && <ResultList projectId={projectId} result={result} />
      )}
    </>
  );
}

const verdictText = (i: Handoff3DChecked) =>
  !i.verdict ? (
    <span className="text-muted">Chờ kiểm tra</span>
  ) : i.verdict.value === 'accept' ? (
    <span className="text-emerald-700">✓ Đã chấp nhận ({i.verdict.by})</span>
  ) : (
    <span className="text-rose-700">✗ Bị từ chối ({i.verdict.by})</span>
  );

// A returned round, item by item: what the annotator said and the reviewers' verdicts. With
// `onJudge`, a reviewer accepts or rejects each item.
function ResultList({
  projectId,
  result,
  onJudge,
}: {
  projectId: string;
  result: Handoff3DResult;
  onJudge?: (id: string, value: 'accept' | 'reject' | null) => Promise<void>;
}) {
  const items = [...result.errors, ...result.review];
  const judged = items.filter((i) => i.verdict).length;
  return (
    <section className="panel mb-5 p-5" data-testid="handoff-result-3d">
      <h2 className="font-semibold">Kết quả lượt sửa</h2>
      <p className="mt-1 text-sm text-muted">
        {items.filter((i) => i.fixed).length}/{items.length} mục Annotator báo đã sửa · đã kiểm tra{' '}
        {judged}/{items.length}
      </p>
      {result.note && <p className="mt-2 text-sm">Annotator: “{result.note}”</p>}
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex flex-wrap gap-3 rounded-lg border p-3 ${item.verdict ? (item.verdict.value === 'accept' ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50') : 'border-line'}`}
          >
            <ItemText projectId={projectId} item={item} />
            <div className="w-full space-y-1 text-sm sm:w-64">
              <p
                className={
                  item.fixed ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'
                }
              >
                {item.fixed ? 'Annotator: đã sửa' : 'Annotator: chưa sửa'}
              </p>
              {item.answer && <p>“{item.answer}”</p>}
              <p>{verdictText(item)}</p>
              {onJudge && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className="sr-button min-h-8 py-1 text-xs"
                    onClick={() => onJudge(item.id, 'accept')}
                  >
                    Chấp nhận
                  </button>
                  <button
                    type="button"
                    className="sr-button min-h-8 py-1 text-xs"
                    onClick={() => onJudge(item.id, 'reject')}
                  >
                    Từ chối
                  </button>
                  {item.verdict && (
                    <button
                      type="button"
                      className="sr-button min-h-8 py-1 text-xs"
                      onClick={() => onJudge(item.id, null)}
                    >
                      Bỏ
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The handoff part of a 3D project page for leaders and reviewers: the button that sends the
// review, the notice while it is with the annotators, and the returned round to check.
export function Reviewer3DHandoff({ project }: { project: Project3D }) {
  const { sent, error, reload } = useHandoff3D(project.id);
  const [failure, setFailure] = useState('');
  if (error)
    return (
      <p role="alert" className="panel mb-6 p-5 text-sm text-rose-700">
        {error}
      </p>
    );
  if (!sent) return null;
  const { handoff, result } = sent;
  async function judge(id: string, value: 'accept' | 'reject' | null) {
    setFailure('');
    try {
      await request(`/projects3d/${project.id}/handoff/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value }),
      });
      reload();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <div className="mb-6" data-testid="handoff-3d">
      {handoff?.status === 'SENT' ? (
        <div className="flex flex-wrap items-center gap-3">
          <HandoffNotice handoff={handoff} className="min-w-0 flex-1" />
          <ReopenReviewButton
            projectId={project.id}
            handoff={handoff}
            onReopened={reload}
            base="/projects3d"
          />
        </div>
      ) : (
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Gửi lỗi cho Annotator</h2>
            <p className="mt-1 text-sm text-muted">
              {handoff?.status === 'RETURNED'
                ? 'Annotator đã gửi lại lượt sửa. Kiểm tra từng mục bên dưới; bấm Hoàn thành để gửi lượt mới.'
                : 'Review xong thì gửi các cuboid đã xác nhận lỗi cho Annotator. Quyết định review bị khoá tới khi mở lại.'}
            </p>
          </div>
          <CompleteReviewButton
            project={{ id: project.id, my_role: project.my_role, handoff }}
            metrics={
              sent.metrics ?? {
                confirmed_errors: project.review_summary?.errors ?? 0,
                unsure: project.review_summary?.unsure ?? 0,
                unreviewed: 0,
              }
            }
            onSent={reload}
            base="/projects3d"
          />
        </div>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {failure}
        </p>
      )}
      {handoff?.status === 'RETURNED' && result && (
        <div className="mt-5">
          <ResultList projectId={project.id} result={result} onJudge={judge} />
        </div>
      )}
    </div>
  );
}
