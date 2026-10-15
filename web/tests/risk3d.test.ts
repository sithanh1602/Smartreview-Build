import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeScene, calibrateScene } from '../core/risk3d/engine.ts';
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
  assert.deepEqual(empty.ids, [[3, ['points.sparse', 'points.empty_near', 'points.dropped']]]);
  assert.equal(
    empty.report.cases[0].score,
    rule('points.empty_near').score + rule('points.dropped').score,
  );
  const thin = only(drive(7, (i) => (i === 3 ? { counted: 5 } : {})));
  assert.deepEqual(thin.ids, [[3, ['points.sparse', 'points.dropped']]]);
  // Far away an empty cuboid is ordinary.
  const far = only(drive(3, () => ({ center: [70, 0, 1], counted: 0 })));
  assert.equal(far.ids.length, 0);
  // An object no frame ever shows a point of is one case, on its first cuboid.
  const ghost = only(drive(4, () => ({ center: [45, 0, 1], counted: 0 })));
  assert.deepEqual(ghost.ids, [[0, ['points.sparse', 'track.never_observed']]]);
  // A source that gave its own count is used when nothing was counted at import.
  const labelled = only(drive(7, (i) => ({ counted: undefined, points: i === 3 ? 0 : 200 })));
  assert.deepEqual(labelled.ids, [[3, ['points.sparse', 'points.empty_near', 'points.dropped']]]);
});

test('an object missing from the middle of its track is listed as a gap, not a case', () => {
  const { report } = only(drive(7, (i) => (i === 3 ? null : {})));
  assert.deepEqual(report.gaps, [
    { object_id: 'a', type: 'VEHICLE', frame_indexes: [3], timestamps: [103] },
  ]);
  assert.equal(report.cases.length, 0);
});

test('one object boxed twice is a case on the copy; a person beside a car is not', () => {
  const scene = drive(5);
  // A second cuboid on the same car, 0.3 m off, with fewer points.
  scene.frames[2].boxes.push(car('copy', 12.3, { counted: 50 }));
  const report = analyzeScene(scene);
  const copied = report.cases.find((c) => c.object_id === 'copy')!;
  assert.ok(copied.findings.some((f) => f.check_id === 'pair.duplicate'));
  assert.equal(copied.suspected_error, 'EXTRA_OBJECT');
  assert.ok(!report.cases.some((c) => c.object_id === 'a'));
  // A pedestrian standing in the back of the car overlaps it only one way.
  const person = drive(5);
  person.frames[2].boxes.push(
    car('person', 11, { type: 'PEDESTRIAN', size: [0.8, 0.8, 1.7], counted: 40 }),
  );
  assert.ok(
    !analyzeScene(person)
      .cases.concat(analyzeScene(person).warnings)
      .some((c) => c.findings.some((f) => f.check_id === 'pair.duplicate')),
  );
});

test('every rule of the policy is one the engine runs, with a score or a warning level', () => {
  const ran = Object.keys(analyzeScene(drive()).checks).sort();
  assert.deepEqual(ran, policy.rules.map((r: any) => r.id).sort());
  for (const r of policy.rules) assert.ok(r.score > 0 || r.level === 'warning', r.id);
  // A type the policy does not know is not judged, and does not break the run.
  assert.equal(analyzeScene(drive(3, () => ({ type: 'UNKNOWN' }))).cases.length, 0);
});

test('a cuboid that stays off its object is one case for the run; a moment of clutter is not', () => {
  const { window } = rule('fit.moved').params;
  const limit = policy.types.VEHICLE.moved_ratio;
  // Held where it is: 200 points, all of them.
  const fits = (here: number) => ({ outside: 0, slack: [0.1, 0.1], moved: [0, 0, here, 200] });
  // Off for frames 3–10 of 14, missing most at frame 6.
  const off = (i: number) => (i === 6 ? 40 : i >= 3 && i <= 10 ? 60 : 200);
  const { report, ids } = only(drive(14, (i) => fits(off(i))));
  assert.ok(1 - 60 / 200 > limit);
  assert.deepEqual(ids, [[6, ['fit.moved']]]);
  const [found] = report.cases;
  assert.equal(found.suspected_error, 'BBOX');
  assert.deepEqual(found.findings[0].evidence.frame_indexes, [3, 10]);
  // Fewer frames off than half the window: the median does not move.
  const brief = only(drive(14, (i) => fits(i >= 6 && i < 6 + (window >> 1) ? 40 : 200)));
  assert.equal(brief.ids.length, 0);
  // Too few points where it would fit best to judge.
  const sparse = (i: number) => ({ moved: [0, 0, off(i) / 20, 10] });
  assert.equal(only(drive(14, sparse)).ids.length, 0);
  // A scene exported before the fit was measured has no fit cases.
  assert.equal(only(drive(14)).ids.length, 0);
});

