import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GestureInterpreter,
  fingersUp,
  pointing,
  replay,
  spreadOf,
  thumbSide,
} from '../src/features/projects3d/viewer/gestures.ts';
import { flagsOf, issuesOf, sunkBoxes } from '../src/features/projects3d/viewer/flags.ts';
import type { Hand, RecordedFrame, Recording } from '../src/features/projects3d/viewer/gestures.ts';

type At = { x: number; y: number };
const CENTRE = { x: 0.5, y: 0.6 };
// A made-up hand seen palm on, wrist at the bottom: each finger is either straight up from its
// knuckle or folded back onto the palm. `at` moves the whole hand; x and y are image fractions.
function hand(
  up: { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean },
  at: At = CENTRE,
): Hand {
  const points: Hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const put = (i: number, x: number, y: number) => (points[i] = { x: at.x + x, y: at.y + y });
  put(0, 0, 0.2);
  const knuckles = [-0.06, -0.02, 0.02, 0.06],
    names = ['index', 'middle', 'ring', 'pinky'] as const;
  knuckles.forEach((x, f) => {
    const base = 5 + f * 4,
      out = up[names[f]];
    put(base, x, 0);
    // Straight: joints going up. Folded: the tip comes back down towards the wrist.
    put(base + 1, x, out ? -0.06 : -0.03);
    put(base + 2, x, out ? -0.1 : 0.0);
    put(base + 3, x, out ? -0.14 : 0.04);
  });
  // The thumb sticks out to the side, or lies across the palm.
  put(1, -0.07, 0.12);
  put(2, -0.09, 0.06);
  put(3, up.thumb ? -0.13 : -0.05, up.thumb ? 0.02 : 0.04);
  put(4, up.thumb ? -0.17 : -0.01, up.thumb ? -0.02 : 0.03);
  return points;
}
const open = { thumb: true, index: true, middle: true, ring: true, pinky: true };
// The same hand with all five finger tips brought together in front of the palm (`spread` 0),
// fully open (1), or anywhere between.
function shaped(spread: number, at: At = CENTRE): Hand {
  const wide = hand(open, at);
  const bunch = { x: at.x - 0.03, y: at.y - 0.08 };
  [4, 8, 12, 16, 20].forEach((tip, i) => {
    const near = { x: bunch.x + (i - 2) * 0.004, y: bunch.y };
    wide[tip] = {
      x: near.x + (wide[tip].x - near.x) * spread,
      y: near.y + (wide[tip].y - near.y) * spread,
    };
    // The joint below the tip follows it part of the way.
    wide[tip - 1] = {
      x: wide[tip - 1].x + (near.x - wide[tip - 1].x) * (1 - spread) * 0.5,
      y: wide[tip - 1].y,
    };
  });
  return wide;
}
// Pictures at 30 a second for `seconds`, starting at `start` ms; `make` gets 0 to 1.
function sequence(seconds: number, make: (progress: number, i: number) => Hand[], start = 0) {
  const frames: RecordedFrame[] = [],
    count = Math.round(seconds * 30);
  for (let i = 0; i <= count; i++)
    frames.push({ t: start + (i * 1000) / 30, hands: make(i / count, i) });
  return frames;
}
const tremble = (i: number) => (i % 2 ? 0.0015 : -0.0015);

test('fingers are counted and the poses told apart', () => {
  assert.equal(fingersUp(hand({})), 0);
  assert.equal(fingersUp(hand({ index: true })), 1);
  assert.equal(fingersUp(hand({ index: true, middle: true, ring: true })), 3);
  assert.equal(fingersUp(hand({ thumb: true })), 1);
  assert.equal(fingersUp(hand(open)), 5);
  assert.equal(fingersUp(shaped(1)), 5);
  assert.equal(pointing(hand({ index: true })), true);
  assert.equal(pointing(hand({ index: true, thumb: true })), true);
  assert.equal(pointing(hand({ index: true, middle: true })), false);
  assert.equal(pointing(hand(open)), false);
  // Bunched finger tips are close to the thumb; an open hand's are a hand's size away.
  assert.ok(spreadOf(shaped(0)) < 0.3, `bunched ${spreadOf(shaped(0))}`);
  assert.ok(spreadOf(shaped(1)) > 0.9, `open ${spreadOf(shaped(1))}`);
});

