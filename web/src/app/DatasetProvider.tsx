import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { getDataset, saveReview as sendReview, getReviewState } from '../lib/api';
import type { DatasetData, Review, ReviewValues } from '../types.ts';

type State = { loading: boolean; error: string; data: DatasetData | null };
interface DatasetValue extends State {
  scope: 'all' | 'suspicious';
  reviewPath: string;
  projectId: string | undefined;
  reviewedIds: string[];
  saveDecision(
    id: string,
    values: ReviewValues,
    existing: Review | null | undefined,
  ): Promise<{ review: Review; metricsPending: boolean }>;
  refreshReviews(): Promise<void>;
  retry(): void;
}
const DatasetContext = createContext<DatasetValue | null>(null);
// Updates only apply while a dataset is loaded.
const patch = (s: State, change: Partial<DatasetData>): State =>
  s.data ? { ...s, data: { ...s.data, ...change } } : s;
export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams();
  const prefix = projectId ? `/projects/${projectId}` : '';
  const reviewPath = `${prefix}/review`;
  const [params] = useSearchParams(),
    scope = params.get('scope') === 'all' ? 'all' : 'suspicious';
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<State>({ loading: true, error: '', data: null });
  const activeRevision = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    activeRevision.current = null;
    setState({ loading: true, error: '', data: null });
    getDataset(controller.signal, scope, prefix)
      .then((data) => {
        if (controller.signal.aborted) return;
        activeRevision.current = data.meta.dataset_id;
        setState({ loading: false, error: '', data });
      })
      .catch((error) => {
        if (error.name !== 'AbortError')
          setState({ loading: false, error: error.message, data: null });
      });
    return () => controller.abort();
  }, [attempt, scope, prefix]);
  async function refreshReviews() {
    const revision = activeRevision.current,
      result = await getReviewState(prefix);
    if (revision !== activeRevision.current) return;
    if (result.metrics.dataset_revision !== revision)
      throw new Error('Dataset đã thay đổi. Tải lại trang.');
    setState((s) => patch(s, result));
  }
  async function saveDecision(
    id: string,
    values: ReviewValues,
    existing: Review | null | undefined,
  ) {
    if (!state.data) throw new Error('Dataset chưa tải xong.');
    const revision = state.data.meta.dataset_id;
    const payload = {
      ...values,
      dataset_revision: revision,
      ...(existing ? { version: existing.version } : {}),
    };
    const { review } = await sendReview(id, payload, existing, prefix);
    if (revision === activeRevision.current)
      setState((s) => patch(s, { reviews: { ...s.data?.reviews, [id]: review } }));
    let metricsPending = false;
    try {
      await refreshReviews();
    } catch {
      metricsPending = true;
    }
    return { review, metricsPending };
  }
  return (
    <DatasetContext.Provider
      value={{
        ...state,
        scope,
        reviewPath,
        projectId,
        reviewedIds: Object.keys(state.data?.reviews || {}),
        saveDecision,
        refreshReviews,
        retry: () => setAttempt((v) => v + 1),
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
}
// For components rendered inside DataBoundary, which only shows them once data is loaded.
export function useLoadedDataset() {
  const value = useDataset();
  if (!value.data) throw new Error('Dataset chưa tải xong.');
  return { ...value, data: value.data };
}
export function useDataset() {
  const value = useContext(DatasetContext);
  if (!value) throw new Error('useDataset must be used inside DatasetProvider.');
  return value;
}
