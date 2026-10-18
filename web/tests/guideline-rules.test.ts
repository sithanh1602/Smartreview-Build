import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, checkPatches, ENGINE_VERSION } from '../core/risk/engine.ts';
import { verifierRequest } from '../core/risk/label-verify.ts';
import { buildDataset } from '../server/repository.ts';
import {
  captionsFrom,
  describeRun,
  directionOf,
  guessRun,
  patchesFrom,
  rulesForLabel,
  runMismatch,
  runProblem,
  stableJson,
  summaryFrom,
} from '../shared/guideline-rules.ts';

// One 1280x720 frame; boxes as [label, confidence, x1, y1, x2, y2].
const scene = (boxes: any[]): any => ({
  schema_version: '1.0.0',
  dataset: { id: 'scene', name: 'scene', source: { kind: 'model' } },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0, image: 'm.jpg' }],
  annotations: boxes.map(([label, confidence, x1, y1, x2, y2], i) => ({
    id: `b${i}`,
    frame_id: 'f0',
    label,
    confidence,
    geometry: { type: 'bbox', x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
  })),
});
// A small car and a large one, both drafted with confidence.
const SCENE = scene([
  ['car', 0.9, 100, 400, 160, 440],
  ['car', 0.9, 400, 300, 700, 520],
]);
const rule = (over: object) => ({
  id: 'G-01',
  section: '4.1',
  quote: 'Xe có cạnh dài dưới 80 px phải được gán lại.',
  kind: 'check',
  verdict: 'flag',
  relation: 'new',
  classes: ['Car'],
  condition: 'Box car có cạnh dài nhỏ hơn 80 px.',
  quantities: ['box.size'],
  ...over,
});
const run = { template: 'min_size', params: { side: 'long', px: 80 }, score: 30 };

test('only a chosen new or stricter rule with a complete run becomes a patch', () => {
  const file = (over: object = {}, choice = 'guideline', spec: object = run) => ({
    rules: [rule(over)],
    choices: { 'G-01': choice },
    runs: { 'G-01': spec },
  });
  assert.deepEqual(patchesFrom(file()), [
    {
      op: 'add',
      label: 'car',
      rule: {
        id: 'guideline.G-01.car',
        status: 'active',
        template: 'min_size',
        check: 'guideline.G-01',
        params: { action: 'flag', side: 'long', px: 80 },
        score: 30,
        error_type: 'BBOX',
        text: 'Guideline 4.1: Box car có cạnh dài nhỏ hơn 80 px.',
      },
      from: { rule: 'G-01', section: '4.1', quote: 'Xe có cạnh dài dưới 80 px phải được gán lại.' },
    },
  ]);
  // Kept policy, a looser rule, a rule the reviewer judges, a run with a number missing, and
  // a class the policy does not know: nothing runs.
  assert.deepEqual(patchesFrom(file({}, 'policy')), []);
  assert.deepEqual(patchesFrom(file({ relation: 'looser' })), []);
  assert.deepEqual(patchesFrom(file({ kind: 'reviewer' })), []);
  assert.deepEqual(patchesFrom(file({}, 'guideline', { ...run, params: { side: 'long' } })), []);
  assert.deepEqual(patchesFrom(file({ classes: ['tricycle'] })), []);
  assert.deepEqual(patchesFrom(file({ id: 'G 01; drop' })), []);
  assert.deepEqual(patchesFrom(null), []);
  // "*" adds one rule for every label.
  assert.deepEqual(
    patchesFrom(file({ classes: ['*', 'car'] })).map((p) => p.op === 'add' && p.label),
    ['*'],
  );
});

test('a guideline check flags the boxes it names and is reported under its own id', () => {
  const patches = patchesFrom({
    rules: [rule({})],
    choices: { 'G-01': 'guideline' },
    runs: { 'G-01': run },
  });
  const plain = analyzeDataset(SCENE),
    report = analyzeDataset(SCENE, { patches });
  assert.equal(plain.results[0].check_ids.includes('guideline.G-01'), false);
  assert.ok(report.results[0].check_ids.includes('guideline.G-01'));
  assert.equal(report.results[1].check_ids.includes('guideline.G-01'), false);
  const finding = report.results[0].findings.find((f) => f.check_id === 'guideline.G-01')!;
  assert.equal(finding.reason, 'Guideline 4.1: Box car có cạnh dài nhỏ hơn 80 px.');
  assert.deepEqual(report.patches, patches);
  // A patch the policy cannot run is refused before any dataset is scored.
  assert.throws(
    () =>
      checkPatches([
        {
          op: 'add',
          label: 'car',
          rule: {
            ...(patches[0] as any).rule,
            id: 'x',
            params: { action: 'flag', side: 'diagonal', px: 5 },
          },
        } as any,
      ]),
    /side "diagonal" is not supported/,
  );
});

