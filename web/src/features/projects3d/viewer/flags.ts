import { isBelowLocalGround } from '../../../../core/risk3d/engine.ts';
import type { Box3D } from './engine.ts';
import type { Risk3DCase, Risk3DGap, Risk3DReport } from '../../../../core/risk3d/engine.ts';
import { cssColor } from './colors.ts';

// A flag marks a cuboid that is wrong or may be, drawn as a map pin. Its colour is how sure the
// error is and its number, the same in every frame and list (issuesOf), is how it is called up,
// by raising that many fingers or from the list; what the engine only warns about has none.
// A flag comes from a review that says the cuboid is wrong, or from the 3D Risk Engine. An
// engine flag stays once reviewed, marked as such, so the reviewer can find it and look again.
export interface Flag {
  number?: number;
  objectId: string;
  type: string;
  errorType: string;
  level: PinLevel;
  source: 'review' | 'risk';
  // What the 3D Risk Engine said; on a review flag only if the engine had flagged it too.
  risk?: Risk;
  // The decision of the review the cuboid has, if any.
  reviewed?: string;
}
// Red for an error a review confirmed or the engine is certain of, orange for a high risk, yellow for a medium or low one,
// grey for what the engine only warns about (too few points to check, for one), green for what
// the engine doubted and a review found right.
export type PinLevel = 'error' | 'high' | 'low' | 'warn' | 'done';
export const PIN_LEVELS: PinLevel[] = ['error', 'high', 'low', 'warn', 'done'];
export const PIN_COLORS: Record<PinLevel, number> = {
  error: 0xef4444,
  high: 0xf97316,
  low: 0xfacc15,
  warn: 0x9ca3af,
  done: 0x16a34a,
};
// The number on a yellow or grey pin is dark, white on the others.
export const PIN_TEXT: Record<PinLevel, string> = {
  error: '#ffffff',
  high: '#ffffff',
  low: '#1f2328',
  warn: '#1f2328',
  done: '#ffffff',
};
export const PIN_NAMES: Record<PinLevel, string> = {
  error: 'Lỗi chắc chắn / đã xác nhận',
  high: 'Rủi ro cao',
  low: 'Rủi ro trung bình / thấp',
  warn: 'Cảnh báo',
  done: 'Đã review: đúng',
};
// The pin: a drop with its point at the bottom centre, on a 24 × 32 box.
export const PIN_PATH = 'M12 31C12 31 2 19.5 2 11.5a10 10 0 0 1 20 0C22 19.5 12 31 12 31z';
// The pin as SVG markup, for the point cloud, where labels are plain DOM elements.
export const pinSvg = (flag: Pick<Flag, 'number' | 'level'>) =>
  `<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true">` +
  `<path d="${PIN_PATH}" fill="${cssColor(PIN_COLORS[flag.level])}" stroke="#0d1117" stroke-width="1.5"/>` +
  (flag.number === undefined
    ? ''
    : `<text x="12" y="15.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${flag.number > 99 ? 7 : flag.number > 9 ? 9 : 11}" font-weight="700" fill="${PIN_TEXT[flag.level]}">${flag.number}</text>`) +
  `</svg>`;
export const FLAG_NAMES: Record<string, string> = {
  CLASS: 'Class',
  BBOX: 'Cuboid',
  TRACKING: 'Tracking',
  EXTRA_OBJECT: 'Extra Object',
  OTHER: 'Other',
};
export const SEVERITY_NAMES: Record<string, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
};
// What a flag needs to know of a review.
export interface Verdict {
  decision: string;
  error_type: string | null;
}
// What a flag needs to know of a case of the 3D Risk Engine.
// `warning` marks one the engine only warns about: below its queue, not a case.
export type Risk = Pick<
  Risk3DCase,
  'score' | 'severity' | 'suspected_error' | 'reasons' | 'certain'
> &
  Partial<Pick<Risk3DCase, 'findings'>> & {
    warning?: boolean;
  };
