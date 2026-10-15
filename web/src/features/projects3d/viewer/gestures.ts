// Turns hand landmarks from the webcam into viewer actions. Pure: no camera, no MediaPipe and
// no DOM here, so the rules can be tested with made-up hands and with recordings of real ones.
//
//   index finger up, moved left / right      drag the view left / right
//   index finger up, moved up / down         drag the view up / down
//   fingers bunched, then spread open        zoom in
//   open hand, then fingers bunched          zoom out
//   the hand held still for a second after   let go of the zoom: the next change of shape
//   zooming                                  (closing the hand, pointing) does not zoom
//   1 to 9 fingers held up and still         call up the flag with that number
//
// Dragging and zooming take one hand. A measurement is smoothed before it is used, a move
// slower than a dead zone is not a move, and a pose is entered and left at different
// thresholds, so nothing flickers at the edge.
export interface Point {
  x: number;
  y: number;
}
// The 21 landmarks of one hand as MediaPipe gives them: x and y from 0 to 1 across the image
// as the camera sees it (not mirrored).
export type Hand = Point[];
export type Action =
  | { type: 'zoom'; factor: number }
  | { type: 'pan'; right: number; up: number }
  | { type: 'flag'; number: number };
// What the interpreter currently makes of the hands, for showing next to the camera picture.
export interface Reading {
  mode: 'none' | 'pan' | 'zoom' | 'count';
  // Fingers held up, when counting.
  count: number;
  // How far a held finger count is towards taking effect, 0 to 1.
  hold: number;
  // While zooming: nearer, farther, the hand holding its shape (`hold` then says how far it is
  // towards letting go), or let go.
  zoom?: 'in' | 'out' | 'still' | 'released';
}
// One picture's worth of hands, as a recording keeps it.
export interface RecordedFrame {
  t: number;
  hands: Hand[];
}
// A recording of real hands made from the webcam box, for tuning the rules and for tests.
export interface Recording {
  // What the person was doing: 'zoom_in', 'zoom_out', 'pan' or 'none'.
  label: string;
  frames: RecordedFrame[];
}
export const GESTURE = {
  // The camera picture is wider than tall; distances are measured as if it were square.
  aspect: 4 / 3,
  // Smoothing (One Euro filter): a lower cutoff is steadier at rest, a higher beta follows a
  // quick move sooner.
  cutoff: 1.5,
  beta: 0.5,
  // Dragging: the pointing pose must last this long to start, and may be lost this long.
  pointEnterMs: 100,
  pointLostMs: 200,
  // The view moves by this share of its distance to the scene for a finger crossing the whole
  // picture. A fingertip slower than `panDead` (pictures a second) is resting.
  pan: 1.4,
  panDead: 0.04,
  // Zooming reads how far the finger tips are from the thumb tip, in hand sizes: about 0.2
  // when bunched, about 1 when spread. The hand counts as bunched below `bunchEnter` and stops
  // counting as bunched above `bunchLeave`.
  bunchEnter: 0.42,
  bunchLeave: 0.55,
  // After the hand was bunched or open, a change of its shape zooms for this long.
  zoomArmMs: 1200,
  // Spreading from bunched to open multiplies the distance to the scene by about
  // exp(-zoomGain * 0.8), a little under a half.
  zoomGain: 1.1,
  // The shape changing slower than this (hand sizes a second) is the hand holding still.
  zoomDead: 0.25,
  // After zooming, holding the hand still this long lets go of the zoom. It is taken up again
  // only when the hand newly becomes bunched or fully open.
  breakMs: 1000,
  // A finger count takes effect after being held this long, and not until the hand has been
  // out of a drag or a zoom for `settleMs`.
  holdCountMs: 900,
  settleMs: 1200,
};
const WRIST = 0,
  THUMB_TIP = 4,
  INDEX_MCP = 5,
  INDEX_TIP = 8,
  MIDDLE_MCP = 9,
  PINKY_MCP = 17;
// Tip and middle joint of the four fingers, index first.
const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];
const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * GESTURE.aspect, a.y - b.y);
const sizeOf = (hand: Hand) => distance(hand[WRIST], hand[MIDDLE_MCP]) || 1e-6;

// One Euro filter: smooths a jittery measurement heavily while it is nearly still and lightly
// while it moves, so there is neither tremble at rest nor lag in a move.
export class OneEuro {
  private last: { value: number; rate: number; time: number } | null = null;
  // `time` in seconds.
  filter(value: number, time: number): number {
    if (!this.last || time <= this.last.time) {
      this.last = { value, rate: 0, time };
      return value;
    }
    const dt = time - this.last.time;
    const blend = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
    const rate = this.last.rate + blend(1) * ((value - this.last.value) / dt - this.last.rate);
    const next =
      this.last.value +
      blend(GESTURE.cutoff + GESTURE.beta * Math.abs(rate)) * (value - this.last.value);
    this.last = { value: next, rate, time };
    return next;
  }
  reset() {
    this.last = null;
  }
}

