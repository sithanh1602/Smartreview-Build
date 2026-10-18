import { ReviewError } from '../../shared/review.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Risk3DReport, Scene } from '../../core/risk3d/engine.ts';
import type { Review } from '../reviews/store.ts';
import type { Verdict } from '../projects/handoff.ts';

// The 3D counterpart of the 2D handoff (projects/handoff.ts): the reviewer sends the cuboids
// confirmed as wrong to annotators, who fix them in their own tool, mark each one fixed and send
// the round back; the reviewer then accepts or rejects each item. No fixed file comes back, so
// nothing is compared: the annotator says what was done.

// One object to fix: a cuboid in one frame, or the same object over the frames where it got
// the same decision (a whole object reviewed at once is one item, not hundreds).
export interface Handoff3DItem {
  // The first box key ("<timestamp>:<object id>") of the item.
  id: string;
  object_id: string;
  type: string;
  // Frame indexes in the scene, in order, and the box keys of those frames.
  frames: number[];
  keys: string[];
  status: 'ERROR' | 'UNSURE' | 'UNREVIEWED';
  error_type: string | null;
  corrected_value: string | null;
  note: string | null;
  // The highest Risk Engine score over the frames, and its reasons there.
  score: number;
  reasons: string[];
}
export interface Handoff3DReport {
  project: { id: string; name: string };
  dataset_revision: string;
  segment: string;
  errors: Handoff3DItem[];
  review: Handoff3DItem[];
}
export interface Handoff3DChecked extends Handoff3DItem {
  // What the annotator said: fixed or not, and why.
  fixed: boolean;
  answer: string | null;
  verdict?: Verdict;
}
export interface Handoff3DResult {
  dataset_revision: string;
  note: string;
  errors: Handoff3DChecked[];
  review: Handoff3DChecked[];
}
// Counts for the send dialog, as the 2D dashboard gives them.
export interface Handoff3DMetrics {
  confirmed_errors: number;
  unsure: number;
  unreviewed: number;
}

const byKey = (key: string) => {
  const at = key.indexOf(':');
  return { timestamp: Number(key.slice(0, at)), object: key.slice(at + 1) };
};

export function buildReport3D(
  project: { id: string; name: string },
  revision: string,
  scene: Scene,
  reviews: Record<string, Review>,
  risk: Risk3DReport | null,
  { review: withReview = false }: { review?: boolean } = {},
): Handoff3DReport {
  const frames = new Map(scene.frames.map((f, i) => [f.timestamp, { index: i, frame: f }]));
  const cases = new Map((risk?.cases ?? []).map((c) => [c.id, c]));
  // Box keys grouped by object and by what was decided on them.
  const groups = new Map<string, { status: Handoff3DItem['status']; keys: string[] }>();
  const add = (key: string, status: Handoff3DItem['status'], r?: Review) => {
    const { object } = byKey(key);
    const group = JSON.stringify([object, status, r?.error_type, r?.corrected_value, r?.note]);
    if (!groups.has(group)) groups.set(group, { status, keys: [] });
    groups.get(group)!.keys.push(key);
  };
  for (const [key, r] of Object.entries(reviews))
    if (
      frames.has(byKey(key).timestamp) &&
      (r.decision === 'ERROR' || (withReview && r.decision === 'UNSURE'))
    )
      add(key, r.decision as Handoff3DItem['status'], r);
  if (withReview)
    for (const c of cases.values())
      if (!reviews[c.id] && frames.has(c.timestamp)) add(c.id, 'UNREVIEWED');
  const items = [...groups.values()].map(({ status, keys }): Handoff3DItem => {
    const placed = keys
      .map((key) => ({ key, ...byKey(key) }))
      .sort((a, b) => frames.get(a.timestamp)!.index - frames.get(b.timestamp)!.index);
    const first = placed[0],
      r = reviews[first.key];
    const box = frames.get(first.timestamp)!.frame.boxes.find((b) => b.id === first.object);
    const worst = placed
      .map((p) => cases.get(p.key))
      .filter((c) => !!c)
      .sort((a, b) => b.score - a.score)[0];
    return {
      id: first.key,
      object_id: first.object,
      type: box?.type ?? worst?.type ?? 'UNKNOWN',
      frames: placed.map((p) => frames.get(p.timestamp)!.index),
      keys: placed.map((p) => p.key),
      status,
      error_type: r?.error_type ?? null,
      corrected_value: r?.corrected_value ?? null,
      note: r?.note ?? null,
      score: worst?.score ?? 0,
      reasons: worst?.reasons ?? [],
    };
  });
  const order = (a: Handoff3DItem, b: Handoff3DItem) =>
    a.frames[0] - b.frames[0] || a.object_id.localeCompare(b.object_id);
  return {
    project,
    dataset_revision: revision,
    segment: scene.segment,
    errors: items.filter((i) => i.status === 'ERROR').sort(order),
    review: items.filter((i) => i.status !== 'ERROR').sort(order),
  };
}