export const boxKey = (timestamp: number, objectId: string) => `${timestamp}:${objectId}`;
// The rules that find a cuboid sunk into the road, over a run of frames.
const SINKING = new Set(['fit.sunk', 'fit.lowered', 'box.below_ground']);
// The cuboids the 3D Risk Engine found sunk, by box key: every cuboid of the object in the run
// of frames a fit.sunk or fit.lowered case covers (evidence.frame_indexes), not only the one
// the case is on. The viewer paints red the part of these below the road.
export function sunkBoxes(
  frames: { timestamp: number; boxes: Box3D[] }[],
  report: Risk3DReport | null,
): Set<string> {
  const keys = new Set<string>();
  // Old/missing reports must not hide a measured penetration already in the scene.
  for (const frame of frames)
    for (const box of frame.boxes)
      if (isBelowLocalGround(box)) keys.add(boxKey(frame.timestamp, box.id));
  for (const c of report?.cases ?? [])
    for (const finding of c.findings) {
      if (!SINKING.has(finding.check_id)) continue;
      const [from, to] = (finding.evidence.frame_indexes as number[] | undefined) ?? [
        c.frame_index,
        c.frame_index,
      ];
      for (let index = from; index <= to; index++) {
        const frame = frames[index];
        if (frame?.boxes.some((b) => b.id === c.object_id))
          keys.add(boxKey(frame.timestamp, c.object_id));
      }
    }
  return keys;
}
// Plain names for what an issue is, for reviewers.
export const ISSUE_NAMES: Record<string, string> = {
  CLASS: 'Sai loại',
  BBOX: 'Cuboid lệch / sai cỡ',
  TRACKING: 'Sai tracking',
  EXTRA_OBJECT: 'Gán thừa',
  OTHER: 'Lỗi khác',
  MISSING: 'Thiếu cuboid',
};
// Something the reviewer has to look at, numbered once for the whole segment: the engine's
// cases and the places a cuboid may be missing, in frame order, then the cuboids reviewed as
// wrong that the engine had not flagged, in the order they were found. A number therefore
// tells the frame: #1 is in the first frame that has anything.
export interface Issue {
  number: number;
  frame: number;
  objectId: string;
  type: string;
  // The box key; for a missing cuboid "gap:<object>:<frame>", as there is no box.
  key: string;
  kind: 'case' | 'gap' | 'review';
  errorType: string;
  case?: Risk3DCase;
  gap?: Risk3DGap;
}
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
export function issuesOf(
  frames: { timestamp: number; boxes: Box3D[] }[],
  report: Risk3DReport | null,
  reviews: Record<string, Verdict>,
): Issue[] {
  const engine: Omit<Issue, 'number'>[] = [
    ...(report?.cases ?? []).map((c) => ({
      frame: c.frame_index,
      objectId: c.object_id,
      type: c.type,
      key: c.id,
      kind: 'case' as const,
      errorType: c.suspected_error ?? 'OTHER',
      case: c,
    })),
    ...(report?.gaps ?? []).map((g) => ({
      frame: g.frame_indexes[0],
      objectId: g.object_id,
      type: g.type,
      key: `gap:${g.object_id}:${g.frame_indexes[0]}`,
      kind: 'gap' as const,
      errorType: 'MISSING',
      gap: g,
    })),
  ];
  // A cuboid that is surely missing ranks with the medium risks; a maybe, last.
  const rank = (i: Omit<Issue, 'number'>) =>
    i.case ? SEVERITY_RANK[i.case.severity] : i.gap?.likely_missing ? 1 : 3;
  engine.sort(
    (a, b) => a.frame - b.frame || rank(a) - rank(b) || a.objectId.localeCompare(b.objectId),
  );
  const known = new Set(engine.map((i) => i.key));
  const frameOf = new Map(frames.map((f, index) => [f.timestamp, index]));
  const found: Omit<Issue, 'number'>[] = [];
  for (const [key, review] of Object.entries(reviews)) {
    if (review.decision !== 'ERROR' || known.has(key)) continue;
    const cut = key.indexOf(':'),
      frame = frameOf.get(Number(key.slice(0, cut)));
    const objectId = key.slice(cut + 1);
    const box = frame === undefined ? null : frames[frame].boxes.find((b) => b.id === objectId);
    if (!box) continue;
    found.push({
      frame: frame!,
      objectId,
      type: box.type,
      key,
      kind: 'review',
      errorType: review.error_type ?? 'OTHER',
    });
  }
  found.sort((a, b) => a.frame - b.frame || a.objectId.localeCompare(b.objectId));
  return [...engine, ...found].map((issue, i) => ({ number: i + 1, ...issue }));
}

// The flags of one frame. With the numbers of issuesOf (by box key) each flag carries its
// number for the whole segment; without them they are numbered from 1 in the order of the
// objects' IDs. A review comes before the engine: wrong gives a review flag, right turns the
// engine's flag green, and unsure leaves it; either way the flag stays, marked reviewed.
export function flagsOf(
  frame: { timestamp: number; boxes: Box3D[] },
  reviews: Record<string, Verdict>,
  risks: Record<string, Risk> = {},
  numbers?: Map<string, number>,
): Flag[] {
  const flags: (Omit<Flag, 'number'> & { key: string })[] = [];
  for (const box of frame.boxes) {
    const key = boxKey(frame.timestamp, box.id),
      decision = reviews[key]?.decision,
      risk = risks[key];
    let source: Flag['source'], errorType: string;
    if (decision === 'ERROR') {
      source = 'review';
      errorType = reviews[key].error_type ?? 'OTHER';
    } else if (risk) {
      source = 'risk';
      errorType = risk.suspected_error ?? 'OTHER';
    } else continue;
    flags.push({
      key,
      objectId: box.id,
      type: box.type,
      errorType,
      level:
        source === 'review'
          ? 'error'
          : decision === 'CORRECT'
            ? 'done'
            : risk!.certain
              ? 'error'
              : risk!.warning
                ? 'warn'
                : risk!.severity === 'high'
                  ? 'high'
                  : 'low',
      source,
      ...(risk && { risk }),
      ...(decision && { reviewed: decision }),
    });
  }
  const sorted = flags.sort((a, b) =>
    a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0,
  );
  if (!numbers) return sorted.map(({ key: _, ...flag }, i) => ({ number: i + 1, ...flag }));
  return sorted
    .map(({ key, ...flag }) => ({ number: numbers.get(key), ...flag }))
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}
