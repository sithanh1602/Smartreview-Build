import { handleFrames } from '../frames/http.ts';
import { FrameReviewStore } from '../frames/store.ts';
import { buildReport, HANDOFF_LOCKED } from './handoff.ts';
import { exportDataset, isExportFormat } from '../../core/exporters/formats.ts';
import { ZipWriter, ZIP_MAX_FILES } from './zip.ts';
import { handoffIssues, pushToCvat } from '../cvat/tasks.ts';
import { ReviewError } from '../../shared/review.ts';
import { listScoreModels, SCORE_MODELS } from '../ai/rescore.ts';
import { SECOND_ENGINE, VERIFIER_ENGINE } from '../../core/risk/label-verify.ts';
import { listModels } from '../verify/models.ts';
import { readJson, sameOrigin } from './upload.ts';
import type { ProjectService } from './service.ts';
import type { SourceFile } from '../../core/importers/index.ts';
import type { Json, ProjectContext, Req, Res } from '../types.ts';

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
  if (url.pathname === '/api/projects/score-models') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, await listScoreModels());
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
  if (route === '/label-verify/models') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    leaderOnly();
    const models = await listModels();
    json(res, 200, {
      first: models.filter((m) => m.engine === VERIFIER_ENGINE),
      second: models.filter((m) => m.engine === SECOND_ENGINE),
    });
    return true;
  }
  if (route === '/label-verify') {
    if (req.method === 'GET') json(res, 200, await projects.verify.status(id));
    else if (req.method === 'POST') {
      sameOrigin(req);
      leaderOnly();
      const { model, second_model } = (await readJson(req)) ?? {};
      json(res, 202, await projects.verify.request(id, { model, second_model }));
    } else throw new ReviewError(405, 'Use GET or POST.');
    return true;
  }
  if (route === '/import') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    leaderOnly();
    const rescoreModel = url.searchParams.get('model') || undefined;
    // Checked before the upload is read, not after it is stored.
    if (rescoreModel && !SCORE_MODELS.some((m) => m.id === rescoreModel))
      throw new ReviewError(400, `Không có model chấm điểm “${rescoreModel}”.`);
    const imported = await projects.import(id, req, {
      rescore: url.searchParams.get('rescore') === '1',
      rescoreModel,
    });
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
  if (!route || route === '/import-status') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    json(res, 200, {
      ...(await projects.get(id)),
      progress: projects.progress.get(id) ?? null,
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
      if (input?.include_review !== undefined && typeof input.include_review !== 'boolean')
        throw new ReviewError(400, 'include_review phải là true hoặc false.');
      const report = buildReport(
        { id, name: (await projects.get(id)).name },
        context.dataset,
        await context.reviews.list(),
        await new FrameReviewStore(projects.pool, context.reviews.datasetId).list(),
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
    return true;
  }
  // The whole dataset in one of the image formats (?format=, default CVAT for images 1.1):
  // its annotation files and every image, laid out as that format's tools import it.
  if (route === '/handoff/dataset.zip') {
    if (req.method !== 'GET') throw new ReviewError(405, 'Use GET.');
    await projects.handoffs.report(id, user, role, revision);
    const format = url.searchParams.get('format') || 'cvat-images';
    if (!isExportFormat(format)) throw new ReviewError(400, `Không có định dạng xuất ${format}.`);
    const { normalized, assets, readAsset } = context.dataset;
    if (normalized.media.some((m) => m.type !== 'image'))
      throw new ReviewError(422, 'Chỉ xuất được dataset ảnh rời.');
    const { files, image } = exportDataset(format, normalized);
    if (normalized.frames.length + files.length > ZIP_MAX_FILES)
      throw new ReviewError(422, 'Dataset có quá nhiều ảnh cho một file .zip.');
    const media = new Map(normalized.media.map((m) => [m.id, m]));
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="smartreview-${id}-${format}.zip"`,
      'Cache-Control': 'no-store',
    });
    const zip = new ZipWriter(res);
    try {
      for (const file of files) await zip.add(file.path, Buffer.from(file.text));
      for (const frame of normalized.frames) {
        const data = assets.has(frame.id) ? await readAsset(frame.id) : null;
        if (data) await zip.add(image(media.get(frame.media_id)!), data);
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
  // The dataset as a task in the CVAT this server is set up with (CVAT_BASE_URL), for the
  // annotators to fix in: one task per sent round, opened again on a second call.
  if (route === '/handoff/cvat') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    const { handoff, report } = await projects.handoffs.report(id, user, role, revision);
    if (handoff.status !== 'SENT')
      throw new ReviewError(409, 'Project không ở trạng thái chờ Annotator sửa.');
    const { normalized, assets, readAsset } = context.dataset;
    const name = `SmartReview · ${(await projects.get(id)).name} · ${id.slice(0, 8)} · ${handoff.sent_at}`;
    json(
      res,
      200,
      await pushToCvat(
        name.slice(0, 256),
        normalized,
        async (frameId) => (assets.has(frameId) ? readAsset(frameId) : null),
        // A report of an older dataset may point at frames that are gone; those are skipped.
        handoffIssues(report),
      ),
    );
    return true;
  }
  // A reviewer accepts or rejects one item of the round the annotators sent back.
  if (route === '/handoff/verdict') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    json(res, 200, await projects.judge(id, await readJson(req), user, role));
    return true;
  }
  if (route === '/handoff/return') {
    if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
    sameOrigin(req);
    json(res, 200, await projects.returnFixed(id, await readFiles(req), user, role));
    return true;
  }
  // Once sent to the annotators, the decisions are what they were sent; nobody edits them
  // until a leader or reviewer reopens the review.
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