test('the index finger held up drags the view the way it moves', () => {
  // The camera sees the finger go to its left: mirrored, that is the user's right.
  const right = replay(sequence(1, (p) => [hand({ index: true }, { x: 0.6 - 0.3 * p, y: 0.6 })]));
  assert.ok(right.actions.length > 0 && right.actions.every((a) => a.type === 'pan'));
  assert.ok(right.right > 0.25, `right ${right.right}`);
  assert.ok(Math.abs(right.up) < 0.02, `up ${right.up}`);
  const left = replay(sequence(1, (p) => [hand({ index: true }, { x: 0.3 + 0.3 * p, y: 0.6 })]));
  assert.ok(left.right < -0.25, `right ${left.right}`);
  const down = replay(sequence(1, (p) => [hand({ index: true }, { x: 0.5, y: 0.4 + 0.3 * p })]));
  assert.ok(down.up > 0.25 && Math.abs(down.right) < 0.02, `up ${down.up}`);
  const up = replay(sequence(1, (p) => [hand({ index: true }, { x: 0.5, y: 0.7 - 0.3 * p })]));
  assert.ok(up.up < -0.25, `up ${up.up}`);
});

test('a finger at rest, trembling, does not drag, and pointing again elsewhere does not jump', () => {
  const still = replay(
    sequence(2, (_, i) => [hand({ index: true }, { x: 0.5 + tremble(i), y: 0.6 })]),
  );
  assert.ok(Math.abs(still.right) < 0.01 && Math.abs(still.up) < 0.01, `right ${still.right}`);
  // Point, drop the hand, point again far away: only the moves made while pointing count.
  const jump = replay([
    ...sequence(0.5, () => [hand({ index: true }, { x: 0.3, y: 0.6 })]),
    ...sequence(0.5, () => [], 600),
    ...sequence(0.5, () => [hand({ index: true }, { x: 0.8, y: 0.3 })], 1200),
  ]);
  assert.ok(Math.abs(jump.right) < 0.01 && Math.abs(jump.up) < 0.01, `right ${jump.right}`);
});

test('bunched fingers spread open zoom in; an open hand bunched zooms out', () => {
  const nearer = replay(sequence(0.6, (p) => [shaped(p)]));
  assert.ok(nearer.zoom < 0.6, `zoom ${nearer.zoom}`);
  assert.ok(nearer.actions.every((a) => a.type === 'zoom'));
  const farther = replay(sequence(0.6, (p) => [shaped(1 - p)]));
  assert.ok(farther.zoom > 1.6, `zoom ${farther.zoom}`);
  // Twice in a row adds up: bunch again quickly, off to the side of nothing, and spread again.
  const twice = replay([
    ...sequence(0.6, (p) => [shaped(p)]),
    ...sequence(0.6, (p) => [shaped(p)], 1500),
  ]);
  assert.ok(twice.zoom < nearer.zoom, `once ${nearer.zoom}, twice ${twice.zoom}`);
});

test('a hand holding its shape, trembling, does not zoom', () => {
  for (const spread of [0, 0.5, 1]) {
    const still = replay(sequence(2, (_, i) => [shaped(spread + tremble(i) * 4)]));
    assert.ok(Math.abs(still.zoom - 1) < 0.03, `spread ${spread}: zoom ${still.zoom}`);
  }
});