test('a cuboid wider than its object on both seen sides is loose; one empty side is not', () => {
  const half = [4.5 / 2, 2 / 2];
  const share = policy.types.VEHICLE.slack_ratio + 0.1;
  const loose = only(drive(9, () => ({ slack: [half[0] * share, half[1] * share] })));
  assert.deepEqual(
    loose.ids.map(([, checks]) => checks),
    [['fit.loose']],
  );
  // Hidden behind something: only the long side looks empty.
  const hidden = only(drive(9, () => ({ slack: [half[0] * 0.9, 0.05] })));
  assert.equal(hidden.ids.length, 0);
});

test('points just outside the cuboid over a run are a case', () => {
  const ratio = policy.types.VEHICLE.outside_ratio;
  const spill = Math.ceil((200 * (ratio + 0.1)) / (1 - ratio - 0.1));
  const { ids } = only(drive(9, () => ({ outside: spill, moved: [0, 0, 200, 200] })));
  assert.deepEqual(
    ids.map(([, checks]) => checks),
    [['fit.points_outside']],
  );
});

test('a cuboid with too few points to check is only warned about', () => {
  const { below } = rule('points.sparse').params;
  // Far enough that an empty or thin cuboid is ordinary, so nothing else is said.
  const report = analyzeScene(drive(3, (i) => ({ center: [70, 0, 1], counted: i })));
  assert.equal(report.cases.length, 0);
  assert.deepEqual(
    report.warnings.map((w) => [w.frame_index, w.findings.map((f) => [f.check_id, f.level])]),
    [0, 1, 2].filter((i) => i < below).map((i) => [i, [['points.sparse', 'warning']]]),
  );
  assert.match(report.warnings[0].reasons[0], /không có điểm/);
  assert.equal(analyzeScene(drive(3, () => ({ counted: below }))).warnings.length, 0);
});

test('a cuboid on an empty stretch of road holds only road points and is empty', () => {
  // Road points inside, none above the road band where the fit search counts the object's.
  const road = { counted: 150, outside: 0, moved: [0, 0, 0, 0] };
  const { ids, report } = only(drive(7, (i) => (i === 3 ? road : {})));
  assert.ok(
    ids.some(([i, checks]) => i === 3 && (checks as string[]).includes('points.empty_near')),
  );
  assert.match(report.cases[0].reasons.join(' '), /mặt đường/);
  // A sign is not on the road: its points all count.
  const sign = { type: 'SIGN', size: [0.1, 0.8, 0.8], ...road };
  assert.equal(only(drive(3, () => sign)).ids.length, 0);
});

test('a cuboid standing out in front of its object, its facing side empty, is a case', () => {
  const limit = policy.types.VEHICLE.empty_side_m;
  // The car is ahead on the x axis, so its back (-x) faces the vehicle; the search would move
  // the cuboid away (+x) and that side is empty.
  const ahead = { slack: [limit + 0.3, 0.05], moved: [1, 0, 150, 200], outside: 0 };
  const { ids, report } = only(drive(9, () => ahead));
  assert.deepEqual(
    ids.map(([, checks]) => checks),
    [['fit.empty_side']],
  );
  assert.match(report.cases[0].reasons[0], /trống/);
  // The same gap where the search moves the cuboid towards the vehicle: not this rule.
  const towards = { ...ahead, moved: [-1, 0, 150, 200] };
  assert.ok(
    !only(drive(9, () => towards)).ids.some(([, c]) => (c as string[]).includes('fit.empty_side')),
  );
  // A hidden side alone, without the search agreeing, says nothing.
  const hidden = { ...ahead, moved: [0, 0, 200, 200] };
  assert.equal(only(drive(9, () => hidden)).ids.length, 0);
});

test('the first or last cuboid of an object is held to where the next two frames say it is', () => {
  const far = policy.types.VEHICLE.position_jump_m * rule('track.end_off').params.factor * 1.5;
  // The first cuboid pushed sideways: no frame before it, so only the frames after judge it.
  const first = only(drive(7, (i) => (i === 0 ? { center: [10, far, 1] } : {})));
  assert.deepEqual(first.ids, [[0, ['track.end_off']]]);
  assert.match(first.report.cases[0].reasons[0], /hai frame sau/);
  // The last one turned round.
  const last = only(drive(7, (i) => (i === 6 ? { heading: Math.PI } : {})));
  assert.deepEqual(last.ids, [[6, ['track.end_off']]]);
  // When the neighbour is the one off, the end cuboid is not blamed for it.
  const middle = only(drive(7, (i) => (i === 1 ? { center: [11, far, 1] } : {})));
  assert.ok(
    middle.ids.every(([i]) => i === 1),
    JSON.stringify(middle.ids),
  );
});