export function metrics3D(
  reviews: Record<string, Review>,
  risk: Risk3DReport | null,
): Handoff3DMetrics {
  const decisions = Object.values(reviews);
  return {
    confirmed_errors: decisions.filter((r) => r.decision === 'ERROR').length,
    unsure: decisions.filter((r) => r.decision === 'UNSURE').length,
    unreviewed: (risk?.cases ?? []).filter((c) => !reviews[c.id]).length,
  };
}

// What the annotator sent back: the items they fixed, a word on any item, and a note.
export function returnRound(report: Handoff3DReport, input: Untrusted): Handoff3DResult {
  const fixed: unknown = input?.fixed,
    answers: unknown = input?.answers ?? {},
    note: unknown = input?.note ?? '';
  if (!Array.isArray(fixed) || fixed.some((id) => typeof id !== 'string'))
    throw new ReviewError(400, 'fixed phải là danh sách id.');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers))
    throw new ReviewError(400, 'answers phải là object.');
  if (typeof note !== 'string' || note.length > 1000)
    throw new ReviewError(400, 'Ghi chú tối đa 1000 ký tự.');
  const ids = new Set([...report.errors, ...report.review].map((i) => i.id));
  if (fixed.some((id) => !ids.has(id))) throw new ReviewError(400, 'Có id không thuộc lượt gửi.');
  const said = answers as Record<string, unknown>;
  const check = (item: Handoff3DItem): Handoff3DChecked => {
    const answer = said[item.id];
    if (answer !== undefined && (typeof answer !== 'string' || answer.length > 500))
      throw new ReviewError(400, 'Ghi chú mỗi mục tối đa 500 ký tự.');
    return {
      ...item,
      fixed: fixed.includes(item.id),
      answer: typeof answer === 'string' && answer.trim() ? answer.trim() : null,
    };
  };
  return {
    dataset_revision: report.dataset_revision,
    note: note.trim(),
    errors: report.errors.map(check),
    review: report.review.map(check),
  };
}

// A reviewer's verdict on one item of a returned round.
export function judge(result: Handoff3DResult, input: Untrusted, by: string): Handoff3DResult {
  const { id, value, note = null } = (input ?? {}) as Record<string, unknown>;
  if (value !== 'accept' && value !== 'reject' && value !== null)
    throw new ReviewError(400, 'value phải là accept, reject hoặc null.');
  if (note !== null && (typeof note !== 'string' || note.length > 500))
    throw new ReviewError(400, 'Ghi chú tối đa 500 ký tự.');
  let found = false;
  const mark = (item: Handoff3DChecked): Handoff3DChecked => {
    if (item.id !== id) return item;
    found = true;
    const { verdict: _old, ...rest } = item;
    return value
      ? {
          ...rest,
          verdict: {
            value: value as Verdict['value'],
            note: typeof note === 'string' && note.trim() ? note.trim() : null,
            by,
            at: new Date().toISOString(),
          },
        }
      : rest;
  };
  const next = { ...result, errors: result.errors.map(mark), review: result.review.map(mark) };
  if (!found) throw new ReviewError(404, 'Không có mục này trong lượt gửi lại.');
  return next;
}