test('holding still for a second after zooming lets go: closing the hand does not zoom back', () => {
  const zoomIn = sequence(0.6, (p) => [shaped(p)]);
  const reached = replay(zoomIn).zoom;
  // Without the pause, closing the hand right away zooms back out.
  const straightBack = replay([...zoomIn, ...sequence(0.5, (p) => [shaped(1 - p)], 650)]);
  assert.ok(straightBack.zoom > reached * 1.5, `zoom ${straightBack.zoom}`);
  // With it: zoom in, hold the open hand still for 1.2 s, then close it and point.
  const held = [...zoomIn, ...sequence(1.2, (_, i) => [shaped(1 + tremble(i) * 4)], 650)];
  const after = [
    ...held,
    ...sequence(0.5, (p) => [shaped(1 - p)], 1900),
    ...sequence(0.5, () => [hand({ index: true })], 2450),
  ];
  // (The smoothed spread finishes arriving during the pause, so compare with the zoom then.)
  const paused = replay(held).zoom,
    kept = replay(after);
  assert.ok(Math.abs(kept.zoom - paused) < paused * 0.02, `kept ${kept.zoom}, was ${paused}`);
  // The reading says so while it happens.
  const gestures = new GestureInterpreter();
  const seen = new Set<string>();
  let most = 0;
  for (const frame of held) {
    const { reading } = gestures.update(frame.hands, frame.t);
    if (reading.zoom) seen.add(reading.zoom);
    if (reading.zoom === 'still') most = Math.max(most, reading.hold);
  }
  assert.ok(seen.has('still') && seen.has('released'), [...seen].join(','));
  assert.ok(most > 0.8, `hold reached ${most}`);
  // Opening the hand afresh takes the zoom up again: bunching it then zooms out.
  const again = replay([
    ...after,
    ...sequence(0.3, () => [shaped(1)], 3000),
    ...sequence(0.6, (p) => [shaped(1 - p)], 3350),
  ]);
  assert.ok(again.zoom > reached * 1.5, `again ${again.zoom}`);
  // A pause shorter than a second does not let go.
  const brief = replay([
    ...zoomIn,
    ...sequence(0.5, () => [shaped(1)], 650),
    ...sequence(0.5, (p) => [shaped(1 - p)], 1200),
  ]);
  assert.ok(brief.zoom > reached * 1.5, `brief ${brief.zoom}`);
});

test('raising fingers from a fist to show a number does not zoom', () => {
  const frames = [
    ...sequence(0.5, () => [hand({})]),
    ...sequence(0.2, () => [hand({ index: true, middle: true })], 550),
    ...sequence(1.5, () => [hand({ index: true, middle: true, ring: true })], 800),
  ];
  const shown = replay(frames);
  assert.deepEqual(shown.actions, [{ type: 'flag', number: 3 }]);
});

test('a finger count held still calls up that flag once', () => {
  const gestures = new GestureInterpreter();
  const three = hand({ index: true, middle: true, ring: true });
  assert.deepEqual(gestures.update([three], 0).actions, []);
  const early = gestures.update([three], 500);
  assert.deepEqual(early.actions, []);
  assert.equal(early.reading.mode, 'count');
  assert.equal(early.reading.count, 3);
  assert.deepEqual(gestures.update([three], 950).actions, [{ type: 'flag', number: 3 }]);
  // Still held: it does not fire again until the count changes.
  assert.deepEqual(gestures.update([three], 3000).actions, []);
  // Two hands add up, and neither drags nor zooms.
  const both = [hand(open, { x: 0.3, y: 0.6 }), hand({ index: true }, { x: 0.7, y: 0.6 })];
  gestures.update(both, 3100);
  assert.deepEqual(gestures.update(both, 4100).actions, [{ type: 'flag', number: 6 }]);
});

test('the index finger is the number one only once it has rested', () => {
  // Dragging, then holding the finger still: flag 1 comes after the settle time and the hold.
  const frames = [
    ...sequence(0.5, (p) => [hand({ index: true }, { x: 0.6 - 0.2 * p, y: 0.6 })]),
    ...sequence(3, () => [hand({ index: true }, { x: 0.4, y: 0.6 })], 550),
  ];
  const flags = [];
  const gestures = new GestureInterpreter();
  for (const frame of frames)
    for (const action of gestures.update(frame.hands, frame.t).actions)
      if (action.type === 'flag') flags.push([action.number, Math.round(frame.t)]);
  assert.equal(flags.length, 1);
  assert.equal(flags[0][0], 1);
  assert.ok(flags[0][1] > 550 + 1200 + 800, `fired at ${flags[0][1]} ms`);
});

