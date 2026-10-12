// Where the boxes of a dataset sit and how they are best looked at. Every box is measured
// (position, size, how much of the image it takes), every pair of boxes in a frame is compared
// (how much they overlap), and the boxes are grouped into review units: a box alone, a cluster
// of same-label boxes that overlap one another, or a rider with the two-wheeler under it. Each
// unit carries the region to cut from the image. Nothing here reads a file or a pixel.
import { canonicalLabel, TWO_WHEEL } from '../risk/policy.ts';
import type { Annotation, Dataset, Rect } from '../schema/types.ts';

export const LAYOUT = Object.freeze({
  // Kept around a unit when it is cut, as a share of its width and of its height. The label
  // verifier (policy/_verifier.json) cuts with the same margin and the same minimum side.
  margin: 0.15,
  // A box whose longer side is below this has too few pixels to be judged from a crop.
  min_side_px: 24,
  // A crop is widened to at least this, so a small box still comes with its surroundings.
  min_crop_px: 96,
  // The side a crop is enlarged towards for viewing; `scale` never goes past `max_scale`.
  target_side_px: 224,
  max_scale: 4,
  // Overlap is read as the share of the SMALLER box that lies under the other one: IoU stays
  // low when a small box sits on a large one. Two same-label boxes are linked from here up.
  link_share: 0.2,
  // From here up one object hides most of the other.
  heavy_share: 0.5,
  // From here up the smaller box lies inside the larger one.
  nested_share: 0.9,
  // From here up (IoU) the two boxes are most likely the same object drawn twice.
  duplicate_iou: 0.8,
  // A unit never grows past this; a longer chain is cut at its weakest links.
  max_members: 6,
  rider: Object.freeze({
    // The person and the two-wheeler must share at least this much of the smaller box.
    min_share: 0.2,
    // Correct riders overlap their vehicle at IoU 0.35 (median) and 0.55 (p95), see
    // policy/person.json. Above it one of the two boxes probably holds both.
    near_identical_iou: 0.55,
    max_per_vehicle: 3,
  }),
});
// The settings with their numbers free to change, for a caller that overrides some.
type Widen<T> = { readonly [K in keyof T]: T[K] extends number ? number : Widen<T[K]> };
export type LayoutConfig = Widen<typeof LAYOUT>;

export type Relation = 'duplicate' | 'nested' | 'heavy' | 'partial' | 'rider';
export type UnitKind = 'single' | 'cluster' | 'rider' | 'mixed';
export type UnitFlag =
  | 'too_small'
  | 'at_image_edge'
  | 'duplicate'
  | 'nested'
  | 'heavy_overlap'
  | 'rider_near_identical'
  | 'rider_box_contains_vehicle'
  | 'vehicle_box_contains_rider'
  | 'chain_cut';

export interface Overlap {
  // Pixels the two boxes share.
  area: number;
  iou: number;
  // Share of each box that lies under the other, and that share for the smaller of the two.
  share_a: number;
  share_b: number;
  share_small: number;
}
export interface BoxLayout extends Rect {
  annotation_id: string;
  frame_id: string;
  label: string;
  // Centre of the box, as a share of the image (0–1 from the top-left corner).
  center: [number, number];
  // Which ninth of the image the centre falls in.
  zone: string;
  area_share: number;
  // Height over width.
  aspect: number;
  size: 'tiny' | 'small' | 'medium' | 'large';
  // Image edges the box touches: the object is probably cut by the frame there.
  edges: ('left' | 'top' | 'right' | 'bottom')[];
  unit_id: string;
}
export interface Link extends Omit<Overlap, 'share_a' | 'share_b'> {
  a: string;
  b: string;
  relation: Relation;
}
export interface Unit {
  id: string;
  frame_id: string;
  image?: string;
  kind: UnitKind;
  labels: string[];
  // The boxes of the unit, placed inside `crop` (pixels from the crop's top-left corner).
  members: (Rect & { annotation_id: string; label: string })[];
  // The smallest rectangle holding every member, and the rectangle to cut: the region with
  // its margin, widened to the minimum crop, kept inside the image, on whole pixels.
  region: Rect;
  crop: Rect;
  crop_share: number;
  // How much to enlarge the crop for viewing (1 = as cut).
  scale: number;
  links: Link[];
  // Boxes left out of the unit that still overlap one of its members, so they show in the crop.
  // Each is named once, with the member it overlaps most.
  neighbours: {
    annotation_id: string;
    label: string;
    member: string;
    iou: number;
    share_small: number;
  }[];
  flags: UnitFlag[];
  // What to do with the unit, in the reviewer's language.
  advice: string[];
}
export interface LayoutReport {
  schema_version: '1.0.0';
  dataset_id: string;
  config: LayoutConfig;
  summary: {
    frames: number;
    boxes: number;
    units: Record<UnitKind, number>;
    links: Record<Relation, number>;
    flags: Partial<Record<UnitFlag, number>>;
    labels: Record<
      string,
      {
        boxes: number;
        tiny: number;
        grouped: number;
        width_p50: number;
        height_p50: number;
        area_share_p50: number;
      }
    >;
  };
  boxes: BoxLayout[];
  units: Unit[];
  skipped: { annotation_id: string; reason: string }[];
}

