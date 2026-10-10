import { hint } from '../../lib/englishHints';
import { DECISIONS } from '../../../shared/review.ts';
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RiskBadge } from '../../components/RiskBadge';
import { Icon } from '../../components/Icon';
import { confidenceText, objectText, contextLabel } from '../../lib/format';
import { levelText } from './grouping';
import type { ImageGroup } from './grouping';
import type { Case, Review } from '../../types.ts';

const select = 'field min-h-9 rounded-lg px-2 py-1.5 text-xs';
const temporal = (c: Case) => Object.keys(c.context).length > 1;

export function CaseQueue({
  reviewPath = '/review',
  cases,
  total,
  selectedId,
  filters,
  onFilter,
  search,
  onReset,
  reviewedIds,
  reviews,
  groups,
  onGrouping,
}: {
  reviewPath?: string;
  cases: Case[];
  total: number;
  selectedId?: string;
  filters: Record<string, string>;
  onFilter: (key: string, value: string) => void;
  search: string;
  onReset: () => void;
  reviewedIds: string[];
  reviews: Record<string, Review>;
  // Given when the queue is grouped by image.
  groups?: ImageGroup[];
  onGrouping: (grouping: 'image' | 'case') => void;
}) {
  const navigate = useNavigate();
  const to = (c: Case) => ({ pathname: `${reviewPath}/${encodeURIComponent(c.id)}`, search });
  return (
    <aside
      className="flex flex-col overflow-hidden border-b border-line bg-panel lg:min-h-0 lg:border-r lg:border-b-0"
      aria-label={hint('Danh sách risk cases')}
    >
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Hàng đợi kiểm tra</h2>
          <span className="text-xs tabular-nums text-muted">
            {cases.length} / {total}
          </span>
        </div>
        <div
          className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold"
          role="group"
          aria-label="Gom hàng đợi"
        >
          {(
            [
              ['image', 'Theo ảnh'],
              ['case', 'Theo lỗi'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`flex-1 rounded-full py-1 ${(groups ? 'image' : 'case') === value ? 'bg-panel text-accent shadow-sm' : 'text-muted'}`}
              aria-pressed={(groups ? 'image' : 'case') === value}
              onClick={() => onGrouping(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative block">
          <span className="sr-only">{hint('Tìm frame, track hoặc class')}</span>
          <Icon name="search" className="absolute top-2.5 left-2.5 text-muted" />
          <input
            className="field min-h-9 rounded-lg py-1.5 pl-8 text-xs"
            placeholder="Frame, object, media, label…"
            value={filters.q}
            onChange={(e) => onFilter('q', e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select
            className={`${select} col-span-2`}
            aria-label={hint('Phạm vi review')}
            value={filters.scope}
            onChange={(e) => onFilter('scope', e.target.value)}
          >
            <option value="suspicious">{hint('Suspicious cases')}</option>
            <option value="all">{hint('Tất cả annotations')}</option>
          </select>
          <select
            aria-label={hint('Lọc trạng thái review')}
            className={`${select} col-span-2`}
            value={filters.reviewStatus}
            onChange={(e) => onFilter('review', e.target.value)}
          >
            <option value="all">{hint('Mọi trạng thái review')}</option>
            <option value="unreviewed">{hint('Unreviewed')}</option>
            <option value="reviewed">{hint('Reviewed')}</option>
            <option value="ERROR">{hint('Confirmed Error')}</option>
            <option value="CORRECT">{hint('Correct / False Alarm')}</option>
            <option value="UNSURE">{hint('Unsure')}</option>
          </select>
          <select
            className={select}
            aria-label={hint('Lọc mức risk')}
            value={filters.level}
            onChange={(e) => onFilter('level', e.target.value)}
          >
            <option value="all">Mọi severity</option>
            <option value="high">{hint('High · ≥ 70')}</option>
            <option value="medium">{hint('Medium · 40–69')}</option>
            <option value="low">{hint('Low · < 40')}</option>
          </select>
          <select
            aria-label={hint('Sắp xếp case')}
            className={select}
            value={filters.sort}
            onChange={(e) => onFilter('sort', e.target.value)}
          >
            <option value="risk-desc">{hint('Risk ↓')}</option>
            <option value="risk-asc">{hint('Risk ↑')}</option>
            <option value="frame">{hint('Media / frame')}</option>
          </select>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {groups?.map((g) => {
          const open = g.cases.some((c) => c.id === selectedId);
          const top = g.cases.reduce((a, c) => (c.risk_score > a.risk_score ? c : a));
          const done = g.cases.filter((c) => reviewedIds.includes(c.id)).length;
          return (
            <section
              key={g.key}
              className={`border-b border-line px-3 py-2.5 ${open ? 'bg-accent/7 shadow-[inset_3px_0_0_#087f73]' : ''}`}
            >
              <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => navigate(to(g.cases[0]))}
              >
                <span className="truncate text-sm font-semibold">{g.name}</span>
                <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-panel">
                  {g.cases.length}
                </span>
              </button>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  Cao nhất
                  <span className={`font-bold ${levelText[top.risk_level]}`}>{top.risk_score}</span>
                </span>
                <span>
                  đã xem {done}/{g.cases.length}
                </span>
              </div>
              {open ? (
                <div className="mt-2 border-t border-dashed border-line pt-1.5">
                  {g.cases.map((c, i) => (
                    <Link
                      key={c.id}
                      to={to(c)}
                      aria-current={selectedId === c.id ? 'page' : undefined}
                      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs ${selectedId === c.id ? 'bg-accent/15 font-semibold' : 'hover:bg-slate-100'}`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-current text-[10px] font-bold ${levelText[c.risk_level]}`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {c.class_name}
                        {temporal(c) && (
                          <span className="ml-1.5 font-normal text-muted">{contextLabel(c)}</span>
                        )}
                      </span>
                      {reviewedIds.includes(c.id) && (
                        <span
                          className="shrink-0 text-xs font-bold text-accent"
                          title={hint(DECISIONS[reviews[c.id]?.decision ?? ''])}
                        >
                          ✓
                        </span>
                      )}
                      <RiskBadge level={c.risk_level} score={c.risk_score} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.cases.map((c, i) => (
                    <Link
                      key={c.id}
                      to={to(c)}
                      title={`${c.class_name} · ${c.risk_score}`}
                      className={`relative flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] border-current text-[10px] font-bold ${levelText[c.risk_level]} ${reviewedIds.includes(c.id) ? 'bg-current' : ''}`}
                    >
                      <span
                        className={reviewedIds.includes(c.id) ? 'text-panel' : ''}
                        aria-hidden="true"
                      >
                        {reviewedIds.includes(c.id) ? '✓' : i + 1}
                      </span>
                      <span className="sr-only">
                        {hint(`Risk ${c.risk_score}`)} · {c.class_name} · {objectText(c)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!groups &&
          cases.map((c) => (
            <Link
              key={c.id}
              to={to(c)}
              aria-current={selectedId === c.id ? 'page' : undefined}
              className={`block border-b border-line px-3 py-2.5 transition ${selectedId === c.id ? 'bg-accent/7 shadow-[inset_3px_0_0_#087f73]' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <RiskBadge level={c.risk_level} score={c.risk_score} />
                {reviewedIds.includes(c.id) && (
                  <span className="truncate text-[10px] text-accent">
                    ✓ {hint(DECISIONS[reviews[c.id]?.decision ?? ''])}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {c.media_type === 'image' ? c.class_name : hint(`Frame ${c.frame_id}`)}
                </span>
                {typeof c.confidence === 'number' && (
                  <span className="shrink-0 text-[10px] text-muted">
                    Conf {confidenceText(c.confidence, 1)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {temporal(c) ? contextLabel(c) : objectText(c)} · {c.media_name}
              </p>
            </Link>
          ))}
        {cases.length === 0 && (
          <div className="py-10 text-center">
            <p className="mb-3 text-sm text-muted">{hint('Không có case khớp bộ lọc.')}</p>
            <button className="sr-button" onClick={onReset}>
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
