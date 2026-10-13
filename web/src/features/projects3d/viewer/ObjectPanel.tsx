import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '../../../components/Spinner';
import { hint } from '../../../lib/englishHints';
import { request } from '../../../lib/api';
import { DECISIONS } from '../../../../shared/review.ts';
import { Swatch } from './controls';
import { BOX_COLORS } from './colors.ts';
import { FLAG_COLORS, FLAG_NAMES, boxKey } from './flags.ts';
import { cssColor } from './colors.ts';
import type { Flag } from './flags.ts';
import type { Box3D, Scene3D } from './engine.ts';
import type { Review } from '../../../types.ts';

// What can be wrong with a cuboid that exists; a missing object has no cuboid to review.
const ERROR_TYPES_3D: [string, string][] = [
  ['CLASS', 'Class'],
  ['BBOX', 'Cuboid (vị trí, kích thước, hướng)'],
  ['TRACKING', 'Tracking'],
  ['EXTRA_OBJECT', 'Extra Object'],
  ['OTHER', 'Other'],
];
const KNOWN_TYPES = ['VEHICLE', 'PEDESTRIAN', 'CYCLIST', 'SIGN'];
const NOTE_MAX = 500;
const decisionKeys = Object.keys(DECISIONS);
const split = (label: string) => label.match(/^(.*?) \((.*)\)$/)?.slice(1) ?? [label];
const fixed = (values: number[], digits = 2) => values.map((v) => v.toFixed(digits));
const MARK: Record<string, string> = { CORRECT: '✓', UNSURE: '?' };

// Where a cuboid's centre is in the world: its frame's pose (16 numbers, row-major) applied
// to the centre given in vehicle coordinates.
function worldCenter(pose: number[], [x, y, z]: number[]) {
  return [0, 4, 8].map(
    (row) => pose[row] * x + pose[row + 1] * y + pose[row + 2] * z + pose[row + 3],
  );
}
// The object's own speed around this frame, from where its cuboid is in the frames next to it.
function speedOf(scene: Scene3D, frames: number[], index: number, objectId: string) {
  const at = frames.indexOf(index),
    from = frames[Math.max(0, at - 1)],
    to = frames[Math.min(frames.length - 1, at + 1)];
  if (from === to) return null;
  const centre = (i: number) =>
    worldCenter(scene.frames[i].pose, scene.frames[i].boxes.find((b) => b.id === objectId)!.center);
  const a = centre(from),
    b = centre(to);
  const seconds = (scene.frames[to].timestamp - scene.frames[from].timestamp) / 1e6;
  return seconds > 0 ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / seconds : null;
}