test('an open hand left after zooming in is not at once read as five', () => {
  const frames = [...sequence(0.6, (p) => [shaped(p)]), ...sequence(1.5, () => [shaped(1)], 650)];
  assert.ok(replay(frames).actions.every((a) => a.type === 'zoom'));
});

test('flags number the cuboids reviewed as wrong, in the order of their IDs', () => {
  const box = (id: string, type = 'VEHICLE') =>
    ({ id, type, center: [0, 0, 0], size: [1, 1, 1], heading: 0, points: 1 }) as any;
  const frame = { timestamp: 7, boxes: [box('c'), box('a', 'SIGN'), box('b'), box('d')] };
  const flags = flagsOf(frame, {
    '7:c': { decision: 'ERROR', error_type: 'BBOX' },
    '7:a': { decision: 'ERROR', error_type: 'CLASS' },
    '7:b': { decision: 'CORRECT', error_type: null },
    '8:d': { decision: 'ERROR', error_type: 'CLASS' },
  });
  assert.deepEqual(
    flags.map((f) => [f.number, f.objectId, f.errorType]),
    [
      [1, 'a', 'CLASS'],
      [2, 'c', 'BBOX'],
    ],
  );
  assert.ok(flags.every((f) => f.level === 'error'));
});

test('the risk engine flags the cuboids it doubts, and the flag stays once reviewed', () => {
  const box = (id: string) =>
    ({ id, type: 'VEHICLE', center: [0, 0, 0], size: [1, 1, 1], heading: 0, points: 1 }) as any;
  const frame = { timestamp: 7, boxes: ['e', 'b', 'a', 'c', 'd'].map(box) };
  const risk = (suspected_error?: string, severity: 'high' | 'medium' | 'low' = 'high') => ({
    score: 0.8,
    severity,
    suspected_error,
    reasons: ['x'],
  });
  const flags = flagsOf(
    frame,
    {
      '7:a': { decision: 'ERROR', error_type: 'CLASS' },
      '7:b': { decision: 'CORRECT', error_type: null },
      '7:c': { decision: 'UNSURE', error_type: null },
    },
    {
      '7:a': risk('BBOX'),
      '7:b': risk('BBOX'),
      '7:c': risk(),
      '7:d': risk('CLASS', 'low'),
      '7:e': risk('EXTRA_OBJECT', 'medium'),
    },
  );
  // Red for the confirmed error, green for a doubt reviewed as right, orange for the high risk
  // (still so when unsure), yellow for the medium and low ones.
  assert.deepEqual(
    flags.map((f) => [f.number, f.objectId, f.source, f.errorType, f.level, f.reviewed]),
    [
      [1, 'a', 'review', 'CLASS', 'error', 'ERROR'],
      [2, 'b', 'risk', 'BBOX', 'done', 'CORRECT'],
      [3, 'c', 'risk', 'OTHER', 'high', 'UNSURE'],
      [4, 'd', 'risk', 'CLASS', 'low', undefined],
      [5, 'e', 'risk', 'EXTRA_OBJECT', 'low', undefined],
    ],
  );
  assert.equal(flags[0].risk?.score, 0.8);
});

// Recordings of real hands, saved from the webcam box into tests/fixtures/gestures, are held
// to what their label says the person was doing.
const recordings = new URL('./fixtures/gestures/', import.meta.url);
const files = fs.existsSync(recordings)
  ? fs.readdirSync(recordings).filter((name) => name.endsWith('.json'))
  : [];
