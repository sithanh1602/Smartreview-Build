import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  BACKGROUND,
  BOX_COLORS,
  LASER_COLORS,
  REVIEW_COLORS,
  SELECTED_COLOR,
  cssColor,
} from './colors.ts';
import { boxKey, flagsOf, pinSvg } from './flags.ts';
import type { Risk, Verdict } from './flags.ts';

// The three.js side of the point cloud viewer. It draws one frame of a scene (scene.json of a
// 3D project) and knows nothing about React: the page hands it settings and reads back what is
// on screen. The data contract is docs/projects-3d.md; coordinates are the vehicle's, z up.
export interface Box3D {
  id: string;
  type: string;
  center: [number, number, number];
  size: [number, number, number];
  heading: number;
  points: number;
  // How far the cuboid's bottom is above the road under it, in metres (below zero: under it).
  lift?: number;
}
export interface Scene3D {
  segment: string;
  lasers: { id: number; name: string; extrinsic: number[] }[];
  // Cameras with images, left to right; absent when the project has none.
  cameras?: string[];
  frames: {
    timestamp: number;
    file: string;
    pose: number[];
    laserCounts: number[];
    boxes: Box3D[];
    // The cameras that have an image of this frame.
    cameras?: string[];
    // Where an object missing in this frame would be, interpolated from the frames around it.
    ghosts?: Box3D[];
  }[];
}
export type ColorMode = 'height' | 'intensity' | 'range' | 'laser';
export type ViewPreset = 'top' | 'front' | 'side' | 'perspective';
export { boxKey };
export interface ViewSettings {
  // Which frame of reference stays still: the vehicle, or the world it drives through.
  frame: 'vehicle' | 'world';
  follow: boolean;
  trajectory: boolean;
  motionCompensation: boolean;
  color: ColorMode;
  pointSize: number;
  boxes: boolean;
  // Cuboids take the colour of their type, or of the decision their review holds.
  boxColor: 'type' | 'review';
  labels: boolean;
  orientation: boolean;
  sensors: boolean;
  lasers: Record<string, boolean>;
  types: Record<string, boolean>;
}
// What the frame on screen holds, for the page to show.
export interface FrameInfo {
  index: number;
  points: number;
  boxes: number;
  byType: Record<string, number>;
  speedKmh: number;
  seconds: number;
}
// Frames kept after they were shown, so stepping back and replaying does not fetch again.
const CACHE_SIZE = 40;
const BYTES_PER_POINT = 22;
// 12 edges of the box and one segment on its top face pointing where it is heading.
const BOX_EDGES = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];
// The part of a sunk cuboid below the road is painted in this colour.
const SUNK_COLOR = 0xef4444;
const CAMERA_HOME = { position: [-35, 0, 22], target: [8, 0, 0] } as const;
// Flying to an issue: how long it takes, and how high above the cuboid it ends up looking.
const FLIGHT_MS = 700;
const FLIGHT_ELEVATION = 0.6;
// A pointer that moved less than this between press and release was a click, not a drag.
const CLICK_PX = 4;
// Thin cuboids (a sign is a few centimetres deep) are picked as if at least this thick.
const PICK_MIN_HALF = 0.25;

interface Cloud {
  xyzi: Float32Array;
  // Millimetres to add to a point to undo motion compensation; only the TOP lidar has any.
  delta: Int16Array;
}
// Blue, green, yellow, red as t goes from 0 to 1.
function ramp(t: number, out: Float32Array, o: number) {
  t = Math.min(1, Math.max(0, t));
  out[o] = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
  out[o + 1] = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
  out[o + 2] = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
}

