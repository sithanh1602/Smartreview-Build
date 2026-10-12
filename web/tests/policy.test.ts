import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  analyzeDataset,
  checks,
  checksFor,
  imageRules,
  ENGINE_VERSION,
  ENGINE_VERSIONS,
  supportsWaivers,
} from '../core/risk/engine.ts';
import { POLICY, POLICY_VERSION, mergeLabels } from '../core/risk/policy.ts';

// The engine scores from policy/*.json. These tests hold the files and the engine together.
const dir = new URL('../policy/', import.meta.url);
const files = Object.fromEntries(
  readdirSync(dir).map((name) => [
    name.replace('.json', ''),
    Object.values(JSON.parse(readFileSync(new URL(name, dir), 'utf8')))[0] as any,
  ]),
);
const dataset = files._dataset;
const labels: any[] = dataset.labels.map((label) => files[label]);
const active = (file) => file.rules.filter((rule) => rule.status === 'active');
const scene = (boxes: any[]) => ({
  schema_version: '1.0.0',
  dataset: { id: 'scene', name: 'scene', source: { kind: 'model' } },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0 }],
  annotations: boxes.map(([label, confidence, x1, y1, x2, y2, attributes], i) => ({
    id: `b${i}`,
    frame_id: 'f0',
    label,
    ...(confidence != null && { confidence }),
    geometry: { type: 'bbox', x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    ...(attributes && { attributes }),
  })),
});
const analyze = (boxes: any[], options?: any): any => analyzeDataset(scene(boxes), options);
const found = (report: any, i: number) =>
  report.results[i].findings.map((f) => [f.rule_id, f.score]);

test('every active rule runs: its check or frame rule exists in the engine', () => {
  const ids = new Set(checks.map((c) => c.id));
  for (const file of [...labels, dataset, files.car_truck])
    for (const rule of active(file))
      if (!['min_size', 'waive'].includes(rule.template))
        assert.ok(ids.has(rule.check), `${rule.id} has no check`);
  // Nothing is left waiting: a rule either runs or is for people to read.
  for (const file of Object.values(files))
    for (const rule of file.rules) assert.notEqual(rule.status, 'proposed', rule.id);
  assert.deepEqual(
    imageRules.map((r) => [r.id, r.blocking]),
    active(files._frame).map((r) => [r.id, r.params.blocking]),
  );
  assert.equal(POLICY_VERSION, dataset.policy_version);
});

test('the shared file repeats what the label rules say', () => {
  for (const file of labels) {
    const rule = (template) => active(file).find((r) => r.template === template);
    assert.equal(rule('min_size').params.px, dataset.min_side_px[file.label], file.label);
    const sliver = rule('edge_sliver')?.params;
    if (!sliver) continue;
    const [low, high] = dataset.normal_ratio[file.label];
    assert.deepEqual(sliver.normal_ratio, [low, high]);
    assert.equal(sliver.side_cut_ratio_over, 2 * high);
    assert.equal(sliver.vertical_cut_ratio_under, low / 2);
    assert.equal(sliver.edge_px, POLICY.edgePx);
  }
});

test('a finding names the policy rule behind it, with that rule’s score', () => {
  const report = analyzeDataset(
    scene([
      ['person', 0.4, 100, 300, 300, 400],
      ['pole', null, 600, 300, 700, 400],
      ['dog', 0.4, 900, 300, 1000, 400],
    ]),
  );
  const found = (i) => report.results[i].evaluations.filter((e) => e.status === 'flagged');
  const rule = (id) => files[id.split('.')[0]]?.rules.find((r) => r.id === id);
  assert.deepEqual(
    found(0).map((e: any) => [e.rule_id, e.score]),
    ['person.low_confidence', 'person.wider_than_tall'].map((id) => [id, rule(id).score]),
  );
  assert.deepEqual(
    found(1).map((e: any) => e.rule_id),
    ['pole.not_slender'],
  );
  // A label without a file is scored by the shared rules.
  assert.deepEqual(
    found(2).map((e: any) => e.rule_id),
    ['any.low_confidence'],
  );
});

