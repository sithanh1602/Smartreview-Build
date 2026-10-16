import { ReviewError } from '../../shared/review.ts';
import { readJson, sameOrigin } from '../projects/upload.ts';
import type { Db, Json, Req, Res } from '../types.ts';
import { getCvatAnnotations, getCvatJob } from './client.ts';
import { CvatScans } from './scans.ts';

// Scan QA, for any signed-in user (annotators run it; results are their own):
//  POST /api/cvat/scan           { job_id } -> run the Risk Engine on the CVAT job, store, return
//  GET  /api/cvat/scans          history of the caller
//  GET  /api/cvat/scans/:id      one stored scan
// Leader only (app.ts):
//  GET  /api/cvat/jobs/:id       raw job + annotation summary (debug)
export async function handleCvat(
  req: Req,
  res: Res,
  pathname: string,
  { json, pool }: { json: Json; pool?: Db },
): Promise<boolean> {
  if (!pathname.startsWith('/api/cvat/')) return false;
  const user = req.user;
  if (!user) throw new ReviewError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (pathname === '/api/cvat/scan' || pathname.startsWith('/api/cvat/scans')) {
    if (!pool) throw new ReviewError(503, 'Dịch vụ dữ liệu chưa sẵn sàng.');
    const scans = new CvatScans(pool);
    if (pathname === '/api/cvat/scan') {
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      json(res, 201, await scans.scan(await readJson(req), user));
      return true;
    }
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    if (pathname === '/api/cvat/scans') {
      json(res, 200, { scans: await scans.history(user.id) });
      return true;
    }
    const one = pathname.match(/^\/api\/cvat\/scans\/([a-f0-9-]{36})$/);
    const found = one && (await scans.get(user.id, one[1]));
    if (!found) throw new ReviewError(404, 'Không tìm thấy lần quét.');
    json(res, 200, found);
    return true;
  }
  const m = /^\/api\/cvat\/jobs\/(\d+)$/.exec(pathname);
  if (!m) return false;
  if (req.method !== 'GET') throw new ReviewError(405, 'Method not allowed.');
  const id = Number(m[1]);
  const [job, annotations] = await Promise.all([getCvatJob(id), getCvatAnnotations(id)]);
  const a = annotations as { shapes?: unknown[]; tracks?: unknown[]; tags?: unknown[] };
  json(res, 200, {
    job,
    summary: {
      shapes: a.shapes?.length ?? 0,
      tracks: a.tracks?.length ?? 0,
      tags: a.tags?.length ?? 0,
    },
    annotations,
  });
  return true;
}
