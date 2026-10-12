import { POLICY, FOUR_WHEEL, VEHICLES } from '../policy.ts';
import { skip, container, isLabel } from './shared.ts';
import type { StaticContext } from './shared.ts';
import type { Media } from '../../schema/types.ts';
import type { Box, DraftBox, Evidence, LabelBox, MeasuredBox, Skipped } from '../types.ts';

// Checks whose logic does not fit a few parameters. The policy names them through the template
// "builtin" and gives them a score and an error type; what they look for stays here.
type Hit = { reason: string; evidence: Evidence };
type Falsy = false | 0 | '' | null | undefined;
export interface Builtin {
  relational?: boolean;
  // Needs a confidence, so it only runs on model drafts.
  modelOnly?: boolean;
  test(context: StaticContext<any>): Hit | Skipped | Falsy;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
// The horizon passes near the roof line of the cars in a frame. Three other vehicles place it;
// with fewer the fixed top band of the image is the only reference.
function horizon(box: LabelBox, frameBoxes: Box[], media: Media) {
  const roofs = frameBoxes
    .filter(
      (b): b is LabelBox =>
        b.id !== box.id &&
        isLabel(b) &&
        VEHICLES.includes(b.label) &&
        b.y2 < media.height - POLICY.edgePx,
    )
    .map((b) => b.y1 + 0.1 * b.height);
  return roofs.length >= 3 ? median(roofs) : undefined;
}
// A person box inside a vehicle box is usually a real pedestrian the rectangle happens to cover:
// standing in front of the vehicle, far behind it, or showing past a top corner of its box.
function pedestrianNearVehicle(person: MeasuredBox, vehicle: MeasuredBox) {
  const cx = (person.x1 + person.x2) / 2,
    cy = (person.y1 + person.y2) / 2;
  if (person.y2 >= vehicle.y2 - 0.1 * vehicle.height) return 'feet_on_ground';
  if (person.ratio >= 1.8 && person.height <= 0.35 * vehicle.height) return 'far_behind';
  if (
    Math.min(cx - vehicle.x1, vehicle.x2 - cx) <= 0.2 * vehicle.width &&
    cy - vehicle.y1 <= 0.35 * vehicle.height
  )
    return 'box_corner';
  return null;
}

export const BUILTINS: Record<string, Builtin> = {
  // N4: the camera car's own bonnet. A real car ahead also touches the bottom but reaches
  // mid-frame.
  'context.ego_vehicle': {
    test: ({ box, media }: StaticContext) =>
      box.y2 >= media.height - POLICY.edgePx &&
      box.width > 0.6 * media.width &&
      box.y1 > 0.7 * media.height && {
        reason: 'Box rộng, dẹt, sát mép dưới ảnh: nghi nắp ca-pô của xe gắn camera.',
        evidence: {
          bbox: box.geometry,
          width_ratio: box.width / media.width,
          top_ratio: box.y1 / media.height,
        },
      },
  },
  // N1: vehicles stand on the road, and the road lies below the horizon.
  'geometry.vehicle_position': {
    test({ box, media, frameBoxes }: StaticContext) {
      if (box.y2 >= 0.3 * media.height) return null;
      // Cameras pitched down put the whole road in the top band; the frame's own horizon decides.
      const line = horizon(box, frameBoxes, media);
      if (line !== undefined && box.y2 >= line - 0.25 * box.height) return null;
      return {
        reason: 'Cả box nằm ở phần trên cùng của ảnh.',
        evidence: {
          bbox: box.geometry,
          bottom_ratio: box.y2 / media.height,
          threshold: 0.3,
          ...(line !== undefined && { horizon_y: line }),
        },
      };
    },
  },
  // N4, N12: a passenger behind glass or a printed figure, not a person in the scene.
  'context.person_in_vehicle': {
    relational: true,
    test({ box, peers }: StaticContext) {
      const peer = container(box, peers, FOUR_WHEEL, POLICY.containment, POLICY.duplicateIou);
      return (
        peer &&
        !pedestrianNearVehicle(box, peer) && {
          reason: `Box người nằm trọn trong một box “${peer.label}”.`,
          evidence: { annotation_ids: [box.id, peer.id], container: peer.label },
        }
      );
    },
  },
  // N3: a barrier cut by a vehicle must be split into two segments.
  'context.barrier_spans_vehicle': {
    relational: true,
    test({ box, peers }: StaticContext) {
      const peer = peers.find(
        (p) =>
          VEHICLES.includes(p.label) &&
          p.x1 > box.x1 &&
          p.x2 < box.x2 &&
          Math.min(p.y2, box.y2) - Math.max(p.y1, box.y1) >= 0.8 * box.height,
      );
      return (
        peer && {
          reason: `Box rào chắn vắt qua một box “${peer.label}”.`,
          evidence: { annotation_ids: [box.id, peer.id] },
        }
      );
    },
  },
  // N6: a weak box in a dark, blurred or rainy frame goes to the queue; in a clear frame it
  // does not.
  'env.poor_condition': {
    modelOnly: true,
    test({ box, env_risk }: StaticContext<DraftBox>) {
      if (env_risk === undefined) return skip('missing_env_risk');
      return (
        env_risk >= POLICY.poorEnv &&
        box.confidence < POLICY.lowScore && {
          reason: 'Box yếu trong ảnh điều kiện xấu.',
          evidence: { env_risk, confidence: box.confidence, threshold: POLICY.poorEnv },
        }
      );
    },
  },
};