// Which of the four fingers are straight: a straight finger's tip is farther from the wrist
// than its middle joint, a curled one's is nearer.
const straight = (hand: Hand) =>
  FINGERS.map(
    ([tip, joint]) => distance(hand[tip], hand[WRIST]) > distance(hand[joint], hand[WRIST]) * 1.1,
  );
// How many fingers of the hand are held out, thumb included.
export function fingersUp(hand: Hand): number {
  // The thumb is out when its tip is well beyond the palm's width from the little finger.
  const thumb =
    distance(hand[THUMB_TIP], hand[PINKY_MCP]) > distance(hand[INDEX_MCP], hand[PINKY_MCP]) * 1.35;
  return straight(hand).filter(Boolean).length + (thumb ? 1 : 0);
}
// The index finger held up alone; the thumb may do as it likes.
export function pointing(hand: Hand): boolean {
  const [index, ...others] = straight(hand);
  return index && !others.some(Boolean);
}
// How spread the hand is: the mean distance from the thumb tip to the four finger tips, in
// hand sizes. Small when the finger tips are bunched on the thumb, large when the hand is open.
export function spreadOf(hand: Hand): number {
  let total = 0;
  for (const [tip] of FINGERS) total += distance(hand[THUMB_TIP], hand[tip]);
  return total / FINGERS.length / sizeOf(hand);
}

export class GestureInterpreter {
  // Dragging with the index finger: where its smoothed tip was at the last picture.
  private finger: { x: number; y: number; time: number } | null = null;
  private fingerX = new OneEuro();
  private fingerY = new OneEuro();
  private pointSince: number | null = null;
  private pointLost: number | null = null;
  // Zooming: the smoothed spread at the last picture, whether the hand counts as bunched, and
  // until when a change of shape still zooms.
  private shape: { spread: number; time: number } | null = null;
  private spread = new OneEuro();
  private bunched = false;
  private armedUntil = 0;
  // Letting go: whether this zoom has changed anything yet, since when the hand has been
  // still, whether the zoom was let go of, and the pose the hand was last in.
  private zoomed = false;
  private stillSince: number | null = null;
  private released = false;
  // Taken up again in the middle of a move: nothing zooms until the hand has come to rest.
  private settling = false;
  private pose: 'bunched' | 'open' | null = null;
  // The finger count being held, since when, and whether it has already taken effect.
  private held: { count: number; since: number; fired: boolean } | null = null;
  // Until when the hand is taken to be busy dragging or zooming, not showing a number.
  private busyUntil = 0;

