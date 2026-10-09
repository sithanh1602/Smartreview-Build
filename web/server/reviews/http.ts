import { ReviewError, validateReview } from '../../shared/review.ts';
import type { ReviewStore } from './store.ts';
import type { Json, LoadedDataset, Req, Res } from '../types.ts';

async function body(req: Req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json'))
    throw new ReviewError(415, 'Content-Type must be application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 32768) chunks.push(chunk);
  }
  if (size > 32768) throw new ReviewError(413, 'Review request too large.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ReviewError(400, 'Invalid JSON.');
  }
}
export async function handleReview(
  req: Req,
  res: Res,
  p: string,
  {
    dataset,
    reviews,
    json,
  }: { dataset?: LoadedDataset | null; reviews?: ReviewStore | null; json: Json },
) {
  const match = p.match(/^\/api\/cases\/([^/]+)\/review$/);
  if (p !== '/api/dashboard/metrics' && p !== '/api/reviews' && !match) return false;
  if (!reviews) throw new ReviewError(503, 'Review database unavailable.');
  if (p === '/api/dashboard/metrics' || p === '/api/reviews') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, p === '/api/reviews' ? await reviews.list() : await reviews.metrics());
    return true;
  }
  let id: string;
  try {
    id = decodeURIComponent(match![1]);
  } catch {
    throw new ReviewError(400, 'Invalid case ID.');
  }
  // Review routes are only dispatched for a loaded dataset (reviews exists only with one).
  const loaded = dataset as LoadedDataset;
  const item = loaded.allCases.find((c) => c.id === id);
  if (!item) throw new ReviewError(404, 'Case not found.');
  if (req.method === 'GET') {
    json(res, 200, { review: await reviews.read(id) });
    return true;
  }
  if (!['POST', 'PUT'].includes(req.method)) throw new ReviewError(405, 'Use GET, POST or PUT.');
  if (req.headers.origin) {
    let origin;
    try {
      origin = new URL(req.headers.origin).host;
    } catch {
      throw new ReviewError(403, 'Invalid origin.');
    }
    if (origin !== req.headers.host)
      throw new ReviewError(403, 'Cross-origin writes are not allowed.');
  }
  const mode = req.method === 'POST' ? 'create' : 'update';
  const input = validateReview(await body(req), mode, loaded.meta.dataset_id);
  const review = await reviews.save(item, input, mode, req.user?.id);
  // Successful persistence must remain successful even if a subsequent metrics fetch fails.
  json(res, mode === 'create' ? 201 : 200, { review });
  return true;
}
