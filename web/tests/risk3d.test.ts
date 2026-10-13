import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeScene } from '../core/risk3d/engine.ts';
import type { Scene, SceneBox } from '../core/risk3d/engine.ts';

// The 3D Risk Engine scores cuboids from scene.json alone; policy3d/_scene.json holds every
// threshold and score, so these tests read their numbers from it.
const policy = JSON.parse(
  readFileSync(new URL('../policy3d/_scene.json', import.meta.url), 'utf8'),
).scene_policy;
const rule = (id: string) => policy.rules.find((r: any) => r.id === id);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const car = (id: string, x: number, change: Partial<SceneBox> = {}): SceneBox => ({
  id,
  type: 'VEHICLE',
  center: [x, 0, 1],
  size: [4.5, 2, 1.6],
  heading: 0,
  counted: 200,
  ...change,
});
// One car driving straight ahead of a standing vehicle, a metre a frame.
function drive(frames = 7, change: (index: number) => Partial<SceneBox> | null = () => ({})) {
  const scene: Scene = { segment: 's', frames: [] };
  for (let i = 0; i < frames; i++) {
    const edit = change(i);
    scene.frames.push({
      timestamp: 100 + i,
      pose: IDENTITY,
      boxes: edit === null ? [] : [car('a', 10 + i, edit)],
    });
  }
  return scene;
}
const only = (scene: Scene) => {
  const report = analyzeScene(scene);
  return {
    report,
    ids: report.cases.map((c) => [c.frame_index, c.findings.map((f) => f.check_id)]),
  };
};

test('a smooth, well-observed track has no case', () => {
  const { report } = only(drive());
  assert.deepEqual([report.cases.length, report.warnings.length, report.gaps.length], [0, 0, 0]);
  assert.equal(report.total_boxes, 7);
  assert.equal(report.min_score, policy.scoring.queue_from);
});

test('a cuboid off its track is the one flagged, not its neighbours', () => {
  const far = policy.types.VEHICLE.position_jump_m * 3;
  const { report, ids } = only(drive(7, (i) => (i === 3 ? { center: [13, far, 1] } : {})));
  assert.deepEqual(ids, [[3, ['track.position_jump']]]);
  const [found] = report.cases;
  assert.equal(found.id, '103:a');
  assert.equal(found.score, rule('track.position_jump').score);
  assert.equal(found.suspected_error, 'BBOX');
  // Lifted off the ground instead of pushed sideways.
  const lifted = only(drive(7, (i) => (i === 3 ? { center: [13, 0, 2] } : {})));
  assert.deepEqual(lifted.ids, [[3, ['track.position_jump']]]);
  // Inside the allowance nothing is said.
  const near = policy.types.VEHICLE.position_jump_m * 0.5;
  assert.equal(only(drive(7, (i) => (i === 3 ? { center: [13, near, 1] } : {}))).ids.length, 0);
});

test('the vehicle moving does not make standing objects jump', () => {
  // The same world position seen from a vehicle that advances 5 m a frame.
  const scene: Scene = { segment: 's', frames: [] };
  for (let i = 0; i < 5; i++) {
    const pose = [...IDENTITY];
    pose[3] = i * 5;
    scene.frames.push({ timestamp: i, pose, boxes: [car('parked', 30 - i * 5)] });
  }
  assert.equal(analyzeScene(scene).cases.length, 0);
});

test('a turned-around or resized cuboid, and a change of type, are found', () => {
  const flipped = only(drive(7, (i) => (i === 3 ? { heading: Math.PI } : {})));
  assert.deepEqual(flipped.ids, [[3, ['track.heading_jump']]]);
  assert.match(flipped.report.cases[0].reasons[0], /quay ngược/);
  const grown = only(drive(7, (i) => (i === 3 ? { size: [6, 2, 1.6] } : {})));
  assert.deepEqual(grown.ids, [[3, ['track.size_change']]]);
  const renamed = only(
    drive(7, (i) => (i === 2 ? { type: 'PEDESTRIAN', size: [0.8, 0.8, 1.7] } : {})),
  );
  const [found] = renamed.report.cases;
  assert.equal(found.frame_index, 2);
  assert.ok(found.findings.some((f) => f.check_id === 'track.type_change'));
  assert.deepEqual([found.suspected_error, found.suggested_label], ['CLASS', 'VEHICLE']);
  assert.equal(
    found.score,
    Math.min(
      100,
      found.findings.reduce((sum, f) => sum + f.score, 0),
    ),
  );
});

