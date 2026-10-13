import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GestureInterpreter,
  fingersUp,
  pointing,
  replay,
  spreadOf,
} from '../src/features/projects3d/viewer/gestures.ts';
import { flagsOf } from '../src/features/projects3d/viewer/flags.ts';
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
  assert.notEqual(flags[0].color, flags[1].color);
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
    const { zoom, right, up, actions } = replay(recording.frames);
    const moved = Math.hypot(right, up);
    if (recording.label === 'zoom_in') assert.ok(zoom < 0.85, `zoom ${zoom}`);
    else if (recording.label === 'zoom_out') assert.ok(zoom > 1.15, `zoom ${zoom}`);
    else assert.ok(Math.abs(zoom - 1) < 0.1, `zoom ${zoom}`);
    if (recording.label === 'pan') assert.ok(moved > 0.1, `dragged ${moved}`);
    else assert.ok(moved < 0.05, `dragged ${moved}`);
    assert.ok(
      actions.every((a) => a.type !== 'flag'),
      'no flag is called up',
    );
  });
