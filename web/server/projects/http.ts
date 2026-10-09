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
  if (url.pathname === '/api/projects') {
    if (req.method === 'GET') json(res, 200, await projects.list());
    else if (req.method === 'POST') {
      sameOrigin(req);
      json(res, 201, await projects.create(await readJson(req)));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  const match = url.pathname.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
  if (!match) throw new ReviewError(404, 'Unknown project route.');
  const [, id, route = ''] = match;
  if (!route && req.method === 'DELETE') {
    sameOrigin(req);
    json(res, 200, await projects.remove(id));
    return true;
  }
  if (route === '/ai-check') {
    if (req.method === 'GET') json(res, 200, await projects.ai.status(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      json(res, 202, await projects.ai.start(id));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (route === '/import') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    json(res, 201, await projects.import(id, req));
    return true;
  }
  if (!route || route === '/import-status') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, await projects.get(id));
    return true;
  }
  const context = await projects.context(id);
  if (await handleFrames(req, res, route, { ...context, pool: projects.pool, json, projectId: id }))
    return true;
  if (route === '/dashboard') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, {
      project: await projects.get(id),
      dataset: context.dataset.meta,
      metrics: await context.reviews.metrics(),
    });
    return true;
  }
  req.url = '/api' + route + url.search;
  dispatch(context, req, res);
  return true;
}