test('off by less than the limit is a case when the fit search moves the cuboid back', () => {
  const limit = policy.types.VEHICLE.position_jump_m;
  const side = limit * 0.8;
  // Pushed sideways (+y) at frame 3; the search moves it back (-y, across the car heading x).
  const back = only(
    drive(7, (i) => (i === 3 ? { center: [13, side, 1], moved: [0, -side, 120, 200] } : {})),
  );
  assert.deepEqual(back.ids, [[3, ['track.position_drift']]]);
  // The search moving it further out says nothing.
  const out = only(
    drive(7, (i) => (i === 3 ? { center: [13, side, 1], moved: [0, side, 120, 200] } : {})),
  );
  assert.equal(out.ids.length, 0);
});

test('a cuboid floating above the road or sunk into it over a run is a case', () => {
  const { above_m, below_m } = {
    above_m: rule('fit.floating').params.above_m,
    below_m: rule('fit.sunk').params.below_m,
  };
  const fits = { moved: [0, 0, 200, 200], outside: 0 };
  const up = only(drive(9, () => ({ ...fits, lift: above_m + 0.3 })));
  assert.deepEqual(
    up.ids.map(([, c]) => c),
    [['fit.floating']],
  );
  const down = only(drive(9, () => ({ ...fits, lift: -(below_m + 0.3) })));
  assert.deepEqual(
    down.ids
      .map(([, c]) => (c as string[]).filter((id) => id !== 'box.below_ground'))
      .filter((c) => c.length),
    [['fit.sunk']],
  );
  // A sign is not on the road, and nothing is judged beyond the distance the road is measured.
  assert.equal(
    only(drive(9, () => ({ ...fits, type: 'SIGN', size: [0.1, 0.8, 0.8], lift: 2 }))).ids.length,
    0,
  );
  assert.equal(only(drive(9, (i) => ({ ...fits, center: [60 + i, 0, 1], lift: 2 }))).ids.length, 0);
});

test('a cuboid too far above or below the road to be right is a certain, high-risk case', () => {
  const fits = { moved: [0, 0, 200, 200], outside: 0 };
  for (const id of ['fit.floating', 'fit.sunk']) {
    const { certain_m, certain_score } = rule(id).params;
    const sign = id === 'fit.floating' ? 1 : -1;
    const far = only(drive(9, () => ({ ...fits, lift: sign * (certain_m + 0.2) }))).report;
    assert.equal(far.cases.length, id === 'fit.sunk' ? 9 : 1);
    const temporal = far.cases.find((c) => c.findings.some((f) => f.check_id === id))!;
    assert.equal(temporal.certain, true);
    assert.equal(temporal.score, certain_score);
    assert.equal(temporal.severity, 'high');
    // Over the rule's level but within certain_m: a doubt, not certain.
    const near = only(drive(9, () => ({ ...fits, lift: sign * (certain_m - 0.2) }))).report;
    assert.equal(near.cases.length, id === 'fit.sunk' ? 9 : 1);
    assert.equal(near.cases[0].certain, undefined);
    assert.equal(near.cases[0].severity === 'high', id === 'fit.sunk');
  }
});

test('a run of cuboids lowered or raised against the rest of their track is a case', () => {
  const shift = policy.types.VEHICLE.level_shift_m;
  const { min_frames } = rule('fit.lowered').params;
  const frames = min_frames + 8;
  const fits = { moved: [0, 0, 200, 200], outside: 0 };
  // A curb beside the car: the road it is measured against sits 0.2 m off all along. Not a case.
  const curb = only(drive(frames, () => ({ ...fits, lift: -0.2 })));
  assert.equal(curb.ids.length, 0);
  // Frames 6 to 11 lowered by more than the shift, though still above fit.sunk's level.
  const run = (i: number) => i >= 6 && i <= 11;
  const lowered = only(drive(frames, (i) => ({ ...fits, lift: run(i) ? -(shift + 0.1) : 0 })));
  assert.ok(shift + 0.1 < rule('fit.sunk').params.below_m);
  assert.deepEqual(
    lowered.ids
      .map(([, c]) => (c as string[]).filter((id) => id !== 'box.below_ground'))
      .filter((c) => c.length),
    [['fit.lowered']],
  );
  const [from, to] = lowered.report.cases
    .flatMap((c) => c.findings)
    .find((f) => f.check_id === 'fit.lowered')!.evidence.frame_indexes as number[];
  assert.ok(from >= 6 && to <= 11, `${from}–${to}`);
  const raised = only(drive(frames, (i) => ({ ...fits, lift: run(i) ? shift + 0.1 : 0 })));
  assert.deepEqual(
    raised.ids.map(([, c]) => c),
    [['fit.raised']],
  );
  // Too short a track has no level of its own to compare with.
  const short = only(drive(min_frames - 1, (i) => ({ ...fits, lift: i > 4 ? -(shift + 0.1) : 0 })));
  assert.ok(
    short.report.cases.every((c) => c.findings.every((f) => f.check_id === 'box.below_ground')),
  );
  assert.equal(short.report.cases.length, Math.max(0, min_frames - 6));
});

