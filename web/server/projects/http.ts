import { handleFrames } from '../frames/http.ts';
import { FrameReviewStore } from '../frames/store.ts';
import { buildReport, HANDOFF_LOCKED } from './handoff.ts';
import { exportCvatImages } from '../../core/exporters/cvat-images.ts';
import { ZipWriter, ZIP_MAX_FILES } from './zip.ts';
import { ReviewError } from '../../shared/review.ts';
import { readJson, sameOrigin } from './upload.ts';
import type { ProjectService } from './service.ts';
import type { SourceFile } from '../../core/importers/index.ts';
import type { Json, ProjectContext, Req, Res } from '../types.ts';

// An image name as a path inside the archive: no drive, no leading slash, no "..".
const zipPath = (name: string) =>
  name
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
const MAX_RETURN_BYTES = 12 * 1024 * 1024;
// The annotation files of a returned dataset, as text: { files: [{ name, text }] }.
async function readFiles(req: Req): Promise<SourceFile[]> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ReviewError(415, 'Expected application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size <= MAX_RETURN_BYTES) chunks.push(c);
  }
  if (size > MAX_RETURN_BYTES) throw new ReviewError(413, 'File nhãn tối đa 10 MB.');
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ReviewError(400, 'Invalid JSON.');
  }
  const files = input?.files;
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > 1010 ||
    files.some((f) => typeof f?.name !== 'string' || typeof f?.text !== 'string')
  )
    throw new ReviewError(400, 'Chọn file nhãn đã sửa để gửi.');
  return files.map((f) => ({ name: f.name.slice(0, 500), text: f.text }));
}
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
    if (!(await projects.members.owns(id, user)))
      throw new ReviewError(403, 'Chỉ Leader tạo project được xóa project này.');
    json(res, 200, await projects.remove(id));
    return true;
  }
  if (!route && req.method === 'PATCH') {
    sameOrigin(req);
    leaderOnly();
    json(res, 200, await projects.setHidden(id, await readJson(req), user));
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
  if (route === '/label-verify') {
    if (req.method === 'GET') json(res, 200, await projects.verify.status(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      leaderOnly();
      // The second engine runs only when the person asks for it.
      const { second } = (await readJson(req)) ?? {};
      json(res, 202, await projects.verify.request(id, { second: second === true }));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (route === '/import') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    leaderOnly();
    const imported = await projects.import(id, req);
    // 202: the dataset is accepted and the import is being finished in the background.
    json(res, imported.status === 'READY' ? 201 : 202, imported);
    return true;
  }
  if (route === '/import/resume') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    leaderOnly();
    json(res, 202, await projects.resume(id));
    return true;
  }
  if (route === '/members') {
    if (req.method === 'GET') json(res, 200, await projects.members.people(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      const input = await readJson(req);
      // A reviewer may bring in annotators; any other addition is the leader's.
      if (!(role === 'reviewer' && input?.role === 'annotator')) leaderOnly();
      json(res, 201, await projects.members.add(id, input));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (route === '/members/candidates') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    if (role !== 'reviewer') leaderOnly();
    json(res, 200, await projects.members.candidates(id));
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
    json(res, 200, {
      ...(await projects.get(id)),
      my_role: role,
      handoff: await projects.handoffs.get(id, user),
    });
    return true;
  }
  const context = await projects.context(id);
  const revision = context.dataset.meta.dataset_id;
  if (route === '/handoff') {
    if (req.method === 'GET') {
      json(res, 200, await projects.handoffs.report(id, user, role, revision));
    } else if (req.method === 'POST') {
      sameOrigin(req);
      if (role === 'annotator')
        throw new ReviewError(403, 'Chỉ Leader hoặc Reviewer được hoàn thành review.');
      const input = await readJson(req);
      const report = buildReport(
        { id, name: (await projects.get(id)).name },
        context.dataset,
        await context.reviews.list(),
        await new FrameReviewStore(projects.pool, context.reviews.datasetId).list(),
      );
      json(
        res,
        201,
        await projects.handoffs.send(id, input, user, await projects.members.people(id), report),
      );
    } else if (req.method === 'DELETE') {
      sameOrigin(req);
      leaderOnly();
      await projects.handoffs.reopen(id);
      json(res, 200, { handoff: null });
    } else throw new ReviewError(405, 'Use GET, POST or DELETE.');
    return true;
  }
  // The whole dataset as CVAT takes it: annotations.xml (CVAT for images 1.1) and images/.
  if (route === '/handoff/dataset.zip') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    await projects.handoffs.report(id, user, role, revision);
    const { normalized, assets, readAsset } = context.dataset;
    if (normalized.media.some((m) => m.type !== 'image'))
      throw new ReviewError(422, 'Chỉ xuất được dataset ảnh rời sang CVAT for images.');
    if (normalized.frames.length + 1 > ZIP_MAX_FILES)
      throw new ReviewError(422, 'Dataset có quá nhiều ảnh cho một file .zip.');
    const { xml } = exportCvatImages(normalized);
    const media = new Map(normalized.media.map((m) => [m.id, m]));
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="smartreview-${id}-cvat.zip"`,
      'Cache-Control': 'no-store',
    });
    const zip = new ZipWriter(res);
    try {
      await zip.add('annotations.xml', Buffer.from(xml));
      for (const frame of normalized.frames) {
        const data = assets.has(frame.id) ? await readAsset(frame.id) : null;
        if (data) await zip.add('images/' + zipPath(media.get(frame.media_id)!.name), data);
      }
      await zip.end();
      res.end();
    } catch (e) {
      // The headers are gone; a cut connection is the only way left to report the failure.
      console.error('Dataset ZIP failed:', (e as Error).message);
      res.destroy();
    }
    return true;
  }
  if (route === '/handoff/return') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    json(res, 200, await projects.returnFixed(id, await readFiles(req), user, role));
    return true;
  }
  // Once sent to the annotators, the decisions are what they were sent; nobody edits them
  // until the leader reopens the review.
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    /^\/(cases|frames)\/[^/]+\/review$/.test(route) &&
    (await projects.handoffs.locked(id))
  )
    throw new ReviewError(423, HANDOFF_LOCKED);
  if (await handleFrames(req, res, route, { ...context, pool: projects.pool, json, projectId: id }))
    return true;
  if (route === '/dashboard') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, {
      project: {
        ...(await projects.get(id)),
        my_role: role,
        handoff: await projects.handoffs.get(id, user, revision),
      },
      dataset: context.dataset.meta,
      metrics: await context.reviews.metrics(),
    });
    return true;
  }
  req.url = '/api' + route + url.search;
  dispatch(context, req, res);
  return true;
}
