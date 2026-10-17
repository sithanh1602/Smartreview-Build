import { ReviewError } from '../../shared/review.ts';

// CVAT token is a server-side secret: never forward it to the browser.
async function cvatGet(path: string): Promise<unknown> {
  const base = process.env.CVAT_BASE_URL,
    token = process.env.CVAT_TOKEN;
  if (!base || !token) throw new ReviewError(503, 'Thiếu cấu hình CVAT_BASE_URL / CVAT_TOKEN.');
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.cvat+json, application/json;q=0.9',
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ReviewError(502, 'Không kết nối được CVAT.');
  }
  if (response.status === 401 || response.status === 403)
    throw new ReviewError(502, 'CVAT từ chối token hoặc không có quyền với job này.');
  if (response.status === 404) throw new ReviewError(404, 'Không tìm thấy job CVAT.');
  if (!response.ok) throw new ReviewError(502, `CVAT HTTP ${response.status}`);
  return response.json();
}

export async function getCvatFrameImage(jobId: number, frameNumber: number): Promise<Buffer> {
  const base = process.env.CVAT_BASE_URL,
    token = process.env.CVAT_TOKEN;
  if (!base || !token) throw new ReviewError(503, 'Thiếu cấu hình CVAT_BASE_URL / CVAT_TOKEN.');
  let response: Response;
  try {
    response = await fetch(
      new URL(`/api/jobs/${jobId}/data?type=frame&quality=compressed&number=${frameNumber}`, base),
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new ReviewError(502, 'Không kết nối được CVAT.');
  }
  if (!response.ok) throw new ReviewError(502, `CVAT frame image HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function createCvatShapes(jobId: number, shapes: Record<string, unknown>[]) {
  const base = process.env.CVAT_BASE_URL,
    token = process.env.CVAT_TOKEN;
  if (!base || !token) throw new ReviewError(503, 'Thiếu cấu hình CVAT_BASE_URL / CVAT_TOKEN.');
  const response = await fetch(new URL(`/api/jobs/${jobId}/annotations?action=create`, base), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 0, tags: [], tracks: [], shapes }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new ReviewError(502, `CVAT ghi annotation HTTP ${response.status}: ${await response.text()}`);
}
export const getCvatJob = (id: number) => cvatGet(`/api/jobs/${id}`);
export const getCvatAnnotations = (id: number) => cvatGet(`/api/jobs/${id}/annotations`);
export const getCvatMeta = (id: number) => cvatGet(`/api/jobs/${id}/data/meta`);
export async function getCvatLabels(id: number): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page < 50; page++) {
    const r = (await cvatGet(`/api/labels?job_id=${id}&page=${page}&page_size=100`)) as any;
    out.push(...(r.results ?? []));
    if (!r.next) break;
  }
  return out;
}
export async function loadCvatJob(id: number) {
  const [job, meta, labels, annotations] = await Promise.all([
    getCvatJob(id),
    getCvatMeta(id),
    getCvatLabels(id),
    getCvatAnnotations(id),
  ]);
  return { job, meta, labels, annotations } as {
    job: Record<string, any>;
    meta: Record<string, any>;
    labels: Record<string, any>[];
    annotations: Record<string, any>;
  };
}
