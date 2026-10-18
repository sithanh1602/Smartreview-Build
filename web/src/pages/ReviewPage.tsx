import { hint } from '../lib/englishHints';
import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { matchesReview } from '../../shared/review.ts';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useLoadedDataset } from '../app/DatasetProvider';
import { DataBoundary } from '../components/DataBoundary';
import { ReviewSummary } from '../components/ReviewSummary';
import { CaseQueue } from '../features/review/CaseQueue';
import { CaseDetail } from '../features/review/CaseDetail';
import { usePanels } from '../features/review/usePanels';
import { groupByImage } from '../features/review/grouping';
import { useAiCheck } from '../features/ai/useAiCheck';
import { LabelCheckButton } from '../features/ai/LabelCheckButton';
import { useProject } from '../features/projects/useProject';
import { CompleteReviewButton, HandoffNotice } from '../features/handoff/CompleteReviewButton';

export type Grouping = 'image' | 'case';
const GROUPING_KEY = 'smartreview-queue-grouping';
function storedGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === 'case' ? 'case' : 'image';
  } catch {
    return 'image';
  }
}
import type { LayoutContext } from '../layouts/AppLayout';
function ReviewWorkspace() {
  const {
    data: { cases, meta, reviews, metrics },
    reviewedIds,
    scope,
    reviewPath,
    projectId,
  } = useLoadedDataset();
  const { caseId } = useParams();
  const headerSlot = useOutletContext<LayoutContext | null>()?.headerSlot;
  const [params, setParams] = useSearchParams();
  const param = (name: string) => params.get(name) ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const level = ['high', 'medium', 'low'].includes(param('level')) ? param('level') : 'all';
  const q = params.get('q') || '';
  const normalized = q.trim().toLowerCase();
  const reviewStatus = ['unreviewed', 'reviewed', 'ERROR', 'CORRECT', 'UNSURE'].includes(
    param('review'),
  )
    ? param('review')
    : 'all';
  const sort = ['risk-asc', 'frame'].includes(param('sort')) ? param('sort') : 'risk-desc';
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
  const panels = usePanels();
  const [grouping, setGrouping] = useState<Grouping>(storedGrouping);
  const [wholeImage, setWholeImage] = useState(false);
  const ai = useAiCheck(projectId),
    project = useProject(projectId),
    leader = project.data?.my_role === 'leader',
    // Decisions are locked only while the annotators have the review.
    handoff = project.data?.handoff?.status === 'SENT' ? project.data.handoff : null;
  const [aiShown, setAiShown] = useState(true);
  const groups = groupByImage(filtered);
  // Grouped, an image's cases follow one another; otherwise the plain sorted list is used.
  const ordered = grouping === 'image' ? groups.flatMap((g) => g.cases) : filtered;
  const exists = cases.some((c) => c.id === caseId);
  const selected = ordered.find((c) => c.id === caseId);
  const index = ordered.findIndex((c) => c.id === caseId);
  const groupIndex = groups.findIndex((g) => g.cases.some((c) => c.id === caseId));
  // Without a case there is no toolbar to bring the queue back, so it stays.
  const queueShown = panels.shown.queue || !selected;
  const open = useCallback(
    (id?: string) => {
      if (id)
        navigate({
          pathname: `${reviewPath}/${encodeURIComponent(id)}`,
          search: location.search,
        });
    },
    [navigate, location.search, reviewPath],
  );
  const move = useCallback(
    (delta: number) => open(ordered[index + delta]?.id),
    [ordered, index, open],
  );
  const moveImage = useCallback(
    (delta: number) => open(groups[groupIndex + delta]?.cases[0].id),
    [groups, groupIndex, open],
  );
  function chooseGrouping(next: Grouping) {
    setGrouping(next);
    try {
      localStorage.setItem(GROUPING_KEY, next);
    } catch {
      // The choice still applies to this page.
    }
  }
  function setFilter(name: string, value: string) {
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
  // The finding for this annotation: from the project's latest AI result while the button is
  // on, or the one the AI Check page handed over.
  const aiFinding =
    (aiShown &&
      ai.report?.status === 'READY' &&
      ai.report.dataset_revision === meta.dataset_id &&
      ai.report.findings.find((f) => f.annotation_id === selected?.id)) ||
    (location.state?.aiRevision === meta.dataset_id &&
    location.state?.aiFinding?.annotation_id === selected?.id
      ? location.state.aiFinding
      : undefined);
  if (filtered.length && (!caseId || (exists && !selected)))
    return (
      <Navigate
        replace
        to={{
          pathname: `${reviewPath}/${encodeURIComponent(ordered[0].id)}`,
          search: location.search,
        }}
      />
    );
  return (
    <main
      className={`grid lg:min-h-0 lg:flex-1 ${queueShown ? 'lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)]'}`}
    >
      {headerSlot &&
        createPortal(
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h1 className="flex max-w-md min-w-0 items-baseline gap-2 text-xs font-semibold">
              <span className="truncate" title={meta.project_name || meta.name}>
                {meta.project_name || meta.name}
              </span>
              <span className="shrink-0 font-normal whitespace-nowrap text-muted max-2xl:hidden">
                {meta.frame_count} frames · {meta.total_annotations} annotations
              </span>
            </h1>
            <ReviewSummary compact />
          </div>,
          headerSlot,
        )}
      <div className={queueShown ? 'contents' : 'hidden'}>
        <CaseQueue
          reviewPath={reviewPath}
          cases={ordered}
          groups={grouping === 'image' ? groups : undefined}
          onGrouping={chooseGrouping}
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
          footer={
            project.data && handoff && <HandoffNotice handoff={handoff} className="text-xs" />
          }
        />
      </div>
      {selected ? (
        <CaseDetail
          key={selected.id}
          item={selected}
          guideline={meta.guideline}
          aiFinding={aiFinding}
          locked={Boolean(handoff)}
          finish={
            // Offered on the last case of the queue, where "save and next" has nowhere to go.
            project.data && !handoff && index === ordered.length - 1 ? (
              <CompleteReviewButton
                project={project.data}
                metrics={metrics}
                onSent={project.retry}
                className="sr-button min-h-9 w-full border-accent bg-accent py-1.5 text-white hover:bg-accent/90"
              />
            ) : undefined
          }
          aiButton={
            projectId && (
              <LabelCheckButton
                ai={ai}
                leader={leader}
                shown={aiShown}
                onShown={setAiShown}
                count={aiFinding ? 1 : 0}
                className="sr-button min-h-8 px-3 py-1 text-xs"
              />
            )
          }
          index={index}
          count={ordered.length}
          onNavigate={move}
          siblings={groups[groupIndex]?.cases ?? [selected]}
          imageIndex={groupIndex}
          imageCount={groups.length}
          onNavigateImage={moveImage}
          onOpenCase={open}
          wholeImage={wholeImage}
          onWholeImage={setWholeImage}
          panels={panels}
        />
      ) : (
        <section className="p-12 text-center">
          <h2 className="text-lg font-medium">
            {hint(caseId && !exists ? 'Không tìm thấy case này' : 'Không có case để hiển thị')}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {caseId && !exists
              ? 'Case có thể đã thay đổi sau khi chạy lại Risk Engine.'
              : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'}
          </p>
          <Link className="sr-button mt-6" to={reviewPath}>
            {hint('Về hàng đợi review')}
          </Link>
        </section>
      )}
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
