import type { ApiError, DatasetData, Metrics, Review, ReviewValues, User } from '../types.ts';

type Session = { user: User };
// Responses are JSON documents; callers name the shape they asked for.
async function parseResponse<T = any>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    const error: ApiError = new Error(
      response.status >= 500
        ? `Không kết nối được dịch vụ dữ liệu (HTTP ${response.status}). Kiểm tra backend rồi thử lại.`
        : `Dịch vụ trả về dữ liệu không hợp lệ (HTTP ${response.status}). Hãy thử lại.`,
    );
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error: ApiError = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}
let refreshPending: Promise<Session> | null = null;
const expired = () => window.dispatchEvent(new Event('smartreview:session-expired'));
export function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  return globalThis.navigator?.locks
    ? (navigator.locks.request('smartreview-session', fn) as Promise<T>)
    : fn();
}
export async function authRequest<T = Session>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return parseResponse<T>(response);
}
export function refreshSession() {
  if (!refreshPending) {
    refreshPending = withSessionLock(async () => {
      const current = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (current.ok) return parseResponse<Session>(current);
      if (current.status !== 401) return parseResponse<Session>(current);
      return authRequest('refresh');
    })
      .catch((error: ApiError) => {
        if (error.status === 401) expired();
        throw error;
      })
      .finally(() => {
        refreshPending = null;
      });
  }
  return refreshPending;
}
// The last answer to each GET, kept so that re-rendering the pages in another language shows
// the data already on screen instead of asking for it again. Any write empties it, because the
// answers may no longer be true.
const MAX_ANSWERS = 200;
const answers = new Map<string, unknown>();
let reusable: Map<string, unknown> | null = null;
export function reuseAnswers(milliseconds = 3000) {
  const snapshot = new Map(answers);
  reusable = snapshot;
  setTimeout(() => {
    if (reusable === snapshot) reusable = null;
  }, milliseconds);
}
export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const reading = !options.method || options.method === 'GET';
  if (!reading) {
    answers.clear();
    reusable = null;
  } else if (reusable?.has(path)) return structuredClone(reusable.get(path)) as T;
  let response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
    if (response.status === 401) expired();
  }
  const data = await parseResponse<T>(response);
  if (reading) {
    answers.delete(path);
    answers.set(path, data);
    if (answers.size > MAX_ANSWERS) answers.delete(answers.keys().next().value!);
  }
  return data;
}
export async function getDataset(
  signal: AbortSignal,
  scope = 'suspicious',
  prefix = '',
): Promise<DatasetData> {
  const [meta, cases, reviews, metrics] = await Promise.all([
    request(prefix + '/meta', { signal }),
    request(`${prefix}/cases?scope=${scope}`, { signal }),
    request(prefix + '/reviews', { signal }),
    request(prefix + '/dashboard/metrics', { signal }),
  ]);
  if (meta.dataset_id !== metrics.dataset_revision)
    throw new Error('Dataset đã thay đổi khi tải. Hãy thử lại.');
  return { meta, cases, reviews, metrics };
}
export async function saveReview(
  id: string,
  payload: ReviewValues & { dataset_revision: string; version?: number },
  existing: Review | null | undefined,
  prefix = '',
) {
  return request<{ review: Review }>(`${prefix}/cases/${encodeURIComponent(id)}/review`, {
    method: existing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
export async function getReviewState(prefix = '') {
  const [reviews, metrics] = await Promise.all([
    request<Record<string, Review>>(prefix + '/reviews'),
    request<Metrics>(prefix + '/dashboard/metrics'),
  ]);
  return { reviews, metrics };
}