  // Takes the hands seen at `time` (milliseconds) and returns what to do about them.
  update(hands: Hand[], time: number): { actions: Action[]; reading: Reading } {
    const actions: Action[] = [];
    const one = hands.length === 1 ? hands[0] : null;
    const dragging = one ? this.drag(one, time, actions) : null;
    if (dragging === 'moving') return { actions, reading: { mode: 'pan', count: 0, hold: 0 } };
    // A pointing finger at rest is not zooming; held long enough, it is the number one.
    const zooming = one && !dragging ? this.zoom(one, time, actions) : null;
    if (!one) this.forgetHand();
    if (zooming === 'in' || zooming === 'out')
      return { actions, reading: { mode: 'zoom', count: 0, hold: 0, zoom: zooming } };
    // How far a still hand is towards letting go of the zoom.
    const letGo =
      zooming === 'still' && this.zoomed && this.stillSince !== null
        ? Math.min(1, (time - this.stillSince) / GESTURE.breakMs)
        : 0;
    if (!hands.length) {
      this.held = null;
      return { actions, reading: { mode: 'none', count: 0, hold: 0 } };
    }
    const count = hands.reduce((n, hand) => n + fingersUp(hand), 0);
    // A hand that has just dragged or zoomed is not yet showing a number, and neither is one
    // with no finger up.
    if (time < this.busyUntil || count === 0) {
      this.held = null;
      return {
        actions,
        reading: zooming
          ? { mode: 'zoom', count: 0, hold: letGo, zoom: zooming }
          : { mode: dragging ? 'pan' : 'none', count, hold: 0 },
      };
    }
    if (this.held?.count !== count) this.held = { count, since: time, fired: false };
    const hold = Math.min(1, (time - this.held.since) / GESTURE.holdCountMs);
    if (hold >= 1 && !this.held.fired) {
      this.held.fired = true;
      actions.push({ type: 'flag', number: count });
    }
    return { actions, reading: { mode: 'count', count, hold } };
  }
  private forgetHand() {
    this.finger = this.shape = this.pointSince = this.pointLost = null;
    this.bunched = this.zoomed = this.released = this.settling = false;
    this.armedUntil = 0;
    this.stillSince = this.pose = null;
    for (const filter of [this.fingerX, this.fingerY, this.spread]) filter.reset();
  }
  // The index finger held up drags the view by as much as its tip moves. Returns whether the
  // finger is moving the view, resting, or the hand is not pointing at all.
  private drag(hand: Hand, time: number, actions: Action[]): 'moving' | 'resting' | null {
    if (!pointing(hand)) {
      this.pointSince = null;
      if (!this.finger) return null;
      // The pose missed for a picture or two does not end the drag.
      this.pointLost ??= time;
      if (time - this.pointLost <= GESTURE.pointLostMs) return 'resting';
      this.finger = this.pointLost = null;
      this.fingerX.reset();
      this.fingerY.reset();
      return null;
    }
    this.pointLost = null;
    this.pointSince ??= time;
    if (!this.finger && time - this.pointSince < GESTURE.pointEnterMs) return 'resting';
    // Mirrored left to right, so that the finger going right reads as rightwards.
    const x = this.fingerX.filter(1 - hand[INDEX_TIP].x, time / 1000),
      y = this.fingerY.filter(hand[INDEX_TIP].y, time / 1000),
      before = this.finger;
    this.finger = { x, y, time };
    this.shape = null;
    this.spread.reset();
    const dt = before ? (time - before.time) / 1000 : 0;
    // The first picture, or the first after a gap, only sets where the finger is.
    if (!before || dt <= 0 || dt > 0.25) return 'resting';
    const dx = x - before.x,
      dy = y - before.y;
    if (Math.hypot(dx * GESTURE.aspect, dy) / dt < GESTURE.panDead) return 'resting';
    // The view follows the finger: right with it, and down with it.
    actions.push({ type: 'pan', right: dx * GESTURE.pan, up: dy * GESTURE.pan });
    this.busyUntil = time + GESTURE.settleMs;
    return 'moving';
  }
  // The hand's shape zooms: spreading the fingers from bunched brings the scene nearer,
  // bunching them from open moves it away. Only a hand that was bunched or fully open a
  // moment ago zooms, so that raising a few fingers to show a number does not. Returns what
  // the zoom is doing, or null when the hand is not zooming.
  private zoom(hand: Hand, time: number, actions: Action[]): Reading['zoom'] | null {
    const measured = spreadOf(hand),
      spread = this.spread.filter(measured, time / 1000),
      before = this.shape;
    this.shape = { spread, time };
    // In a fist the finger tips are on the thumb too, but curled in below the knuckles; a
    // bunch reaches out from the palm. The pose is judged on the picture as measured: the
    // smoothed value lags, and would call a fist just opened a bunch.
    this.bunched =
      measured < (this.bunched ? GESTURE.bunchLeave : GESTURE.bunchEnter) &&
      distance(hand[INDEX_TIP], hand[WRIST]) > distance(hand[INDEX_MCP], hand[WRIST]) * 0.9;
    const pose = this.bunched ? 'bunched' : fingersUp(hand) === 5 ? 'open' : null,
      entered = pose !== null && pose !== this.pose;
    this.pose = pose;
    // A zoom that was let go of is taken up again only by newly bunching or opening the hand.
    if (this.released && entered) {
      this.released = false;
      this.settling = true;
    }
    if (this.released) return 'released';
    if (pose) this.armedUntil = time + GESTURE.zoomArmMs;
    const dt = before ? (time - before.time) / 1000 : 0;
    if (!before || dt <= 0 || dt > 0.25 || time >= this.armedUntil) {
      this.zoomed = false;
      this.stillSince = null;
      return null;
    }
    if (Math.abs(spread - before.spread) / dt < GESTURE.zoomDead) {
      this.settling = false;
      // Held still for long enough after zooming: let go, so that what the hand does next
      // (closing, pointing) is not read as zooming back.
      this.stillSince ??= time;
      if (this.zoomed && time - this.stillSince >= GESTURE.breakMs) {
        this.released = true;
        this.zoomed = false;
        this.stillSince = null;
        this.armedUntil = 0;
        return 'released';
      }
      return 'still';
    }
    this.stillSince = null;
    // The move that brought the hand back to a starting pose is not itself a zoom.
    if (this.settling) return 'released';
    this.zoomed = true;
    actions.push({ type: 'zoom', factor: Math.exp(-GESTURE.zoomGain * (spread - before.spread)) });
    this.busyUntil = time + GESTURE.settleMs;
    return spread > before.spread ? 'in' : 'out';
  }
}

// Runs a recording through a fresh interpreter: every action it leads to, the zoom they add up
// to (below 1 is nearer, above 1 is farther) and how far the view was dragged.
export function replay(frames: RecordedFrame[]) {
  const gestures = new GestureInterpreter();
  const actions: Action[] = [];
  for (const frame of frames) actions.push(...gestures.update(frame.hands, frame.t).actions);
  let zoom = 1,
    right = 0,
    up = 0;
  for (const action of actions)
    if (action.type === 'zoom') zoom *= action.factor;
    else if (action.type === 'pan') {
      right += action.right;
      up += action.up;
    }
  return { actions, zoom, right, up };
}