function ReviewForm({
  projectId,
  revision,
  timestamp,
  box,
  trackFrames,
  existing,
  onSaved,
  onNext,
}: {
  projectId: string;
  revision: string;
  timestamp: number;
  box: Box3D;
  // In how many frames this object is boxed.
  trackFrames: number;
  existing: Review | null;
  onSaved: (reviews: Record<string, Review>) => void;
  // Moves on to the next cuboid of the frame still without a decision, if there is one.
  onNext: (() => void) | null;
}) {
  const [decision, setDecision] = useState(existing?.decision ?? ''),
    [type, setType] = useState(existing?.error_type ?? 'CLASS'),
    [correction, setCorrection] = useState(existing?.corrected_value ?? ''),
    [note, setNote] = useState(existing?.note ?? ''),
    [whole, setWhole] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body = JSON.stringify({
        dataset_revision: revision,
        decision,
        error_type: decision === 'ERROR' ? type : null,
        corrected_value: decision === 'ERROR' ? correction : null,
        note,
        ...(!whole && existing && { version: existing.version }),
      });
      const object = encodeURIComponent(box.id);
      const result = await request<{ reviews: Record<string, Review> }>(
        whole
          ? `/projects3d/${projectId}/tracks/${object}/review`
          : `/projects3d/${projectId}/boxes/${timestamp}/${object}/review`,
        {
          method: whole || existing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
      );
      onSaved(result.reviews);
      setMessage(
        whole ? `Đã lưu cho ${Object.keys(result.reviews).length} frame.` : 'Đã lưu vào MySQL.',
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function saveAndNext() {
    if (saving || !form.current?.reportValidity()) return;
    if ((await save()) && onNext) onNext();
  }
  const shortcut = useRef(saveAndNext);
  shortcut.current = saveAndNext;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        shortcut.current();
        return;
      }
      const target = e.target as HTMLElement;
      const typing =
        /SELECT|TEXTAREA/.test(target.tagName) ||
        (target instanceof HTMLInputElement && !['radio', 'checkbox'].includes(target.type));
      const key = decisionKeys[Number(e.key) - 1];
      if (key && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) setDecision(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const labels = [...new Set([...KNOWN_TYPES, box.type])].filter((t) => t !== box.type);
  return (
    <section aria-label="Quyết định review" data-testid="review-form">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="text-sm font-semibold">Quyết định</h3>
        {existing ? (
          <p className="text-[11px] text-accent">
            {hint('✓ Reviewed · ')}
            {hint(DECISIONS[existing.decision])} ·{' '}
            {new Date(existing.reviewed_at).toLocaleString('vi-VN')}
          </p>
        ) : (
          <p className="text-[11px] text-muted">chưa review</p>
        )}
      </div>
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset disabled={saving} className="min-w-0 space-y-2">
          <legend className="sr-only">Quyết định review</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(DECISIONS).map(([value, label], i) => {
              const [main, sub] = split(hint(label));
              return (
                <label
                  key={value}
                  className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-1 text-center text-[11px] leading-4 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${decision === value ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent'}`}
                >
                  <input
                    type="radio"
                    name="decision"
                    className="sr-only"
                    aria-label={hint(label)}
                    value={value}
                    checked={decision === value}
                    required
                    onChange={() => setDecision(value)}
                  />
                  {main}
                  <span className="text-[10px] font-normal text-muted" aria-hidden="true">
                    {sub ? `${sub} · ` : ''}
                    {i + 1}
                  </span>
                </label>
              );
            })}
          </div>
          {decision === 'ERROR' && (
            <>
              <label className="block text-[11px] text-muted">
                {hint('Error Type')}
                <select
                  aria-label={hint('Error Type')}
                  className="field mt-1 min-h-9 rounded-lg px-2 py-1 text-xs"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value);
                    setCorrection('');
                  }}
                >
                  {ERROR_TYPES_3D.map(([value, label]) => (
                    <option key={value} value={value}>
                      {hint(label)}
                    </option>
                  ))}
                </select>
              </label>
              {type === 'CLASS' ? (
                <label className="block text-[11px] text-muted">
                  {hint('Correct Label')}
                  <select
                    aria-label={hint('Correct Label')}
                    className="field mt-1 min-h-9 rounded-lg px-2 py-1 text-xs"
                    required
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                  >
                    <option value="">{`hiện tại: ${box.type}`}</option>
                    {labels.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-[11px] text-muted">
                  {hint('Correction (optional)')}
                  <input
                    aria-label={hint('Correction (optional)')}
                    className="field mt-1 min-h-9 rounded-lg px-2 py-1 text-xs"
                    maxLength={1000}
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <div>
            <textarea
              aria-label={hint('Note (optional)')}
              placeholder={hint('Note (optional)')}
              className="field min-h-12 resize-y rounded-lg px-2 py-1.5 text-xs"
              rows={2}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-right text-[10px] text-muted tabular-nums">
              {note.length}/{NOTE_MAX}
            </p>
          </div>
          {trackFrames > 1 && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-teal-600"
                checked={whole}
                onChange={(e) => setWhole(e.target.checked)}
              />
              <span>
                {`Áp dụng cho cả ${trackFrames} frame của đối tượng này`}
                <span className="block text-[11px] text-muted">
                  Ghi đè quyết định đã có ở các frame đó.
                </span>
              </span>
            </label>
          )}
          <div className="flex gap-1.5">
            <button
              className="sr-button min-h-9 flex-1 py-1 text-xs"
              type="submit"
              disabled={!decision || saving}
            >
              {saving && <Spinner />}
              {saving ? 'Đang lưu…' : existing ? hint('Update Review') : hint('Save Review')}
            </button>
            {onNext && (
              <button
                className="sr-button min-h-9 border-accent py-1 text-xs text-accent"
                type="button"
                disabled={!decision || saving}
                onClick={saveAndNext}
              >
                Lưu &amp; tiếp →
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {message && (
        <p role="status" className="mt-2 text-xs text-accent">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}

// The cuboids of the frame on screen, the details of the selected one and its review.
export function ObjectPanel({
  projectId,
  revision,
  scene,
  frameIndex,
  tracks,
  selected,
  onSelect,
  reviews,
  flags,
  onSaved,
  onFocus,
}: {
  projectId: string;
  revision: string;
  scene: Scene3D;
  frameIndex: number;
  // Frame indexes each object is boxed in, in order.
  tracks: Map<string, number[]>;
  selected: string | null;
  onSelect: (objectId: string | null) => void;
  reviews: Record<string, Review>;
  // The flags of the frame on screen: its cuboids reviewed as wrong.
  flags: Flag[];
  onSaved: (reviews: Record<string, Review>) => void;
  onFocus: () => void;
}) {
  const frame = scene.frames[frameIndex];
  const boxes = [...frame.boxes].sort(
    (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id),
  );
  const box = boxes.find((b) => b.id === selected) ?? null;
  const reviewOf = (b: Box3D) => reviews[boxKey(frame.timestamp, b.id)] ?? null;
  const reviewed = boxes.filter(reviewOf).length;
  const frames = box ? (tracks.get(box.id) ?? []) : [];
  const speed = box ? speedOf(scene, frames, frameIndex, box.id) : null;
  const next = box ? boxes.find((b) => b.id !== box.id && !reviewOf(b)) : undefined;
  const pad = (n: number) => String(n).padStart(4, '0');
  return (
    <>
      <section className="border-b border-line pb-4">
        <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
          Cuboid trong frame
          <span
            className="text-xs font-normal text-muted tabular-nums"
            data-testid="frame-progress"
          >
            {reviewed}/{boxes.length} đã review
          </span>
        </h2>
        {boxes.length ? (
          <ul className="max-h-44 overflow-y-auto pr-1" data-testid="box-list">
            {boxes.map((b) => {
              const decision = reviewOf(b)?.decision,
                flag = flags.find((f) => f.objectId === b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-pressed={b.id === selected}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${b.id === selected ? 'bg-accent/10 text-accent' : 'hover:bg-slate-50'}`}
                    onClick={() => onSelect(b.id === selected ? null : b.id)}
                  >
                    <Swatch color={BOX_COLORS[b.type] ?? BOX_COLORS.UNKNOWN} />
                    <span className="font-semibold">{b.type}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{b.id.slice(0, 5)}</span>
                    <span className="text-muted tabular-nums">{b.points} điểm</span>
                    {flag ? (
                      <span
                        className="rounded px-1 text-[11px] font-bold whitespace-nowrap text-white"
                        style={{ background: cssColor(flag.color) }}
                        title={`Cờ ${flag.number}: ${FLAG_NAMES[flag.errorType] ?? flag.errorType}`}
                        data-testid={`flag-${flag.number}`}
                      >
                        {`⚑ ${flag.number}`}
                      </span>
                    ) : (
                      <span
                        className={`w-3 text-center font-bold ${decision === 'CORRECT' ? 'text-accent' : 'text-amber-700'}`}
                        title={decision ? hint(DECISIONS[decision]) : undefined}
                      >
                        {decision ? MARK[decision] : ''}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">Frame này không có cuboid.</p>
        )}
        {flags.length > 0 && (
          <p
            className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted"
            data-testid="flag-legend"
          >
            <span>{`${flags.length} cờ lỗi:`}</span>
            {[...new Set(flags.map((f) => f.errorType))].map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <Swatch color={FLAG_COLORS[type] ?? FLAG_COLORS.OTHER} />
                {FLAG_NAMES[type] ?? type}
              </span>
            ))}
          </p>
        )}
      </section>
      {box ? (
        <>
          <section className="border-b border-line py-4" data-testid="box-details">
            <h2 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
              Chi tiết cuboid
              <span className="flex gap-1.5">
                <button
                  type="button"
                  className="sr-button min-h-7 px-2.5 py-0.5 text-[11px]"
                  onClick={onFocus}
                >
                  Đưa camera tới
                </button>
                <button
                  type="button"
                  className="sr-button min-h-7 px-2.5 py-0.5 text-[11px]"
                  aria-label="Bỏ chọn cuboid"
                  onClick={() => onSelect(null)}
                >
                  ✕
                </button>
              </span>
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-muted">Track ID</dt>
              <dd className="break-all">{box.id}</dd>
              <dt className="text-muted">Loại</dt>
              <dd className="flex items-center gap-1.5">
                <Swatch color={BOX_COLORS[box.type] ?? BOX_COLORS.UNKNOWN} />
                {box.type}
              </dd>
              <dt className="text-muted">Kích thước (m)</dt>
              <dd className="tabular-nums">{fixed(box.size).join(' × ')}</dd>
              <dt className="text-muted">Vị trí (m)</dt>
              <dd className="tabular-nums">{fixed(box.center, 1).join(', ')}</dd>
              <dt className="text-muted">Cách xe</dt>
              <dd className="tabular-nums">
                {Math.hypot(box.center[0], box.center[1]).toFixed(1)} m
              </dd>
              <dt className="text-muted">Hướng (yaw)</dt>
              <dd className="tabular-nums">
                {box.heading.toFixed(2)} rad · {((box.heading * 180) / Math.PI).toFixed(0)}°
              </dd>
              <dt className="text-muted">Điểm trong box</dt>
              <dd className={`tabular-nums ${box.points < 5 ? 'text-amber-700' : ''}`}>
                {box.points}
              </dd>
              <dt className="text-muted">Tốc độ</dt>
              <dd className="tabular-nums">
                {speed === null
                  ? '—'
                  : `${speed.toFixed(1)} m/s · ${(speed * 3.6).toFixed(0)} km/h`}
              </dd>
              <dt className="text-muted">Xuất hiện</dt>
              <dd className="tabular-nums">
                {frames.length} frame ({pad(frames[0])}–{pad(frames[frames.length - 1])})
              </dd>
            </dl>
          </section>
          <div className="pt-4">
            <ReviewForm
              key={boxKey(frame.timestamp, box.id)}
              projectId={projectId}
              revision={revision}
              timestamp={frame.timestamp}
              box={box}
              trackFrames={frames.length}
              existing={reviewOf(box)}
              onSaved={onSaved}
              onNext={next ? () => onSelect(next.id) : null}
            />
          </div>
        </>
      ) : (
        <p className="pt-4 text-sm text-muted" data-testid="box-hint">
          {selected
            ? 'Đối tượng đang chọn không có cuboid ở frame này.'
            : 'Bấm vào một cuboid trong point cloud, hoặc chọn trong danh sách trên, để xem chi tiết và review.'}
        </p>
      )}
    </>
  );
}