test('size out of range for the type is a case on its own', () => {
  const { ids } = only(drive(3, () => ({ size: [4.5, 2, 9] })));
  assert.deepEqual(
    ids.map(([, checks]) => checks),
    [['box.size_out_of_range'], ['box.size_out_of_range'], ['box.size_out_of_range']],
  );
});

test('point counts: empty near the vehicle, dropped between full frames, never observed', () => {
  // 10–16 m ahead is inside the distance where an empty cuboid is unusual.
  const empty = only(drive(7, (i) => (i === 3 ? { counted: 0 } : {})));
  assert.deepEqual(empty.ids, [[3, ['points.empty_near', 'points.dropped']]]);
  assert.equal(
    empty.report.cases[0].score,
    rule('points.empty_near').score + rule('points.dropped').score,
  );
  const thin = only(drive(7, (i) => (i === 3 ? { counted: 5 } : {})));
  assert.deepEqual(thin.ids, [[3, ['points.dropped']]]);
  // Far away an empty cuboid is ordinary.
  const far = only(drive(3, () => ({ center: [70, 0, 1], counted: 0 })));
  assert.equal(far.ids.length, 0);
  // An object no frame ever shows a point of is one case, on its first cuboid.
  const ghost = only(drive(4, () => ({ center: [45, 0, 1], counted: 0 })));
  assert.deepEqual(ghost.ids, [[0, ['track.never_observed']]]);
  // A source that gave its own count is used when nothing was counted at import.
  const labelled = only(drive(7, (i) => ({ counted: undefined, points: i === 3 ? 0 : 200 })));
  assert.deepEqual(labelled.ids, [[3, ['points.empty_near', 'points.dropped']]]);
});

test('an object missing from the middle of its track is listed as a gap, not a case', () => {
  const { report } = only(drive(7, (i) => (i === 3 ? null : {})));
  assert.deepEqual(report.gaps, [
    { object_id: 'a', type: 'VEHICLE', frame_indexes: [3], timestamps: [103] },
  ]);
  assert.equal(report.cases.length, 0);
});

test('a centre inside another cuboid only warns; a one-frame object scores below the queue', () => {
  const scene = drive(5);
  scene.frames[2].boxes.push(
    car('inside', 12.5, { type: 'PEDESTRIAN', size: [0.8, 0.8, 1.5], counted: 40 }),
  );
  const report = analyzeScene(scene);
  assert.equal(report.cases.length, 0);
  const [warned] = report.warnings;
  assert.equal(warned.object_id, 'inside');
  assert.deepEqual(
    warned.findings.map((f) => [f.check_id, f.score, f.level]),
    [
      ['pair.centre_inside', 0, 'warning'],
      ['track.single_frame', rule('track.single_frame').score, undefined],
    ],
  );
  assert.ok(warned.score < report.min_score);
  assert.equal(report.checks['pair.centre_inside'].flagged, 1);
});

test('every rule of the policy is one the engine runs, with a score or a warning level', () => {
  const ran = Object.keys(analyzeScene(drive()).checks).sort();
  assert.deepEqual(ran, policy.rules.map((r: any) => r.id).sort());
  for (const r of policy.rules) assert.ok(r.score > 0 || r.level === 'warning', r.id);
  // A type the policy does not know is not judged, and does not break the run.
  assert.equal(analyzeScene(drive(3, () => ({ type: 'UNKNOWN' }))).cases.length, 0);
});
