// The 3D Risk Engine: scores every cuboid of a LiDAR segment from scene.json alone. It reads
// the cuboids, the vehicle's pose and the point counts taken at import; never a point cloud.
// What a rule looks for is here; its thresholds, score and error type are data, in
// policy3d/_scene.json.
import policyFile from '../../policy3d/_scene.json' with { type: 'json' };

const policy = policyFile.scene_policy;
export const ENGINE_3D_VERSION = '3d-1.0.0';
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
}
export interface SceneFrame {
  timestamp: number;
  // world_from_vehicle, 4x4 row-major.
  pose: number[];
  boxes: SceneBox[];
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
  reasons: string[];
  findings: Finding3D[];
}
export interface Risk3DGap {
  object_id: string;
  type: string;
  // The frames the object is absent from, between two frames that hold it.
  frame_indexes: number[];
  timestamps: number[];
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

export function analyzeScene(scene: Scene): Risk3DReport {
  const found = new Map<string, Finding3D[]>();
  const key = (seen: Pick<Seen, 'timestamp' | 'box'>) => `${seen.timestamp}:${seen.box.id}`;
  const flag = (
    seen: Seen,
    id: string,
    reason: string,
    evidence: Record<string, unknown>,
    suggested?: string,
  ) => {
    const from = rule(id)!;
    const list = found.get(key(seen)) ?? [];
    found.set(key(seen), list);
    list.push({
      check_id: id,
      score: 'score' in from ? (from.score as number) : 0,
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

  // Rules on one cuboid.
  for (const seen of every) {
    const { box } = seen;
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
    if (rule('points.empty_near') && pointsIn(box) === 0 && seen.distance <= limits.empty_within_m)
      flag(
        seen,
        'points.empty_near',
        `Cuboid cách xe ${round(seen.distance, 1)} m mà không có điểm LiDAR nào bên trong.`,
        { distance_m: round(seen.distance, 2), within_m: limits.empty_within_m },
      );
  }

  // Rules on two cuboids of one frame.
  if (rule('pair.centre_inside'))
    for (const frame of scene.frames) {
      const inFrame = every.filter((seen) => seen.timestamp === frame.timestamp);
      for (const inner of inFrame)
        for (const outer of inFrame) {
          if (inner === outer) continue;
          const [dx, dy, dz] = inner.box.center.map((c, i) => c - outer.box.center[i]);
          const cos = Math.cos(outer.box.heading),
            sin = Math.sin(outer.box.heading);
          if (
            Math.abs(dx * cos + dy * sin) <= outer.box.size[0] / 2 &&
            Math.abs(dy * cos - dx * sin) <= outer.box.size[1] / 2 &&
            Math.abs(dz) <= outer.box.size[2] / 2
          ) {
            flag(
              inner,
              'pair.centre_inside',
              `Tâm cuboid nằm trong cuboid ${outer.box.type} ${outer.box.id}.`,
              { inside: outer.box.id, inside_type: outer.box.type },
            );
            break;
          }
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
        gaps.push({
          object_id: objectId,
          type: majority,
          frame_indexes: indexes,
          timestamps: indexes.map((index) => scene.frames[index].timestamp),
        });
      }
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
    track.forEach((seen, i) => {
      const o = off[i];
      const limits = limitsOf(seen.box.type);
      if (!o || !limits) return;
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
      findings.reduce((sum, finding) => sum + finding.score, 0),
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