export function overlapOf(a: Rect, b: Rect): Overlap {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    area = w > 0 && h > 0 ? w * h : 0,
    areaA = a.width * a.height,
    areaB = b.width * b.height;
  return {
    area,
    iou: area / (areaA + areaB - area),
    share_a: area / areaA,
    share_b: area / areaB,
    share_small: area / Math.min(areaA, areaB),
  };
}
// How two same-label boxes that overlap relate; undefined below the link threshold.
export function relationOf(overlap: Overlap, config: LayoutConfig = LAYOUT): Relation | undefined {
  if (overlap.iou >= config.duplicate_iou) return 'duplicate';
  if (overlap.share_small >= config.nested_share) return 'nested';
  if (overlap.share_small >= config.heavy_share) return 'heavy';
  if (overlap.share_small >= config.link_share) return 'partial';
}
// A rider sits on the vehicle: the two boxes overlap, the person is over the vehicle's width,
// starts above its middle and reaches down into it. Someone standing beside a parked bike
// fails the horizontal test; someone standing in front of one passes, and the unit says so.
export function isRider(person: Rect, vehicle: Rect, config: LayoutConfig = LAYOUT) {
  const centre = person.x + person.width / 2;
  return (
    overlapOf(person, vehicle).share_small >= config.rider.min_share &&
    centre >= vehicle.x - 0.1 * vehicle.width &&
    centre <= vehicle.x + 1.1 * vehicle.width &&
    person.y <= vehicle.y + vehicle.height / 2 &&
    person.y + person.height >= vehicle.y + 0.25 * vehicle.height
  );
}

