import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { getDataset, saveReview as sendReview, getReviewState } from '../lib/api';
const DatasetContext = createContext(null);
export function DatasetProvider({ children }) {
  const { projectId } = useParams();
  const prefix = projectId ? `/projects/${projectId}` : '';
  const reviewPath = `${prefix}/review`;
  const [params] = useSearchParams(),
    scope = params.get('scope') === 'all' ? 'all' : 'suspicious';
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState({ loading: true, error: '', data: null });
  const activeRevision = useRef(null);
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
    setState((s) => ({ ...s, data: { ...s.data, ...result } }));
  }
  async function saveDecision(id, values, existing) {
    const revision = state.data.meta.dataset_id;
    const payload = {
      ...values,
      dataset_revision: revision,
      ...(existing ? { version: existing.version } : {}),
    };
    const { review } = await sendReview(id, payload, existing, prefix);
    if (revision === activeRevision.current)
      setState((s) => ({
        ...s,
        data: { ...s.data, reviews: { ...s.data.reviews, [id]: review } },
      }));
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
export function useDataset() {
  return useContext(DatasetContext);
}
