import { hint } from '../../lib/englishHints';
import { DECISIONS } from '../../../shared/review.mjs';
import React from 'react';
import { Link } from 'react-router-dom';
import { RiskBadge } from '../../components/RiskBadge';
import { Icon } from '../../components/Icon';
import { confidenceText, objectText, contextLabel } from '../../lib/format';
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
}) {
  return (
    <aside
      className="panel flex max-h-[900px] flex-col overflow-hidden lg:sticky lg:top-5 lg:min-h-[720px]"
      aria-label={hint('Danh sách risk cases')}
    >
      <div className="border-b border-line p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow mb-1">{hint('REVIEW QUEUE')}</p>
            <h2 className="font-semibold">Hàng đợi kiểm tra</h2>
          </div>
          <span className="rounded-none bg-slate-100 px-2 py-1 text-xs text-muted">
            {cases.length} / {total}
          </span>
        </div>
        <label className="relative mb-3 block">
          <span className="sr-only">{hint('Tìm frame, track hoặc class')}</span>
          <Icon name="search" className="absolute top-3 left-3 text-muted" />
          <input
            className="field pl-9"
            placeholder={hint('Frame, object, media, label…')}
            value={filters.q}
            onChange={(e) => onFilter('q', e.target.value)}
          />
        </label>
        <label className="mb-3 block">
          <span className="sr-only">{hint('Phạm vi review')}</span>
          <select
            className="field"
            aria-label={hint('Phạm vi review')}
            value={filters.scope}
            onChange={(e) => onFilter('scope', e.target.value)}
          >
            <option value="suspicious">{hint('Suspicious cases')}</option>
            <option value="all">{hint('Tất cả annotations')}</option>
          </select>
        </label>
        <select
          aria-label={hint('Lọc trạng thái review')}
          className="field mb-3 text-xs"
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
        <div className="grid grid-cols-2 gap-2">
          <select
            className="field text-xs"
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
            className="field text-xs"
            value={filters.sort}
            onChange={(e) => onFilter('sort', e.target.value)}
          >
            <option value="risk-desc">{hint('Risk ↓')}</option>
            <option value="risk-asc">{hint('Risk ↑')}</option>
            <option value="frame">{hint('Media / frame')}</option>
          </select>
        </div>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-[680px] lg:flex-1">
        {cases.map((c) => (
          <Link
            key={c.id}
            to={{
              pathname: `${reviewPath}/${encodeURIComponent(c.id)}`,
              search,
            }}
            aria-current={selectedId === c.id ? 'page' : undefined}
            className={`block rounded-none border p-3.5 transition ${selectedId === c.id ? 'border-accent/45 bg-accent/7 shadow-[inset_3px_0_0_#087f73]' : 'border-transparent bg-slate-50 hover:border-line hover:bg-slate-100'}`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <RiskBadge level={c.risk_level} score={c.risk_score} />
              {reviewedIds.includes(c.id) && (
                <span className="text-[10px] text-accent">
                  ✓ {hint(DECISIONS[reviews[c.id]?.decision])}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {c.media_type === 'image' ? c.class_name : hint(`Frame ${c.frame_id}`)}
              </span>
              <span className="text-[10px] text-muted">
                {confidenceText(c.confidence, 1)} confidence (độ tin cậy)
              </span>
            </div>
            <p className="mt-1.5 truncate text-[11px] text-slate-700">{objectText(c)}</p>
            <p className="mt-1 truncate text-[10px] text-muted">
              {c.media_name} · F{c.frame_id}
            </p>
            <p className="mt-2 truncate border-t border-line pt-2 text-xs text-muted">
              {contextLabel(c)}
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
      <div className="border-t border-line p-4 text-[10px] leading-5 text-muted">
        {hint('Risk là mức ưu tiên kiểm tra.')}
        <br />
        {hint('Reviewed có quyết định được lưu trong MySQL.')}
      </div>
    </aside>
  );
}
