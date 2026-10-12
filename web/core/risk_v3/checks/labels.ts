import { POLICY, FOUR_WHEEL, TWO_WHEEL, VEHICLES, LARGE_VEHICLES } from '../policy.ts';
import { staticCheck, flag, iou, inside, weaker } from './shared.ts';
import type { Check, LabelBox, MeasuredBox } from '../types.ts';

const MOTOR_VEHICLES = [...FOUR_WHEEL, 'motorcycle'];
const ratioEvidence = (box: MeasuredBox) => ({ bbox: box.geometry, aspect_ratio: box.ratio });
// Two near-identical boxes contain each other; that is a duplicate, not a part inside a whole.
const container = (box: LabelBox, peers: LabelBox[], labels: string[]) =>
  peers.find((p) => labels.includes(p.label) && inside(box, p) && !inside(p, box));
const containedIn = (box: LabelBox, peer: LabelBox) => ({
  annotation_ids: [box.id, peer.id],
  container: peer.label,
});
// Two boxes of one label on one object: the weaker box is the extra one.
const duplicate = (box: LabelBox, peers: LabelBox[], threshold: number) =>
  peers.find(
    (p) => p.label === box.label && iou(box.geometry, p.geometry) >= threshold && weaker(box, p),
  );
const overlapEvidence = (box: LabelBox, peer: LabelBox, threshold: number) => ({
  annotation_ids: [box.id, peer.id],
  iou: iou(box.geometry, peer.geometry),
  threshold,
});

// Vehicles
// N4: usually a cab, trailer or fitting of the large vehicle drawn as its own vehicle.
const vehicleInLargeVehicle = staticCheck({
  id: 'context.vehicle_in_large_vehicle',
  labels: VEHICLES,
  relational: true,
  test({ box, peers }) {
    const peer = container(box, peers, LARGE_VEHICLES);
    return (
      peer &&
      flag(
        30,
        `Box nằm trọn trong một box “${peer.label}”.`,
        containedIn(box, peer),
        'EXTRA_OBJECT',
      )
    );
  },
});
// N4: the camera car's own bonnet. A real car ahead also touches the bottom but reaches mid-frame.
const egoVehicle = staticCheck({
  id: 'context.ego_vehicle',
  labels: FOUR_WHEEL,
  test: ({ box, media }) =>
    box.y2 >= media.height - POLICY.edgePx &&
    box.width > 0.6 * media.width &&
    box.y1 > 0.7 * media.height &&
    flag(
      40,
      'Box rộng, dẹt, sát mép dưới ảnh: nghi nắp ca-pô của xe gắn camera.',
      {
        bbox: box.geometry,
        width_ratio: box.width / media.width,
        top_ratio: box.y1 / media.height,
      },
      'EXTRA_OBJECT',
    ),
});
// N1: vehicles stand on the road, and the road lies below the horizon.
const vehiclePosition = staticCheck({
  id: 'geometry.vehicle_position',
  labels: VEHICLES,
  test: ({ box, media }) =>
    box.y2 < 0.3 * media.height &&
    flag(
      30,
      'Cả box nằm ở phần trên cùng của ảnh.',
      { bbox: box.geometry, bottom_ratio: box.y2 / media.height, threshold: 0.3 },
      'EXTRA_OBJECT',
    ),
});
const vehicleAspect = staticCheck({
  id: 'geometry.vehicle_aspect',
  labels: FOUR_WHEEL,
  test: ({ box }) =>
    (box.ratio > 2 || box.ratio < 0.2) &&
    flag(15, 'Box xe đứng hoặc dẹt bất thường.', ratioEvidence(box), 'BBOX'),
});
// N2: a two-wheeler is narrow but not tall; a tall box usually swallowed the rider.
const twoWheelerAspect = staticCheck({
  id: 'geometry.two_wheeler_aspect',
  labels: TWO_WHEEL,
  test: ({ box }) =>
    box.ratio > 3 && flag(15, 'Box xe hai bánh quá cao.', ratioEvidence(box), 'BBOX'),
});

// Person
// N4, N12: a passenger behind glass or a printed figure, not a person in the scene.
const personInVehicle = staticCheck({
  id: 'context.person_in_vehicle',
  labels: ['person'],
  relational: true,
  test({ box, peers }) {
    const peer = container(box, peers, FOUR_WHEEL);
    return (
      peer &&
      flag(
        30,
        `Box người nằm trọn trong một box “${peer.label}”.`,
        containedIn(box, peer),
        'EXTRA_OBJECT',
      )
    );
  },
});
// N3: a rider only overlaps the top of the bike; near-identical boxes mean one covers both.
const personTwoWheeler = staticCheck({
  id: 'context.person_two_wheeler',
  labels: ['person'],
  relational: true,
  test({ box, peers }) {
    const peer = peers.find(
      (p) => TWO_WHEEL.includes(p.label) && iou(box.geometry, p.geometry) >= 0.5,
    );
    return (
      peer &&
      flag(
        20,
        `Box người gần trùng với box “${peer.label}”.`,
        overlapEvidence(box, peer, 0.5),
        'BBOX',
      )
    );
  },
});
const personAspect = staticCheck({
  id: 'geometry.person_aspect',
  labels: ['person'],
  test: ({ box }) =>
    box.ratio < 0.8 && flag(15, 'Box người rộng hơn cao.', ratioEvidence(box), 'BBOX'),
});

