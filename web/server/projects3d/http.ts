import { ReviewError, validateReview } from '../../shared/review.ts';
import { readJson, sameOrigin } from '../projects/upload.ts';
import { noTable } from './service.ts';
import type { Project3DService } from './service.ts';
import type { Json, Req, Res } from '../types.ts';

// 3D projects live beside the 2D ones, under their own routes and tables.
export async function handleProjects3D(
  req: Req,
  res: Res,
  url: URL,
  { projects, json }: { projects?: Project3DService | null; json: Json },
) {
  if (!/^\/api\/projects3d(\/|$)/.test(url.pathname)) return false;
  if (!projects) throw new ReviewError(503, 'Project service unavailable.');
  const user = req.user;
  if (!user) throw new ReviewError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  try {
    if (url.pathname === '/api/projects3d') {
      if (req.method === 'GET') json(res, 200, await projects.list(user));
      else if (req.method === 'POST') {
        sameOrigin(req);
        if (user.role !== 'leader') throw new ReviewError(403, 'Chỉ Leader được tạo project.');
        json(res, 201, await projects.create(await readJson(req), user));
      } else throw new ReviewError(405, 'Use GET or POST.');
      return true;
    }
    const match = url.pathname.match(/^\/api\/projects3d\/([^/]+)(\/.*)?$/);
    if (!match) throw new ReviewError(404, 'Unknown project route.');
    const [, id, route = ''] = match;
    const role = await projects.role(id, user);
    const review =
      route.match(/^\/(boxes)\/(\d{1,20})\/([^/]{1,200})\/review$/) ??
      route.match(/^\/(tracks)\/([^/]{1,200})\/review$/);
    // The stored files a viewer may read: the scene, a frame's points, its camera sheet, and
    // one camera's image.
    const stored =
      route === '/scene' ||
      /^\/(frames\/\d{1,20}\.bin|sheets\/\d{1,20}\.jpg|cameras\/[A-Z0-9][A-Z0-9_-]{0,39}\/\d{1,20}\.jpg)$/.test(
        route,
      );
    const leaderOnly = () => {
      if (role !== 'leader')
        throw new ReviewError(403, 'Chỉ Leader của project được thực hiện thao tác này.');
    };
    if (!route && req.method === 'DELETE') {
      sameOrigin(req);
      leaderOnly();
      json(res, 200, await projects.remove(id));
    } else if (route === '/import') {
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      leaderOnly();
      json(res, 201, await projects.import(id, req));
    } else if (stored) {
      // What the viewer reads. The files of a READY project never change, and the address
      // carries the project's revision, so the browser may keep them.
      if (!['GET', 'HEAD'].includes(req.method)) throw new ReviewError(405, 'Use GET.');
      const scene = route === '/scene';
      const data = await projects.read(id, scene ? 'scene.json' : route.slice(1));
      if (!data)
        throw new ReviewError(
          scene ? 409 : 404,
          scene
            ? 'Không tìm thấy dữ liệu project trên kho lưu trữ.'
            : 'Không có tệp này của frame.',
        );
      res.writeHead(200, {
        'Content-Type': scene
          ? 'application/json; charset=utf-8'
          : route.endsWith('.jpg')
            ? 'image/jpeg'
            : 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': url.searchParams.has('dataset')
          ? 'private, max-age=31536000, immutable'
          : 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } else if (route === '/reviews') {
      if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
      const { index, store } = await projects.reviews(id);
      json(res, 200, { dataset_revision: index.fingerprint, reviews: await store.list() });
    } else if (review) {
      // One cuboid: POST creates its decision, PUT updates it and must name the version it
      // read. A whole object (every frame it is boxed in) is always overwritten.
      const [, kind, first, second] = review;
      const whole = kind === 'tracks';
      if (!(whole ? ['PUT'] : ['POST', 'PUT']).includes(req.method))
        throw new ReviewError(405, whole ? 'Use PUT.' : 'Use POST or PUT.');
      sameOrigin(req);
      let objectId: string;
      try {
        objectId = decodeURIComponent(whole ? first : second);
      } catch {
        throw new ReviewError(400, 'Invalid object ID.');
      }
      const { index, store } = await projects.reviews(id);
      const refs = projects.boxes(index, objectId, whole ? undefined : Number(first));
      const mode = whole || req.method === 'POST' ? 'create' : 'update';
      const input = validateReview(await readJson(req), mode, index.fingerprint);
      if (input.error_type === 'MISSING_OBJECT')
        throw new ReviewError(400, 'Thiếu đối tượng không phải lỗi của một cuboid đã có.');
      json(res, whole || mode === 'update' ? 200 : 201, {
        reviews: await store.save(refs, input, user.id, whole ? undefined : mode),
      });
    } else if (!route || route === '/import-status') {
      if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
      json(res, 200, { ...(await projects.get(id)), my_role: role });
    } else throw new ReviewError(404, 'Unknown project route.');
    return true;
  } catch (e) {
    if (noTable(e))
      throw new ReviewError(503, 'Chưa có bảng cho project 3D. Chạy npm run db:migrate.');
    throw e;
  }
}
