import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { hint } from '../../lib/englishHints';
import { request } from '../../lib/api';
import { Button } from '@heroui/react';
import { FrameViewer } from '../review/FrameViewer';
import { Icon } from '../../components/Icon';
import { Tip } from '../../components/Tip';
import { ERROR_TYPES } from '../../../shared/review.ts';
import { readZip } from '../../lib/zip';
import type {
  Handoff,
  HandoffCheck,
  HandoffError,
  HandoffMissing,
  HandoffReport,
  HandoffResult,
  Outcome,
  ProjectRole,
} from '../../types.ts';

// The sent review of a project, shown on the annotator's dashboard and on the fixes page.
export type Sent = { handoff: Handoff; report: HandoffReport; result: HandoffResult | null };
// Once the annotator has returned a file, every item also says what became of it.
type Checked = HandoffResult['errors'][number];
type After = { outcome?: Outcome; now?: Checked['now']; verdict?: Checked['verdict'] };
type Item = (
  | (HandoffError & { kind: 'error' })
  | (HandoffMissing & { kind: 'missing' })
  | (HandoffCheck & { kind: 'review' })
) &
  After;
const CHECKS: Record<HandoffCheck['status'], string> = {
  UNSURE: 'Reviewer chưa chắc',
  UNREVIEWED: 'Chưa ai kiểm tra',
};
const KIND_COLOR = { error: 'text-rose-700', missing: 'text-violet-700', review: 'text-amber-700' };
// Which boxes the viewer draws: the one sent, the one there now, both, or none (the bare image).
type Boxes = 'both' | 'sent' | 'now' | 'none';
const BOXES: [Boxes, string][] = [
  ['both', 'Cả hai'],
  ['sent', 'Lúc gửi'],
  ['now', 'Hiện tại'],
  ['none', 'Không khung'],
];
const KIND_BORDER = {
  error: 'border-l-rose-500',
  missing: 'border-l-violet-500',
  review: 'border-l-amber-500',
};
const title = (i: Item) =>
  i.kind === 'error'
    ? hint(ERROR_TYPES[i.error_type ?? 'OTHER'])
    : i.kind === 'missing'
      ? 'Thiếu nhãn'
      : 'Cần xem lại';
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

// The sent review and, once returned, what became of it; nothing is fetched while disabled.
export function useSent(projectId: string | undefined, enabled = true) {
  const [sent, setSent] = useState<Sent | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    request<Sent>(`/projects/${projectId}/handoff`, { signal: c.signal })
      .then((data) => !c.signal.aborted && setSent(data))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [projectId, attempt, enabled]);
  return { sent, error, reload: () => setAttempt((a) => a + 1), setSent };
}

// Picks the fixed export and sends it back to the reviewers.
export function ReturnForm({
  projectId,
  onReturned,
  children,
}: {
  projectId: string | undefined;
  onReturned: () => void;
  children?: React.ReactNode;
}) {
  const [fixed, setFixed] = useState<File | null>(null),
    [returning, setReturning] = useState(false),
    [failure, setFailure] = useState('');
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
      onReturned();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setReturning(false);
    }
  }
  return (
    <>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label
          className={`sr-button cursor-pointer ${returning ? 'pointer-events-none opacity-60' : ''}`}
        >
          Chọn file…
          <input
            type="file"
            className="sr-only"
            aria-label="File đã sửa"
            accept=".zip,.xml,.json,.txt"
            disabled={returning}
            onChange={(e) => {
              setFixed(e.target.files?.[0] ?? null);
              setFailure('');
            }}
          />
        </label>
        <span className="min-w-0 max-w-full truncate text-sm text-muted">
          {fixed ? fixed.name : 'Chưa chọn file'}
        </span>
        <button
          className="sr-button border-accent bg-accent text-white"
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
    </>
  );
}

