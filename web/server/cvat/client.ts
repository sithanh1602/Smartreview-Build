import { ReviewError } from '../../shared/review.ts';

const authHeader = (token: string) =>
  token.startsWith('Bearer ') || token.startsWith('Token ') ? token : `Token ${token}`;

// CVAT token is a server-side secret: never forward it to the browser.
// One call to the CVAT API; a FormData body goes as multipart, anything else as JSON.
export async function cvatCall(method: string, path: string, body?: unknown): Promise<any> {
  const base = process.env.CVAT_BASE_URL,
    token = process.env.CVAT_TOKEN;
  if (!base || !token) throw new ReviewError(503, 'Thiếu cấu hình CVAT_BASE_URL / CVAT_TOKEN.');
  const form = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method,
      headers: {
        Authorization: authHeader(token),
        Accept: 'application/vnd.cvat+json, application/json;q=0.9',
        ...(body !== undefined && !form && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(form ? 300_000 : 30_000),
    });
  } catch {
    throw new ReviewError(502, 'Không kết nối được CVAT.');
  }
  if (response.status === 401 || response.status === 403)
    throw new ReviewError(502, 'CVAT từ chối token hoặc không có quyền với job này.');
  if (response.status === 404) throw new ReviewError(404, 'Không tìm thấy job CVAT.');
  if (!response.ok) throw new ReviewError(502, `CVAT HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const cvatGet = (path: string) => cvatCall('GET', path);

export async function getCvatFrameImage(jobId: number, frameNumber: number): Promise<Buffer> {
  const base = process.env.CVAT_BASE_URL,
    token = process.env.CVAT_TOKEN;
  if (!base || !token) throw new ReviewError(503, 'Thiếu cấu hình CVAT_BASE_URL / CVAT_TOKEN.');
  let response: Response;
  try {
    response = await fetch(
      new URL(`/api/jobs/${jobId}/data?type=frame&quality=compressed&number=${frameNumber}`, base),
      {
        headers: { Authorization: authHeader(token) },
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
    headers: { Authorization: authHeader(token), 'Content-Type': 'application/json' },
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