export class PointCloudEngine {
  current = -1;
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private world = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2000);
  private controls: OrbitControls;
  // vehicleGroup holds what is given in vehicle coordinates (points, cuboids, sensors) and
  // worldGroup what is given in world coordinates (the trajectory). Changing the frame of
  // reference only resets these two matrices from the vehicle pose; no point is recomputed.
  private vehicleGroup = new THREE.Group();
  private worldGroup = new THREE.Group();
  private pointGeometry = new THREE.BufferGeometry();
  private pointMaterial: THREE.PointsMaterial;
  private boxLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private sensors = new THREE.Group();
  private boxLabels = new THREE.Group();
  private highlight: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  // The part below the road of each cuboid the risk engine found sunk (setSunk): a red block
  // with red edges, from the cuboid's bottom up to the road.
  private sunkParts = new THREE.Group();
  private sunkGeometry = new THREE.BoxGeometry(1, 1, 1);
  private sunkEdges = new THREE.EdgesGeometry(this.sunkGeometry);
  private sunkFill = new THREE.MeshBasicMaterial({
    color: SUNK_COLOR,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  private sunkLine = new THREE.LineBasicMaterial({ color: SUNK_COLOR });
  private sunk = new Set<string>();
  private selected: string | null = null;
  // Decision by box key, for colouring cuboids by review.
  private reviews: Record<string, Verdict> = {};
  // The 3D Risk Engine's cases by box key: the cuboids it doubts are flagged, reviewed or not.
  private risks: Record<string, Risk> = {};
  // The number of each flagged cuboid for the whole segment, by box key (issuesOf).
  private numbers = new Map<string, number>();
  private pressed: { x: number; y: number } | null = null;
  // The object to fly to once its frame is on screen, and the flight under way.
  private pendingFocus: { frame: number; objectId: string } | null = null;
  private flight: {
    start: number;
    from: [THREE.Vector3, THREE.Vector3];
    to: [THREE.Vector3, THREE.Vector3];
  } | null = null;
  private listeners: [keyof HTMLElementEventMap, (event: PointerEvent) => void][] = [];
  private trajectory: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private poses: THREE.Matrix4[];
  private cloud: Cloud | null = null;
  private cache = new Map<number, Promise<Cloud>>();
  // Where the vehicle is in the scene, so the camera can move along with it.
  private anchor = new THREE.Vector3();
  private showToken = 0;
  private observer: ResizeObserver;
  private disposed = false;
  private host: HTMLElement;
  private scene: Scene3D;
  private settings: ViewSettings;
  private load: (file: string) => Promise<ArrayBuffer>;
  private onFrame: (info: FrameInfo) => void;
  private onSelect: (objectId: string | null) => void;

  constructor(
    host: HTMLElement,
    scene: Scene3D,
    settings: ViewSettings,
    load: (file: string) => Promise<ArrayBuffer>,
    onFrame: (info: FrameInfo) => void,
    onSelect: (objectId: string | null) => void,
  ) {
    this.host = host;
    this.scene = scene;
    this.settings = settings;
    this.load = load;
    this.onFrame = onFrame;
    this.onSelect = onSelect;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(BACKGROUND);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;display:block';
    this.labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    host.append(this.renderer.domElement, this.labels.domElement);

    // The data is z-up: x ahead of the vehicle, y to its left. The camera is told so before
    // the controls read it; the data is never rotated to y-up.
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2;
    // Grabbing the view stops a flight, so the camera never fights the hand.
    this.controls.addEventListener('start', () => (this.flight = null));
    this.resetCamera();

    this.vehicleGroup.matrixAutoUpdate = this.worldGroup.matrixAutoUpdate = false;
    this.world.add(this.vehicleGroup, this.worldGroup);
    this.pointMaterial = new THREE.PointsMaterial({
      size: settings.pointSize,
      sizeAttenuation: false,
      vertexColors: true,
    });
    const capacity = Math.max(...scene.frames.map((f) => f.laserCounts.reduce((a, b) => a + b, 0)));
    for (const name of ['position', 'color'])
      this.pointGeometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
      );
    this.pointGeometry.setDrawRange(0, 0);
    const points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    this.boxLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true }),
    );
    points.frustumCulled = this.boxLines.frustumCulled = false;
    // Each lidar sits where its extrinsic puts it on the vehicle.
    for (const laser of scene.lasers) {
      const marker = new THREE.AxesHelper(0.8);
      marker.matrixAutoUpdate = false;
      marker.matrix.set(...(laser.extrinsic as Parameters<THREE.Matrix4['set']>));
      const label = document.createElement('div');
      label.className = 'viewer3d-sensor';
      label.textContent = laser.name;
      marker.add(new CSS2DObject(label));
      this.sensors.add(marker);
    }
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: SELECTED_COLOR,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    this.highlight.visible = false;
    this.vehicleGroup.add(
      points,
      this.boxLines,
      this.boxLabels,
      this.highlight,
      this.sunkParts,
      this.sensors,
      new THREE.AxesHelper(3),
    );

    this.poses = scene.frames.map((f) =>
      new THREE.Matrix4().set(...(f.pose as Parameters<THREE.Matrix4['set']>)),
    );
    this.trajectory = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        this.poses.map((pose) => new THREE.Vector3().setFromMatrixPosition(pose)),
      ),
      new THREE.LineBasicMaterial({ color: 0xf59e0b }),
    );
    this.trajectory.frustumCulled = false;
    this.worldGroup.add(this.trajectory);
    this.applyVisibility();

    // A click on a cuboid selects it and a click on nothing clears the selection; dragging
    // belongs to the orbit controls.
    const canvas = this.renderer.domElement;
    this.listen('pointerdown', (e) => {
      this.pressed = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    });
    this.listen('pointerup', (e) => {
      const from = this.pressed;
      this.pressed = null;
      if (!from || Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_PX) return;
      this.onSelect(this.pick(e)?.id ?? null);
    });
    this.listen('pointermove', (e) => {
      if (!e.buttons) canvas.style.cursor = this.pick(e) ? 'pointer' : '';
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop((now) => {
      this.fly(now);
      this.controls.update();
      this.renderer.render(this.world, this.camera);
      this.labels.render(this.world, this.camera);
    });
  }
  private listen(
    type: 'pointerdown' | 'pointerup' | 'pointermove',
    handler: (e: PointerEvent) => void,
  ) {
    this.renderer.domElement.addEventListener(type, handler);
    this.listeners.push([type, handler]);
  }
  // The shown cuboid under the pointer that is nearest to the camera.
  private pick(event: PointerEvent): Box3D | null {
    if (this.current < 0 || !this.settings.boxes) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    // Cuboids are given in vehicle coordinates, so the ray is taken there too.
    const { origin, direction } = ray.ray.applyMatrix4(this.vehicleGroup.matrix.clone().invert());
    let best: Box3D | null = null,
      nearest = Infinity;
    for (const box of this.shownBoxes()) {
      const cos = Math.cos(box.heading),
        sin = Math.sin(box.heading);
      const ox = origin.x - box.center[0],
        oy = origin.y - box.center[1];
      // Into the cuboid's own axes, where it is an axis-aligned box around the origin.
      const o = [ox * cos + oy * sin, -ox * sin + oy * cos, origin.z - box.center[2]],
        d = [
          direction.x * cos + direction.y * sin,
          -direction.x * sin + direction.y * cos,
          direction.z,
        ];
      let enter = 0,
        leave = Infinity;
      for (let axis = 0; axis < 3 && enter <= leave; axis++) {
        const half = Math.max(box.size[axis] / 2, PICK_MIN_HALF);
        if (Math.abs(d[axis]) < 1e-9) {
          if (Math.abs(o[axis]) > half) leave = -1;
          continue;
        }
        const a = (-half - o[axis]) / d[axis],
          b = (half - o[axis]) / d[axis];
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
      if (enter <= leave && enter < nearest) {
        nearest = enter;
        best = box;
      }
    }
    return best;
  }
  private resize() {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  // Back to the starting view, behind and above the vehicle wherever it is now.
  resetCamera() {
    this.camera.position.set(...CAMERA_HOME.position).add(this.anchor);
    this.controls.target.set(...CAMERA_HOME.target).add(this.anchor);
    this.controls.update();
  }
  private selectedBox() {
    return this.current < 0 || !this.selected
      ? null
      : (this.scene.frames[this.current].boxes.find((b) => b.id === this.selected) ?? null);
  }
  // Looks at the selected cuboid, or at the vehicle when none is selected in this frame, from
  // above, from ahead, from the left, or from behind and above. Directions are the vehicle's.
  view(preset: ViewPreset) {
    const box = this.selectedBox();
    const matrix = this.vehicleGroup.matrix;
    const target = box
      ? new THREE.Vector3(...box.center).applyMatrix4(matrix)
      : this.anchor.clone();
    const ahead = new THREE.Vector3().setFromMatrixColumn(matrix, 0),
      left = new THREE.Vector3().setFromMatrixColumn(matrix, 1),
      up = new THREE.Vector3(0, 0, 1);
    const distance = box ? Math.max(12, Math.hypot(...box.size) * 3.5) : 55;
    const offset =
      preset === 'top'
        ? // Straight down leaves the heading undefined; a hair behind keeps "ahead" at the top.
          up.multiplyScalar(distance).addScaledVector(ahead, -distance * 0.001)
        : preset === 'front'
          ? ahead.multiplyScalar(distance).addScaledVector(up, distance * 0.15)
          : preset === 'side'
            ? left.multiplyScalar(distance).addScaledVector(up, distance * 0.15)
            : ahead.multiplyScalar(-distance * 0.8).addScaledVector(up, distance * 0.5);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
    this.controls.update();
  }
  // Turns the camera to an object of a frame: at once when the frame is on screen, otherwise
  // once show() has put it there.
  focus(frame: number, objectId: string) {
    this.pendingFocus = { frame, objectId };
    if (frame === this.current) this.flyPending();
  }
  private flyPending() {
    const pending = this.pendingFocus;
    if (!pending || pending.frame !== this.current) return;
    this.pendingFocus = null;
    const box = this.locate(pending.frame, pending.objectId);
    if (!box) return;
    const target = box.center;
    // Seen from the side of the vehicle, where the LiDAR hits it, a little from above. An
    // object at the vehicle itself keeps the direction the camera has now.
    const toward = this.anchor.clone().sub(target).setZ(0);
    if (toward.length() < 1) toward.copy(this.camera.position).sub(this.controls.target).setZ(0);
    if (toward.length() < 1e-6) toward.set(-1, 0, 0);
    toward.normalize().setZ(FLIGHT_ELEVATION).normalize();
    const distance = Math.max(12, Math.hypot(...box.size) * 3.5);
    this.flight = {
      start: performance.now(),
      from: [this.controls.target.clone(), this.camera.position.clone().sub(this.controls.target)],
      to: [target, toward.multiplyScalar(distance)],
    };
  }
  // Where an object is in the scene as drawn now. In a frame where it has no cuboid (a gap),
  // its interpolated place, or else its cuboid in the nearest frame that has one.
  private locate(frame: number, objectId: string) {
    const { frames } = this.scene;
    for (let step = 0; step < frames.length; step++)
      for (const index of step ? [frame - step, frame + step] : [frame]) {
        const at = frames[index];
        if (!at) continue;
        const box =
          at.boxes.find((b) => b.id === objectId) ??
          (index === frame ? at.ghosts?.find((b) => b.id === objectId) : undefined);
        if (!box) continue;
        // From that frame's vehicle coordinates to what is drawn for the current frame.
        const matrix = this.vehicleGroup.matrix
          .clone()
          .multiply(this.poses[frame].clone().invert())
          .multiply(this.poses[index]);
        return { center: new THREE.Vector3(...box.center).applyMatrix4(matrix), size: box.size };
      }
    return null;
  }
  // One step of the flight: the point looked at slides to the cuboid and the camera swings
  // round it, easing in and out.
  private fly(now: number) {
    const flight = this.flight;
    if (!flight) return;
    const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
    const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const [fromTarget, fromOffset] = flight.from,
      [toTarget, toOffset] = flight.to;
    this.controls.target.lerpVectors(fromTarget, toTarget, k);
    // Direction and distance apart, so the camera swings round instead of cutting through.
    const direction = fromOffset
      .clone()
      .normalize()
      .lerp(toOffset.clone().normalize(), k)
      .normalize();
    const length = fromOffset.length() + (toOffset.length() - fromOffset.length()) * k;
    this.camera.position.copy(this.controls.target).addScaledVector(direction, length);
    if (t === 1) this.flight = null;
  }
  // Marks one object as selected; it stays selected in every frame it is boxed in.
  select(objectId: string | null) {
    if (objectId === this.selected) return;
    this.selected = objectId;
    if (this.current >= 0) this.rebuildBoxes();
  }
  // What the reviews say, by box key: cuboids are coloured by it and the wrong ones flagged.
  setReviews(reviews: Record<string, Verdict>) {
    this.reviews = reviews;
    if (this.current >= 0) this.rebuildBoxes();
  }
  setRisks(risks: Record<string, Risk>) {
    this.risks = risks;
    if (this.current >= 0) this.rebuildBoxes();
  }
  // The cuboids found sunk, by box key (sunkBoxes): their part below the road is painted red.
  setSunk(sunk: Set<string>) {
    this.sunk = sunk;
    if (this.current >= 0) this.rebuildBoxes();
  }
  setNumbers(numbers: Map<string, number>) {
    this.numbers = numbers;
    if (this.current >= 0) this.rebuildBoxes();
  }
  // Moves the camera nearer (factor below 1) or farther from what it is looking at.
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(Math.min(600, Math.max(3, offset.length() * factor)));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }
  // Slides the view sideways and up, as fractions of the distance to what it is looking at.
  pan(right: number, up: number) {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const shift = new THREE.Vector3()
      .setFromMatrixColumn(this.camera.matrix, 0)
      .multiplyScalar(-right * distance)
      .addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1),
        up * distance,
      );
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.controls.update();
  }
  private boxColor(box: Box3D, timestamp: number) {
    if (Number.isFinite(box.lift) && box.lift! < 0 && this.sunk.has(boxKey(timestamp, box.id)))
      return SUNK_COLOR;
    return this.settings.boxColor === 'review'
      ? REVIEW_COLORS[this.reviews[boxKey(timestamp, box.id)]?.decision ?? 'NONE']
      : (BOX_COLORS[box.type] ?? BOX_COLORS.UNKNOWN);
  }
  private fetchCloud(index: number) {
    const hit = this.cache.get(index);
    if (hit) {
      this.cache.delete(index);
      this.cache.set(index, hit);
      return hit;
    }
    const frame = this.scene.frames[index];
    const count = frame.laserCounts.reduce((a, b) => a + b, 0);
    const pending = this.load(frame.file).then((buffer) => {
      if (buffer.byteLength !== count * BYTES_PER_POINT)
        throw new Error('Point cloud của frame này không khớp số điểm trong scene.');
      return {
        xyzi: new Float32Array(buffer, 0, count * 4),
        delta: new Int16Array(buffer, count * 16, count * 3),
      };
    });
    pending.catch(() => this.cache.delete(index));
    this.cache.set(index, pending);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    return pending;
  }
  private rebuildPoints() {
    if (!this.cloud) return 0;
    const { xyzi, delta } = this.cloud,
      { settings, scene } = this;
    const position = this.pointGeometry.attributes.position.array as Float32Array,
      color = this.pointGeometry.attributes.color.array as Float32Array;
    const raw = settings.motionCompensation ? 0 : 0.001;
    const laserColor = new THREE.Color();
    let n = 0,
      start = 0;
    scene.frames[this.current].laserCounts.forEach((count, laser) => {
      const end = start + count;
      if (settings.lasers[scene.lasers[laser].name]) {
        laserColor.setHex(LASER_COLORS[laser % LASER_COLORS.length]);
        for (let i = start; i < end; i++, n++) {
          const x = xyzi[i * 4] + delta[i * 3] * raw,
            y = xyzi[i * 4 + 1] + delta[i * 3 + 1] * raw,
            z = xyzi[i * 4 + 2] + delta[i * 3 + 2] * raw;
          position[n * 3] = x;
          position[n * 3 + 1] = y;
          position[n * 3 + 2] = z;
          if (settings.color === 'height') ramp((z + 0.5) / 4.5, color, n * 3);
          else if (settings.color === 'intensity')
            ramp(Math.tanh(xyzi[i * 4 + 3] * 2), color, n * 3);
          else if (settings.color === 'range') ramp(Math.hypot(x, y) / 60, color, n * 3);
          else laserColor.toArray(color, n * 3);
        }
      }
      start = end;
    });
    this.pointGeometry.setDrawRange(0, n);
    this.pointGeometry.attributes.position.needsUpdate = true;
    this.pointGeometry.attributes.color.needsUpdate = true;
    return n;
  }
  private shownBoxes() {
    return this.scene.frames[this.current].boxes.filter((b) => this.settings.types[b.type] ?? true);
  }
  private rebuildBoxes() {
    const boxes = this.shownBoxes(),
      timestamp = this.scene.frames[this.current].timestamp;
    this.boxLabels.clear();
    this.highlight.visible = false;
    this.sunkParts.clear();
    const flags = new Map(
      flagsOf(this.scene.frames[this.current], this.reviews, this.risks, this.numbers).map(
        (flag) => [flag.objectId, flag],
      ),
    );
    const verticesPerBox = BOX_EDGES.length + (this.settings.orientation ? 6 : 0);
    const position = new Float32Array(boxes.length * verticesPerBox * 3),
      color = new Float32Array(position.length);
    const tint = new THREE.Color();
    let o = 0;
    for (const box of boxes) {
      const [cx, cy, cz] = box.center,
        [sx, sy, sz] = box.size;
      const cos = Math.cos(box.heading),
        sin = Math.sin(box.heading);
      const local = (x: number, y: number, z: number) => [
        cx + x * cos - y * sin,
        cy + x * sin + y * cos,
        cz + z,
      ];
      const corners: number[][] = [];
      for (const z of [-sz / 2, sz / 2])
        for (const y of [-sy / 2, sy / 2])
          for (const x of [-sx / 2, sx / 2]) corners.push(local(x, y, z));
      const segments = BOX_EDGES.map((i) => corners[i]);
      if (this.settings.orientation) {
        // Heading rotates local +X. Raise the arrow above the roof and extend its tip
        // beyond the front face so it remains distinguishable from cuboid edges.
        const head = Math.max(0.12, Math.min(0.5, sx * 0.2, sy * 0.4));
        const tip = sx / 2 + head;
        const z = sz / 2 + 0.06;
        segments.push(
          local(0, 0, z),
          local(tip, 0, z),
          local(tip, 0, z),
          local(tip - head, head * 0.65, z),
          local(tip, 0, z),
          local(tip - head, -head * 0.65, z),
        );
      }
      const chosen = box.id === this.selected,
        own = this.boxColor(box, timestamp);
      const sunk =
        Number.isFinite(box.lift) && box.lift! < 0 && this.sunk.has(boxKey(timestamp, box.id));
      tint.setHex(sunk ? SUNK_COLOR : chosen ? SELECTED_COLOR : own);
      if (chosen) {
        this.highlight.position.set(cx, cy, cz);
        this.highlight.scale.set(sx, sy, sz);
        this.highlight.rotation.z = box.heading;
        this.highlight.visible = this.settings.boxes;
      }
      // Sunk: the part from the bottom up to the road, no higher than the cuboid itself.
      if (box.lift !== undefined && box.lift < 0 && this.sunk.has(boxKey(timestamp, box.id))) {
        const depth = Math.min(sz, -box.lift);
        for (const part of [
          new THREE.Mesh(this.sunkGeometry, this.sunkFill),
          new THREE.LineSegments(this.sunkEdges, this.sunkLine),
        ]) {
          part.position.set(cx, cy, cz - sz / 2 + depth / 2);
          part.scale.set(sx, sy, depth);
          part.rotation.z = box.heading;
          this.sunkParts.add(part);
        }
      }
      const flag = flags.get(box.id);
      if (chosen || this.settings.labels) {
        const tag = document.createElement('div');
        tag.className =
          'viewer3d-box' +
          (chosen ? ' viewer3d-box--selected' : '') +
          (flag ? ' viewer3d-box--pinned' : '');
        tag.style.borderColor = cssColor(own);
        tag.textContent = `${box.type} · ${box.id.slice(0, 5)}`;
        const label = new CSS2DObject(tag);
        label.position.set(cx, cy, cz + sz / 2);
        // Beside the pin when the cuboid has one, else centred over the cuboid.
        label.center.set(flag ? 0 : 0.5, 1.4);
        this.boxLabels.add(label);
      }
      // A cuboid reviewed as wrong, or doubted by the risk engine, carries a map pin with its
      // number, its point on the top of the cuboid: red when confirmed, green when reviewed as
      // right, orange or yellow by risk.
      if (flag) {
        const tag = document.createElement('div');
        tag.className = 'viewer3d-pin' + (chosen ? ' viewer3d-pin--selected' : '');
        tag.innerHTML = pinSvg(flag);
        const marker = new CSS2DObject(tag);
        marker.position.set(cx, cy, cz + sz / 2);
        marker.center.set(0.5, 1);
        this.boxLabels.add(marker);
      }
      for (const [index, vertex] of segments.entries()) {
        if (index === BOX_EDGES.length) tint.setHex(sunk ? SUNK_COLOR : 0x00e5ff);
        position.set(vertex, o);
        tint.toArray(color, o);
        o += 3;
      }
    }
    this.boxLines.geometry.dispose();
    this.boxLines.geometry = new THREE.BufferGeometry();
    this.boxLines.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.boxLines.geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  }
  // Sets the two group matrices from the vehicle pose. The camera moves by as much as the
  // vehicle did when it follows it, or when the frame of reference itself was switched.
  private applyPose(keepView: boolean) {
    const pose = this.poses[this.current];
    if (this.settings.frame === 'vehicle') {
      this.vehicleGroup.matrix.identity();
      this.worldGroup.matrix.copy(pose).invert();
    } else {
      this.vehicleGroup.matrix.copy(pose);
      this.worldGroup.matrix.identity();
    }
    this.vehicleGroup.matrixWorldNeedsUpdate = this.worldGroup.matrixWorldNeedsUpdate = true;
    const next = new THREE.Vector3().setFromMatrixPosition(this.vehicleGroup.matrix);
    if (keepView || this.settings.follow) {
      const shift = next.clone().sub(this.anchor);
      this.camera.position.add(shift);
      this.controls.target.add(shift);
    }
    this.anchor.copy(next);
  }
  private applyVisibility() {
    this.trajectory.visible = this.settings.trajectory;
    this.sensors.visible = this.settings.sensors;
    this.boxLines.visible = this.boxLabels.visible = this.settings.boxes;
    if (!this.settings.boxes) this.highlight.visible = false;
    this.sunkParts.visible = this.settings.boxes;
    this.pointMaterial.size = this.settings.pointSize;
  }
  private report(points: number) {
    const { frames } = this.scene,
      last = frames.length - 1,
      before = Math.max(0, this.current - 1),
      after = Math.min(last, this.current + 1);
    const byType: Record<string, number> = {};
    for (const box of frames[this.current].boxes) byType[box.type] = (byType[box.type] ?? 0) + 1;
    const dt = (frames[after].timestamp - frames[before].timestamp) / 1e6;
    const travelled = new THREE.Vector3()
      .setFromMatrixPosition(this.poses[before])
      .distanceTo(new THREE.Vector3().setFromMatrixPosition(this.poses[after]));
    this.onFrame({
      index: this.current,
      points,
      boxes: this.shownBoxes().length,
      byType,
      speedKmh: dt > 0 ? (travelled / dt) * 3.6 : 0,
      seconds: (frames[this.current].timestamp - frames[0].timestamp) / 1e6,
    });
  }
  // Shows a frame once its points have arrived. A later call wins over one still loading.
  async show(index: number) {
    const token = ++this.showToken;
    const loaded = await this.fetchCloud(index);
    if (token !== this.showToken || this.disposed) return;
    this.current = index;
    this.cloud = loaded;
    const count = this.rebuildPoints();
    this.rebuildBoxes();
    this.applyPose(false);
    // A flight asked for another frame is dropped once the reviewer has moved on.
    if (this.pendingFocus?.frame === index) this.flyPending();
    else this.pendingFocus = null;
    this.report(count);
    for (const ahead of [1, 2])
      if (index + ahead < this.scene.frames.length) this.fetchCloud(index + ahead).catch(() => {});
  }
  // Applies changed settings to what is on screen, redoing only what they affect.
  update(next: ViewSettings) {
    const before = this.settings;
    this.settings = next;
    this.applyVisibility();
    if (this.current < 0) return;
    if (next.frame !== before.frame) this.applyPose(true);
    const pointsChanged =
      next.color !== before.color ||
      next.motionCompensation !== before.motionCompensation ||
      next.lasers !== before.lasers;
    const boxesChanged =
      next.types !== before.types ||
      next.boxColor !== before.boxColor ||
      next.labels !== before.labels ||
      next.orientation !== before.orientation ||
      next.boxes !== before.boxes;
    if (boxesChanged) this.rebuildBoxes();
    if (pointsChanged) this.report(this.rebuildPoints());
    else if (boxesChanged) this.report(this.pointGeometry.drawRange.count);
  }
  dispose() {
    this.disposed = true;
    this.showToken++;
    this.observer.disconnect();
    this.renderer.setAnimationLoop(null);
    for (const [type, handler] of this.listeners)
      this.renderer.domElement.removeEventListener(type, handler as EventListener);
    this.controls.dispose();
    this.boxLabels.clear();
    this.highlight.geometry.dispose();
    this.highlight.material.dispose();
    this.sunkParts.clear();
    this.sunkGeometry.dispose();
    this.sunkEdges.dispose();
    this.sunkFill.dispose();
    this.sunkLine.dispose();
    this.pointGeometry.dispose();
    this.pointMaterial.dispose();
    this.boxLines.geometry.dispose();
    this.boxLines.material.dispose();
    this.trajectory.geometry.dispose();
    this.trajectory.material.dispose();
    this.sensors.traverse((o) => {
      if (o instanceof THREE.AxesHelper) o.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.cache.clear();
  }
}