// The labels to fix, one at a time on its image: a list on the left, the image and what to
// do on the right. Where reviewers check a returned round, each item is accepted or rejected.
export function FixList({
  sent,
  projectId,
  role,
  onJudged,
  fill = false,
}: {
  sent: Sent;
  projectId: string | undefined;
  role: ProjectRole | undefined;
  // Given where the reviewers accept or reject the returned items: the answer was saved.
  onJudged?: (result: HandoffResult) => void;
  // Fills the rest of a one-screen page from laptop width up: only the list scrolls.
  fill?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState('all'),
    [note, setNote] = useState(''),
    [noteShown, setNoteShown] = useState(false),
    [judging, setJudging] = useState(false),
    [judgeError, setJudgeError] = useState(''),
    [closeUp, setCloseUp] = useState(false),
    [boxes, setBoxes] = useState<Boxes>('both'),
    [full, setFull] = useState(false),
    [zoomSlot, setZoomSlot] = useState<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stage.current?.requestFullscreen().catch(() => {});
  };
  const { handoff, report, result } = sent;
  const returned = handoff.status === 'RETURNED' && result !== null;
  // After a return the items sit on the images of the returned dataset.
  const source = returned ? result : report;
  const all: Item[] = [
    ...source.errors.map((e) => ({ ...e, kind: 'error' as const })),
    ...source.missing.map((m) => ({ ...m, kind: 'missing' as const })),
    ...(source.review ?? []).map((c) => ({ ...c, kind: 'review' as const })),
  ];
  const judge =
    Boolean(onJudged) && returned && handoff.status === 'RETURNED' && role !== 'annotator';
  const open = (i: Item) => i.outcome === 'unchanged' || i.outcome === 'not_added';
  const FILTERS: [string, string, (i: Item) => boolean, boolean][] = [
    ['all', 'Tất cả', () => true, true],
    ['pending', 'Chờ kiểm tra', (i) => !i.verdict, judge],
    ['error', 'Nhãn sai', (i) => i.kind === 'error', true],
    ['missing', 'Thiếu nhãn', (i) => i.kind === 'missing', true],
    ['review', 'Cần xem lại', (i) => i.kind === 'review', all.some((i) => i.kind === 'review')],
    ['open', 'Chưa đổi', open, returned],
  ];
  const shown = FILTERS.filter((f) => f[3]);
  const test = (shown.find((f) => f[0] === filter) ?? shown[0])[2];
  const items = all.filter(test);
  const current = items.find((i) => i.id === selected) || items[0];
  const index = items.findIndex((i) => i.id === current?.id);
  const judged = all.filter((i) => i.verdict);
  // Without a label there now, "now" falls back to the box that was sent.
  const shownBoxes: Boxes = !current?.now && boxes !== 'none' ? 'sent' : boxes;
  // With no label there now only the sent box exists: show it or not.
  const boxChoices: [Boxes, string][] = current?.now
    ? BOXES
    : [
        ['sent', returned ? 'Lúc gửi' : 'Hiện khung'],
        ['none', 'Không khung'],
      ];
  const rejected = judged.filter((i) => i.verdict!.value === 'reject');
  const fixes = all.filter((i) => i.kind !== 'review');
  // A note belongs to the item it was written for.
  useEffect(() => {
    setNote('');
    setNoteShown(false);
    setJudgeError('');
  }, [current?.id]);
  async function answer(value: 'accept' | 'reject') {
    if (!current || judging) return;
    setJudging(true);
    setJudgeError('');
    try {
      const next = await request<HandoffResult>(`/projects/${projectId}/handoff/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: current.id, verdict: value, note: note.trim() || null }),
      });
      // On to the next item nobody answered, after this one in the list.
      const after = [...items.slice(index + 1), ...items.slice(0, index)].find((i) => !i.verdict);
      if (after) setSelected(after.id);
      onJudged!(next);
    } catch (e) {
      setJudgeError((e as Error).message);
    } finally {
      setJudging(false);
    }
  }
  const go = (delta: number) => {
    const next = items[index + delta];
    if (next) setSelected(next.id);
  };
  // ←/→ move through the list; A accepts and R rejects, unless a field has the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key.toLowerCase() === 'z') setCloseUp((v) => !v);
      else if (e.key.toLowerCase() === 'f') toggleFull();
      else if (e.key.toLowerCase() === 'b')
        setBoxes((v) => BOXES[(BOXES.findIndex(([id]) => id === v) + 1) % BOXES.length][0]);
      else if (judge && e.key.toLowerCase() === 'a') answer('accept');
      else if (judge && e.key.toLowerCase() === 'r') answer('reject');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const verdictMark = (i: Item) =>
    i.verdict ? (
      i.verdict.value === 'accept' ? (
        <span className="text-emerald-600" title="Đã đồng ý">
          ✓
        </span>
      ) : (
        <span className="text-rose-600" title="Đã từ chối">
          ✗
        </span>
      )
    ) : (
      <span className="text-muted" title="Chờ kiểm tra">
        ○
      </span>
    );
  return (
    <div className={fill ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : undefined}>
      {(judge || returned) && (
        <section className={`panel ${fill ? 'mb-3 p-3' : 'mb-4 p-4'}`} data-testid="return-summary">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <p>
              {handoff.returned_by_name} gửi lại lúc{' '}
              {new Date(handoff.returned_at ?? '').toLocaleString('vi-VN')}:{' '}
              <strong>{fixes.filter((i) => !open(i)).length}</strong> mục đã sửa,{' '}
              <strong>{fixes.filter(open).length}</strong> mục chưa đổi.
            </p>
            {judge && (
              <span>
                Đã kiểm tra <strong>{judged.length}</strong>/{all.length}
              </span>
            )}
          </div>
          {judge && (
            <div className="mt-2" data-testid="judge-progress">
              <div className="flex flex-wrap items-baseline justify-end gap-2 text-sm">
                <span className="text-xs">
                  <span className="text-emerald-700">
                    ✓ {judged.length - rejected.length} đồng ý
                  </span>
                  {' · '}
                  <span className="text-rose-700">✗ {rejected.length} từ chối</span>
                  {' · '}
                  <span className="text-muted">○ {all.length - judged.length} chờ</span>
                </span>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${(100 * (judged.length - rejected.length)) / (all.length || 1)}%`,
                  }}
                />
                <div
                  className="bg-rose-500"
                  style={{ width: `${(100 * rejected.length) / (all.length || 1)}%` }}
                />
              </div>
              {judged.length === all.length && (
                <p className="mt-3 text-sm">
                  Đã kiểm tra hết.{' '}
                  {rejected.length ? (
                    <>
                      {rejected.length} mục bị từ chối đã được đánh lỗi lại; về{' '}
                      <Link
                        className="font-semibold text-accent underline"
                        to={`/projects/${projectId}`}
                      >
                        trang dự án
                      </Link>{' '}
                      bấm Hoàn thành để gửi vòng mới (kèm issue CVAT).
                    </>
                  ) : (
                    'Mọi bản sửa đều được đồng ý.'
                  )}
                </p>
              )}
            </div>
          )}
        </section>
      )}
      <div
        className={`flex flex-wrap items-center gap-3 ${fill ? 'mb-3 justify-start' : 'mb-4 justify-between'}`}
      >
        <p className={`text-sm font-semibold ${fill ? 'sr-only' : ''}`} data-testid="fix-count">
          {report.errors.length} nhãn sai · {report.missing.length} đối tượng thiếu nhãn ·{' '}
          {report.review?.length ?? 0} cần xem lại
        </p>
        <div role="tablist" aria-label="Lọc" className="flex flex-wrap gap-1.5">
          {shown.map(([id, label, match]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id || (id === 'all' && !shown.some((f) => f[0] === filter))}
              onClick={() => {
                setFilter(id);
                setSelected(null);
              }}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${filter === id ? 'border-accent bg-accent text-white' : 'border-line bg-panel'}`}
            >
              {label} <span className="tabular-nums opacity-80">{all.filter(match).length}</span>
            </button>
          ))}
        </div>
      </div>
      {!current ? (
        <section className="panel p-8">Không có lỗi nào trong mục này.</section>
      ) : (
        <div
          className={`grid gap-4 ${fill ? 'items-start lg:min-h-0 lg:flex-1 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-stretch' : 'items-start lg:grid-cols-[260px_minmax(0,1fr)]'}`}
        >
          <aside
            className={`panel max-h-[40vh] overflow-auto ${fill ? 'lg:max-h-none lg:min-h-0' : 'lg:max-h-[78vh]'}`}
            aria-label="Danh sách lỗi cần sửa"
          >
            {items.map((i) => (
              <button
                key={i.id}
                onClick={() => setSelected(i.id)}
                aria-current={current.id === i.id ? 'true' : undefined}
                className={`block w-full border-b border-l-4 border-b-line px-3 py-2.5 text-left ${KIND_BORDER[i.kind]} ${current.id === i.id ? 'bg-teal-50' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className={`truncate text-sm ${KIND_COLOR[i.kind]}`}>{title(i)}</strong>
                  {judge && (
                    <span className="shrink-0 text-base leading-none">{verdictMark(i)}</span>
                  )}
                </span>
                <span className="mt-1 block truncate text-sm">{i.media_name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="whitespace-nowrap">
                    {hint('Frame')} {i.frame_id}
                    {i.class_name ? ` · ${i.class_name}` : ''}
                  </span>
                  {i.outcome && (
                    <span className={`whitespace-nowrap font-semibold ${OUTCOMES[i.outcome][1]}`}>
                      {OUTCOMES[i.outcome][0]}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </aside>
          <section
            className={`panel p-4 ${fill ? 'lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden' : ''}`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="min-w-0 truncate font-semibold">
                {index + 1}/{items.length} · {current.media_name} · {hint('Frame')}{' '}
                {current.frame_id}
              </h2>
              <div className="flex gap-2">
                <button className="sr-button" disabled={index === 0} onClick={() => go(-1)}>
                  ← Trước
                </button>
                <button
                  className="sr-button"
                  disabled={index === items.length - 1}
                  onClick={() => go(1)}
                >
                  Sau →
                </button>
              </div>
            </div>
            <div
              className={`grid gap-4 ${fill ? 'items-start lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-stretch xl:grid-cols-[minmax(0,1fr)_280px]' : 'items-start xl:grid-cols-[minmax(0,1fr)_300px]'}`}
            >
              <div
                ref={stage}
                className={`min-w-0 ${full ? 'flex h-full flex-col gap-2 bg-ink p-3' : fill ? 'lg:flex lg:min-h-0 lg:flex-col' : ''}`}
              >
                <div
                  className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2"
                  role="toolbar"
                  aria-label="Công cụ xem ảnh"
                >
                  {current.outcome && (
                    <strong className={`text-sm ${OUTCOMES[current.outcome][1]}`}>
                      {OUTCOMES[current.outcome][0]}
                    </strong>
                  )}
                  <div
                    role="radiogroup"
                    aria-label="Khung hiển thị"
                    className="flex overflow-hidden rounded-md border border-line text-xs"
                  >
                    {boxChoices.map(([id, label]) => {
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={shownBoxes === id}
                          title={
                            id === 'sent'
                              ? 'Khung liền: nhãn lúc gửi'
                              : id === 'now'
                                ? 'Khung xanh nét đứt: nhãn hiện tại'
                                : undefined
                          }
                          onClick={() => setBoxes(id)}
                          className={`border-l border-line px-2 py-1 first:border-l-0 ${shownBoxes === id ? 'bg-accent text-white' : 'bg-panel'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <div ref={setZoomSlot} className="flex items-center" />
                    <Tip text={closeUp ? 'Xem toàn ảnh (Z)' : 'Phóng vào chỗ lỗi (Z)'}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant={closeUp ? 'primary' : 'tertiary'}
                        aria-label={closeUp ? 'Xem toàn ảnh' : 'Phóng vào chỗ lỗi'}
                        aria-pressed={closeUp}
                        onPress={() => setCloseUp((v) => !v)}
                      >
                        <Icon name="target" />
                      </Button>
                    </Tip>
                    <Tip text={full ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="tertiary"
                        aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                        onPress={toggleFull}
                      >
                        <Icon name={full ? 'shrink' : 'expand'} />
                      </Button>
                    </Tip>
                    {current.image_url && (
                      <Tip text="Mở ảnh gốc trong tab mới">
                        <a
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-slate-100"
                          href={current.image_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Mở ảnh gốc trong tab mới"
                        >
                          <Icon name="external" />
                        </a>
                      </Tip>
                    )}
                  </div>
                </div>
                {/* On a one-screen page and in full screen the image takes all the height left. */}
                <div className={full || fill ? 'min-h-0 lg:flex-1' : undefined}>
                  <FrameViewer
                    key={current.id}
                    observation={current}
                    maxHeight={full || fill ? undefined : '62vh'}
                    fill={full || fill}
                    zoom={closeUp}
                    interactive
                    wheel
                    controlsSlot={zoomSlot}
                    showBox={shownBoxes === 'both' || shownBoxes === 'sent'}
                    proposal={shownBoxes === 'both' || shownBoxes === 'now' ? current.now : null}
                  />
                </div>
                {full && (
                  <p className="text-xs text-muted">
                    {index + 1}/{items.length} · {current.media_name} · ←/→ chuyển mục · Esc thoát
                  </p>
                )}
              </div>
              <div
                className={
                  fill ? 'space-y-3 lg:max-h-full lg:min-h-0 lg:overflow-auto' : 'space-y-4'
                }
                data-testid="side"
              >
                {judge && (
                  <div
                    className={`rounded-lg border p-3 ${current.verdict ? (current.verdict.value === 'accept' ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50') : 'border-line'}`}
                    data-testid="verdict"
                  >
                    <p className="text-sm font-semibold">Bản sửa này được không?</p>
                    {current.verdict ? (
                      <p
                        className={`mt-1 text-xs ${current.verdict.value === 'accept' ? 'text-emerald-800' : 'text-rose-800'}`}
                      >
                        {current.verdict.value === 'accept' ? '✓ Đã đồng ý' : '✗ Đã từ chối'} ·{' '}
                        {current.verdict.by} ·{' '}
                        {new Date(current.verdict.at).toLocaleString('vi-VN')}
                        {current.verdict.note ? ` · “${current.verdict.note}”` : ''}. Chọn lại để
                        đổi.
                      </p>
                    ) : (
                      <p
                        className={`mt-1 text-xs text-muted ${fill ? '[@media(max-height:860px)]:hidden' : ''}`}
                      >
                        Từ chối thì mục được đánh lỗi lại, vào lần gửi tiếp và thành issue CVAT.
                      </p>
                    )}
                    <div className={`grid grid-cols-2 gap-2 ${fill ? 'mt-2' : 'mt-3'}`}>
                      <button
                        type="button"
                        className="sr-button justify-center border-emerald-600 bg-emerald-600 text-white hover:brightness-110"
                        disabled={judging}
                        onClick={() => answer('accept')}
                      >
                        {judging && <Spinner />}✓ Đồng ý
                      </button>
                      <button
                        type="button"
                        className="sr-button justify-center border-rose-600 bg-rose-600 text-white hover:brightness-110"
                        disabled={judging}
                        onClick={() => answer('reject')}
                      >
                        ✗ Từ chối
                      </button>
                    </div>
                    {noteShown ? (
                      <label className="mt-3 block text-xs">
                        Ghi chú gửi kèm
                        <textarea
                          className="field mt-1 text-sm"
                          rows={2}
                          value={note}
                          maxLength={1000}
                          disabled={judging}
                          autoFocus
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="mt-2 text-xs text-accent underline"
                        onClick={() => setNoteShown(true)}
                      >
                        + Thêm ghi chú
                      </button>
                    )}
                    <p
                      className={`mt-2 text-[11px] text-muted ${fill ? '[@media(max-height:860px)]:hidden' : ''}`}
                    >
                      Phím tắt: A đồng ý · R từ chối · ←/→ mục · Z · B · F
                    </p>
                    {judgeError && (
                      <p role="alert" className="mt-2 text-xs text-rose-700">
                        {judgeError}
                      </p>
                    )}
                  </div>
                )}
                <dl
                  className={`grid grid-cols-[max-content_1fr] gap-x-4 ${fill ? 'gap-y-1 text-xs' : 'gap-y-2 text-sm'}`}
                >
                  {current.kind === 'error' ? (
                    <>
                      <dt className="text-muted">Loại lỗi</dt>
                      <dd>{hint(ERROR_TYPES[current.error_type ?? 'OTHER'])}</dd>
                      <dt className="text-muted">Nhãn lúc gửi</dt>
                      <dd>{current.class_name}</dd>
                      {current.corrected_value && (
                        <>
                          <dt className="text-muted">Sửa thành</dt>
                          <dd className="font-semibold text-accent">{current.corrected_value}</dd>
                        </>
                      )}
                    </>
                  ) : current.kind === 'review' ? (
                    <>
                      <dt className="text-muted">Cần xem lại</dt>
                      <dd>{CHECKS[current.status]}; chưa xác nhận là lỗi.</dd>
                      <dt className="text-muted">
                        {current.annotation_id ? 'Nhãn lúc gửi' : 'Có thể thiếu'}
                      </dt>
                      <dd>{current.class_name}</dd>
                      <dt className="text-muted">Điểm rủi ro</dt>
                      <dd className="tabular-nums">{Math.round(current.score)}</dd>
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
                  {current.now && (
                    <>
                      <dt className="text-muted">Nhãn hiện tại</dt>
                      <dd>{current.now.class_name}</dd>
                    </>
                  )}
                  {current.note && (
                    <>
                      <dt className="text-muted">Ghi chú của Reviewer</dt>
                      <dd>{current.note}</dd>
                    </>
                  )}
                  {current.geometry.type === 'bbox' && !fill && (
                    <>
                      <dt className="text-muted">Vị trí (px)</dt>
                      <dd className="tabular-nums">
                        x {Math.round(current.geometry.x)}, y {Math.round(current.geometry.y)},{' '}
                        {Math.round(current.geometry.width)} × {Math.round(current.geometry.height)}
                      </dd>
                    </>
                  )}
                </dl>
                {current.kind !== 'missing' && current.reasons.length > 0 && (
                  <div>
                    <h3 className={`font-semibold ${fill ? 'text-xs' : 'text-sm'}`}>
                      Lý do cảnh báo
                    </h3>
                    <ul
                      className={`mt-1 list-disc space-y-0.5 pl-5 ${fill ? 'text-xs' : 'text-sm'}`}
                    >
                      {current.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {returned && current.now && role !== 'annotator' && (
                  <Link
                    className="text-xs text-accent underline"
                    to={`/projects/${projectId}/review/${encodeURIComponent(current.now.id)}?scope=all`}
                  >
                    Mở nhãn hiện tại trong Review →
                  </Link>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// On the project page once the annotators sent their file back: one way in to check the fixes.
export function RecheckButton({ projectId }: { projectId: string }) {
  const { sent } = useSent(projectId);
  const result = sent?.result;
  const all = result ? [...result.errors, ...result.missing, ...(result.review ?? [])] : [];
  const judged = all.filter((i) => i.verdict).length;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Link
        className="sr-button border-accent bg-accent text-white"
        to={`/projects/${projectId}/fixes`}
        data-testid="recheck"
      >
        Kiểm tra bản sửa{result ? ` · ${judged}/${all.length}` : ''} →
      </Link>
    </div>
  );
}