test('every engine version still runs, each on its own policy', () => {
  const data = scene([
    ['car', 0.48, 500, 360, 680, 480, { label_top2: 'truck', score_top2: 0.4 }],
    ['person', 0.4, 100, 300, 300, 400],
  ]);
  assert.deepEqual(ENGINE_VERSIONS, ['2.0.0', '2.1.0', '3.0.0', '4.0.0', '5.0.0', '6.0.0']);
  assert.equal(ENGINE_VERSION, '6.0.0');
  for (const engineVersion of ENGINE_VERSIONS) {
    const report = analyzeDataset(structuredClone(data), { engineVersion });
    assert.equal(report.engine_version, engineVersion);
    assert.deepEqual(
      Object.keys(report.checks),
      checksFor(engineVersion).map((c) => c.id),
    );
  }
  // 4.0.0 keeps the policy written in code: the car/truck doubt is still scored there.
  const old: any = analyzeDataset(structuredClone(data), { engineVersion: '4.0.0' });
  assert.equal(old.policy_version, '2.0.0');
  assert.equal(old.results[0].score, 70);
  assert.equal(analyze([]).policy_version, '4.0.0');
  assert.equal(analyze([], { engineVersion: '5.0.0' }).policy_version, '3.0.0');
  assert.equal((analyzeDataset(data) as any).results[0].score, 20);
  assert.deepEqual(ENGINE_VERSIONS.map(supportsWaivers), [false, false, false, true, true, true]);
  assert.throws(
    () => analyzeDataset(data, { engineVersion: '4.0.0', patches: [{ op: 'disable', rule: 'x' }] }),
    /takes no patches/,
  );
});

test('car against truck: the truck box takes the points, by how far it leads', () => {
  const pair = (car: number, truck: number) =>
    analyze([
      ['car', car, 300, 300, 500, 420],
      ['truck', truck, 302, 300, 500, 421],
    ]);
  // Truck ahead by less than 0.25: the truck is the doubtful box, car is suggested.
  let report = pair(0.5, 0.7);
  assert.deepEqual(found(report, 1), [['car_truck.same_place_flag_truck', 50]]);
  assert.equal(report.results[1].suggested_label, 'car');
  // The car is told nothing it must act on: the old duplicate rule stands down for this pair,
  // and a truck leading by more than 0.15 is only a warning.
  assert.equal(report.results[0].score, 0);
  assert.equal(report.results[0].findings[0].level, 'warning');
  assert.deepEqual(
    report.warning_cases.map((c) => c.id),
    ['b0'],
  );
  assert.deepEqual(found(pair(0.4, 0.8), 1), [['car_truck.same_place_flag_truck', 30]]);
  // Far ahead: a warning that scores nothing.
  report = pair(0.31, 0.9);
  assert.equal(report.results[1].score, 0);
  assert.equal(report.results[1].findings[0].level, 'warning');
  // A grey-zone car is still a second name for the truck.
  assert.deepEqual(found(pair(0.12, 0.3), 1).at(-1), ['car_truck.same_place_flag_truck', 50]);

  // A truck no taller than the cars beside it, with no second opinion and a middling score.
  report = analyze([
    ['truck', 0.62, 500, 300, 700, 420],
    ['car', 0.9, 100, 310, 300, 420],
    ['car', 0.9, 800, 320, 1000, 425],
  ]);
  assert.deepEqual(found(report, 0), [
    ['car_truck.truck_name_unsupported', 20],
    ['car_truck.truck_no_taller_than_cars', 10],
  ]);
});

test('attributes: required where the dataset carries them, and never across box kinds', () => {
  const car = (attributes?: object, confidence: number | null = 0.9, x = 300) => [
    'car',
    confidence,
    x,
    360,
    x + 180,
    480,
    attributes,
  ];
  assert.deepEqual(found(analyze([car(), car(undefined, 0.9, 600)]), 0), []);
  let report = analyze([
    car({ occluded: false }),
    car({ occluded: 'yes' }, 0.9, 600),
    car(undefined, 0.9, 900),
  ]);
  assert.deepEqual(found(report, 0), []);
  assert.deepEqual(found(report, 1), [['car.occlusion_attributes_valid', 30]]);
  assert.deepEqual(report.results[2].findings[0].evidence, { missing: ['occluded'], invalid: [] });
  // Hand-drawn boxes with the attribute ask nothing of model drafts without it.
  report = analyze([car({ occluded: false }, null), car(undefined, 0.9, 600)]);
  assert.deepEqual(found(report, 1), []);
  // truncated has to agree with where the box is.
  report = analyze([
    car({ truncated: true }),
    ['car', 0.9, 0, 360, 180, 480, { truncated: false }],
  ]);
  assert.deepEqual(found(report, 0), [['car.truncated_matches_edge', 10]]);
  assert.deepEqual(found(report, 1), [['car.truncated_matches_edge', 10]]);
  // An occluded object is not judged by its shape, and one measured as all but hidden is not
  // judged at all.
  const tall = (attributes?: object) => ['car', 0.9, 300, 100, 400, 400, attributes];
  assert.deepEqual(found(analyze([tall()]), 0), [['car.aspect', 15]]);
  assert.deepEqual(found(analyze([tall({ occluded: true })]), 0), []);
  assert.equal(analyze([tall({ occlusion_pct: 97 })]).results[0].state, 'ignored');
});

