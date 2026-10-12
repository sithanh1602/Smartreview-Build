import { handleFrames } from '../frames/http.ts';
import { ReviewError } from '../../shared/review.ts';
import { readJson, sameOrigin } from './upload.ts';
import type { ProjectService } from './service.ts';
import type { Json, ProjectContext, Req, Res } from '../types.ts';

export async function handleProjects(
  req: Req,
  res: Res,
  url: URL,
  {
    projects,
    json,
    dispatch,
  }: {
    projects?: ProjectService | null;
    json: Json;
    dispatch: (context: ProjectContext, req: Req, res: Res) => unknown;
  },
) {
  if (!url.pathname.startsWith('/api/projects')) return false;
  if (!projects) throw new ReviewError(503, 'Project service unavailable.');
  const user = req.user;
  if (!user) throw new ReviewError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  if (url.pathname === '/api/projects') {
    if (req.method === 'GET') json(res, 200, await projects.list(user));
    else if (req.method === 'POST') {
      sameOrigin(req);
      if (user.role !== 'leader') throw new ReviewError(403, 'Chỉ Leader được tạo project.');
      json(res, 201, await projects.create(await readJson(req), user));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (url.pathname === '/api/projects/join') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    json(res, 200, await projects.members.join(await readJson(req), user));
    return true;
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
  if (!match) throw new ReviewError(404, 'Unknown project route.');
  const [, id, route = ''] = match;
  // Checked before anything is read: members view and edit, the leader also manages.
  const role = await projects.members.role(id, user);
  const leaderOnly = () => {
    if (role !== 'leader')
      throw new ReviewError(403, 'Chỉ Leader của project được thực hiện thao tác này.');
  };
  if (!route && req.method === 'DELETE') {
    sameOrigin(req);
    leaderOnly();
    json(res, 200, await projects.remove(id));
    return true;
  }
  if (route === '/ai-check') {
    if (req.method === 'GET') json(res, 200, await projects.ai.status(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      leaderOnly();
      json(res, 202, await projects.ai.start(id));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (route === '/import') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    leaderOnly();
    json(res, 201, await projects.import(id, req));
    return true;
  }
  if (route === '/members') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, await projects.members.people(id));
    return true;
  }
  const member = route.match(/^\/members\/([a-f0-9-]{36})$/);
  if (member) {
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
    return true;
  }
  if (route === '/invites') {
    leaderOnly();
    if (req.method === 'GET') json(res, 200, await projects.members.invites(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      json(res, 200, await projects.members.regenerate(id, await readJson(req)));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (!route || route === '/import-status') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, { ...(await projects.get(id)), my_role: role });
    return true;
  }
  const context = await projects.context(id);
  if (await handleFrames(req, res, route, { ...context, pool: projects.pool, json, projectId: id }))
    return true;
  if (route === '/dashboard') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, {
      project: { ...(await projects.get(id)), my_role: role },
      dataset: context.dataset.meta,
      metrics: await context.reviews.metrics(),
    });
    return true;
  }
  req.url = '/api' + route + url.search;
  dispatch(context, req, res);
  return true;
}
