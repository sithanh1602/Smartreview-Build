import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, checks, ENGINE_VERSION } from '../core/risk/engine.ts';
import { buildDataset } from '../server/repository.ts';
import { waiversFrom } from '../shared/guideline-waivers.ts';

// One 1280x720 frame; boxes as [label, confidence, x1, y1, x2, y2].
const scene = (boxes: any[]): any => ({
  schema_version: '1.0.0',
  dataset: { id: 'scene', name: 'scene', source: { kind: 'model' } },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0 }],
  annotations: boxes.map(([label, confidence, x1, y1, x2, y2], i) => ({
    id: `b${i}`,
    frame_id: 'f0',
    label,
    confidence,
    geometry: { type: 'bbox', x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
  })),
});
// A rider drawn as a box that nearly coincides with the bike, and a passenger behind glass.
const SCENE = scene([
  ['bus', 0.9, 200, 200, 800, 520],
  ['person', 0.7, 400, 260, 480, 360],
  ['motorcycle', 0.8, 900, 380, 960, 480],
  ['person', 0.75, 900, 370, 960, 480],
]);
const ids = checks.map((c) => c.id);
const rule = (over: object) => ({
  id: 'G-001',
  kind: 'check',
  verdict: 'accept',
  classes: ['person', 'Motorcycle'],
  overrides: ['context.person_two_wheeler'],
  ...over,
});

test('with no waivers the engine scores exactly as before', () => {
  const plain = analyzeDataset(SCENE);
  assert.deepEqual(analyzeDataset(SCENE, { waivers: {} }), plain);
  assert.equal('waivers' in plain, false);
  assert.deepEqual(plain.results[1].check_ids, [
    'context.person_in_vehicle',
    'visibility.barely_visible',
  ]);
  assert.deepEqual(plain.results[3].check_ids, ['context.person_two_wheeler']);
  assert.equal(plain.frames[0].tier, 'verify');
});

test('a waived check stands down for the named labels only, and says so', () => {
  const waivers = { 'context.person_two_wheeler': ['person'] };
  const report = analyzeDataset(SCENE, { waivers });
  // The rider is no longer a case; the passenger still is.
  assert.deepEqual(report.results[3].check_ids, []);
  assert.equal(report.results[3].score, 0);
  assert.deepEqual(report.results[1].check_ids, [
    'context.person_in_vehicle',
    'visibility.barely_visible',
  ]);
  assert.deepEqual(
    report.cases.map((c) => c.id),
    ['b1'],
  );
  assert.deepEqual(report.waivers, waivers);
  assert.equal(report.checks['context.person_two_wheeler'].skip_reasons.guideline_waived, 2);

  // Waiving everything said about the passenger leaves no flagged box, so the frame passes the
  // risk gate.
  const all = analyzeDataset(SCENE, {
    waivers: {
      ...waivers,
      'context.person_in_vehicle': ['*'],
      'visibility.barely_visible': ['person'],
    },
  });
  assert.deepEqual(all.cases, []);
  assert.equal(report.frames[0].gates.risk, false);
  assert.equal(all.frames[0].gates.risk, true);
  // A label the check never looks at changes nothing.
  assert.deepEqual(
    analyzeDataset(SCENE, { waivers: { 'context.person_two_wheeler': ['bus'] } }).results[3]
      .check_ids,
    ['context.person_two_wheeler'],
  );
});