test('patches change the dataset fingerprint, whatever order their keys come back in', async () => {
  const source = { remote: false, locate: (image: string) => image, read: async () => null };
  const json = JSON.stringify(SCENE);
  const options = { namespace: 'p', engineVersion: ENGINE_VERSION };
  const patches = patchesFrom({
    rules: [rule({})],
    choices: { 'G-01': 'guideline' },
    runs: { 'G-01': run },
  });
  const plain = await buildDataset(json, options, source);
  const patched = await buildDataset(json, { ...options, patches }, source);
  // MySQL hands a JSON object back with its keys in another order.
  const reordered = JSON.parse(
    JSON.stringify(patches, (_, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  );
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(patches));
  assert.equal(stableJson(reordered), stableJson(patches));
  const again = await buildDataset(json, { ...options, patches: reordered }, source);
  assert.equal(
    (await buildDataset(json, { ...options, patches: [] }, source)).meta.dataset_id,
    plain.meta.dataset_id,
  );
  assert.notEqual(patched.meta.dataset_id, plain.meta.dataset_id);
  assert.equal(again.meta.dataset_id, patched.meta.dataset_id);
  assert.deepEqual(patched.meta.guideline_patches, patches);
  assert.equal('guideline_patches' in plain.meta, false);
});

test('a guess fills the template and the numbers the condition states', () => {
  assert.deepEqual(guessRun(rule({}) as any), run);
  assert.deepEqual(
    guessRun(rule({ quantities: ['box.confidence'], condition: 'confidence dưới 40%' }) as any),
    { template: 'low_confidence', params: { below: 0.4 }, score: 30 },
  );
  assert.deepEqual(
    guessRun(rule({ quantities: ['box.attribute'], classes: ['car'] }) as any, [
      { name: 'Car', attributes: [{ name: 'occluded', values: ['yes', 'no'] }] },
    ])?.params,
    { names: ['occluded'], values: ['yes', 'no'] },
  );
  assert.equal(guessRun(rule({ quantities: ['pair.overlap'] }) as any), null);
  assert.equal(
    runProblem({ template: 'aspect_ratio', params: {}, score: 30 }),
    'Cần ít nhất một đầu của khoảng.',
  );
  assert.equal(runProblem({ ...run, score: 0 }), 'Điểm phải từ 1 tới 100.');
  assert.equal(runProblem(run), null);
});

// "Chỉ lấy những cái rescore <= 0.3": the model wrote the condition as what gets flagged.
const rescoreRule = rule({
  classes: ['*'],
  quote: 'Chỉ lấy những cái rescore <= 0.3',
  condition: 'box có điểm rescore lớn hơn 0.3',
  quantities: ['box.confidence'],
});
test('a score rule runs on the score it names, in the direction its condition says', () => {
  const guessed = guessRun(rescoreRule as any)!;
  assert.deepEqual(guessed, {
    template: 'score_range',
    params: { source: 'rescore', above: 0.3 },
    score: 30,
  });
  assert.equal(runMismatch(rescoreRule as any, guessed), null);
  assert.equal(describeRun(guessed), 'Gắn cờ box có rescore > 0,3 (+30 điểm).');
  // The run the demo project was scored with said the opposite on two counts.
  const old = { template: 'low_confidence', params: { below: 0.3 }, score: 30 } as const;
  assert.match(
    runMismatch(rescoreRule as any, old)!,
    /nói về rescore, nhưng check này đo confidence/,
  );
  assert.match(
    runMismatch(rule({ condition: 'confidence lớn hơn 0.8' }) as any, old)!,
    /LỚN HƠN ngưỡng, nhưng check này gắn cờ khi NHỎ HƠN/,
  );
  // A confidence above a number has no low_confidence to run as; below one still does.
  assert.deepEqual(
    guessRun(rule({ quantities: ['box.confidence'], condition: 'confidence trên 0.8' }) as any),
    { template: 'score_range', params: { source: 'confidence', above: 0.8 }, score: 30 },
  );
  assert.equal(directionOf('rescore <= 0.3'), 'below');
  assert.equal(
    runProblem({ template: 'score_range', params: { source: 'rescore' }, score: 30 }),
    'Cần ngưỡng “lớn hơn” hoặc “nhỏ hơn”.',
  );
  assert.match(
    runProblem({
      template: 'score_range',
      params: { source: 'rescore', above: 0.2, below: 0.5 },
      score: 30,
    })!,
    /mọi box đều bị gắn cờ/,
  );
});

test('a rescore rule flags the boxes a person drew whose rescore is out of bounds', () => {
  const drawn = scene([
    ['car', undefined, 100, 300, 300, 450],
    ['car', undefined, 500, 300, 700, 450],
    ['car', undefined, 800, 300, 1000, 450],
  ]);
  drawn.annotations[0].attributes = { rescore: 0.9 };
  drawn.annotations[1].attributes = { rescore: 0.1 };
  for (const a of drawn.annotations) delete a.confidence;
  const patches = patchesFrom({
    rules: [rescoreRule],
    choices: { 'G-01': 'guideline' },
    runs: { 'G-01': guessRun(rescoreRule as any) },
  });
  assert.equal(patches.length, 1);
  checkPatches(patches);
  const report = analyzeDataset(drawn, { patches });
  const flagged = (i: number) => report.results[i].check_ids.includes('guideline.G-01');
  // Above 0.3 is flagged; below it is not; a box without a rescore is skipped.
  assert.deepEqual([flagged(0), flagged(1), flagged(2)], [true, false, false]);
  const finding = report.results[0].findings.find((f) => f.check_id === 'guideline.G-01')!;
  assert.deepEqual(finding.evidence, { rescore: 0.9, above: 0.3 });
});

test('guideline captions join the policy captions sent to the label verifier', () => {
  const captions = captionsFrom({
    captions: {
      Person: [
        'a photo of a person riding a motorcycle',
        ' ',
        'a photo of a person riding a motorcycle',
      ],
      tricycle: ['a photo of a tricycle'],
      car: 'not a list',
    },
  });
  assert.deepEqual(captions, { person: ['a photo of a person riding a motorcycle'] });
  const data = scene([['person', 0.9, 100, 100, 200, 300]]);
  const plain = verifierRequest(data, () => '/m.jpg').request.labels;
  const labels = verifierRequest(data, () => '/m.jpg', 'siglip', { captions }).request.labels;
  assert.deepEqual(labels.person, [...plain.person, 'a photo of a person riding a motorcycle']);
  assert.deepEqual(labels.car, plain.car);
});

test('the summary keeps every rule with its choice, and the reviewer sees those of the label', () => {
  const summary = summaryFrom(
    {
      rules: [
        rule({}),
        rule({
          id: 'G-02',
          kind: 'reviewer',
          classes: ['car'],
          condition: 'Xe bị che quá nửa thì bỏ.',
        }),
        rule({ id: 'G-03', kind: 'definition', classes: ['*'], condition: 'SUV là car.' }),
        rule({ id: 'G-04', kind: 'reviewer', classes: ['person'] }),
        { id: 5 },
      ],
      choices: { 'G-01': 'guideline', 'G-02': 'whatever' },
      conflicts: [{}],
    },
    'guideline.md',
  );
  assert.equal(summary.name, 'guideline.md');
  assert.equal(summary.conflicts, 1);
  assert.deepEqual(
    summary.rules.map((r) => [r.id, r.choice]),
    [
      ['G-01', 'guideline'],
      ['G-02', undefined],
      ['G-03', undefined],
      ['G-04', undefined],
    ],
  );
  assert.deepEqual(
    rulesForLabel(summary, 'Car').map((r) => r.id),
    ['G-02', 'G-03'],
  );
  assert.deepEqual(rulesForLabel(undefined, 'car'), []);
});
