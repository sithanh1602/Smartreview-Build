export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
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
