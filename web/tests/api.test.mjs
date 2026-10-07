import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadDataset } from '../server/repository.mjs';
import { createApp } from './app-helper.mjs';
import { webRoot, projectRoot } from '../server/config.mjs';
let app, base, dataset;
before(async () => {
  dataset = await loadDataset(path.join(webRoot, 'datasets/demo/dataset.json'));
  app = createApp({ dataset, distRoot: path.join(webRoot, 'dist') });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${app.address().port}`;
});
after(async () => {
  if (app) await new Promise((resolve) => app.close(resolve));
});
const json = async (url) => (await fetch(base + url)).json();
test('scene annotations include clean objects and remain scoped to one video frame', async () => {
  const focus = dataset.cases.find((c) => c.id === '2-422');
  const q = new URLSearchParams({
    media: focus.media_id,
    frame: focus.frame_ref,
    dataset: dataset.meta.dataset_id,
  });
  const scene = await json(`/api/annotations?${q}`);
  const expected = dataset.normalized.annotations.filter((a) => a.frame_id === focus.frame_ref);
  assert.deepEqual(scene.annotations.map((a) => a.id).sort(), expected.map((a) => a.id).sort());
  assert.ok(scene.annotations.length > 1);
  assert.ok(scene.annotations.every((a) => a.media_id === focus.media_id && a.frame_id === 422));
  q.delete('frame');
  assert.equal((await fetch(base + `/api/annotations?${q}`)).status, 400);
  q.set('frame', 'missing');
  assert.equal((await fetch(base + `/api/annotations?${q}`)).status, 404);
  q.set('dataset', 'stale');
  assert.equal((await fetch(base + `/api/annotations?${q}`)).status, 409);
});

test('new engine preserves all 9 legacy demo case IDs/scores including frame 422', async () => {
  const legacy = JSON.parse(
    await fs.readFile(path.join(projectRoot, 'outputs/risk_cases_v1.json')),
  );
  const cases = await json('/api/cases');
  assert.equal(cases.length, 9);
  for (const c of legacy) {
    const current = cases.find((x) => x.id === `${c.track_id}-${c.frame_id}`);
    assert.ok(current);
    assert.equal(current.score, c.risk_score);
  }
  const c = await json('/api/cases/2-422');
  assert.equal(c.score, 70);
  assert.deepEqual(
    Object.values(c.context).map((o) => o.frame_id),
    [421, 422, 423],
  );
  assert.deepEqual(
    Object.values(c.context).map((o) => o.confidence),
    [0.5231, 0.2928, 0.605],
  );
  assert.deepEqual(c.check_ids, ['temporal.class_inconsistency', 'confidence.neighbor_drop']);
  assert.equal(c.reference.annotation_id, '2-422');
  assert.equal((await json('/api/meta')).total_tracks, 110);
});

test('all risk context images and per-frame geometry load from canonical dataset assets', async () => {
  for (const c of await json('/api/cases'))
    for (const o of Object.values(c.context)) {
      const response = await fetch(base + o.image_url);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
      const source = dataset.normalized.annotations.find((a) => a.id === o.annotation_id);
      assert.deepEqual(o.geometry, source.geometry);
    }
});

test('API filters, all-annotation review, read-only methods, missing assets and dataset mismatch', async () => {
  for (const level of ['high', 'medium', 'low'])
    assert.ok((await json(`/api/cases?level=${level}`)).every((c) => c.severity === level));
  assert.equal((await json('/api/cases?scope=all')).length, 3742);
  assert.equal((await fetch(base + '/api/cases?level=invalid')).status, 400);
  assert.equal((await fetch(base + '/api/cases', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/cases/missing')).status, 404);
  assert.equal(
    (await fetch(base + '/api/assets/missing?dataset=' + dataset.meta.dataset_id)).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        base + dataset.cases[0].context.current.image_url.replace(dataset.meta.dataset_id, 'old'),
      )
    ).status,
    409,
  );
  for (const route of ['/', '/review/2-422', '/unknown'])
    assert.match(await (await fetch(base + route)).text(), /<div id="root"><\/div>/);
  assert.equal((await fetch(base + '/missing.js')).status, 404);
});

test('human dataset loads end-to-end with no demo files, model, confidence or tracking', async () => {
  const human = await loadDataset(path.join(webRoot, 'datasets/human/dataset.json'));
  assert.equal(human.meta.total_annotations, 4);
  assert.equal(human.cases.length, 2);
  assert.equal(human.meta.total_tracks, 0);
  assert.ok(human.allCases.every((c) => !('confidence' in c) && !('track_id' in c)));
  const server = createApp({ dataset: human, distRoot: path.join(webRoot, 'dist') });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const q = new URLSearchParams({
      media: human.normalized.media[0].id,
      dataset: human.meta.dataset_id,
    });
    const scene = await (await fetch(url + `/api/annotations?${q}`)).json();
    assert.equal(scene.annotations.length, 4);
    assert.ok(scene.annotations.every((a) => a.confidence == null && a.track_id == null));
    const response = await fetch(url + human.cases[0].context.current.image_url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /HUMAN ANNOTATION FIXTURE/);
    assert.equal((await (await fetch(url + '/api/cases?scope=all')).json()).length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
