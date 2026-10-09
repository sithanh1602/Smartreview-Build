import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, checks } from '../core/risk_v3/engine.mjs';
import { analyzeDataset as analyzeV1 } from '../core/risk_v1/engine.mjs';

// Scenes follow the label_policy scenarios (CAR-n, IMG-n): one 1280x720 frame, boxes as
// [label, confidence, x1, y1, x2, y2, [label_top2, score_top2]].
function scene(boxes, { env, source = 'model' } = {}) {
  return {
    schema_version: '1.0.0',
    dataset: {
      id: 'scene',
      name: 'scene',
      source: { kind: source },
      ...(env !== undefined && { metadata: { env_risk: { f0: env } } }),
    },
    media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
    frames: [{ id: 'f0', media_id: 'm', index: 0 }],
    annotations: boxes.map(([label, confidence, x1, y1, x2, y2, top2], i) => ({
      id: `b${i}`,
      frame_id: 'f0',
      label,
      ...(confidence != null && { confidence }),
      geometry: { type: 'bbox', x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
      ...(top2 && { attributes: { label_top2: top2[0], score_top2: top2[1] } }),
    })),
  };
}
const CLEAN_CAR = ['car', 0.91, 500, 360, 680, 480];
const run = (boxes, options) => {
  const report = analyzeDataset(scene(boxes, options));
  return { report, frame: report.frames[0], box: (i) => report.results[i] };
};

test('clean car is auto-accepted; pickup confusion is flagged with a suggested label', () => {
  let { frame, box } = run([CLEAN_CAR]);
  assert.equal(box(0).score, 0);
  assert.equal(frame.tier, 'auto_accept');
  assert.deepEqual(frame.gates, { policy: true, risk: true, confidence: true });

  ({ frame, box } = run([['car', 0.48, 500, 360, 680, 480, ['truck', 0.4]]]));
  assert.deepEqual(box(0).check_ids, [
    'confidence.low_score',
    'confidence.class_margin',
    'confidence.vehicle_confusion',
  ]);
  assert.equal(box(0).score, 70);
  assert.equal(box(0).suspected_error, 'CLASS');
  assert.equal(box(0).suggested_label, 'truck');
  assert.equal(frame.tier, 'verify');
  assert.deepEqual(frame.flagged, ['b0']);
});

test('vehicle context and geometry rules match CAR-3, CAR-5..7, CAR-9..11', () => {
  let { box } = run([
    ['truck', 0.85, 300, 250, 700, 500],
    ['car', 0.42, 320, 300, 440, 420],
  ]);
  assert.deepEqual(box(1).check_ids, ['confidence.low_score', 'context.vehicle_in_large_vehicle']);
  assert.equal(box(1).score, 50);
  assert.equal(box(1).suspected_error, 'EXTRA_OBJECT');
  assert.equal(box(0).score, 0);

  ({ box } = run([
    ['car', 0.36, 150, 610, 1150, 720],
    ['car', 0.95, 250, 300, 1050, 720],
    ['car', 0.64, 400, 60, 560, 170],
    ['car', 0.4, 1180, 400, 1280, 470],
    ['car', 0.45, 800, 400, 825, 470],
    ['car', 0.33, 900, 400, 908, 406],
  ]));
  assert.deepEqual(box(0).check_ids, [
    'confidence.low_score',
    'geometry.edge_truncated',
    'context.ego_vehicle',
    'geometry.vehicle_aspect',
  ]);
  assert.equal(box(0).score, 85);
  assert.equal(box(1).score, 0);
  assert.deepEqual(box(2).check_ids, ['geometry.vehicle_position']);
  assert.equal(box(3).score, 30);
  assert.deepEqual(box(4).check_ids, ['confidence.low_score', 'geometry.vehicle_aspect']);
  assert.equal(box(4).score, 35);
  assert.equal(box(5).state, 'ignored');
  assert.equal(box(5).score, 0);
});

test('a suspected bonnet is no evidence for a tail light; bonus labels never block', () => {
  let { frame, box } = run([
    ['car', 0.36, 150, 610, 1150, 720],
    ['traffic light', 0.8, 600, 640, 620, 670],
  ]);
  assert.deepEqual(box(1).check_ids, ['geometry.light_position']);
  assert.deepEqual(frame.flagged, ['b0']);
  assert.deepEqual(frame.advisory, ['b1']);

  ({ frame, box } = run([CLEAN_CAR, ['traffic light', 0.8, 560, 400, 580, 430]]));
  assert.deepEqual(box(1).check_ids, ['context.light_in_vehicle']);
  assert.equal(box(1).group, 'bonus');
  assert.equal(frame.tier, 'auto_accept');
  assert.deepEqual(frame.advisory, ['b1']);

  ({ frame } = run([CLEAN_CAR, ...Array(4).fill(['stop sign', 0.9, 100, 100, 140, 140])]));
  assert.deepEqual(
    frame.image_rules.map((r) => [r.rule_id, r.blocking]),
    [['coverage.many_stop_signs', false]],
  );
  assert.equal(frame.tier, 'auto_accept');
});

test('person and overlap rules', () => {
  const { box } = run([
    ['bus', 0.9, 200, 200, 800, 520],
    ['person', 0.7, 400, 260, 440, 340],
    ['motorcycle', 0.8, 900, 380, 960, 480],
    ['person', 0.75, 900, 370, 960, 480],
    ['truck', 0.6, 205, 205, 800, 520],
    ['person', 0.8, 1000, 400, 1100, 460],
  ]);
  assert.deepEqual(box(1).check_ids, ['context.person_in_vehicle']);
  assert.deepEqual(box(3).check_ids, ['context.person_two_wheeler']);
  assert.equal(box(2).score, 0);
  assert.deepEqual(box(4).check_ids, ['geometry.cross_class_overlap']);
  assert.equal(box(4).suspected_error, 'EXTRA_OBJECT');
  assert.equal(box(0).score, 0);
  assert.deepEqual(box(5).check_ids, ['geometry.person_aspect']);
});

test('frame tiers follow IMG-1..6 and the person/vehicle asymmetry', () => {
  const greyCar = ['car', 0.22, 100, 400, 150, 440];
  const tier = (boxes, options) => run(boxes, options).frame;
  assert.equal(tier([]).image_rules[0].rule_id, 'coverage.no_draft_box');
  assert.equal(tier([]).tier, 'verify');
  assert.equal(tier([CLEAN_CAR, greyCar]).tier, 'auto_accept');

  const person = tier([CLEAN_CAR, ['person', 0.22, 100, 400, 150, 440]]);
  assert.equal(person.tier, 'verify');
  assert.deepEqual(person.missing_candidates, ['b1']);
  assert.equal(person.image_rules[0].rule_id, 'coverage.grey_person');

  const threeGrey = tier([
    CLEAN_CAR,
    greyCar,
    ['truck', 0.25, 200, 400, 260, 440],
    ['bus', 0.2, 300, 400, 360, 440],
  ]);
  assert.equal(threeGrey.image_rules[0].rule_id, 'coverage.grey_vehicles');
  assert.equal(tier([['bus', 0.93, 300, 250, 700, 500]]).tier, 'verify');

  const pickup = (x) => ['car', 0.48, x, 360, x + 180, 480, ['truck', 0.4]];
  assert.equal(tier([pickup(100), pickup(400)]).tier, 'relabel');

  const weak = ['car', 0.45, 500, 360, 680, 480];
  assert.equal(tier([weak]).tier, 'auto_accept');
  const dark = run([weak], { env: 0.62 });
  assert.deepEqual(dark.box(0).check_ids, ['confidence.low_score', 'env.poor_condition']);
  assert.equal(dark.frame.tier, 'verify');
  assert.equal(dark.frame.env_risk, 0.62);
});

test('human boxes skip model rules; unsupported geometry cannot be auto-accepted', () => {
  let { report, frame, box } = run(
    [
      ['car', null, 500, 360, 680, 480],
      ['car', null, 505, 360, 680, 480],
      ['pole', null, 100, 100, 180, 400],
      ['pole', null, 300, 100, 380, 120],
    ],
    { source: 'human' },
  );
  assert.equal(box(0).score, 0);
  assert.deepEqual(box(1).check_ids, ['geometry.manual_overlap']);
  assert.deepEqual(box(2).check_ids, []);
  assert.equal(box(3).state, 'ignored');
  assert.deepEqual(frame.image_rules, []);
  assert.equal(frame.tier, 'verify');
  assert.equal(report.checks['confidence.low_score'].skip_reasons.missing_confidence, 3);

  const data = scene([CLEAN_CAR]);
  data.annotations.push({
    id: 'poly',
    frame_id: 'f0',
    label: 'car',
    geometry: {
      type: 'polygon',
      points: [
        [0, 0],
        [20, 0],
        [20, 20],
      ],
    },
  });
  ({ frame } = { frame: analyzeDataset(data).frames[0] });
  assert.equal(frame.gates.policy, false);
  assert.equal(frame.tier, 'verify');
});

test('temporal rules keep risk_v1 scores, including a grey-zone observation', () => {
  const data = scene([]);
  data.media[0] = { ...data.media[0], type: 'video', frame_count: 3 };
  data.frames = [0, 1, 2].map((index) => ({ id: `f${index}`, media_id: 'm', index }));
  data.annotations = [0.5231, 0.2928, 0.605].map((confidence, i) => ({
    id: `a${i}`,
    frame_id: `f${i}`,
    label: i === 1 ? 'truck' : 'car',
    track_id: 't',
    confidence,
    geometry: { type: 'bbox', x: 400, y: 300, width: 200, height: 120 },
  }));
  const current = analyzeDataset(data),
    legacy = analyzeV1(data);
  assert.deepEqual(
    current.cases.map((c) => [c.id, c.score, c.check_ids]),
    legacy.cases.map((c) => [c.id, c.score, c.check_ids]),
  );
  assert.equal(current.cases[0].score, 70);
  assert.equal(current.cases[0].state, 'grey');
  assert.equal(current.frames[1].tier, 'verify');
  assert.equal(new Set(checks.map((c) => c.id)).size, checks.length);
});