for (const name of files)
  test(`recording ${name} is read as its label says`, () => {
    const recording: Recording = JSON.parse(fs.readFileSync(new URL(name, recordings), 'utf8'));
    const label = recording.label;
    const { zoom, right, up, actions } = replay(recording.frames, 23);
    const moved = Math.hypot(right, up);
    const flags = actions.flatMap((a) => (a.type === 'flag' ? [a.number] : []));
    const steps = actions.flatMap((a) => (a.type === 'step' ? [a.delta] : []));
    if (label === 'zoom_in') assert.ok(zoom < 0.85, `zoom ${zoom}`);
    else if (label === 'zoom_out') assert.ok(zoom > 1.15, `zoom ${zoom}`);
    else assert.ok(Math.abs(zoom - 1) < 0.1, `zoom ${zoom}`);
    if (label === 'pan') assert.ok(moved > 0.1, `dragged ${moved}`);
    else assert.ok(moved < 0.05, `dragged ${moved}`);
    // What each label must call up, and nothing else.
    const want: Record<string, { flags?: (f: number[]) => boolean; steps?: number[] }> = {
      step_right: { steps: [1] },
      step_left: { steps: [-1] },
      thumb_up: { flags: (f) => f.length > 0 && f.every((n) => n === 1) },
      count_1_5: { flags: (f) => f.length > 0 && f.every((n) => n >= 1 && n <= 5) },
      number_23: { flags: (f) => f.includes(23) },
      number_20: { flags: (f) => f.includes(20) },
    };
    const rule = want[label] ?? {};
    if (rule.flags) assert.ok(rule.flags(flags), `issues called up ${flags}`);
    else assert.deepEqual(flags, [], 'no issue is called up');
    if (rule.steps)
      assert.ok(steps.length > 0 && steps.every((d) => rule.steps!.includes(d)), `steps ${steps}`);
    else assert.deepEqual(steps, [], 'no step');
  });

test('a case the risk engine is certain of is a red flag until reviewed as right', () => {
  const box = (id: string) =>
    ({ id, type: 'VEHICLE', center: [0, 0, 0], size: [1, 1, 1], heading: 0, points: 1 }) as any;
  const frame = { timestamp: 7, boxes: ['a', 'b'].map(box) };
  const risk = { score: 70, severity: 'high' as const, reasons: ['lơ lửng'], certain: true };
  const flags = flagsOf(
    frame,
    { '7:b': { decision: 'CORRECT', error_type: null } },
    {
      '7:a': risk,
      '7:b': risk,
    },
  );
  assert.deepEqual(
    flags.map((f) => [f.objectId, f.source, f.level]),
    [
      ['a', 'risk', 'error'],
      ['b', 'risk', 'done'],
    ],
  );
});

test('what the risk engine only warns about is a grey flag', () => {
  const box = (id: string) =>
    ({ id, type: 'VEHICLE', center: [0, 0, 0], size: [1, 1, 1], heading: 0, points: 1 }) as any;
  const frame = { timestamp: 7, boxes: ['a', 'b'].map(box) };
  const risk = { score: 0, severity: 'low' as const, reasons: ['ít điểm'] };
  const flags = flagsOf(
    frame,
    { '7:b': { decision: 'CORRECT', error_type: null } },
    {
      '7:a': { ...risk, warning: true },
      '7:b': { ...risk, warning: true },
    },
  );
  assert.deepEqual(
    flags.map((f) => [f.number, f.objectId, f.source, f.level]),
    [
      [1, 'a', 'risk', 'warn'],
      [2, 'b', 'risk', 'done'],
    ],
  );
});