// Traffic light
// N4: a tail light always lies fully inside its vehicle; a real light behind it rarely does.
const lightInVehicle = staticCheck({
  id: 'context.light_in_vehicle',
  labels: ['traffic_light'],
  relational: true,
  test({ box, peers }) {
    const peer = container(box, peers, MOTOR_VEHICLES);
    return (
      peer &&
      flag(
        40,
        `“Đèn tín hiệu” nằm trọn trong một box “${peer.label}”.`,
        containedIn(box, peer),
        'EXTRA_OBJECT',
      )
    );
  },
});
const lightPosition = staticCheck({
  id: 'geometry.light_position',
  labels: ['traffic_light'],
  test: ({ box, media }) =>
    (box.y1 + box.y2) / 2 > 0.65 * media.height &&
    flag(
      30,
      '“Đèn tín hiệu” ở sát mặt đường.',
      { bbox: box.geometry, center_ratio: (box.y1 + box.y2) / 2 / media.height, threshold: 0.65 },
      'EXTRA_OBJECT',
    ),
});
const lightAspect = staticCheck({
  id: 'geometry.light_aspect',
  labels: ['traffic_light'],
  test: ({ box }) =>
    (box.ratio < 0.5 || box.ratio > 4) &&
    flag(15, 'Hình dạng không giống hộp đèn.', ratioEvidence(box), 'BBOX'),
});
const lightOverlap = staticCheck({
  id: 'geometry.light_overlap',
  labels: ['traffic_light'],
  relational: true,
  test({ box, peers }) {
    const peer = duplicate(box, peers, 0.3);
    return (
      peer && flag(20, 'Hai box cho một hộp đèn.', overlapEvidence(box, peer, 0.3), 'EXTRA_OBJECT')
    );
  },
});

// Traffic sign. The model only finds stop signs, so two rules judge model drafts only.
const signInVehicle = staticCheck({
  id: 'context.sign_in_vehicle',
  labels: ['traffic_sign'],
  only: 'draft',
  relational: true,
  test({ box, peers }) {
    const peer = container(box, peers, MOTOR_VEHICLES);
    return (
      peer &&
      flag(
        30,
        `“Biển báo” nằm trọn trong một box “${peer.label}”.`,
        containedIn(box, peer),
        'EXTRA_OBJECT',
      )
    );
  },
});
const stopSignAspect = staticCheck({
  id: 'geometry.stop_sign_aspect',
  labels: ['traffic_sign'],
  only: 'draft',
  test: ({ box }) =>
    (box.ratio < 0.6 || box.ratio > 1.6) &&
    flag(20, 'Hình dạng không giống biển stop.', ratioEvidence(box), 'EXTRA_OBJECT'),
});
const signPosition = staticCheck({
  id: 'geometry.sign_position',
  labels: ['traffic_sign'],
  test: ({ box, media }) =>
    (box.y1 + box.y2) / 2 > 0.7 * media.height &&
    flag(
      20,
      '“Biển báo” ở sát mặt đường.',
      { bbox: box.geometry, center_ratio: (box.y1 + box.y2) / 2 / media.height, threshold: 0.7 },
      'EXTRA_OBJECT',
    ),
});
const signOverlap = staticCheck({
  id: 'geometry.sign_overlap',
  labels: ['traffic_sign'],
  relational: true,
  test({ box, peers }) {
    const peer = duplicate(box, peers, 0.3);
    return (
      peer && flag(20, 'Hai box cho một biển.', overlapEvidence(box, peer, 0.3), 'EXTRA_OBJECT')
    );
  },
});

// Barrier and pole are drawn by hand; these rules check the drawing.
const barrierAspect = staticCheck({
  id: 'geometry.barrier_aspect',
  labels: ['barrier'],
  test: ({ box }) =>
    box.ratio > 1.5 && flag(20, 'Box rào chắn cao hơn rộng.', ratioEvidence(box), 'CLASS'),
});
// N3: a barrier cut by a vehicle must be split into two segments.
const barrierSpansVehicle = staticCheck({
  id: 'context.barrier_spans_vehicle',
  labels: ['barrier'],
  relational: true,
  test({ box, peers }) {
    const peer = peers.find(
      (p) =>
        VEHICLES.includes(p.label) &&
        p.x1 > box.x1 &&
        p.x2 < box.x2 &&
        Math.min(p.y2, box.y2) - Math.max(p.y1, box.y1) >= 0.8 * box.height,
    );
    return (
      peer &&
      flag(
        30,
        `Box rào chắn vắt qua một box “${peer.label}”.`,
        { annotation_ids: [box.id, peer.id] },
        'BBOX',
      )
    );
  },
});
const poleAspect = staticCheck({
  id: 'geometry.pole_aspect',
  labels: ['pole'],
  test: ({ box }) => box.ratio < 2 && flag(30, 'Box cột không mảnh.', ratioEvidence(box), 'BBOX'),
});
// N3: the box covers the pole shaft only; lights and signs stick out of it.
const poleCoversObjects = staticCheck({
  id: 'context.pole_covers_objects',
  labels: ['pole'],
  relational: true,
  test({ box, peers }) {
    const covered = peers.filter(
      (p) => ['traffic_light', 'traffic_sign'].includes(p.label) && inside(p, box),
    );
    return (
      covered.length >= 2 &&
      flag(
        30,
        `Box cột chứa ${covered.length} box đèn hoặc biển.`,
        { annotation_ids: [box.id, ...covered.map((p) => p.id)] },
        'BBOX',
      )
    );
  },
});
export const labelChecks: Check[] = [
  vehicleInLargeVehicle,
  egoVehicle,
  vehiclePosition,
  vehicleAspect,
  twoWheelerAspect,
  personInVehicle,
  personTwoWheeler,
  personAspect,
  lightInVehicle,
  lightPosition,
  lightAspect,
  lightOverlap,
  signInVehicle,
  stopSignAspect,
  signPosition,
  signOverlap,
  barrierAspect,
  barrierSpansVehicle,
  poleAspect,
  poleCoversObjects,
];
