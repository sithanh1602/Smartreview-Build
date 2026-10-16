// The 3D Risk Engine: scores every cuboid of a LiDAR segment from scene.json alone. It reads
// the cuboids, the vehicle's pose and the point counts and fit taken at import; never a point
// cloud.
// What a rule looks for is here; its thresholds, score and error type are data, in
// policy3d/_scene.json.
import policyFile from '../../policy3d/_scene.json' with { type: 'json' };

const policy = policyFile.scene_policy;
export const ENGINE_3D_VERSION = '3d-1.11.0';
export const POLICY_3D_VERSION = policy.policy_version;

export interface SceneBox {
  id: string;
  type: string;
  center: number[];
  size: number[];
  heading: number;
  // Points inside the cuboid: counted from the exported cloud, else as the source labelled it.
  counted?: number;
  points?: number;
  // How well the cuboid fits its object, measured at import alongside counted: points in a ring
  // just outside it, and the empty space [along, across] in metres between its sides that face
  // the vehicle and the object.
  outside?: number;
  slack?: number[];
  // Where within a metre the same cuboid would hold the most of the object's points:
  // [along, across, points where it is, points there].
  moved?: number[];
  // How far the cuboid's bottom is above the road under its centre, in metres; below zero,
  // under it. Absent where the road around it could not be seen.
  lift?: number;
  // Undirected PCA axis in vehicle coordinates, measured from nearby above-road points.
  lidarAxis?: { heading: number; points: number; anisotropy: number; span: number };
}
export interface SceneFrame {
  timestamp: number;
  // world_from_vehicle, 4x4 row-major.
  pose: number[];
  boxes: SceneBox[];
  // Cuboids interpolated where an object is absent between two frames that hold it, measured
  // like the real ones.
  ghosts?: SceneBox[];
}
export interface Scene {
  segment: string;
  frames: SceneFrame[];
}
export type Severity3D = 'high' | 'medium' | 'low';
export interface Finding3D {
  check_id: string;
  score: number;
  level?: 'warning';
  error_type: string;
  reason: string;
  suggested_label?: string;
  // So far off that it cannot be right: the reviewer sees it as an error, not a doubt.
  certain?: boolean;
  evidence: Record<string, unknown>;
}
export interface Risk3DCase {
  // The key 3D reviews use for a cuboid: "<timestamp>:<object id>".
  id: string;
  timestamp: number;
  frame_index: number;
  object_id: string;
  type: string;
  score: number;
  severity: Severity3D;
  suspected_error?: string;
  suggested_label?: string;
  // A finding of the cuboid is certain (Finding3D.certain).
  certain?: boolean;
  reasons: string[];
  findings: Finding3D[];
}
export interface Risk3DGap {
  object_id: string;
  type: string;
  // The frames the object is absent from, between two frames that hold it.
  frame_indexes: number[];
  timestamps: number[];
  // The object's points in the cuboid interpolated at each of those frames; absent for a scene
  // exported before they were counted.
  points?: number[];
  // The object is still there by its points: a cuboid is almost surely missing.
  likely_missing?: boolean;
}
export interface Risk3DReport {
  schema_version: '1.0.0';
  engine_version: string;
  policy_version: string;
  segment: string;
  min_score: number;
  total_frames: number;
  total_boxes: number;
  checks: Record<string, { flagged: number }>;
  levels: Record<Severity3D, number>;
  // Cuboids at or above min_score, highest first; then those only warned about or below it.
  cases: Risk3DCase[];
  warnings: Risk3DCase[];
  gaps: Risk3DGap[];
}

type TypeLimits = {
  size: { length: number[]; width: number[]; height: number[] };
  position_jump_m: number;
  heading_jump_rad: number;
  empty_within_m: number;
  outside_ratio: number;
  slack_ratio: number;
  moved_ratio: number;
  empty_side_m: number;
  // How far a run of cuboids may sit above or below the rest of their track (fit.lowered,
  // fit.raised); a type without it is not checked.
  level_shift_m?: number;
};
const { note: _types, ...TYPES } = policy.types;
const limitsOf = (type: string): TypeLimits | undefined =>
  (TYPES as Record<string, TypeLimits>)[type];
type Rule = (typeof policy.rules)[number];
const RULES = new Map<string, Rule>(policy.rules.map((rule) => [rule.id, rule]));
// A rule the policy does not list does not run.
const rule = (id: string) => RULES.get(id);

const round = (value: number, digits = 3) => Number(value.toFixed(digits));
// The smallest angle between two headings, 0 to pi.
const turn = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
const pointsIn = (box: SceneBox) => box.counted ?? box.points;
// The points of the object itself: for a type standing on the road, those above the road band,
// which the fit search counted where the cuboid is (a scene with the fit measured but no
// `moved` had none there); otherwise every point in the cuboid.
const objectPoints = (box: SceneBox, aboveGround: string[]) =>
  aboveGround.includes(box.type) && box.outside !== undefined
    ? (box.moved?.[2] ?? 0)
    : pointsIn(box);
