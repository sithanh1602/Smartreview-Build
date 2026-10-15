import React, { useEffect, useRef } from 'react';
import { ISSUE_NAMES } from './flags.ts';
import { Pin } from './Pin.tsx';
import type { Issue, PinLevel } from './flags.ts';
import type { Review } from '../../../types.ts';
import type { Risk3DCase, Risk3DReport } from '../../../../core/risk3d/engine.ts';

export const padFrame = (n: number) => String(n).padStart(4, '0');
const STATUS: Record<string, [string, string]> = {
  ERROR: ['Đã review: lỗi', 'bg-rose-100 text-rose-800'],
  CORRECT: ['Đã review: đúng', 'bg-emerald-100 text-emerald-800'],
  UNSURE: ['Đã review: chưa chắc', 'bg-amber-100 text-amber-800'],
};
// The colour of an issue's pin: red once reviewed as wrong, green once reviewed as right,
// orange or yellow by the engine's risk.
export function issueLevel(issue: Issue, decision?: string): PinLevel {
  if (decision === 'ERROR' || issue.kind === 'review') return 'error';
  if (decision === 'CORRECT') return 'done';
  if (issue.case?.certain) return 'error';
  return issue.case?.severity === 'high' ? 'high' : 'low';
}
const rowClass = (current: boolean) =>
  `flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs ${current ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-slate-50'}`;

// The warnings of one object under one rule, so a cuboid with few points over a whole track is
// one row and not one per frame.
interface WarningGroup {
  objectId: string;
  type: string;
  checkId: string;
  frames: number[];
  reason: string;
}
function groupWarnings(warnings: Risk3DCase[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const w of warnings)
    for (const f of w.findings) {
      const key = `${w.object_id}|${f.check_id}`;
      const group = groups.get(key);
      if (group) group.frames.push(w.frame_index);
      else
        groups.set(key, {
          objectId: w.object_id,
          type: w.type,
          checkId: f.check_id,
          frames: [w.frame_index],
          reason: f.reason,
        });
    }
  return [...groups.values()]
    .map((g) => ({ ...g, frames: [...new Set(g.frames)].sort((a, b) => a - b) }))
    .sort((a, b) => a.frames[0] - b.frames[0] || a.objectId.localeCompare(b.objectId));
}
const WARNING_NAMES: Record<string, string> = {
  'points.sparse': 'Ít điểm LiDAR',
  'track.single_frame': 'Chỉ có ở một frame',
};

