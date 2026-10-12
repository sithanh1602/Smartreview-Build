import { FrameReviewStore } from './store.ts';
import { validateFrameReview } from '../../shared/frame-review.ts';
import { ReviewError } from '../../shared/review.ts';
import { sameOrigin } from '../projects/upload.ts';
import type { Frame } from '../../core/schema/types.ts';
import type { Db, Json, ProjectContext, Req, Res } from '../types.ts';

async function body(req: Req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ReviewError(415, 'Expected application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 65536) chunks.push(chunk);
  }
  if (size > 65536) throw new ReviewError(413, 'Đánh giá ảnh quá lớn (tối đa 64 KB).');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ReviewError(400, 'JSON không hợp lệ.');
  }
}
export async function handleFrames(
  req: Req,
  res: Res,
  route: string,
  {
    dataset,
    reviews,
    pool,
    json,
    projectId,
  }: ProjectContext & { pool: Db; json: Json; projectId: string },
) {
  if (route !== '/frames' && !route.startsWith('/frames/')) return false;
  const store = new FrameReviewStore(pool, reviews.datasetId);
  const media = new Map(dataset.normalized.media.map((m) => [m.id, m]));
  const frameInfo = (f: Frame) => ({
    id: f.id,
    media_id: f.media_id,
    media_name: media.get(f.media_id)!.name,
    index: f.index,
    width: media.get(f.media_id)!.width,
    height: media.get(f.media_id)!.height,
    image_url: dataset.assets.has(f.id)
      ? `/api/projects/${projectId}/assets/${encodeURIComponent(f.id)}?dataset=${dataset.meta.dataset_id}`
      : null,
  });
  if (route === '/frames') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    const decisions = await store.list();
    const counts = new Map<string, number>();
    for (const a of dataset.normalized.annotations)
      counts.set(a.frame_id, (counts.get(a.frame_id) || 0) + 1);
    const frames = dataset.normalized.frames.map((f) => ({
      ...frameInfo(f),
      annotation_count: counts.get(f.id) || 0,
      review: decisions[f.id]
        ? {
            status: decisions[f.id].status,
            missing_count: decisions[f.id].missing_regions.length,
            version: decisions[f.id].version,
          }
        : null,
    }));
    json(res, 200, {
      dataset_revision: dataset.meta.dataset_id,
      name: dataset.meta.project_name || dataset.meta.name,
      frames,
      summary: {
        total: frames.length,
        reviewed: frames.filter((f) => f.review?.status === 'REVIEWED').length,
        in_progress: frames.filter((f) => f.review?.status === 'IN_PROGRESS').length,
        missing_regions: Object.values(decisions).reduce((n, r) => n + r.missing_regions.length, 0),
        available_images: frames.filter((f) => f.image_url).length,
      },
    });
    return true;
  }
  const match = route.match(/^\/frames\/([^/]+)(\/review)?$/);
  if (!match) throw new ReviewError(404, 'Không tìm thấy đường dẫn ảnh.');
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    throw new ReviewError(400, 'Mã ảnh không hợp lệ.');
  }
  const frame = dataset.normalized.frames.find((f) => f.id === id);
  if (!frame) throw new ReviewError(404, 'Không tìm thấy ảnh.');
  if (req.method === 'GET' && !match[2]) {
    json(res, 200, {
      dataset_revision: dataset.meta.dataset_id,
      frame: frameInfo(frame),
      annotations: dataset.normalized.annotations.filter((a) => a.frame_id === id),
      review: await store.read(id),
    });
    return true;
  }
  if (req.method !== 'PUT' || !match[2]) throw new ReviewError(405, 'Use GET or PUT /review.');
  sameOrigin(req);
  if (!dataset.assets.has(id)) throw new ReviewError(422, 'Chưa có ảnh để kiểm tra.');
  const values = validateFrameReview(
    await body(req),
    dataset.meta.dataset_id,
    media.get(frame.media_id)!,
  );
  json(res, 200, { review: await store.save(id, values) });
  return true;
}