// The share of one cuboid's volume inside another, from a grid of points in the first.
const GRID = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => t - 0.5);
const shareInside = (box: SceneBox, outer: SceneBox) => {
  const cos = Math.cos(box.heading),
    sin = Math.sin(box.heading);
  const oc = Math.cos(outer.heading),
    os = Math.sin(outer.heading);
  let inside = 0;
  for (const u of GRID)
    for (const v of GRID)
      for (const w of GRID) {
        const x = u * box.size[0],
          y = v * box.size[1];
        const dx = box.center[0] + x * cos - y * sin - outer.center[0],
          dy = box.center[1] + x * sin + y * cos - outer.center[1],
          dz = box.center[2] + w * box.size[2] - outer.center[2];
        if (
          Math.abs(dx * oc + dy * os) <= outer.size[0] / 2 &&
          Math.abs(dy * oc - dx * os) <= outer.size[1] / 2 &&
          Math.abs(dz) <= outer.size[2] / 2
        )
          inside++;
      }
  return inside / GRID.length ** 3;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
// The share of an object's points that fall just outside its cuboid.
const outsideShare = (box: SceneBox) =>
  box.outside === undefined || box.counted === undefined || box.counted + box.outside === 0
    ? undefined
    : box.outside / (box.counted + box.outside);
// The empty space inside the cuboid on the side that has less of it, as a share of half the
// cuboid on that side: an object hidden behind another leaves only one side empty.
const looseShare = (box: SceneBox) =>
  box.slack && Math.min(box.slack[0] / (box.size[0] / 2), box.slack[1] / (box.size[1] / 2));
// The share of the object's points the cuboid misses where it is, against where it would hold
// the most.
const movedShare = (box: SceneBox) => box.moved && 1 - box.moved[2] / box.moved[3];
// The empty space, in metres, on a side of the cuboid that faces the vehicle, on an axis where
// the fit search also moves the cuboid away from the vehicle: the cuboid stands out in front of
// its object. The vehicle is at the origin of the cuboid's coordinates.
const emptySide = (box: SceneBox) => {
  if (!box.moved || !box.slack) return undefined;
  const cos = Math.cos(box.heading),
    sin = Math.sin(box.heading);
  const sensor = [
    -box.center[0] * cos - box.center[1] * sin,
    -box.center[1] * cos + box.center[0] * sin,
  ];
  let gap = 0;
  for (const axis of [0, 1]) {
    const move = box.moved[axis];
    if (Math.abs(move) >= 0.25 && Math.sign(move) === -Math.sign(sensor[axis]))
      gap = Math.max(gap, Math.min(box.slack[axis], Math.abs(move) + 0.25));
  }
  return gap;
};
// The cuboid's bottom against the road, for the types standing on it and near enough for the
// road to be measured well.
const liftOf = (id: 'fit.floating' | 'fit.sunk', box: SceneBox) => {
  const r = rule(id);
  if (!r || box.lift === undefined || !(r.params.types as string[]).includes(box.type)) return;
  if (Math.hypot(box.center[0], box.center[1]) > r.params.max_distance_m!) return;
  return id === 'fit.floating' ? box.lift : -box.lift;
};
// Each cuboid's lift against the median lift of its own track: a curb or a slope beside an
// object raises or lowers the road it is measured against by the same amount all along, so what
// is left is the cuboid moving up or down on its object. Set per track by levelTrack.
const LEVEL = new WeakMap<SceneBox, number>();
function levelTrack(boxes: SceneBox[]) {
  // fit.raised reads its track parameters from fit.lowered.
  const r = rule('fit.lowered');
  if (!r) return;
  const usable = boxes.filter(
    (box) =>
      box.lift !== undefined &&
      (r.params.types as string[]).includes(box.type) &&
      Math.hypot(box.center[0], box.center[1]) <= r.params.max_distance_m! &&
      (pointsIn(box) ?? 0) >= r.params.min_points!,
  );
  if (usable.length < r.params.min_frames!) return;
  const level = median(usable.map((box) => box.lift!));
  for (const box of usable) LEVEL.set(box, box.lift! - level);
}
const FIT = [
  {
    id: 'fit.moved',
    measure: movedShare,
    points: (box: SceneBox) => box.moved?.[3],
    limit: (limits: TypeLimits) => limits.moved_ratio,
    reason: (share: number, from: number, to: number, box: SceneBox) =>
      `Dời cuboid ${round(Math.hypot(box.moved![0], box.moved![1]), 2)} m (dọc ${box.moved![0]} m, ngang ${box.moved![1]} m) thì ôm được nhiều điểm của vật hơn; tại chỗ nó thiếu ${Math.round(share * 100)}% (trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.empty_side',
    measure: emptySide,
    points: (box: SceneBox) => box.moved?.[3],
    limit: (limits: TypeLimits) => limits.empty_side_m,
    reason: (gap: number, from: number, to: number, box: SceneBox) =>
      `Mặt cuboid quay về phía xe trống ${round(gap, 2)} m: vật nằm lùi vào trong. Dời cuboid khoảng ${round(Math.hypot(box.moved![0], box.moved![1]), 2)} m (dọc ${box.moved![0]} m, ngang ${box.moved![1]} m) thì khớp hơn (trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.floating',
    measure: (box: SceneBox) => liftOf('fit.floating', box),
    points: pointsIn,
    limit: () => rule('fit.floating')!.params.above_m!,
    reason: (lift: number, from: number, to: number, _box: SceneBox) =>
      `Đáy cuboid cao hơn mặt đường ${round(lift, 2)} m: cuboid lơ lửng (trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.sunk',
    measure: (box: SceneBox) => liftOf('fit.sunk', box),
    points: pointsIn,
    limit: () => rule('fit.sunk')!.params.below_m!,
    reason: (sink: number, from: number, to: number, _box: SceneBox) =>
      `Đáy cuboid thấp hơn mặt đường ${round(sink, 2)} m: cuboid chìm xuống đường (trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.lowered',
    measure: (box: SceneBox) => {
      const shift = LEVEL.get(box);
      return shift === undefined ? undefined : -shift;
    },
    points: pointsIn,
    limit: (limits: TypeLimits) => limits.level_shift_m ?? Infinity,
    reason: (drop: number, from: number, to: number, _box: SceneBox) =>
      `Cuboid bị hạ xuống ${round(drop, 2)} m so với chính nó ở các frame khác của track (so với mặt đường; trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.raised',
    measure: (box: SceneBox) => LEVEL.get(box),
    points: pointsIn,
    limit: (limits: TypeLimits) => limits.level_shift_m ?? Infinity,
    reason: (rise: number, from: number, to: number, _box: SceneBox) =>
      `Cuboid bị nâng lên ${round(rise, 2)} m so với chính nó ở các frame khác của track (so với mặt đường; trung vị từ frame ${from} tới ${to}).`,
  },
  {
    id: 'fit.points_outside',
    measure: outsideShare,
    points: (box: SceneBox) => box.counted,
    limit: (limits: TypeLimits) => limits.outside_ratio,
    reason: (share: number, from: number, to: number, _box: SceneBox) =>
      `Trung vị ${Math.round(share * 100)}% điểm của vật nằm ngay ngoài cuboid, từ frame ${from} tới ${to}.`,
  },
  {
    id: 'fit.loose',
    measure: looseShare,
    points: (box: SceneBox) => box.counted,
    limit: (limits: TypeLimits) => limits.slack_ratio,
    reason: (share: number, from: number, to: number, _box: SceneBox) =>
      `Cuboid rộng hơn vật ở cả hai mặt nhìn thấy (trung vị ${Math.round(share * 100)}% nửa cạnh), từ frame ${from} tới ${to}.`,
  },
];
export const severity3D = (score: number): Severity3D =>
  score >= policy.scoring.high_from
    ? 'high'
    : score >= policy.scoring.medium_from
      ? 'medium'
      : 'low';

// One cuboid of an object, with where it is in the fixed frame the tracks are compared in.
interface Seen {
  frame: number;
  timestamp: number;
  box: SceneBox;
  world: number[];
  yaw: number;
  distance: number;
}

// Shared by scoring and the viewer: coloring must not depend on a cached risk report.
export function isBelowLocalGround(box: Pick<SceneBox, 'lift' | 'center' | 'size'>): boolean {
  const ground = rule('box.below_ground');
  return (
    !!ground &&
    Number.isFinite(box.lift) &&
    box.lift! < -ground.params.below_m! &&
    Number.isFinite(box.size[2]) &&
    box.size[2] > 0 &&
    Math.hypot(box.center[0], box.center[1]) <= ground.params.max_distance_m!
  );
}

export function analyzeScene(scene: Scene): Risk3DReport {
  const found = new Map<string, Finding3D[]>();
  const key = (seen: Pick<Seen, 'timestamp' | 'box'>) => `${seen.timestamp}:${seen.box.id}`;
  const flag = (
    seen: Seen,
    id: string,
    reason: string,
    evidence: Record<string, unknown>,
    suggested?: string,
    certain?: { score: number },
  ) => {
    const from = rule(id)!;
    const list = found.get(key(seen)) ?? [];
    found.set(key(seen), list);
    list.push({
      check_id: id,
      score: certain ? certain.score : 'score' in from ? (from.score as number) : 0,
      ...(certain && { certain: true }),
      ...('level' in from && from.level === 'warning' && { level: 'warning' as const }),
      error_type: from.error_type,
      reason,
      ...(suggested && { suggested_label: suggested }),
      evidence,
    });
  };

  const tracks = new Map<string, Seen[]>();
  const every: Seen[] = [];
  scene.frames.forEach((frame, index) => {
    const p = frame.pose;
    const ego = Math.atan2(p[4], p[0]);
    for (const box of frame.boxes) {
      const [x, y, z] = box.center;
      const seen: Seen = {
        frame: index,
        timestamp: frame.timestamp,
        box,
        world: [
          p[0] * x + p[1] * y + p[2] * z + p[3],
          p[4] * x + p[5] * y + p[6] * z + p[7],
          p[8] * x + p[9] * y + p[10] * z + p[11],
        ],
        yaw: ego + box.heading,
        distance: Math.hypot(x, y),
      };
      every.push(seen);
      if (!tracks.has(box.id)) tracks.set(box.id, []);
      tracks.get(box.id)!.push(seen);
    }
  });

  const referenceRule = rule('orientation.frame1_reference');
  if (referenceRule)
    for (const track of tracks.values()) {
      const first = track[0];
      if (
        first.frame !== 0 ||
        first.box.type !== 'VEHICLE' ||
        (pointsIn(first.box) ?? 0) < referenceRule.params.min_points!
      )
        continue;
      let stationary = true;
      for (const seen of track.slice(1)) {
        stationary &&=
          Math.hypot(seen.world[0] - first.world[0], seen.world[1] - first.world[1]) <=
          referenceRule.params.max_displacement_m!;
        if (
          !stationary ||
          seen.box.type !== 'VEHICLE' ||
          (pointsIn(seen.box) ?? 0) < referenceRule.params.min_points!
        )
          continue;
        const delta = turn(seen.yaw, first.yaw);
        if (delta > referenceRule.params.min_angle_rad!)
          flag(
            seen,
            'orientation.frame1_reference',
            `Hướng xe đứng yên lệch ${round((delta * 180) / Math.PI, 1)}° so với cùng object ở frame 1. Kiểm tra cả nhãn mốc và nhãn hiện tại.`,
            {
              reference_frame_index: 0,
              reference_timestamp: first.timestamp,
              reference_heading_world: first.yaw,
              heading_world: seen.yaw,
              angle_rad: round(delta),
              reference_verified: false,
            },
          );
      }
    }

  // Rules on one cuboid.
  for (const seen of every) {
    const { box } = seen;
    const axisRule = rule('orientation.lidar_axis'),
      axis = box.lidarAxis;
    if (
      axisRule &&
      axis &&
      box.type === 'VEHICLE' &&
      [axis.heading, axis.points, axis.anisotropy, axis.span, box.heading, ...box.size].every(
        Number.isFinite,
      ) &&
      axis.points >= axisRule.params.min_points! &&
      axis.anisotropy >= axisRule.params.min_anisotropy! &&
      seen.distance <= axisRule.params.max_distance_m! &&
      box.size[1] > 0 &&
      box.size[0] / box.size[1] >= axisRule.params.min_length_width_ratio! &&
      axis.span >= box.size[0] * axisRule.params.min_span_ratio!
    ) {
      const delta = Math.acos(Math.min(1, Math.abs(Math.cos(box.heading - axis.heading))));
      if (delta > axisRule.params.min_angle_rad!)
        flag(
          seen,
          'orientation.lidar_axis',
          `Trục cuboid lệch ${round((delta * 180) / Math.PI, 1)}° so với trục cụm điểm LiDAR; cần kiểm tra hướng và điểm của vật lân cận.`,
          { ...axis, angle_rad: round(delta), undirected: true, reference: 'lidar_pca' },
        );
    }
    const ground = rule('box.below_ground');
    if (ground && isBelowLocalGround(box)) {
      const depth = -box.lift!;
      flag(
        seen,
        'box.below_ground',
        `Đáy cuboid chìm ${round(depth, 2)} m dưới mặt đường cục bộ; vượt dung sai ${ground.params.below_m} m. Cần kiểm tra vị trí trục Z.`,
        {
          depth_m: round(depth),
          lift_m: box.lift,
          tolerance_m: ground.params.below_m,
          submerged_height_ratio: round(Math.min(1, depth / box.size[2])),
          frame_indexes: [seen.frame, seen.frame],
          reference: 'local_road',
        },
      );
    }
    const limits = limitsOf(box.type);
    if (!limits) continue;
    if (rule('box.size_out_of_range')) {
      const sides = (['length', 'width', 'height'] as const).filter(
        (side, i) => box.size[i] < limits.size[side][0] || box.size[i] > limits.size[side][1],
      );
      if (sides.length)
        flag(
          seen,
          'box.size_out_of_range',
          `Kích thước ${box.size.map((s) => round(s, 2)).join(' × ')} m nằm ngoài khoảng của ${box.type} (${sides.join(', ')}).`,
          { size: box.size, allowed: limits.size },
        );
    }
    const sparse = rule('points.sparse');
    const inside = pointsIn(box);
    if (sparse && inside !== undefined && inside < sparse.params.below!)
      flag(
        seen,
        'points.sparse',
        inside === 0
          ? 'Cuboid không có điểm LiDAR nào: engine không kiểm được vị trí và kích thước, cần xem ảnh camera.'
          : `Cuboid chỉ có ${inside} điểm LiDAR (dưới ${sparse.params.below}): quá ít để engine kiểm vị trí và kích thước, cần xem ảnh camera.`,
        { points: inside, below: sparse.params.below },
      );
    const emptyRule = rule('points.empty_near');
    if (
      emptyRule &&
      objectPoints(box, emptyRule.params.above_ground_types!) === 0 &&
      seen.distance <= limits.empty_within_m
    )
      flag(
        seen,
        'points.empty_near',
        (pointsIn(box) ?? 0) > 0
          ? `Cuboid cách xe ${round(seen.distance, 1)} m mà bên trong chỉ có điểm mặt đường (${pointsIn(box)} điểm), không có điểm nào của vật.`
          : `Cuboid cách xe ${round(seen.distance, 1)} m mà không có điểm LiDAR nào bên trong.`,
        {
          distance_m: round(seen.distance, 2),
          within_m: limits.empty_within_m,
          points: pointsIn(box),
        },
      );
  }

  // Rules on two cuboids of one frame: one object boxed twice.
  const duplicate = rule('pair.duplicate');
  if (duplicate)
    for (const frame of scene.frames) {
      const inFrame = every.filter((seen) => seen.timestamp === frame.timestamp);
      for (let a = 0; a < inFrame.length; a++)
        for (let b = a + 1; b < inFrame.length; b++) {
          const one = inFrame[a].box,
            other = inFrame[b].box;
          const reach =
            Math.hypot(one.size[0], one.size[1]) / 2 + Math.hypot(other.size[0], other.size[1]) / 2;
          if (Math.hypot(one.center[0] - other.center[0], one.center[1] - other.center[1]) > reach)
            continue;
          const share = Math.min(shareInside(one, other), shareInside(other, one));
          if (share < duplicate.params.min_share!) continue;
          // The case goes on the one with fewer of the object's points.
          const [extra, kept] =
            (objectPoints(one, []) ?? 0) < (objectPoints(other, []) ?? 0)
              ? [inFrame[a], other]
              : [inFrame[b], one];
          flag(
            extra,
            'pair.duplicate',
            `Cuboid chồng ${Math.round(share * 100)}% với cuboid ${kept.type} ${kept.id.slice(0, 8)} cùng frame: có thể một vật bị gán hai lần.`,
            { duplicate_of: kept.id, share: round(share) },
          );
        }
    }

  // Rules on an object across its frames.
  const gaps: Risk3DGap[] = [];
  const last = scene.frames.length - 1;
  for (const [objectId, track] of tracks) {
    const first = track[0];
    const counts = new Map<string, number>();
    for (const seen of track) counts.set(seen.box.type, (counts.get(seen.box.type) ?? 0) + 1);
    const [majority, most] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (rule('track.type_change') && counts.size > 1 && most * 2 > track.length)
      for (const seen of track)
        if (seen.box.type !== majority)
          flag(
            seen,
            'track.type_change',
            `Đối tượng này là ${majority} ở ${most}/${track.length} frame nhưng ở frame này là ${seen.box.type}.`,
            { types: Object.fromEntries(counts) },
            majority,
          );
    if (rule('track.single_frame') && track.length === 1 && first.frame > 0 && first.frame < last)
      flag(first, 'track.single_frame', 'Đối tượng chỉ có mặt ở đúng một frame.', {});
    const never = rule('track.never_observed');
    if (
      never &&
      track.length >= never.params.min_frames! &&
      track.every((seen) => pointsIn(seen.box) === 0) &&
      track.some((seen) => seen.distance <= never.params.within_m!)
    )
      flag(
        first,
        'track.never_observed',
        `Đối tượng có mặt ở ${track.length} frame mà không frame nào có điểm LiDAR trong cuboid.`,
        { frames: track.length, nearest_m: round(Math.min(...track.map((s) => s.distance)), 1) },
      );
    for (let i = 1; i < track.length; i++) {
      const missing = track[i].frame - track[i - 1].frame - 1;
      if (missing > 0 && missing <= policy.gaps.max_frames) {
        const indexes = Array.from({ length: missing }, (_, n) => track[i - 1].frame + 1 + n);
        const ghosts = indexes.map((index) =>
          scene.frames[index].ghosts?.find((g) => g.id === objectId),
        );
        const points = ghosts.every(Boolean)
          ? ghosts.map((g) => objectPoints(g!, [g!.type]) ?? 0)
          : undefined;
        gaps.push({
          object_id: objectId,
          type: majority,
          frame_indexes: indexes,
          timestamps: indexes.map((index) => scene.frames[index].timestamp),
          ...(points && {
            points,
            likely_missing: Math.max(...points) >= policy.gaps.likely_from_points,
          }),
        });
      }
    }

    // How the cuboids fit the object over a run of frames. A median over `window` cuboids in a
    // row, so that clutter beside an object for a moment is not enough but a cuboid that stays
    // off its object is: the error the rules against the next frames cannot see. A run of
    // windows over the limit is one case, on the cuboid that fits worst.
    levelTrack(track.map((seen) => seen.box));
    for (const fit of FIT) {
      const fitRule = rule(fit.id);
      if (!fitRule) continue;
      const half = fitRule.params.window! >> 1;
      const usable = track.filter(
        (seen) =>
          (fit.points(seen.box) ?? 0) >= fitRule.params.min_points! &&
          fit.measure(seen.box) !== undefined,
      );
      const values = usable.map((seen) => fit.measure(seen.box)!);
      let run: { i: number; median: number; limit: number }[] = [];
      const close = () => {
        if (!run.length) return;
        const worst = run.reduce((top, at) => (values[at.i] > values[top.i] ? at : top));
        // The frames the windows cover, trimmed to the cuboids that are over the limit themselves.
        const over = usable
          .slice(run[0].i - half, run[run.length - 1].i + half + 1)
          .filter((seen) => fit.measure(seen.box)! > worst.limit);
        const from = over[0].frame,
          to = over[over.length - 1].frame;
        // Beyond certain_m (fit.floating, fit.sunk) the cuboid is too far off to be right.
        const certainM = (fitRule.params as { certain_m?: number }).certain_m;
        const certain =
          certainM !== undefined && worst.median > certainM
            ? { score: (fitRule.params as { certain_score?: number }).certain_score ?? 70 }
            : undefined;
        const reason =
          fit.reason(worst.median, from, to, usable[worst.i].box) +
          (certain ? ` Quá ${certainM} m: chắc chắn sai.` : '');
        flag(
          usable[worst.i],
          fit.id,
          reason,
          {
            share: round(values[worst.i]),
            median: round(worst.median),
            allowed: worst.limit,
            frame_indexes: [from, to],
            fit: (({ counted, outside, slack, moved, lift }) => ({
              counted,
              outside,
              slack,
              moved,
              lift,
            }))(usable[worst.i].box),
          },
          undefined,
          certain,
        );
        run = [];
      };
      for (let i = half; i < usable.length - half; i++) {
        const limits = limitsOf(usable[i].box.type);
        const middle = median(values.slice(i - half, i + half + 1));
        if (limits && middle > fit.limit(limits))
          run.push({ i, median: middle, limit: fit.limit(limits) });
        else close();
      }
      close();
    }

    // Against the frames just before and after. How far each cuboid is from what its two
    // neighbours say, so that of three in a row only the one furthest off is flagged.
    const off = track.map((seen, i) => {
      const before = track[i - 1],
        after = track[i + 1];
      if (!before || !after || before.frame !== seen.frame - 1 || after.frame !== seen.frame + 1)
        return null;
      const mid = before.world.map((value, axis) => (value + after.world[axis]) / 2);
      const average = before.box.size.map((value, axis) => (value + after.box.size[axis]) / 2);
      const around = ((pointsIn(before.box) ?? 0) + (pointsIn(after.box) ?? 0)) / 2;
      return {
        before,
        after,
        flat: Math.hypot(seen.world[0] - mid[0], seen.world[1] - mid[1]),
        up: Math.abs(seen.world[2] - mid[2]),
        heading: Math.min(turn(seen.yaw, before.yaw), turn(seen.yaw, after.yaw)),
        neighboursTurn: turn(before.yaw, after.yaw),
        size: Math.max(
          ...seen.box.size.map((s, axis) => Math.abs(s - average[axis]) / average[axis]),
        ),
        around,
      };
    });
    // The furthest off of the three cuboids around it, by one measure.
    const peak = (i: number, measure: 'flat' | 'up' | 'heading' | 'size') =>
      [off[i - 1], off[i + 1]].every((other) => !other || off[i]![measure] >= other[measure]);
    // A cuboid with no neighbour on one side, against where the two frames in a row on its other
    // side say it should be.
    const end = rule('track.end_off');
    // End cuboids found off: the cuboid next to one is pulled half as far off by it.
    const endOff = new Set<number>();
    if (end)
      track.forEach((seen, i) => {
        const limits = limitsOf(seen.box.type);
        if (off[i] || !limits) return;
        const side = [1, -1].find((d) => {
          const a = track[i + d],
            b = track[i + 2 * d];
          return a && b && a.frame === seen.frame + d && b.frame === seen.frame + 2 * d;
        });
        if (!side) return;
        const near = track[i + side],
          far = track[i + 2 * side],
          farther = track[i + 3 * side];
        const factor = end.params.factor!;
        const guess = near.world.map((value, axis) => 2 * value - far.world[axis]);
        // The neighbour must itself fit the frames beyond it: when it is the cuboid that is off,
        // it is judged by the rules against both sides, and says nothing about this one.
        if (farther?.frame === seen.frame + 3 * side) {
          const check = far.world.map((value, axis) => 2 * value - farther.world[axis]);
          // Stricter than the limits: a neighbour off by less than they allow still moves the
          // guess twice as much.
          if (
            Math.hypot(near.world[0] - check[0], near.world[1] - check[1]) >
              limits.position_jump_m / 2 ||
            Math.abs(near.world[2] - check[2]) >
              (rule('track.position_jump')?.params.vertical_jump_m ?? Infinity) / 2 ||
            turn(near.yaw, far.yaw) > limits.heading_jump_rad ||
            near.box.size.some(
              (s, axis) => Math.abs(s - far.box.size[axis]) / far.box.size[axis] > 0.02,
            )
          )
            return;
        }
        const flat = Math.hypot(seen.world[0] - guess[0], seen.world[1] - guess[1]);
        const up = Math.abs(seen.world[2] - guess[2]);
        const heading = turn(seen.yaw, near.yaw);
        const steady = turn(near.yaw, far.yaw) <= limits.heading_jump_rad;
        const sizeRule = rule('track.size_change');
        const resized = Math.max(
          ...seen.box.size.map(
            (s, axis) => Math.abs(s - near.box.size[axis]) / near.box.size[axis],
          ),
        );
        const sameSize = near.box.size.every(
          (s, axis) => Math.abs(s - far.box.size[axis]) / far.box.size[axis] <= 0.02,
        );
        const jumpRule = rule('track.position_jump');
        const found: string[] = [];
        // A cuboid the fit search would leave where it is sits on its object: the frames beside it
        // are the ones off, as at the end of a run of shifted cuboids.
        const seated =
          !!seen.box.moved &&
          seen.box.moved[3] >= 20 &&
          Math.hypot(seen.box.moved[0], seen.box.moved[1]) <= 0.25;
        if (!seated && flat > limits.position_jump_m * factor)
          found.push(`tâm lệch ${round(flat, 2)} m khỏi vị trí ngoại suy`);
        else if (!seated && jumpRule && up > jumpRule.params.vertical_jump_m! * factor)
          found.push(`tâm lệch ${round(up, 2)} m theo phương đứng`);
        if (steady && heading > limits.heading_jump_rad * factor)
          found.push(`hướng lệch ${Math.round((heading * 180) / Math.PI)}°`);
        if (sizeRule && sameSize && resized > sizeRule.params.relative_change! * factor)
          found.push(`kích thước khác ${Math.round(resized * 100)}%`);
        if (found.length) endOff.add(i);
        if (found.length)
          flag(
            seen,
            'track.end_off',
            `So với hai frame ${side === 1 ? 'sau' : 'trước'} nó (frame này không có frame kề phía ${side === 1 ? 'trước' : 'sau'}): ${found.join(', ')}.`,
            {
              horizontal_m: round(flat),
              vertical_m: round(up),
              turn_rad: round(heading),
              size_change: round(resized),
              against_frames: [near.frame, far.frame],
            },
          );
      });
    track.forEach((seen, i) => {
      const o = off[i];
      const limits = limitsOf(seen.box.type);
      if (!o || !limits || endOff.has(i - 1) || endOff.has(i + 1)) return;
      const jump = rule('track.position_jump');
      if (jump) {
        const flat = o.flat > limits.position_jump_m && peak(i, 'flat');
        const up = o.up > jump.params.vertical_jump_m! && peak(i, 'up');
        if (flat || up)
          flag(
            seen,
            'track.position_jump',
            flat
              ? `Tâm cuboid lệch ${round(o.flat, 2)} m khỏi trung điểm của hai frame kề.`
              : `Tâm cuboid lệch ${round(o.up, 2)} m theo phương đứng so với hai frame kề.`,
            {
              horizontal_m: round(o.flat),
              vertical_m: round(o.up),
              allowed_horizontal_m: limits.position_jump_m,
              allowed_vertical_m: jump.params.vertical_jump_m,
            },
          );
      }
      // Off by less than the limit, but the fit search would move the cuboid back towards its
      // track: two signs of one error.
      const drift = rule('track.position_drift');
      const moved = seen.box.moved;
      if (
        drift &&
        moved &&
        moved[3] >= drift.params.min_points! &&
        o.flat > limits.position_jump_m * drift.params.soft_factor! &&
        o.flat <= limits.position_jump_m &&
        peak(i, 'flat')
      ) {
        const mid = o.before.world.map((value, axis) => (value + o.after.world[axis]) / 2);
        const dx = seen.world[0] - mid[0],
          dy = seen.world[1] - mid[1];
        // The search's move, from the cuboid's axes to the fixed frame.
        const cos = Math.cos(seen.yaw),
          sin = Math.sin(seen.yaw);
        const mx = moved[0] * cos - moved[1] * sin,
          my = moved[0] * sin + moved[1] * cos;
        const back = -(mx * dx + my * dy) / o.flat;
        if (back >= o.flat / 2)
          flag(
            seen,
            'track.position_drift',
            `Tâm cuboid lệch ${round(o.flat, 2)} m khỏi trung điểm của hai frame kề (dưới mức ${limits.position_jump_m} m), và dời về phía track ${round(back, 2)} m thì ôm được nhiều điểm hơn.`,
            { horizontal_m: round(o.flat), back_m: round(back), moved },
          );
      }
      const headingRule = rule('track.heading_jump');
      if (
        headingRule &&
        o.heading > limits.heading_jump_rad &&
        o.neighboursTurn <= limits.heading_jump_rad &&
        peak(i, 'heading')
      )
        flag(
          seen,
          'track.heading_jump',
          o.heading >= headingRule.params.flip_from_rad!
            ? 'Cuboid quay ngược đầu so với hai frame kề.'
            : `Hướng cuboid lệch ${Math.round((o.heading * 180) / Math.PI)}° so với hai frame kề.`,
          { turn_rad: round(o.heading), allowed_rad: limits.heading_jump_rad },
        );
      const sizeRule = rule('track.size_change');
      if (sizeRule && o.size > sizeRule.params.relative_change! && peak(i, 'size'))
        flag(
          seen,
          'track.size_change',
          `Kích thước cuboid khác ${Math.round(o.size * 100)}% so với hai frame kề.`,
          { size: seen.box.size, before: o.before.box.size, after: o.after.box.size },
        );
      const dropped = rule('points.dropped');
      const inside = pointsIn(seen.box);
      if (
        dropped &&
        inside !== undefined &&
        Math.min(pointsIn(o.before.box) ?? 0, pointsIn(o.after.box) ?? 0) >=
          dropped.params.min_neighbour_points! &&
        inside < o.around * dropped.params.ratio!
      )
        flag(
          seen,
          'points.dropped',
          `Cuboid chỉ còn ${inside} điểm, trong khi hai frame kề có ${pointsIn(o.before.box)} và ${pointsIn(o.after.box)} điểm.`,
          { points: inside, before: pointsIn(o.before.box), after: pointsIn(o.after.box) },
        );
    });
  }

  const checks = Object.fromEntries(policy.rules.map((r) => [r.id, { flagged: 0 }]));
  const scored: Risk3DCase[] = [];
  for (const seen of every) {
    const findings = found.get(key(seen));
    if (!findings) continue;
    for (const finding of findings) checks[finding.check_id].flagged++;
    const score = Math.min(
      policy.scoring.max_score,
      findings.reduce(
        (sum, finding) =>
          sum +
          (['box.below_ground', 'fit.sunk', 'fit.lowered'].includes(finding.check_id)
            ? 0
            : finding.score),
        0,
      ) +
        Math.max(
          0,
          ...findings
            .filter((f) => ['box.below_ground', 'fit.sunk', 'fit.lowered'].includes(f.check_id))
            .map((f) => f.score),
        ),
    );
    // The strongest finding that carries points speaks for the cuboid.
    const leading = findings.reduce<Finding3D | null>(
      (top, f) => (f.score > 0 && (!top || f.score > top.score) ? f : top),
      null,
    );
    const suggested = findings.find((f) => f.suggested_label)?.suggested_label;
    scored.push({
      id: key(seen),
      timestamp: seen.timestamp,
      frame_index: seen.frame,
      object_id: seen.box.id,
      type: seen.box.type,
      score,
      severity: severity3D(score),
      ...(leading && { suspected_error: leading.error_type }),
      ...(suggested && { suggested_label: suggested }),
      ...(findings.some((f) => f.certain) && { certain: true }),
      reasons: findings.map((f) => f.reason),
      findings,
    });
  }
  const byScore = (a: Risk3DCase, b: Risk3DCase) =>
    b.score - a.score || a.frame_index - b.frame_index || a.object_id.localeCompare(b.object_id);
  const minScore = policy.scoring.queue_from;
  const cases = scored.filter((c) => c.score >= minScore).sort(byScore);
  return {
    schema_version: '1.0.0',
    engine_version: ENGINE_3D_VERSION,
    policy_version: POLICY_3D_VERSION,
    segment: scene.segment,
    min_score: minScore,
    total_frames: scene.frames.length,
    total_boxes: every.length,
    checks,
    levels: {
      high: cases.filter((c) => c.severity === 'high').length,
      medium: cases.filter((c) => c.severity === 'medium').length,
      low: cases.filter((c) => c.severity === 'low').length,
    },
    cases,
    warnings: scored.filter((c) => c.score < minScore).sort(byScore),
    gaps,
  };
}

// What a scene whose labels are taken as right measures against each threshold of the policy:
// for each type, the largest value the correct labels reach, the policy's threshold, and a
// suggestion with a margin above that value. A threshold at or below what correct labels reach
// would flag them (`tight`). For setting the policy of a new dataset (docs/policy-3d.md, 6);
// nothing here changes the policy.
export interface CalibrationEntry {
  observed: number;
  current: number;
  suggested: number;
  tight: boolean;
}
export interface Calibration3D {
  segment: string;
  frames: number;
  types: Record<string, Record<string, CalibrationEntry>>;
}
export function calibrateScene(scene: Scene): Calibration3D {
  const tracks = new Map<
    string,
    { frame: number; box: SceneBox; world: number[]; yaw: number }[]
  >();
  scene.frames.forEach((frame, index) => {
    const p = frame.pose,
      ego = Math.atan2(p[4], p[0]);
    for (const box of frame.boxes) {
      const [x, y, z] = box.center;
      const seen = {
        frame: index,
        box,
        world: [0, 4, 8].map((r) => p[r] * x + p[r + 1] * y + p[r + 2] * z + p[r + 3]),
        yaw: ego + box.heading,
      };
      const list = tracks.get(box.id);
      if (list) list.push(seen);
      else tracks.set(box.id, [seen]);
    }
  });
  const most = new Map<string, Map<string, number>>();
  const note = (type: string, field: string, value: number) => {
    const fields = most.get(type) ?? most.set(type, new Map()).get(type)!;
    fields.set(field, Math.max(fields.get(field) ?? 0, value));
  };
  for (const track of tracks.values()) {
    track.forEach((seen, i) => {
      const before = track[i - 1],
        after = track[i + 1];
      if (!before || !after || before.frame !== seen.frame - 1 || after.frame !== seen.frame + 1)
        return;
      const mid = before.world.map((v, axis) => (v + after.world[axis]) / 2);
      note(
        seen.box.type,
        'position_jump_m',
        Math.hypot(seen.world[0] - mid[0], seen.world[1] - mid[1]),
      );
      note(seen.box.type, 'vertical_jump_m', Math.abs(seen.world[2] - mid[2]));
      if (turn(before.yaw, after.yaw) <= (limitsOf(seen.box.type)?.heading_jump_rad ?? Math.PI))
        note(
          seen.box.type,
          'heading_jump_rad',
          Math.min(turn(seen.yaw, before.yaw), turn(seen.yaw, after.yaw)),
        );
      const average = before.box.size.map((v, axis) => (v + after.box.size[axis]) / 2);
      note(
        seen.box.type,
        'size_change',
        Math.max(...seen.box.size.map((s, axis) => Math.abs(s - average[axis]) / average[axis])),
      );
    });
    // The fit rules, over the same windows they use.
    levelTrack(track.map((seen) => seen.box));
    for (const fit of FIT) {
      const fitRule = rule(fit.id);
      if (!fitRule) continue;
      const half = fitRule.params.window! >> 1;
      const usable = track.filter(
        (seen) =>
          (fit.points(seen.box) ?? 0) >= fitRule.params.min_points! &&
          fit.measure(seen.box) !== undefined,
      );
      const values = usable.map((seen) => fit.measure(seen.box)!);
      for (let i = half; i < usable.length - half; i++)
        note(usable[i].box.type, fit.id, median(values.slice(i - half, i + half + 1)));
    }
  }
  // Where each measure's threshold is, and how much room to leave above what correct labels
  // reach: the neighbour rules see single frames and get twice the largest value, the fit
  // rules, already medians, a fifth more.
  const FIELDS: Record<string, { current: (l: TypeLimits) => number | undefined; margin: number }> =
    {
      position_jump_m: { current: (l) => l.position_jump_m, margin: 2 },
      vertical_jump_m: {
        current: () => rule('track.position_jump')?.params.vertical_jump_m,
        margin: 2,
      },
      heading_jump_rad: { current: (l) => l.heading_jump_rad, margin: 2 },
      size_change: { current: () => rule('track.size_change')?.params.relative_change, margin: 2 },
      'fit.moved': { current: (l) => l.moved_ratio, margin: 1.2 },
      'fit.empty_side': { current: (l) => l.empty_side_m, margin: 1.2 },
      'fit.floating': { current: () => rule('fit.floating')?.params.above_m, margin: 1.2 },
      'fit.sunk': { current: () => rule('fit.sunk')?.params.below_m, margin: 1.2 },
      'fit.lowered': { current: (l) => l.level_shift_m, margin: 1.2 },
      'fit.raised': { current: (l) => l.level_shift_m, margin: 1.2 },
      'fit.points_outside': { current: (l) => l.outside_ratio, margin: 1.2 },
      'fit.loose': { current: (l) => l.slack_ratio, margin: 1.2 },
    };
  const types: Calibration3D['types'] = {};
  for (const [type, fields] of most) {
    const limits = limitsOf(type);
    if (!limits) continue;
    types[type] = {};
    for (const [field, observed] of fields) {
      const how = FIELDS[field],
        current = how?.current(limits);
      if (!how || current === undefined) continue;
      types[type][field] = {
        observed: round(observed),
        current,
        // Rounded up to the next 0.05 (a value already on one stays).
        suggested: Math.ceil(observed * how.margin * 20 - 1e-6) / 20,
        tight: observed >= current,
      };
    }
  }
  return { segment: scene.segment, frames: scene.frames.length, types };
}
