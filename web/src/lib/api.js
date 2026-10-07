async function parseResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error(
      response.status >= 500
        ? `Không kết nối được dịch vụ dữ liệu (HTTP ${response.status}). Kiểm tra backend rồi thử lại.`
        : `Dịch vụ trả về dữ liệu không hợp lệ (HTTP ${response.status}). Hãy thử lại.`,
    );
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}
let refreshPending;
const expired = () => window.dispatchEvent(new Event('smartreview:session-expired'));
export function withSessionLock(fn) {
  return globalThis.navigator?.locks ? navigator.locks.request('smartreview-session', fn) : fn();
}
export async function authRequest(path, data) {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return parseResponse(response);
}
export function refreshSession() {
  if (!refreshPending) {
    refreshPending = withSessionLock(async () => {
      const current = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (current.ok) return parseResponse(current);
      if (current.status !== 401) return parseResponse(current);
      return authRequest('refresh');
    })
      .catch((error) => {
        if (error.status === 401) expired();
        throw error;
      })
      .finally(() => {
        refreshPending = null;
      });
  }
  return refreshPending;
}
export async function request(path, options = {}) {
  let response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin' });
    if (response.status === 401) expired();
  }
  return parseResponse(response);
}
export async function getDataset(signal, scope = 'suspicious', prefix = '') {
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
export async function saveReview(id, payload, existing, prefix = '') {
  return request(`${prefix}/cases/${encodeURIComponent(id)}/review`, {
    method: existing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
export async function getReviewState(prefix = '') {
  const [reviews, metrics] = await Promise.all([
    request(prefix + '/reviews'),
    request(prefix + '/dashboard/metrics'),
  ]);
  return { reviews, metrics };
}
