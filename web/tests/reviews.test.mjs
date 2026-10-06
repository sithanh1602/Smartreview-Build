import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadDataset } from '../server/repository.mjs';
import { createApp } from '../server/app.mjs';
import { webRoot } from '../server/config.mjs';
import { ReviewStore } from '../server/reviews/store.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { testPool, cleanRevision } from './db-helpers.mjs';
let pool, dataset, store, server, base;
const call = async (route, method = 'GET', payload) => {
  const res = await fetch(base + route, {
    method,
    ...(payload === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  return { status: res.status, body: await res.json() };
};
const payload = (extra = {}) => ({
  dataset_revision: dataset.meta.dataset_id,
  decision: 'ERROR',
  error_type: 'CLASS',
  corrected_value: 'car',
  note: "Xe vàng; review thủ công ' ✔",
  ...extra,
});
before(async () => {
  pool = testPool();
  await migrate(pool);
  await migrate(pool);
  dataset = await loadDataset(path.join(webRoot, 'datasets/demo/dataset.json'));
  dataset.meta.dataset_id = randomBytes(10).toString('hex');
  store = new ReviewStore(pool, dataset);
  await store.initialize();
  server = createApp({ dataset, reviews: store, distRoot: path.join(webRoot, 'dist') });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) {
    await cleanRevision(pool, store?.datasetId);
    await pool.end();
  }
});

test('migration can run twice and initial metrics come from persisted risk references', async () => {
  const { body: m } = await call('/api/dashboard/metrics');
  assert.equal(m.total_risk_cases, 9);
  assert.equal(m.reviewed, 0);
  assert.equal(m.unreviewed, 9);
  assert.equal(m.high, 1);
  assert.equal(m.medium, 8);
  assert.equal(m.review_progress, 0);
  const [rows] = await pool.query('SELECT version FROM schema_migrations');
  assert.equal(rows.length, 2);
});
test('create review persists Unicode, correction and accurate UTC timestamp; restart retains it', async () => {
  const res = await call('/api/risk-cases/2-422/review', 'POST', payload());
  assert.equal(res.status, 201);
  assert.equal(res.body.review.decision, 'ERROR');
  assert.equal(res.body.review.note, payload().note);
  assert.ok(Math.abs(Date.now() - Date.parse(res.body.review.reviewed_at)) < 10000);
  const freshPool = testPool();
  try {
    const freshStore = new ReviewStore(freshPool, dataset);
    await freshStore.initialize();
    assert.equal((await freshStore.read('2-422')).corrected_value, 'car');
  } finally {
    await freshPool.end();
  }
  const { body: m } = await call('/api/dashboard/metrics');
  assert.equal(m.reviewed, 1);
  assert.equal(m.confirmed_errors, 1);
  assert.equal(m.unreviewed, 8);
  assert.equal(m.review_progress, 11.1);
});
test('update decision clears obsolete correction, retains one row, and rejects conflicting edits', async () => {
  assert.equal((await call('/api/cases/2-422/review', 'POST', payload())).status, 409);
  const res = await call(
    '/api/cases/2-422/review',
    'PUT',
    payload({ decision: 'CORRECT', error_type: null, corrected_value: null, version: 1 }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.review.version, 2);
  assert.equal(res.body.review.error_type, null);
  assert.equal((await call('/api/cases/2-422/review', 'PUT', payload({ version: 1 }))).status, 409);
  const { body: m } = await call('/api/dashboard/metrics');
  assert.equal(m.reviewed, 1);
  assert.equal(m.confirmed_errors, 0);
  assert.equal(m.correct, 1);
  assert.equal((await call('/api/cases?review_status=CORRECT')).body.length, 1);
  assert.equal((await call('/api/cases?review_status=unreviewed')).body.length, 8);
});
test('validation, unknown cases, malformed JSON and stale dataset do not write decisions', async () => {
  for (const extra of [
    { decision: 'BAD' },
    { error_type: 'BAD' },
    { corrected_value: '' },
    { note: 'x'.repeat(4001) },
    { extra: 'field' },
  ])
    assert.equal((await call('/api/cases/1-470/review', 'POST', payload(extra))).status, 400);
  assert.equal(
    (await call('/api/cases/1-470/review', 'POST', payload({ dataset_revision: 'old' }))).status,
    409,
  );
  assert.equal((await call('/api/cases/missing/review', 'POST', payload())).status, 404);
  assert.equal((await call('/api/cases/1-470/review', 'PUT', payload({ version: 1 }))).status, 404);
  assert.equal(
    (
      await fetch(base + '/api/cases/1-470/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + '/api/cases/1-470/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' },
        body: JSON.stringify(payload()),
      })
    ).status,
    403,
  );
  assert.equal((await call('/api/dashboard/metrics')).body.reviewed, 1);
});
test('large request gets 413 and database outage returns 503 without exposing credentials', async () => {
  const response = await fetch(base + '/api/cases/1-470/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload({ note: 'x'.repeat(40000) })),
  });
  assert.equal(response.status, 413);
  const unavailable = createApp({
    dataset,
    reviews: {
      list: async () => {
        throw Object.assign(new Error('secret detail'), { code: 'ECONNREFUSED' });
      },
    },
    distRoot: path.join(webRoot, 'dist'),
  });
  await new Promise((resolve) => unavailable.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${unavailable.address().port}/api/reviews`);
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), /secret detail/);
  } finally {
    await new Promise((resolve) => unavailable.close(resolve));
  }
});

test('UNSURE is persisted and concurrent create only counts once', async () => {
  const values = payload({ decision: 'UNSURE', error_type: null, corrected_value: null });
  const responses = await Promise.all([
    call('/api/cases/1-470/review', 'POST', values),
    call('/api/cases/1-470/review', 'POST', values),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await call('/api/dashboard/metrics')).body.unsure, 1);
});
test('human annotations without track/confidence and clean annotations remain reviewable', async () => {
  const human = await loadDataset(path.join(webRoot, 'datasets/human/dataset.json'));
  human.meta.dataset_id = randomBytes(10).toString('hex');
  const s = new ReviewStore(pool, human);
  await s.initialize();
  try {
    const item = human.cases[0];
    assert.equal(item.confidence, undefined);
    assert.equal(item.track_id, undefined);
    await s.save(
      item,
      { decision: 'ERROR', error_type: 'BBOX', corrected_value: null, note: 'BBox invalid' },
      'create',
    );
    const clean = human.allCases.find((c) => c.score === 0);
    await s.save(
      clean,
      { decision: 'CORRECT', error_type: null, corrected_value: null, note: null },
      'create',
    );
    const m = await s.metrics();
    assert.equal(m.total_risk_cases, 2);
    assert.equal(m.reviewed, 1);
    assert.equal(m.confirmed_errors, 1);
    assert.equal(Object.keys(await s.list()).length, 2);
  } finally {
    await cleanRevision(pool, s.datasetId);
  }
});
test('dataset revisions isolate decisions and zero-case metrics do not divide by zero', async () => {
  const clone = structuredClone(dataset);
  clone.meta.dataset_id = randomBytes(10).toString('hex');
  clone.cases = [];
  const s = new ReviewStore(pool, clone);
  await s.initialize();
  try {
    assert.equal(await s.read('2-422'), null);
    const m = await s.metrics();
    assert.equal(m.total_risk_cases, 0);
    assert.equal(m.review_progress, 0);
  } finally {
    await cleanRevision(pool, s.datasetId);
  }
});

test('Vite dev proxy preserves same-origin review writes and rejects foreign origins', async () => {
  const { createServer } = await import('vite');
  const { default: config } = await import('../vite.config.js');
  const vite = await createServer({
    ...config,
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      ...config.server,
      port: 3199,
      strictPort: false,
      proxy: { '/api': { ...config.server.proxy['/api'], target: base } },
    },
  });
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const current = await store.read('2-422');
    const res = await fetch(origin + '/api/cases/2-422/review', {
      method: 'PUT',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({ version: current.version })),
    });
    assert.equal(res.status, 200, JSON.stringify(await res.json()));
    const denied = await fetch(origin + '/api/cases/2-422/review', {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    assert.equal(denied.status, 403);
  } finally {
    await vite.close();
  }
});
