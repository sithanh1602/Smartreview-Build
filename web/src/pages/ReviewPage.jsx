import { hint } from '../lib/englishHints';
import React, { useCallback } from 'react';
import { matchesReview } from '../../shared/review.mjs';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useDataset } from '../app/DatasetProvider';
import { DataBoundary } from '../components/DataBoundary';
import { ReviewSummary } from '../components/ReviewSummary';
import { CaseQueue } from '../features/review/CaseQueue';
import { CaseDetail } from '../features/review/CaseDetail';
function ReviewWorkspace() {
  const {
    data: { cases, meta, reviews },
    reviewedIds,
    scope,
    reviewPath,
  } = useDataset();
  const { caseId } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const level = ['high', 'medium', 'low'].includes(params.get('level'))
    ? params.get('level')
    : 'all';
  const q = params.get('q') || '';
  const normalized = q.trim().toLowerCase();
  const reviewStatus = ['unreviewed', 'reviewed', 'ERROR', 'CORRECT', 'UNSURE'].includes(
    params.get('review'),
  )
    ? params.get('review')
    : 'all';
  const sort = ['risk-asc', 'frame'].includes(params.get('sort'))
    ? params.get('sort')
    : 'risk-desc';
  const filtered = cases.filter(
    (c) =>
      (level === 'all' || c.risk_level === level) &&
      matchesReview(reviews[c.id], reviewStatus) &&
      (!normalized ||
        `frame ${c.frame_id} track ${c.track_id ?? ''} object ${c.object_id ?? c.id} ${c.media_name} ${c.class_name}`
          .toLowerCase()
          .includes(normalized)),
  );
  filtered.sort((a, b) =>
    sort === 'frame'
      ? a.media_name.localeCompare(b.media_name) || a.frame_id - b.frame_id
      : sort === 'risk-asc'
        ? a.score - b.score
        : b.score - a.score,
  );
  const exists = cases.some((c) => c.id === caseId);
  const selected = filtered.find((c) => c.id === caseId);
  const index = filtered.findIndex((c) => c.id === caseId);
  const move = useCallback(
    (delta) => {
      const target = filtered[index + delta];
      if (target)
        navigate({
          pathname: `${reviewPath}/${encodeURIComponent(target.id)}`,
          search: location.search,
        });
    },
    [filtered, index, navigate, location.search, reviewPath],
  );
  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    if (
      !value ||
      (name === 'level' && value === 'all') ||
      (name === 'scope' && value === 'suspicious')
    )
      next.delete(name);
    else next.set(name, value);
    if (name === 'scope')
      navigate(
        {
          pathname: reviewPath,
          search: next.toString(),
        },
        {
          replace: true,
        },
      );
    else
      setParams(next, {
        replace: true,
      });
  }
  if (filtered.length && (!caseId || (exists && !selected)))
    return (
      <Navigate
        replace
        to={{
          pathname: `${reviewPath}/${encodeURIComponent(filtered[0].id)}`,
          search: location.search,
        }}
      />
    );
  return (
    <main className="mx-auto max-w-[1920px] px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 text-accent">{hint('QUALITY REVIEW / WORKSPACE')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {hint('Annotation quality review.')}
          </h1>
          <p className="mt-2 text-xs text-muted">
            {meta.project_name || meta.name} <span className="mx-2 text-slate-600">/</span>{' '}
            {meta.frame_count}
            {hint(' frames')}
            <span className="mx-2 text-slate-600">/</span> {meta.total_annotations}
            {hint(' annotations')}
          </p>
        </div>
        <p className="text-[11px] text-muted">
          <span className="rounded-none border border-line px-1.5 py-1">←</span>{' '}
          <span className="rounded-none border border-line px-1.5 py-1">→</span>
          <span className="ml-2">{hint('Chuyển case')}</span>
        </p>
      </div>
      <ReviewSummary />
      <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <CaseQueue
          reviewPath={reviewPath}
          cases={filtered}
          total={cases.length}
          selectedId={selected?.id}
          filters={{
            level,
            q,
            sort,
            scope,
            reviewStatus,
          }}
          reviews={reviews}
          reviewedIds={reviewedIds}
          onFilter={setFilter}
          search={location.search}
          onReset={() => setParams({})}
        />
        {selected ? (
          <CaseDetail
            key={selected.id}
            item={selected}
            aiFinding={
              location.state?.aiRevision === meta.dataset_id &&
              location.state?.aiFinding?.annotation_id === selected.id
                ? location.state.aiFinding
                : undefined
            }
            meta={meta}
            index={index}
            count={filtered.length}
            onNavigate={move}
          />
        ) : (
          <section className="panel p-12 text-center">
            <h2 className="text-lg font-medium">
              {hint(caseId && !exists ? 'Không tìm thấy case này' : 'Không có case để hiển thị')}
            </h2>
            <p className="mt-3 text-sm text-muted">
              {caseId && !exists
                ? 'Case có thể đã thay đổi sau khi chạy lại Risk Engine.'
                : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'}
            </p>
            <Link className="button mt-6" to={reviewPath}>
              {hint('Về hàng đợi review')}
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
export function ReviewPage() {
  return (
    <DataBoundary>
      <ReviewWorkspace />
    </DataBoundary>
  );
}
