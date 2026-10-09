import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProjectService } from '../server/projects/service.mjs';
import { createApp } from './app-helper.mjs';
import { loadDataset } from '../server/repository.mjs';
import { ReviewStore } from '../server/reviews/store.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { testPool, cleanRevision } from './db-helpers.mjs';
import { webRoot } from '../server/config.mjs';
import { safePath } from '../server/projects/upload.mjs';
let pool, service, server, base, storage, demoId;
const ids = [];
const jsonData = JSON.parse(
  await fs.readFile(new URL('../fixtures/upload/dataset.json', import.meta.url), 'utf8'),
);
const png = await fs.readFile(new URL('../fixtures/upload/street.png', import.meta.url));
const xml = await fs.readFile(
  new URL('../fixtures/upload/annotations.xml', import.meta.url),
  'utf8',
);
async function call(route, method = 'GET', data) {
  const res = await fetch(base + route, {
    method,
    ...(data
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
      : {}),
  });
  return { status: res.status, body: await res.json() };
}
async function create(format = 'smartreview-json') {
  const { status, body } = await call('/api/projects', 'POST', {
    name: 'Project thử nghiệm',
    format,
  });
  assert.equal(status, 201);
  ids.push(body.id);
  return body;
}
async function upload(
  p,
  text = p.format === 'cvat-images' ? xml : JSON.stringify(jsonData),
  name = 'street.png',
  bytes = png,
) {
  const form = new FormData();
  form.append(
    'annotation',
    new Blob([text]),
    p.format === 'cvat-images' ? 'annotations.xml' : 'dataset.json',
  );
  form.append('media', new Blob([bytes]), name);
  const res = await fetch(`${base}/api/projects/${p.id}/import`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}
before(async () => {
  pool = testPool();
  await migrate(pool);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-projects-'));
  service = new ProjectService(pool, storage);
  const dataset = await loadDataset(path.join(webRoot, 'datasets/demo/dataset.json'));
  const reviews = new ReviewStore(pool, dataset);
  await reviews.initialize();
  demoId = await service.registerDemo(
    dataset,
    reviews,
    path.join(webRoot, 'datasets/demo/dataset.json'),
  );
  ids.push(demoId);
  server = createApp({ dataset, reviews, projects: service, distRoot: path.join(webRoot, 'dist') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const id of ids) {
    const [[row]] = await pool.execute('SELECT * FROM projects WHERE id=?', [id]);
    if (!row) continue;
    await pool.execute('DELETE FROM projects WHERE id=?', [id]);
    await cleanRevision(pool, row.dataset_revision_id);
  }
  if (pool) await pool.end();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});
test('delete removes project, reviews, revision and owned files while preserving other projects', async () => {
  const p = await create();
  assert.equal((await upload(p)).status, 201);
  const row = await service.row(p.id);
  const { dataset, reviews } = await service.context(p.id);
  await reviews.save(
    dataset.cases[0],
    { decision: 'CORRECT', error_type: null, corrected_value: null, note: 'delete test' },
    'create',
  );
  await pool.execute(
    "INSERT INTO frame_reviews(dataset_revision_id,frame_key,frame_reference,missing_regions,note) VALUES (?,SHA2('frame',256),'frame','[]','test')",
    [row.dataset_revision_id],
  );
  const ai = path.join(storage, 'projects', p.id, 'ai');
  await fs.mkdir(ai);
  await fs.writeFile(path.join(ai, 'latest.json'), '{}');
  const denied = await fetch(`${base}/api/projects/${p.id}`, {
    method: 'DELETE',
    headers: { Origin: 'https://bad.example' },
  });
  assert.equal(denied.status, 403);
  assert.equal((await call(`/api/projects/${p.id}`, 'DELETE')).status, 200);
  assert.equal((await call(`/api/projects/${p.id}`)).status, 404);
  assert.equal((await call(`/api/projects/${p.id}`, 'DELETE')).status, 404);
  await assert.rejects(fs.access(path.join(storage, 'projects', p.id)), { code: 'ENOENT' });
  for (const table of ['dataset_revisions', 'risk_cases', 'frame_reviews']) {
    const [rows] = await pool.execute(
      `SELECT * FROM ${table} WHERE ${table === 'dataset_revisions' ? 'id' : 'dataset_revision_id'}=?`,
      [row.dataset_revision_id],
    );
    assert.equal(rows.length, 0);
  }
  assert.equal(service.cache.has(p.id), false);
  assert.equal((await call(`/api/projects/${demoId}/dashboard`)).status, 200);
});
test('delete protects demo and busy projects, and supports empty projects', async () => {
  assert.equal((await call(`/api/projects/${demoId}`, 'DELETE')).status, 409);
  const p = await create();
  await service.status(p.id, 'UPLOADING');
  assert.equal((await call(`/api/projects/${p.id}`, 'DELETE')).status, 409);
  await service.status(p.id, 'FAILED');
  service.ai.active = true;
  try {
    assert.equal((await call(`/api/projects/${p.id}`, 'DELETE')).status, 409);
  } finally {
    service.ai.active = false;
  }
  assert.equal((await call(`/api/projects/${p.id}`, 'DELETE')).status, 200);
});
test('create/list project and metadata validation', async () => {
  const p = await create();
  assert.equal(p.status, 'CREATED');
  const list = await call('/api/projects');
  assert.ok(list.body.some((v) => v.id === p.id));
  assert.ok(!('dataset_path' in list.body[0]));
  assert.equal(
    (await call('/api/projects', 'POST', { name: '', format: 'smartreview-json' })).status,
    400,
  );
  assert.equal(
    (await call('/api/projects', 'POST', { name: 'x', format: '__proto__' })).status,
    400,
  );
  assert.equal((await call('/api/projects/not-found')).status, 404);
});
test('SmartReview JSON upload analyzes annotations without confidence or track, persists and serves image', async () => {
  const p = await create();
  const r = await upload(p);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'READY');
  const dashboard = (await call(`/api/projects/${p.id}/dashboard`)).body;
  assert.equal(dashboard.dataset.total_tracks, 0);
  assert.equal(dashboard.dataset.total_annotations, 1);
  assert.equal(dashboard.dataset.total_cases, 1);
  const cases = (await call(`/api/projects/${p.id}/risk-cases`)).body;
  assert.equal(cases[0].confidence, undefined);
  assert.equal(cases[0].track_id, undefined);
  assert.ok(cases[0].check_ids.includes('geometry.bbox_validity'));
  assert.equal((await fetch(base + cases[0].image_url)).status, 200);
  const reloaded = new ProjectService(pool, storage);
  assert.equal((await reloaded.get(p.id)).status, 'READY');
  assert.equal((await reloaded.context(p.id)).dataset.cases.length, 1);
  assert.equal((await upload(p)).status, 409);
});
test('new imports pin the latest engine version and reload with the same fingerprint', async () => {
  const p = await create();
  const r = await upload(p);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.metadata.engine_version, '2.1.0');
  const { dataset } = await new ProjectService(pool, storage).context(p.id);
  assert.equal(dataset.meta.engine_version, '2.1.0');
  assert.equal(dataset.meta.dataset_id, r.body.metadata.dataset_id);
  assert.ok('geometry.bbox_duplicate' in dataset.report.checks);
});
test('CVAT XML upload uses existing importer and risk engine', async () => {
  const p = await create('cvat-images');
  const r = await upload(p);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.metadata.total_cases, 1);
  assert.equal(r.body.metadata.total_tracks, 0);
});
test('COCO upload uses category names, scoped scene API and persisted review', async () => {
  const p = await create('coco-detection');
  const text = await fs.readFile(new URL('../fixtures/upload/coco.json', import.meta.url), 'utf8');
  const result = await upload(p, text);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const { body: dashboard } = await call(`/api/projects/${p.id}/dashboard`);
  assert.equal(dashboard.dataset.total_annotations, 1);
  const q = new URLSearchParams({ media: 'image-7', dataset: dashboard.dataset.dataset_id });
  const { body: scene } = await call(`/api/projects/${p.id}/annotations?${q}`);
  assert.equal(scene.annotations[0].class_name, 'delivery_vehicle');
  assert.equal((await fetch(base + scene.annotations[0].image_url)).status, 200);
  assert.equal(
    (
      await call(`/api/projects/${p.id}/cases/coco-100/review`, 'POST', {
        dataset_revision: dashboard.dataset.dataset_id,
        decision: 'ERROR',
        error_type: 'BBOX',
        corrected_value: null,
        note: 'COCO review',
      })
    ).status,
    201,
  );
  assert.equal((await call(`/api/projects/${p.id}/dashboard`)).body.metrics.reviewed, 1);
});
test('identical datasets in separate projects isolate cases, decisions, assets and metrics', async () => {
  const a = await create(),
    b = await create();
  assert.equal((await upload(a)).status, 201);
  assert.equal((await upload(b)).status, 201);
  const da = (await call(`/api/projects/${a.id}/dashboard`)).body,
    db = (await call(`/api/projects/${b.id}/dashboard`)).body;
  assert.notEqual(da.dataset.dataset_id, db.dataset.dataset_id);
  const q = new URLSearchParams({ media: jsonData.media[0].id, dataset: da.dataset.dataset_id });
  assert.equal((await call(`/api/projects/${b.id}/annotations?${q}`)).status, 409);
  const sceneA = await call(`/api/projects/${a.id}/annotations?${q}`);
  assert.equal(sceneA.status, 200);
  assert.ok(
    sceneA.body.annotations.every((annotation) =>
      annotation.image_url.startsWith(`/api/projects/${a.id}/assets/`),
    ),
  );
  const payload = {
    dataset_revision: da.dataset.dataset_id,
    decision: 'ERROR',
    error_type: 'BBOX',
    corrected_value: null,
    note: 'Sai bbox',
  };
  const endpoint = `/api/projects/${a.id}/cases/image-0-box-0/review`;
  assert.equal((await call(endpoint, 'POST', payload)).status, 201);
  assert.equal((await call(`/api/projects/${b.id}/cases/image-0-box-0/review`)).body.review, null);
  assert.equal(
    (await call(`/api/projects/${b.id}/cases/image-0-box-0/review`, 'POST', payload)).status,
    409,
  );
  assert.equal((await call(`/api/projects/${a.id}/dashboard`)).body.metrics.reviewed, 1);
  assert.equal((await call(`/api/projects/${b.id}/dashboard`)).body.metrics.reviewed, 0);
  const reloaded = new ProjectService(pool, storage);
  assert.equal(
    (await (await reloaded.context(a.id)).reviews.read('image-0-box-0')).decision,
    'ERROR',
  );
  assert.equal(
    (
      await fetch(
        `${base}/api/projects/${b.id}/assets/image-0%3A0?dataset=${da.dataset.dataset_id}`,
      )
    ).status,
    409,
  );
});
test('invalid JSON, XML, bbox and missing media fail clearly and failed projects can retry', async () => {
  for (const [format, text] of [
    ['smartreview-json', '{'],
    ['cvat-images', '<bad>'],
    ['cvat-images', '<!DOCTYPE foo><annotations/>'],
    [
      'smartreview-json',
      JSON.stringify({
        ...jsonData,
        annotations: [
          {
            ...jsonData.annotations[0],
            geometry: { type: 'bbox', x: 0, y: 0, width: -1, height: 10 },
          },
        ],
      }),
    ],
    [
      'smartreview-json',
      JSON.stringify({ ...jsonData, frames: [{ ...jsonData.frames[0], image: 'missing.png' }] }),
    ],
  ]) {
    const p = await create(format);
    const r = await upload(p, text);
    assert.equal(r.status, 422, JSON.stringify(r.body));
    const status = (await call(`/api/projects/${p.id}/import-status`)).body;
    assert.equal(status.status, 'FAILED');
    assert.ok(status.error_message);
    assert.equal((await upload(p)).status, 201);
  }
});
test('upload rejects traversal, executable or mislabeled files and foreign origin', async () => {
  for (const name of ['../outside.png', '/tmp/x.png', 'a/../../x.png', 'a\\x.png', 'a//b.png'])
    assert.throws(() => safePath(name));
  for (const [name, bytes] of [
    ['../outside.png', png],
    ['script.svg', png],
    ['street.png', Buffer.from('<script>')],
  ]) {
    const p = await create();
    const r = await upload(p, JSON.stringify(jsonData), name, bytes);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal((await service.get(p.id)).status, 'FAILED');
  }
  const r = await fetch(base + '/api/projects', {
    method: 'POST',
    headers: { Origin: 'https://bad.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(r.status, 403);
});
test('demo project retains frame 422 Risk70 and temporal evidence', async () => {
  const c = (await call(`/api/projects/${demoId}/cases/2-422`)).body;
  assert.equal(c.risk_score, 70);
  assert.equal(c.context.previous.class_name, 'car');
  assert.equal(c.context.current.class_name, 'truck');
  assert.equal(c.context.next.class_name, 'car');
  assert.equal((await call(`/api/projects/${demoId}/dashboard`)).body.dataset.total_cases, 9);
});
test('interrupted imports recover as FAILED without touching ready projects', async () => {
  const p = await create();
  await service.status(p.id, 'NORMALIZING');
  await service.recover();
  assert.equal((await service.get(p.id)).status, 'FAILED');
  assert.equal((await service.get(demoId)).status, 'READY');
});

test('media validation rejects dimensions mismatch, truncated image, oversized annotation and duplicate filenames', async () => {
  const wrong = structuredClone(jsonData);
  wrong.media[0].width = 800;
  const p = await create();
  assert.equal((await upload(p, JSON.stringify(wrong))).status, 422);
  const corrupt = await create();
  assert.equal(
    (await upload(corrupt, JSON.stringify(jsonData), 'street.png', png.subarray(0, 40))).status,
    422,
  );
  const huge = await create();
  assert.equal((await upload(huge, ' '.repeat(10 * 1024 * 1024 + 1))).status, 413);
  const duplicate = await create();
  const form = new FormData();
  form.append('annotation', new Blob([JSON.stringify(jsonData)]), 'dataset.json');
  for (let i = 0; i < 2; i++) form.append('media', new Blob([png]), 'street.png');
  const r = await fetch(`${base}/api/projects/${duplicate.id}/import`, {
    method: 'POST',
    body: form,
  });
  assert.equal(r.status, 400);
});
test('nested image references resolve exactly and invalid geometry field types fail validation', async () => {
  const p = await create();
  const nested = structuredClone(jsonData);
  nested.frames[0].image = 'scene/street.png';
  assert.equal((await upload(p, JSON.stringify(nested), 'scene/street.png')).status, 201);
  const bad = await create();
  const data = structuredClone(jsonData);
  data.annotations[0].geometry.width = 'bad';
  assert.equal((await upload(bad, JSON.stringify(data))).status, 422);
});

test('project workflow works with no default demo dataset or model output', async () => {
  const app = createApp({ projects: service, distRoot: path.join(webRoot, 'dist') });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.address().port}`;
  try {
    const health = await fetch(origin + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    assert.equal((await fetch(origin + '/api/projects')).status, 200);
    assert.equal((await fetch(origin + '/api/meta')).status, 409);
  } finally {
    await new Promise((r) => app.close(r));
  }
});