test('issues are numbered once for the segment, in frame order, and pins carry that number', () => {
  const box = (id: string) =>
    ({ id, type: 'VEHICLE', center: [0, 0, 0], size: [1, 1, 1], heading: 0, points: 1 }) as any;
  const frames = [
    { timestamp: 10, boxes: [box('a'), box('b')] },
    { timestamp: 20, boxes: [box('a'), box('b')] },
    { timestamp: 30, boxes: [box('a')] },
  ];
  const kase = (frame: number, id: string, severity: 'high' | 'medium') => ({
    id: `${frames[frame].timestamp}:${id}`,
    timestamp: frames[frame].timestamp,
    frame_index: frame,
    object_id: id,
    type: 'VEHICLE',
    score: severity === 'high' ? 70 : 40,
    severity,
    suspected_error: 'BBOX',
    reasons: ['x'],
    findings: [],
  });
  const report = {
    cases: [kase(1, 'a', 'medium'), kase(2, 'a', 'high'), kase(1, 'b', 'high')],
    warnings: [],
    gaps: [{ object_id: 'b', type: 'VEHICLE', frame_indexes: [2], timestamps: [30] }],
  } as any;
  // A cuboid the engine missed but a reviewer marked wrong comes after the engine's issues.
  const reviews = { '10:a': { decision: 'ERROR', error_type: 'CLASS' } };
  const issues = issuesOf(frames, report, reviews);
  assert.deepEqual(
    issues.map((i) => [i.number, i.frame, i.objectId, i.kind]),
    [
      [1, 1, 'b', 'case'],
      [2, 1, 'a', 'case'],
      [3, 2, 'a', 'case'],
      [4, 2, 'b', 'gap'],
      [5, 0, 'a', 'review'],
    ],
  );
  const numbers = new Map(issues.map((i) => [i.key, i.number]));
  const risks = Object.fromEntries(report.cases.map((c: any) => [c.id, c]));
  const pins = flagsOf(frames[1], reviews, risks, numbers);
  assert.deepEqual(
    pins.map((f) => [f.number, f.objectId]),
    [
      [1, 'b'],
      [2, 'a'],
    ],
  );
  // What the engine only warns about has a pin without a number.
  const warned = flagsOf(frames[2], {}, { '30:a': { ...risks['30:a'], warning: true } }, new Map());
  assert.deepEqual(
    warned.map((f) => [f.number, f.level]),
    [[undefined, 'warn']],
  );
});

// A hand with only the thumb out, pointing sideways: to the person's right as the camera sees
// a right hand, or, mirrored, to their left.
function thumbOut(left = false, at: At = CENTRE): Hand {
  const h = hand({}, at);
  h[2] = { x: at.x - 0.09, y: at.y + 0.06 };
  h[3] = { x: at.x - 0.14, y: at.y + 0.06 };
  h[4] = { x: at.x - 0.19, y: at.y + 0.06 };
  return left ? h.map((p) => ({ x: 2 * at.x - p.x, y: p.y })) : h;
}
const fingers = (n: number) =>
  hand({ index: n > 0, middle: n > 1, ring: n > 2, pinky: n > 3, thumb: n > 4 });
// Feeds pictures of `make()` for `ms` from `start`, 30 a second; returns the actions and the
// last reading.
function hold(gestures: GestureInterpreter, make: () => Hand[], start: number, ms: number) {
  const actions = [];
  let reading;
  for (let t = start; t <= start + ms; t += 1000 / 30) {
    const result = gestures.update(make(), t);
    actions.push(...result.actions);
    reading = result.reading;
  }
  return { actions, reading: reading! };
}

test('past 9 a number is shown one digit after the other, a fist being 0', () => {
  const gestures = new GestureInterpreter();
  gestures.setLargest(23);
  // Two, held: no issue opens yet, as 20 to 23 could follow.
  const two = hold(gestures, () => [fingers(2)], 0, 1000);
  assert.deepEqual(two.actions, []);
  assert.deepEqual(two.reading.typed, [2]);
  // A moment without the hand, then three: twenty-three.
  hold(gestures, () => [], 1100, 300);
  const three = hold(gestures, () => [fingers(3)], 1450, 1000);
  assert.deepEqual(three.actions, [{ type: 'flag', number: 23 }]);
  // Three first: no issue 30 or more, so three opens at once.
  const fresh = new GestureInterpreter();
  fresh.setLargest(23);
  assert.deepEqual(hold(fresh, () => [fingers(3)], 0, 1000).actions, [{ type: 'flag', number: 3 }]);
  // Two then a fist: twenty.
  const zero = new GestureInterpreter();
  zero.setLargest(23);
  hold(zero, () => [fingers(2)], 0, 1000);
  hold(zero, () => [], 1100, 200);
  assert.deepEqual(hold(zero, () => [hand({})], 1350, 1000).actions, [
    { type: 'flag', number: 20 },
  ]);
});