// What the reviewer has to look at in the whole segment, by frame: each issue with the number
// its pin carries in the point cloud, and, folded away, what the engine only warns about.
// A row opens its frame with its cuboid selected.
export function RiskQueue({
  report,
  issues,
  calling = null,
  reviews,
  frameIndex,
  selected,
  onOpen,
}: {
  // Null for a project imported before the engine.
  report: Risk3DReport | null;
  issues: Issue[];
  // The issue a hand gesture is calling up: its row is ringed and scrolled to.
  calling?: number | null;
  reviews: Record<string, Review>;
  frameIndex: number;
  selected: string | null;
  onOpen: (frame: number, objectId: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (calling === null) return;
    list.current
      ?.querySelector(`[data-testid="issue-${calling}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [calling]);
  const engineIssues = issues.filter((i) => i.kind !== 'review');
  const decided = engineIssues.filter((i) => i.kind === 'case' && reviews[i.key]).length;
  const cases = engineIssues.filter((i) => i.kind === 'case').length;
  const byFrame = new Map<number, Issue[]>();
  for (const issue of issues) {
    const list = byFrame.get(issue.frame);
    if (list) list.push(issue);
    else byFrame.set(issue.frame, [issue]);
  }
  const frames = [...byFrame.keys()].sort((a, b) => a - b);
  const warnings = report ? groupWarnings(report.warnings) : [];
  return (
    <section className="border-b border-line pb-4" data-testid="risk-queue">
      <h2 className="flex items-baseline justify-between text-sm font-semibold">
        Lỗi cần kiểm tra
        {cases > 0 && (
          <span
            className="text-xs font-normal text-muted tabular-nums"
            data-testid="queue-progress"
          >
            {decided}/{cases} đã review
          </span>
        )}
      </h2>
      {!report ? (
        <p className="mt-1 text-xs text-muted">
          Project này được import trước khi có Risk Engine 3D nên chưa có danh sách lỗi. Import lại
          segment để engine chấm.
        </p>
      ) : issues.length === 0 ? (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-muted">
          Risk Engine không thấy lỗi nào trong segment này.
        </p>
      ) : (
        <>
          <p className="mt-1 mb-2 text-[11px] text-muted">
            Số trên ghim là mã lỗi, giống với ghim trong point cloud. Bấm một lỗi để mở đúng frame
            và cuboid. Lỗi đã review vẫn ở đây, có nhãn "Đã review", để xem lại hay sửa quyết định.
          </p>
          <div ref={list} className="max-h-72 overflow-y-auto pr-1" data-testid="queue-list">
            {frames.map((frame) => {
              const here = frame === frameIndex;
              return (
                <div key={frame} className="mb-1.5">
                  <h3
                    className={`sticky top-0 z-[1] flex items-center gap-2 bg-panel px-1 py-0.5 text-[11px] font-semibold tabular-nums ${here ? 'text-accent' : 'text-muted'}`}
                  >
                    Frame {padFrame(frame)}
                    {here && (
                      <span className="rounded bg-accent/10 px-1.5 font-normal">đang xem</span>
                    )}
                  </h3>
                  <ul>
                    {byFrame.get(frame)!.map((issue) => {
                      const decision = reviews[issue.key]?.decision,
                        level = issueLevel(issue, decision),
                        status = decision ? STATUS[decision] : null,
                        current = here && issue.objectId === selected,
                        called = issue.number === calling;
                      return (
                        <li key={issue.key}>
                          <button
                            type="button"
                            aria-current={current || undefined}
                            className={`${rowClass(current)} ${called ? 'ring-2 ring-amber-400' : ''}`}
                            onClick={() => onOpen(issue.frame, issue.objectId)}
                            data-testid={`issue-${issue.number}`}
                          >
                            {issue.kind === 'gap' ? (
                              <span
                                className="flex h-6 min-w-5 shrink-0 items-center justify-center rounded border border-dashed border-rose-500 px-0.5 text-[10px] font-bold text-rose-700"
                                aria-hidden="true"
                              >
                                {issue.number}
                              </span>
                            ) : (
                              <Pin level={level} number={issue.number} size={18} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5">
                                <span className="font-semibold">
                                  {ISSUE_NAMES[issue.errorType] ?? issue.errorType}
                                </span>
                                {status && (
                                  <span
                                    className={`ml-auto shrink-0 rounded px-1.5 text-[10px] ${status[1]}`}
                                    data-testid={`issue-${issue.number}-reviewed`}
                                  >
                                    {status[0]}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[11px] text-muted">
                                {issue.type} · {issue.objectId.slice(0, 5)}
                                {issue.kind === 'review' && ' · reviewer tìm thấy'}
                              </span>
                              {issue.kind !== 'review' && (
                                <span className="line-clamp-2 text-[11px] text-muted">
                                  {issue.case
                                    ? issue.case.reasons[0]
                                    : issue.gap?.likely_missing
                                      ? `Mất cuboid ở frame này, nhưng chỗ đó vẫn có ${Math.max(...issue.gap.points!)} điểm của vật: gần như chắc thiếu cuboid.`
                                      : issue.gap?.points
                                        ? 'Mất cuboid ở frame này và chỗ đó không còn điểm của vật: có thể vật bị che.'
                                        : 'Đối tượng có ở frame trước và sau nhưng mất cuboid ở frame này.'}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      {warnings.length > 0 && (
        <details className="mt-2" data-testid="queue-warnings">
          <summary className="cursor-pointer text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Pin level="warn" size={10} />
              {`Cảnh báo (không phải lỗi): ${warnings.length} đối tượng`}
            </span>
          </summary>
          <p className="mt-1 mb-1 text-[11px] text-muted">
            Chỗ engine không tự kiểm được, ví dụ cuboid quá ít điểm. Ghim xám, không có số. Nên đối
            chiếu ảnh camera khi đi qua.
          </p>
          <ul className="max-h-48 overflow-y-auto pr-1">
            {warnings.map((w) => {
              const first = w.frames[0],
                last = w.frames[w.frames.length - 1];
              const current = w.frames.includes(frameIndex) && w.objectId === selected;
              return (
                <li key={`${w.objectId}-${w.checkId}`}>
                  <button
                    type="button"
                    aria-current={current || undefined}
                    className={rowClass(current)}
                    title={w.reason}
                    onClick={() =>
                      onOpen(w.frames.includes(frameIndex) ? frameIndex : first, w.objectId)
                    }
                  >
                    <Pin level="warn" size={12} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-semibold">
                          {WARNING_NAMES[w.checkId] ?? w.checkId}
                        </span>
                        <span className="ml-auto tabular-nums text-muted">
                          Frame {padFrame(first)}
                          {last !== first && `–${padFrame(last)}`}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted">
                        {w.type} · {w.objectId.slice(0, 5)}
                        {w.frames.length > 1 && ` · ${w.frames.length} frame`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}

// The issue to open after the one on screen: the next engine case not yet reviewed, in number
// order, wrapping round; null when every case has a decision.
export function nextIssue(issues: Issue[], reviews: Record<string, Review>, key: string | null) {
  const cases = issues.filter((i) => i.kind === 'case');
  const at = cases.findIndex((i) => i.key === key);
  const order = [...cases.slice(at + 1), ...cases.slice(0, Math.max(0, at))];
  return order.find((i) => !reviews[i.key] && i.key !== key) ?? null;
}
