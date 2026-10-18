import { ReviewError, validateReview } from '../../shared/review.ts';
import { readJson, sameOrigin } from '../projects/upload.ts';
import { noTable, RISK_FILE } from './service.ts';
import { precisionOf } from '../../core/risk3d/precision.ts';
import { HANDOFF_LOCKED } from '../projects/handoff.ts';
import { buildReport3D, judge, metrics3D, returnRound } from './handoff.ts';
import type { Handoff3DReport, Handoff3DResult } from './handoff.ts';
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
    const member = route.match(/^\/members\/([a-f0-9-]{36})$/);
    if (!route && req.method === 'DELETE') {
      sameOrigin(req);
      leaderOnly();
      if (!(await projects.owns(id, user)))
        throw new ReviewError(403, 'Chỉ Leader tạo project được xóa project này.');
      json(res, 200, await projects.remove(id));
    } else if (!route && req.method === 'PATCH') {
      sameOrigin(req);
      leaderOnly();
      json(res, 200, await projects.setHidden(id, await readJson(req), user));
    } else if (route === '/import') {
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      leaderOnly();
      json(res, 201, await projects.import(id, req));
    } else if (route === '/risk') {
      // The 3D Risk Engine's report of the import: the doubtful cuboids, highest score first.
      if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
      const data = await projects.read(id, RISK_FILE);
      if (!data)
        throw new ReviewError(404, 'Project này được import trước khi có engine chấm rủi ro 3D.');
      json(res, 200, JSON.parse(data.toString('utf8')));
    } else if (route === '/risk/precision') {
      // How the engine's cases fared with the reviewers, rule by rule.
      if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
      const data = await projects.read(id, RISK_FILE);
      if (!data)
        throw new ReviewError(404, 'Project này được import trước khi có engine chấm rủi ro 3D.');
      const { store } = await projects.reviews(id);
      json(res, 200, precisionOf(JSON.parse(data.toString('utf8')), await store.list()));
    } else if (route === '/risk/rescore') {
      // The stored scene scored again by the engine as it is now.
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      leaderOnly();
      json(res, 200, await projects.rescore(id));
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
      // Annotators fix labels; deciding on them is the reviewers' part, as in 2D.
      if (role === 'annotator')
        throw new ReviewError(403, 'Annotator không lưu được quyết định review.');
      if (await projects.handoffs.locked(id)) throw new ReviewError(409, HANDOFF_LOCKED);
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
    } else if (route === '/handoff') {
      // The round sent to annotators: GET for the reviewers and its annotators, POST sends it,
      // DELETE withdraws it.
      if (req.method === 'GET') {
        const { index, store } = await projects.reviews(id);
        const row = await projects.handoffs.row(id);
        if (!row) {
          if (role === 'annotator') json(res, 200, { handoff: null });
          else {
            const data = await projects.read(id, RISK_FILE);
            json(res, 200, {
              handoff: null,
              metrics: metrics3D(await store.list(), data && JSON.parse(data.toString('utf8'))),
            });
          }
        } else {
          const sent = await projects.handoffs.report(id, user, role, index.fingerprint);
          json(res, 200, sent);
        }
      } else if (req.method === 'POST') {
        sameOrigin(req);
        if (role === 'annotator')
          throw new ReviewError(403, 'Chỉ Leader hoặc Reviewer được hoàn thành review.');
        const input = await readJson(req);
        if (input?.include_review !== undefined && typeof input.include_review !== 'boolean')
          throw new ReviewError(400, 'include_review phải là true hoặc false.');
        const { index, store } = await projects.reviews(id);
        const [scene, risk] = await Promise.all([
          projects.read(id, 'scene.json'),
          projects.read(id, RISK_FILE),
        ]);
        if (!scene) throw new ReviewError(409, 'Không tìm thấy dữ liệu project trên kho lưu trữ.');
        const report = buildReport3D(
          { id, name: (await projects.row(id)).name },
          index.fingerprint,
          JSON.parse(scene.toString('utf8')),
          await store.list(),
          risk && JSON.parse(risk.toString('utf8')),
          { review: input?.include_review === true },
        );
        json(
          res,
          201,
          await projects.handoffs.send(id, input, user, await projects.members.people(id), report),
        );
      } else if (req.method === 'DELETE') {
        sameOrigin(req);
        if (role === 'annotator')
          throw new ReviewError(403, 'Chỉ Leader hoặc Reviewer được mở lại review.');
        await projects.handoffs.reopen(id);
        json(res, 200, { handoff: null });
      } else throw new ReviewError(405, 'Use GET, POST or DELETE.');
    } else if (route === '/handoff/return') {
      // The annotator says which items are fixed and sends the round back.
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      const report = (await projects.handoffs.sent(id, user, role)) as unknown as Handoff3DReport;
      await projects.handoffs.returned(id, user, returnRound(report, await readJson(req)));
      json(res, 200, await projects.handoffs.get(id, user));
    } else if (route === '/handoff/verdict') {
      // A reviewer accepts or rejects one item of the returned round.
      if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
      sameOrigin(req);
      if (role === 'annotator')
        throw new ReviewError(403, 'Chỉ Leader hoặc Reviewer được kiểm tra bản sửa.');
      const result = (await projects.handoffs.returnedResult(id)) as unknown as Handoff3DResult;
      const next = judge(result, await readJson(req), user.username);
      await projects.handoffs.saveResult(id, next);
      json(res, 200, next);
    } else if (route === '/members') {
      if (req.method === 'GET') json(res, 200, await projects.members.people(id));
      else if (req.method === 'POST') {
        sameOrigin(req);
        const input = await readJson(req);
        // A reviewer may bring in annotators; any other addition is the leader's.
        if (!(role === 'reviewer' && input?.role === 'annotator')) leaderOnly();
        json(res, 201, await projects.members.add(id, input));
      } else throw new ReviewError(405, 'Use GET or POST.');
    } else if (route === '/members/candidates') {
      if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
      if (role !== 'reviewer') leaderOnly();
      json(res, 200, await projects.members.candidates(id));
    } else if (member) {
      if (!['PATCH', 'DELETE'].includes(req.method))
        throw new ReviewError(405, 'Use PATCH or DELETE.');
      sameOrigin(req);
      leaderOnly();
      json(
        res,
        200,
        req.method === 'DELETE'
          ? await projects.members.remove(id, member[1])
          : await projects.members.setRole(id, member[1], await readJson(req)),
      );
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