test('a first digit kept up opens that issue after the wait; taking the hand away drops it', () => {
  const kept = new GestureInterpreter();
  kept.setLargest(23);
  const shown = hold(kept, () => [fingers(2)], 0, 3000);
  assert.deepEqual(shown.actions, [{ type: 'flag', number: 2 }]);
  const dropped = new GestureInterpreter();
  dropped.setLargest(23);
  hold(dropped, () => [fingers(2)], 0, 1000);
  assert.deepEqual(hold(dropped, () => [], 1050, 2500).actions, []);
});

test('the issue a count calls up shows a moment after the count is steady; a missing one never opens', () => {
  const gestures = new GestureInterpreter();
  gestures.setLargest(5);
  const early = hold(gestures, () => [fingers(4)], 0, 150);
  assert.equal(early.reading.number, undefined);
  const later = hold(gestures, () => [fingers(4)], 180, 300);
  assert.equal(later.reading.number, 4);
  assert.ok(later.reading.hold < 1);
  // Seven fingers when there are five issues: shown, but nothing opens.
  const missing = new GestureInterpreter();
  missing.setLargest(5);
  const seven = [hand(open, { x: 0.3, y: 0.6 }), fingers(2)];
  assert.deepEqual(hold(missing, () => seven, 0, 1500).actions, []);
});

test('the thumb out sideways steps to the next or previous issue, once per showing', () => {
  assert.equal(thumbSide(thumbOut()), 1);
  assert.equal(thumbSide(thumbOut(true)), -1);
  assert.equal(thumbSide(hand({ thumb: true, index: true })), null);
  const gestures = new GestureInterpreter();
  const right = hold(gestures, () => [thumbOut()], 0, 1500);
  assert.deepEqual(right.actions, [{ type: 'step', delta: 1 }]);
  assert.equal(right.reading.mode, 'step');
  hold(gestures, () => [], 1550, 200);
  assert.deepEqual(hold(gestures, () => [thumbOut(true)], 1800, 1000).actions, [
    { type: 'step', delta: -1 },
  ]);
});

test('the cuboids painted as sunk are those of the run a sinking case covers', () => {
  const box = (id: string) =>
    ({ id, type: 'VEHICLE', center: [0, 0, 0], size: [4, 2, 1.5], heading: 0, points: 50 }) as any;
  const frames = [0, 1, 2, 3, 4].map((i) => ({ timestamp: 10 + i, boxes: [box('a'), box('b')] }));
  const finding = (check_id: string, frame_indexes: number[]) =>
    ({ check_id, score: 40, error_type: 'BBOX', reason: '', evidence: { frame_indexes } }) as any;
  const report = {
    cases: [
      { object_id: 'a', frame_index: 2, findings: [finding('fit.sunk', [1, 3])] },
      { object_id: 'b', frame_index: 0, findings: [finding('fit.moved', [0, 4])] },
    ],
  } as any;
  assert.deepEqual([...sunkBoxes(frames, report)].sort(), ['11:a', '12:a', '13:a']);
  assert.equal(sunkBoxes(frames, null).size, 0);
});

test('single-frame ground findings color only the affected object and frame', () => {
  const frames = [10, 11, 12].map((timestamp) => ({
    timestamp,
    boxes: [{ id: 'a' }, { id: 'b' }],
  })) as any;
  const report = {
    cases: [
      {
        object_id: 'b',
        frame_index: 1,
        findings: [{ check_id: 'box.below_ground', evidence: { frame_indexes: [1, 1] } }],
      },
    ],
  } as any;
  assert.deepEqual([...sunkBoxes(frames, report)], ['11:b']);
});

test('measured ground penetration stays red without a report or with an old empty report', () => {
  const boxes = [
    { id: 'sunk', center: [10, 0, 0], size: [4, 2, 2], lift: -0.8 },
    { id: 'negative-z', center: [10, 0, -3], size: [4, 2, 2], lift: 0 },
    { id: 'unknown-ground', center: [10, 0, -3], size: [4, 2, 2] },
    { id: 'noise', center: [10, 0, 0], size: [4, 2, 2], lift: -0.2 },
  ];
  const frames = [{ timestamp: 10, boxes }] as any;
  for (const report of [null, { cases: [] } as any])
    assert.deepEqual([...sunkBoxes(frames, report)], ['10:sunk']);
});
