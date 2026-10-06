import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateFrameReview } from '../shared/frame-review.mjs';
import { FrameReviewStore } from '../server/frames/store.mjs';
import { loadDataset } from '../server/repository.mjs';
import { ReviewStore } from '../server/reviews/store.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { testPool, cleanRevision } from './db-helpers.mjs';
import { createApp } from '../server/app.mjs';
const region = {
  id: 'missing-1',
  label: 'car',
  note: 'Thiếu xe',
  geometry: { type: 'bbox', x: 10, y: 20, width: 30, height: 40 },
};
const payload = {
  dataset_revision: 'rev',
  version: 0,
  status: 'REVIEWED',
  missing_regions: [region],
  note: 'Đã xem toàn ảnh',
};
test('frame review validates coordinates, duplicate IDs, versions and stale datasets', () => {
  const media = { width: 160, height: 100 };
  assert.equal(validateFrameReview(payload, 'rev', media).missing_regions.length, 1);
  for (const input of [
    { ...payload, version: -1 },
    { ...payload, status: 'OK' },
    { ...payload, missing_regions: [region, region] },
    { ...payload, missing_regions: [{ ...region, geometry: { ...region.geometry, x: 159 } }] },
    { ...payload, missing_regions: [{ ...region, geometry: { ...region.geometry, width: 0 } }] },
    { ...payload, missing_regions: [{ ...region, geometry: { ...region.geometry, x: NaN } }] },
  ])
    assert.throws(() => validateFrameReview(input, 'rev', media));
  assert.throws(
    () => validateFrameReview(payload, 'new', media),
    (e) => e.status === 409,
  );
});
let pool, folder, dataset, reviews, server, base, original;
before(async () => {
  pool = testPool();
  await migrate(pool);
  await migrate(pool);
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-frames-'));
  const source = new URL('../fixtures/upload/', import.meta.url);
  const data = JSON.parse(await fs.readFile(new URL('dataset.json', source), 'utf8'));
  data.dataset.id = 'frame-review-test-' + Date.now();
  data.media.push({ ...data.media[0], id: 'empty-media', name: 'empty.png' });
  data.frames.push({ id: 'empty-frame', media_id: 'empty-media', index: 0, image: 'street.png' });
  await fs.copyFile(new URL('street.png', source), path.join(folder, 'street.png'));
  original = JSON.stringify(data);
  await fs.writeFile(path.join(folder, 'dataset.json'), original);
  dataset = await loadDataset(path.join(folder, 'dataset.json'), {
    apiPrefix: '/api/projects/test',
  });
  reviews = new ReviewStore(pool, dataset);
  await reviews.initialize();
  server = createApp({
    projects: {
      pool,
      context: async (id) => {
        if (id !== 'test') throw Error('unexpected');
        return { dataset, reviews };
      },
    },
    distRoot: folder,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/projects/test/frames`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (reviews) await cleanRevision(pool, reviews.datasetId);
  if (pool) await pool.end();
  if (folder) await fs.rm(folder, { recursive: true, force: true });
});
async function save(input, headers = {}) {
  return fetch(base + '/empty-frame/review', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
}
test('empty frames list, missing regions persist, conflicts are rejected and progress is frame scoped', async () => {
  const list = await (await fetch(base)).json();
  assert.equal(list.frames.length, 2);
  assert.equal(list.frames.find((f) => f.id === 'empty-frame').annotation_count, 0);
  const detail = await (await fetch(base + '/empty-frame')).json();
  assert.deepEqual(detail.annotations, []);
  const input = { ...payload, dataset_revision: dataset.meta.dataset_id };
  const saved = await save(input);
  assert.equal(saved.status, 200);
  const { review } = await saved.json();
  assert.equal(review.version, 1);
  const restarted = new FrameReviewStore(pool, reviews.datasetId);
  assert.deepEqual((await restarted.read('empty-frame')).missing_regions, [region]);
  assert.equal((await save(input)).status, 409);
  assert.equal(
    (await save({ ...input, version: 1, missing_regions: [], status: 'IN_PROGRESS' })).status,
    200,
  );
  assert.equal((await save({ ...input, version: 1 })).status, 409);
  assert.equal(
    (await save({ ...input, version: 2 }, { Origin: 'http://foreign.example' })).status,
    403,
  );
  assert.equal((await save({ ...input, version: 2, dataset_revision: 'stale' })).status, 409);
  const summary = (await (await fetch(base)).json()).summary;
  assert.equal(summary.reviewed, 0);
  assert.equal(summary.in_progress, 1);
  assert.equal(summary.missing_regions, 0);
  assert.equal(await fs.readFile(path.join(folder, 'dataset.json'), 'utf8'), original);
  assert.deepEqual(await reviews.list(), {});
  const other = new FrameReviewStore(pool, reviews.datasetId + 999999);
  assert.equal(await other.read('empty-frame'), null);
  assert.equal((await fetch(base + '/does-not-exist')).status, 404);
});