test('calibration reports what correct labels reach against each threshold', () => {
  // The car wanders 0.1 m sideways frame to frame.
  const wobble = drive(9, (i) => ({ center: [10 + i, i % 2 ? 0.1 : -0.1, 1] }));
  const { types } = calibrateScene(wobble);
  const jump = types.VEHICLE.position_jump_m;
  assert.ok(Math.abs(jump.observed - 0.2) < 1e-6, String(jump.observed));
  assert.equal(jump.current, policy.types.VEHICLE.position_jump_m);
  assert.equal(jump.suggested, 0.4);
  assert.equal(jump.tight, false);
  // Labels that wobble more than the threshold would be flagged: tight.
  const wild = calibrateScene(drive(9, (i) => ({ center: [10 + i, i % 2 ? 0.5 : -0.5, 1] })));
  assert.equal(wild.types.VEHICLE.position_jump_m.tight, true);
});

test('local ground penetration flags individual objects, including empty boxes and unknown types', () => {
  const scene = drive(3, (i) => ({ lift: i === 1 ? -0.9 : 0, counted: 0 }));
  scene.frames[1].boxes.push(car('other', 12, { type: 'UNKNOWN', lift: -0.6 }));
  const cases = analyzeScene(scene).cases.filter((c) =>
    c.findings.some((f) => f.check_id === 'box.below_ground'),
  );
  assert.deepEqual(cases.map((c) => c.object_id).sort(), ['a', 'other']);
  assert.ok(cases.every((c) => c.frame_index === 1 && c.severity === 'high'));
});

test('negative world Z alone, unknown road, tolerance and invalid measurements do not imply sinking', () => {
  for (const lift of [undefined, NaN, Infinity, -Infinity, -0.2, -0.25, 0, 0.1]) {
    const result = analyzeScene(drive(1, () => ({ center: [10, 0, -3], lift })));
    assert.ok(!result.cases.some((c) => c.findings.some((f) => f.check_id === 'box.below_ground')));
  }
});

test('LiDAR axis checks ignore flips and weak evidence', () => {
  const axis = { heading: Math.PI / 2, points: 100, anisotropy: 8, span: 4 };
  const check = (lidarAxis?: SceneBox['lidarAxis']) =>
    analyzeScene(drive(1, () => ({ lidarAxis }))).cases.some((c) =>
      c.findings.some((f) => f.check_id === 'orientation.lidar_axis'),
    );
  assert.equal(check(axis), true);
  assert.equal(check({ ...axis, heading: Math.PI }), false);
  assert.equal(check({ ...axis, points: 3 }), false);
  assert.equal(check({ ...axis, anisotropy: 1 }), false);
  assert.equal(check(), false);
});
test('frame 1 heading reference requires stationary same-ID car and compensates ego pose', () => {
  const matches = (s: Scene) =>
    analyzeScene(s).cases.flatMap((c) =>
      c.findings.filter((f) => f.check_id === 'orientation.frame1_reference'),
    );
  const scene = drive(4, (i) => ({ center: [10, 0, 1], heading: i ? Math.PI : 0 }));
  assert.equal(matches(scene).length, 3);
  assert.equal(matches(drive(4, (i) => ({ heading: i ? Math.PI : 0 }))).length, 0);
  scene.frames[0].boxes = [];
  assert.equal(matches(scene).length, 0);
  const rotated = drive(4, (i) => ({
    center: i ? [0, -10, 1] : [10, 0, 1],
    heading: i ? -Math.PI / 2 : 0,
  }));
  for (const f of rotated.frames.slice(1))
    f.pose = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.equal(matches(rotated).length, 0);
});