test('a project patches the policy: set, disable, narrow, add', () => {
  const boxes = [
    ['truck', 0.9, 300, 250, 700, 500],
    ['car', 0.45, 320, 300, 440, 420],
    ['person', 0.6, 900, 300, 1100, 400],
  ];
  const plain = analyze(boxes);
  assert.deepEqual(found(plain, 1), [
    ['car.low_confidence', 20],
    ['car.inside_large_vehicle', 30],
  ]);
  const report = analyze(boxes, {
    patches: [
      { op: 'set', rule: 'car.low_confidence', params: { below: 0.4 } },
      {
        op: 'narrow',
        rule: 'car.inside_large_vehicle',
        params: { container: { remove: ['truck'] } },
      },
      { op: 'set', rule: 'person.wider_than_tall', score: 45 },
      { op: 'disable', rule: 'coverage.bus_present' },
      {
        op: 'add',
        label: 'person',
        rule: {
          id: 'project.person.track',
          template: 'required_track',
          score: 30,
          text: 'Mọi box phải có track_id.',
        },
      },
    ],
  });
  assert.deepEqual(found(report, 1), []);
  assert.deepEqual(found(report, 2), [
    ['person.wider_than_tall', 45],
    ['project.person.track', 30],
  ]);
  assert.equal(report.results[2].findings[1].reason, 'Mọi box phải có track_id.');
  assert.equal(report.patches.length, 5);
  assert.equal('coverage.bus_present' in report.image_rules, false);
  // The policy as written is untouched by a project's patches.
  assert.deepEqual(analyze(boxes), plain);
  for (const patch of [
    { op: 'set', rule: 'car.nothing', score: 1 },
    { op: 'disable', rule: 'car.pickup_is_truck' },
    {
      op: 'add',
      label: 'car',
      rule: { id: 'project.x', template: 'no_such_template', score: 1, text: '' },
    },
    { op: 'add', label: 'car', rule: { id: 'project.y', template: 'aspect_ratio', text: '' } },
    { op: 'narrow', rule: 'car.low_confidence', params: { below: { remove: ['x'] } } },
  ])
    assert.throws(() => analyze(boxes, { patches: [patch] }), /policy:/, JSON.stringify(patch));
});

test('motorcycle and bicycle are one label, two_wheeler, from engine 6.0.0', () => {
  assert.equal(dataset.labels.includes('two_wheeler'), true);
  for (const old of dataset.merged_labels.two_wheeler) {
    assert.equal(dataset.labels.includes(old), false);
    assert.equal(dataset.aliases[old], 'two_wheeler');
  }
  // The model draws one scooter twice, under both of its old names.
  const boxes = [
    ['motorcycle', 0.8, 600, 400, 700, 500],
    ['bicycle', 0.6, 620, 400, 720, 500],
    ['Bike', 0.9, 900, 400, 1000, 500],
    ['two-wheeler', 0.9, 300, 400, 400, 500],
  ];
  const report = analyze(boxes);
  assert.deepEqual(found(report, 0), []);
  assert.deepEqual(found(report, 1), [['two_wheeler.duplicate_same_label', 50]]);
  assert.deepEqual(
    report.results.map((r) => r.findings.length),
    [0, 1, 0, 0],
  );
  // 5.0.0 keeps them apart: two labels on one object only count from 80% overlap.
  const before = analyze(boxes, { engineVersion: '5.0.0' });
  assert.deepEqual(
    before.results.map((r) => r.findings.length),
    [0, 0, 0, 0],
  );
  // An import stores the merged name; other aliases are spellings and stay as written.
  const data = mergeLabels(
    scene([
      ['motorcycle', 0.8, 0, 0, 50, 50],
      ['Bike', 0.8, 0, 0, 50, 50],
      ['rider', 0.8, 0, 0, 50, 50],
      ['car', 0.8, 0, 0, 50, 50],
    ]),
  );
  assert.deepEqual(
    data.annotations.map((a) => a.label),
    ['two_wheeler', 'two_wheeler', 'rider', 'car'],
  );
});
