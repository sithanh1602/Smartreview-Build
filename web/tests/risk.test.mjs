import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, checks } from '../core/risk/engine.mjs';
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
  assert.equal(box(0).suggested_label, 'truck');
  assert.equal(frame.tier, 'verify');
});

test('a weak box is one finding counted once; only a sliver at the frame edge adds to it', () => {
  const { report, frame, box } = run(
    [
      ['car', 0.4, 1180, 400, 1280, 470],
      ['car', 0.45, 0, 300, 30, 440],
      ['car', 0.36, 150, 610, 1150, 720],
      ['person', 0.45, 1262, 261, 1280, 487],
      ['traffic light', 0.4, 600, 0, 620, 40],
    ],
    { env: 0.62 },
  );
  // Cut by the frame but still car-shaped: weak, not a case, even in a poor image.
  assert.deepEqual(box(0).check_ids, ['confidence.weak_box']);
  assert.equal(box(0).score, 20);
  assert.deepEqual(
    box(0).findings[0].evidence.signals.map((s) => s.check_id),
    ['confidence.low_score', 'env.poor_condition'],
  );
  // A 30 px strip of a car: the sliver joins the weak finding, the shape rule still adds up.
  assert.deepEqual(box(1).check_ids, ['confidence.weak_box', 'geometry.vehicle_aspect']);
  assert.equal(box(1).findings[0].evidence.signals.length, 3);
  assert.equal(box(1).score, 35);
  assert.equal(box(1).findings.length, 2);
  // Bonnet of the camera car.
  assert.deepEqual(box(2).check_ids, [
    'confidence.weak_box',
    'context.ego_vehicle',
    'geometry.vehicle_aspect',
  ]);
  assert.equal(box(2).score, 75);
  assert.equal(box(3).findings[0].evidence.signals.length, 3);
  assert.equal(box(3).score, 20);
  assert.equal(box(4).score, 20);
  assert.deepEqual(
    report.cases.map((c) => c.id),
    ['b2', 'b1'],
  );
  assert.equal(frame.tier, 'verify');
  assert.equal(run([['car', 0.45, 500, 360, 680, 480]], { env: 0.62 }).frame.tier, 'auto_accept');
});

test('vehicle rules: containment, duplicates, and floating judged against the frame horizon', () => {
  let { box } = run([
    ['truck', 0.85, 300, 250, 700, 500],
    ['car', 0.42, 320, 300, 440, 420],
    ['bus', 0.9, 700, 250, 1100, 500],
    ['truck', 0.6, 705, 255, 1100, 500],
    ['car', 0.64, 400, 60, 560, 170],
    ['car', 0.33, 900, 600, 908, 606],
  ]);
  assert.deepEqual(box(1).check_ids, ['confidence.low_score', 'context.vehicle_in_large_vehicle']);
  assert.equal(box(1).score, 50);
  // Near-identical boxes are a duplicate, never "a vehicle inside a large vehicle".
  assert.deepEqual(box(3).check_ids, ['geometry.cross_class_overlap']);
  assert.equal(box(2).score, 0);
  assert.deepEqual(box(4).check_ids, ['geometry.vehicle_position']);
  assert.equal(box(5).state, 'ignored');

  // Camera pitched down: the whole road sits in the top band, cars there are not floating.
  const road = [0, 1, 2, 3].map((i) => ['car', 0.8, 200 + 150 * i, 150, 280 + 150 * i, 205]);
  ({ box } = run([...road, ['car', 0.7, 900, 20, 980, 70]]));
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => box(i).score),
    [0, 0, 0, 0],
  );
  assert.deepEqual(box(4).check_ids, ['geometry.vehicle_position']);
  assert.equal(box(4).findings[0].evidence.horizon_y, 155.5);
});

test('person inside a vehicle box is flagged only when no pedestrian reading fits', () => {
  const bus = ['bus', 0.9, 200, 200, 800, 520];
  const { box } = run([
    bus,
    ['person', 0.7, 400, 260, 480, 360],
    ['person', 0.48, 500, 260, 525, 330],
    ['person', 0.6, 600, 380, 650, 515],
    ['person', 0.6, 210, 215, 270, 300],
    ['motorcycle', 0.8, 900, 380, 960, 480],
    ['person', 0.75, 900, 370, 960, 480],
    ['person', 0.8, 1000, 400, 1100, 460],
  ]);
  // Bust-sized figure in the window band: a passenger or a printed face.
  assert.deepEqual(box(1).check_ids, ['context.person_in_vehicle']);
  assert.equal(box(1).suspected_error, 'EXTRA_OBJECT');
  // Small full-length figure: a pedestrian far behind the bus. Only its low score remains.
  assert.deepEqual(box(2).check_ids, ['confidence.low_score']);
  // Feet at the bottom of the bus box: standing in front of it.
  assert.equal(box(3).score, 0);
  // Top corner of the box, where the rectangle covers background.
  assert.equal(box(4).score, 0);
  assert.deepEqual(box(6).check_ids, ['context.person_two_wheeler']);
  assert.deepEqual(box(7).check_ids, ['geometry.person_aspect']);
});

test('traffic lights: duplicates and misplaced lights are found, clusters and horizontal heads are not', () => {
  const { report, frame, box } = run([
    CLEAN_CAR,
    ['traffic light', 0.8, 560, 400, 580, 430],
    ['traffic light', 0.6, 100, 100, 122, 128],
    ['traffic light', 0.5, 102, 101, 120, 129],
    ['traffic light', 0.7, 300, 100, 320, 150],
    ['traffic light', 0.5, 300, 100, 345, 152],
    ['traffic light', 0.6, 500, 100, 545, 120],
    ['traffic light', 0.6, 700, 100, 800, 120],
    ['traffic light', 0.6, 900, 500, 920, 550],
  ]);
  assert.deepEqual(box(1).check_ids, ['context.light_in_vehicle']);
  assert.deepEqual(box(3).check_ids, ['geometry.light_overlap']);
  assert.equal(box(2).score, 0);
  // One box around two adjacent heads next to a box on one head.
  assert.equal(box(5).score, 0);
  assert.equal(box(6).score, 0);
  assert.deepEqual(box(7).check_ids, ['geometry.light_aspect']);
  assert.deepEqual(box(8).check_ids, ['geometry.light_position']);
  // Bonus labels are scored and listed apart; they neither queue nor block.
  assert.deepEqual(report.cases, []);
  assert.deepEqual(
    report.advisory_cases.map((c) => c.id),
    ['b1', 'b8'],
  );
  assert.deepEqual(frame.advisory, ['b1', 'b8']);
  assert.equal(frame.tier, 'auto_accept');

  const signs = run([CLEAN_CAR, ...Array(4).fill(['stop sign', 0.9, 100, 100, 140, 140])]).frame;
  assert.deepEqual(
    signs.image_rules.map((r) => [r.rule_id, r.blocking]),
    [['coverage.many_stop_signs', false]],
  );
  assert.equal(signs.tier, 'auto_accept');
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
  assert.equal(tier([['car', 0.45, 500, 360, 680, 480]]).tier, 'auto_accept');
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
