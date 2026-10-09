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
export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
    if (response.status === 401) expired();
  }
  return parseResponse<T>(response);
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