// The extent of a geometry a box can stand in for; null when it has none in the image plane.
function extent({ geometry: g }: Annotation): Rect | null {
  if (g.type === 'bbox') return { x: g.x, y: g.y, width: g.width, height: g.height };
  if ((g.type === 'polygon' || g.type === 'polyline') && g.points.length) {
    const xs = g.points.map((p) => p[0]),
      ys = g.points.map((p) => p[1]),
      x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  return null;
}
const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const third = (share: number, names: [string, string, string]) =>
  names[Math.min(2, Math.max(0, Math.floor(share * 3)))];

function measure(
  annotation: Annotation,
  rect: Rect,
  image: { width: number; height: number },
  config: LayoutConfig,
): BoxLayout {
  const cx = (rect.x + rect.width / 2) / image.width,
    cy = (rect.y + rect.height / 2) / image.height,
    area = rect.width * rect.height,
    column = third(cx, ['left', 'center', 'right']),
    row = third(cy, ['top', 'middle', 'bottom']);
  const edges: BoxLayout['edges'] = [];
  if (rect.x <= 1) edges.push('left');
  if (rect.y <= 1) edges.push('top');
  if (rect.x + rect.width >= image.width - 1) edges.push('right');
  if (rect.y + rect.height >= image.height - 1) edges.push('bottom');
  return {
    annotation_id: annotation.id,
    frame_id: annotation.frame_id,
    label: canonicalLabel(annotation.label),
    ...rect,
    center: [round(cx), round(cy)],
    zone: row === 'middle' && column === 'center' ? 'center' : `${row}-${column}`,
    area_share: round(area / (image.width * image.height), 5),
    aspect: round(rect.height / rect.width),
    // Below the minimum side a box is tiny; past that the COCO areas (32² and 96²) apply.
    size:
      Math.max(rect.width, rect.height) < config.min_side_px
        ? 'tiny'
        : area < 32 * 32
          ? 'small'
          : area < 96 * 96
            ? 'medium'
            : 'large',
    edges,
    unit_id: '',
  };
}

// The rectangle to cut for a region: margin on every side, at least the minimum crop, inside
// the image, on whole pixels.
export function cropOf(
  region: Rect,
  image: { width: number; height: number },
  config: LayoutConfig = LAYOUT,
): Rect {
  const side = (start: number, length: number, limit: number) => {
    const wanted = Math.min(limit, Math.max(length * (1 + 2 * config.margin), config.min_crop_px)),
      // Centred on the region, then pushed back inside the image.
      from = Math.min(Math.max(0, start + length / 2 - wanted / 2), limit - wanted),
      low = Math.floor(from),
      high = Math.min(limit, Math.ceil(from + wanted));
    return [low, high - low];
  };
  const [x, width] = side(region.x, region.width, image.width),
    [y, height] = side(region.y, region.height, image.height);
  return { x, y, width, height };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
function adviceOf(unit: Unit, config: LayoutConfig) {
  const advice: string[] = [],
    has = (flag: UnitFlag) => unit.flags.includes(flag),
    strongest = (relation: Relation) =>
      unit.links
        .filter((l) => l.relation === relation)
        .sort((a, b) => b.share_small - a.share_small)[0];
  if (unit.kind === 'single') advice.push('Cắt riêng box này cùng phần lề quanh nó.');
  if (unit.kind === 'cluster')
    advice.push(
      `Xem cả cụm ${unit.members.length} box ${unit.labels[0]} trong một ảnh cắt: các box chồng lên nhau nên cắt riêng từng box sẽ lẫn vật bên cạnh.`,
    );
  if (unit.kind === 'rider' || unit.kind === 'mixed')
    advice.push(
      'Xem người và xe trong cùng một ảnh cắt. Box person chỉ bao người, box two_wheeler chỉ bao xe; không dùng mô hình để phân xử giữa hai nhãn này vì box nào cũng chứa một phần của box kia.',
    );
  if (unit.kind === 'mixed')
    advice.push('Trong cụm còn các box cùng nhãn chồng nhau: đếm lại số xe và số người.');
  if (has('duplicate'))
    advice.push(
      `Có hai box gần trùng nhau (IoU ${percent(strongest('duplicate').iou)}): nhiều khả năng một vật bị vẽ hai lần.`,
    );
  if (has('nested'))
    advice.push(
      `Có box nằm gọn trong box khác (${percent(strongest('nested').share_small)} diện tích): kiểm tra box thừa, hoặc một phần của vật bị vẽ thành box riêng.`,
    );
  if (has('heavy_overlap'))
    advice.push(
      `Có cặp box chồng ${percent(strongest('heavy').share_small)} box nhỏ: vật phía sau bị che nhiều, kiểm tra box có bao đúng phần của nó không.`,
    );
  if (has('rider_near_identical'))
    advice.push(
      `Box người và box xe gần trùng nhau (IoU từ ${percent(config.rider.near_identical_iou)}): một trong hai box có thể đang bao cả người lẫn xe.`,
    );
  if (has('vehicle_box_contains_rider'))
    advice.push('Box xe bao trọn box người: box xe có thể đã vẽ cả người lái.');
  if (has('rider_box_contains_vehicle'))
    advice.push('Box người bao trọn box xe: box person có thể đã vẽ cả xe.');
  if (has('chain_cut'))
    advice.push(
      `Dãy box chồng nhau dài hơn ${config.max_members} box nên được chia thành nhiều cụm; các box bị tách vẫn hiện trong ảnh cắt và nằm ở "neighbours".`,
    );
  if (has('too_small'))
    advice.push(
      `Có box cạnh dài dưới ${config.min_side_px} px: quá ít điểm ảnh để xét từ ảnh cắt, cần xem trong ảnh gốc.`,
    );
  if (has('at_image_edge'))
    advice.push('Có box chạm mép ảnh: vật bị khung hình cắt, box chỉ cần bao phần còn thấy.');
  return advice;
}

export function analyzeLayout(data: Dataset, overrides: Partial<LayoutConfig> = {}): LayoutReport {
  const config: LayoutConfig = { ...LAYOUT, ...overrides };
  const media = new Map(data.media.map((m) => [m.id, m]));
  const frames = new Map(data.frames.map((f) => [f.id, f]));
  const byFrame = new Map<string, BoxLayout[]>();
  const skipped: LayoutReport['skipped'] = [];
  for (const annotation of data.annotations) {
    const skip = (reason: string) => skipped.push({ annotation_id: annotation.id, reason });
    const rect = extent(annotation),
      frame = frames.get(annotation.frame_id),
      image = frame && media.get(frame.media_id);
    if (!rect) skip('unsupported_geometry');
    else if (!(rect.width > 0 && rect.height > 0) || ![rect.x, rect.y].every(Number.isFinite))
      skip('invalid_box');
    else if (!image || !(image.width > 0 && image.height > 0)) skip('missing_image_size');
    else {
      const boxes = byFrame.get(annotation.frame_id) ?? [];
      boxes.push(measure(annotation, rect, image, config));
      byFrame.set(annotation.frame_id, boxes);
    }
  }

  const units: Unit[] = [];
  for (const [frameId, boxes] of byFrame) {
    const frame = frames.get(frameId)!,
      image = media.get(frame.media_id)!;
    // Every pair that overlaps at all, with what the overlap means for the two labels.
    const pairs: { i: number; j: number; overlap: Overlap; relation?: Relation }[] = [];
    // A person rides one vehicle: the one it overlaps most.
    const ridden = new Map<number, { vehicle: number; iou: number }>();
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j],
          overlap = overlapOf(a, b);
        if (!overlap.area) continue;
        const pair: (typeof pairs)[number] = { i, j, overlap };
        if (a.label === b.label) pair.relation = relationOf(overlap, config);
        else {
          const [person, vehicle] = a.label === 'person' ? [i, j] : [j, i];
          if (
            boxes[person].label === 'person' &&
            TWO_WHEEL.includes(boxes[vehicle].label) &&
            isRider(boxes[person], boxes[vehicle], config) &&
            overlap.iou > (ridden.get(person)?.iou ?? 0)
          )
            ridden.set(person, { vehicle, iou: overlap.iou });
        }
        pairs.push(pair);
      }
    const riders = new Map<number, number>();
    for (const [person, { vehicle }] of [...ridden].sort((a, b) => b[1].iou - a[1].iou)) {
      if ((riders.get(vehicle) ?? 0) >= config.rider.max_per_vehicle) continue;
      riders.set(vehicle, (riders.get(vehicle) ?? 0) + 1);
      const [i, j] = person < vehicle ? [person, vehicle] : [vehicle, person];
      pairs.find((p) => p.i === i && p.j === j)!.relation = 'rider';
    }

    // Linked boxes join into units, strongest link first, so a chain longer than the limit
    // breaks at its weakest links. A rider is tied to its vehicle before anything else.
    const parent = boxes.map((_, i) => i),
      count = boxes.map(() => 1);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const strength = (p: (typeof pairs)[number]) =>
      p.relation === 'rider' ? 2 + p.overlap.iou : p.overlap.share_small;
    const cut = new Set<(typeof pairs)[number]>();
    for (const pair of pairs.filter((p) => p.relation).sort((a, b) => strength(b) - strength(a))) {
      const a = root(pair.i),
        b = root(pair.j);
      if (a === b) continue;
      if (count[a] + count[b] > config.max_members) {
        cut.add(pair);
        continue;
      }
      parent[b] = a;
      count[a] += count[b];
    }
    const groups = new Map<number, number[]>();
    boxes.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));

    for (const members of groups.values()) {
      const inside = new Set(members),
        own = members.map((i) => boxes[i]);
      const x = Math.min(...own.map((b) => b.x)),
        y = Math.min(...own.map((b) => b.y)),
        region = {
          x,
          y,
          width: Math.max(...own.map((b) => b.x + b.width)) - x,
          height: Math.max(...own.map((b) => b.y + b.height)) - y,
        },
        crop = cropOf(region, image, config);
      const links: Link[] = [],
        neighbours: Unit['neighbours'] = [],
        flags = new Set<UnitFlag>();
      for (const pair of pairs) {
        const { overlap } = pair,
          a = boxes[pair.i],
          b = boxes[pair.j];
        if (inside.has(pair.i) && inside.has(pair.j) && pair.relation) {
          links.push({
            a: a.annotation_id,
            b: b.annotation_id,
            relation: pair.relation,
            area: round(overlap.area, 1),
            iou: round(overlap.iou),
            share_small: round(overlap.share_small),
          });
          if (pair.relation === 'duplicate') flags.add('duplicate');
          if (pair.relation === 'nested') flags.add('nested');
          if (pair.relation === 'heavy') flags.add('heavy_overlap');
          if (pair.relation === 'rider') {
            const [person, vehicle] =
              a.label === 'person'
                ? [overlap.share_a, overlap.share_b]
                : [overlap.share_b, overlap.share_a];
            if (overlap.iou >= config.rider.near_identical_iou) flags.add('rider_near_identical');
            else if (person >= config.nested_share) flags.add('vehicle_box_contains_rider');
            else if (vehicle >= config.nested_share) flags.add('rider_box_contains_vehicle');
          }
        } else if (inside.has(pair.i) !== inside.has(pair.j)) {
          if (cut.has(pair)) flags.add('chain_cut');
          // Anything that covers a fifth of a member, or of itself, is visible in the crop.
          if (overlap.share_small < config.link_share) continue;
          const [member, other] = inside.has(pair.i) ? [a, b] : [b, a];
          // Named once, with the member it covers most.
          const known = neighbours.findIndex((n) => n.annotation_id === other.annotation_id);
          if (known >= 0 && neighbours[known].share_small >= round(overlap.share_small)) continue;
          if (known >= 0) neighbours.splice(known, 1);
          neighbours.push({
            annotation_id: other.annotation_id,
            label: other.label,
            member: member.annotation_id,
            iou: round(overlap.iou),
            share_small: round(overlap.share_small),
          });
        }
      }
      if (own.some((b) => b.size === 'tiny')) flags.add('too_small');
      if (own.some((b) => b.edges.length)) flags.add('at_image_edge');
      const rider = links.some((l) => l.relation === 'rider'),
        same = links.some((l) => l.relation !== 'rider');
      const unit: Unit = {
        id: `${frameId}:${own[0].annotation_id}`,
        frame_id: frameId,
        ...(frame.image && { image: frame.image }),
        kind: own.length === 1 ? 'single' : rider ? (same ? 'mixed' : 'rider') : 'cluster',
        labels: [...new Set(own.map((b) => b.label))],
        members: own.map((b) => ({
          annotation_id: b.annotation_id,
          label: b.label,
          x: round(b.x - crop.x, 2),
          y: round(b.y - crop.y, 2),
          width: b.width,
          height: b.height,
        })),
        region,
        crop,
        crop_share: round((crop.width * crop.height) / (image.width * image.height), 5),
        scale: round(
          Math.min(
            config.max_scale,
            Math.max(1, config.target_side_px / Math.max(crop.width, crop.height)),
          ),
          2,
        ),
        links: links.sort((a, b) => b.share_small - a.share_small),
        neighbours: neighbours.sort((a, b) => b.share_small - a.share_small),
        flags: [...flags],
        advice: [],
      };
      unit.advice = adviceOf(unit, config);
      for (const box of own) box.unit_id = unit.id;
      units.push(unit);
    }
  }

  const boxes = [...byFrame.values()].flat();
  const tally = <K extends string>(found: K[], names: K[] = []) => {
    const counts = Object.fromEntries(names.map((name) => [name, 0])) as Record<K, number>;
    for (const key of found) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  };
  const sizes = new Map(units.map((u) => [u.id, u.members.length]));
  const labels: LayoutReport['summary']['labels'] = {};
  for (const label of [...new Set(boxes.map((b) => b.label))].sort()) {
    const own = boxes.filter((b) => b.label === label);
    labels[label] = {
      boxes: own.length,
      tiny: own.filter((b) => b.size === 'tiny').length,
      grouped: own.filter((b) => sizes.get(b.unit_id)! > 1).length,
      width_p50: round(median(own.map((b) => b.width)), 1),
      height_p50: round(median(own.map((b) => b.height)), 1),
      area_share_p50: round(median(own.map((b) => b.area_share)), 5),
    };
  }
  return {
    schema_version: '1.0.0',
    dataset_id: data.dataset.id,
    config,
    summary: {
      frames: byFrame.size,
      boxes: boxes.length,
      units: tally(
        units.map((u) => u.kind),
        ['single', 'cluster', 'rider', 'mixed'],
      ),
      links: tally(
        units.flatMap((u) => u.links.map((l) => l.relation)),
        ['duplicate', 'nested', 'heavy', 'partial', 'rider'],
      ),
      flags: tally(units.flatMap((u) => u.flags)),
      labels,
    },
    boxes,
    units,
    skipped,
  };
}