test('only a chosen guideline rule that permits what a check flags becomes a waiver', () => {
  const from = (rules: object[], choices: object) => waiversFrom({ rules, choices }, ids);
  assert.deepEqual(from([rule({})], { 'G-001': 'guideline' }), {
    'context.person_two_wheeler': ['motorcycle', 'person'],
  });
  // Not chosen, or the policy was kept: scoring stays as it is.
  assert.deepEqual(from([rule({})], {}), {});
  assert.deepEqual(from([rule({})], { 'G-001': 'policy' }), {});
  // Stricter and new rules are prose; choosing them cannot change what runs.
  assert.deepEqual(from([rule({ verdict: 'flag' })], { 'G-001': 'guideline' }), {});
  assert.deepEqual(from([rule({ overrides: [] })], { 'G-001': 'guideline' }), {});
  assert.deepEqual(from([rule({ kind: 'reviewer' })], { 'G-001': 'guideline' }), {});
  // The file comes from a browser: unknown checks and malformed fields are ignored.
  assert.deepEqual(
    from([rule({ overrides: ['made.up', 7, 'context.person_in_vehicle'], classes: ['*', 3] })], {
      'G-001': 'guideline',
    }),
    { 'context.person_in_vehicle': ['*'] },
  );
  assert.deepEqual(from([rule({ classes: [] })], { 'G-001': 'guideline' }), {});
  for (const junk of [null, 'x', {}, { rules: 'x', choices: {} }, { rules: [null], choices: 1 }])
    assert.deepEqual(waiversFrom(junk, ids), {});
  // Two rules on one check merge; order does not matter.
  assert.deepEqual(
    from(
      [
        rule({ id: 'G-002', classes: ['person'], overrides: ['context.person_two_wheeler'] }),
        rule({ id: 'G-001', classes: ['bicycle'], overrides: ['context.person_two_wheeler'] }),
      ],
      { 'G-001': 'guideline', 'G-002': 'guideline' },
    ),
    { 'context.person_two_wheeler': ['bicycle', 'person'] },
  );
});

test('a project keeps its fingerprint unless its waivers change what is scored', async () => {
  const text = JSON.stringify(SCENE);
  const source = { remote: false, locate: (image: string) => image, read: async () => null };
  const build = (options: object) =>
    buildDataset(text, { engineVersion: ENGINE_VERSION, ...options }, source);
  const plain = await build({});
  const same = await build({ waivers: {} });
  const waived = await build({ waivers: { 'context.person_two_wheeler': ['person'] } });
  assert.equal(same.meta.dataset_id, plain.meta.dataset_id);
  assert.equal('guideline_waivers' in plain.meta, false);
  assert.notEqual(waived.meta.dataset_id, plain.meta.dataset_id);
  assert.deepEqual(waived.meta.guideline_waivers, { 'context.person_two_wheeler': ['person'] });
  assert.deepEqual(plain.allCases[3].check_ids, ['context.person_two_wheeler']);
  assert.deepEqual(waived.allCases[3].check_ids, []);
  // Reloading with the stored waivers gives the stored revision back.
  assert.equal(
    (await build({ waivers: waived.meta.guideline_waivers })).meta.dataset_id,
    waived.meta.dataset_id,
  );
  // MySQL returns a stored JSON object with its keys reordered (shorter keys first); the
  // revision must not depend on that.
  const three = {
    'context.person_two_wheeler': ['bicycle', 'person'],
    'context.vehicle_in_large_vehicle': ['car', 'truck'],
    'geometry.edge_truncated': ['car'],
  };
  const reordered = {
    'geometry.edge_truncated': ['car'],
    'context.vehicle_in_large_vehicle': ['truck', 'car'],
    'context.person_two_wheeler': ['person', 'bicycle', 'person'],
  };
  const stored = await build({ waivers: three });
  const reloaded = await build({ waivers: reordered });
  assert.equal(reloaded.meta.dataset_id, stored.meta.dataset_id);
  assert.deepEqual(reloaded.meta.guideline_waivers, three);
  assert.deepEqual(Object.keys(reloaded.meta.guideline_waivers!), Object.keys(three));
  // An older engine profile cannot apply waivers, so it is not given a new revision for them.
  const legacy = await buildDataset(text, { engineVersion: '2.0.0' }, source);
  const legacyWaived = await buildDataset(
    text,
    { engineVersion: '2.0.0', waivers: { 'context.person_two_wheeler': ['person'] } },
    source,
  );
  assert.equal(legacyWaived.meta.dataset_id, legacy.meta.dataset_id);
});
