// Numbers come from label_policy and are illustrative: they give direction and magnitude,
// none has been measured on data. Rule descriptions live with the checks; only values live here.
import type { LabelGroup } from './types.ts';

export const POLICY_VERSION = '1.0.0';
export const POLICY = Object.freeze({
  workingScore: 0.3,
  greyFloor: 0.1,
  lowScore: 0.5,
  classMargin: 0.15,
  confusionMargin: 0.25,
  containment: 0.9,
  edgePx: 2,
  poorEnv: 0.5,
  tier: Object.freeze({ flagged: 30, high: 70, relabelFlagged: 5, relabelHigh: 2 }),
  // Inert at the working score; raise it once shadow runs give a measured floor.
  autoAccept: Object.freeze({ minConfidence: 0.3 }),
  coverage: Object.freeze({
    greyScore: 0.2,
    greySide: 32,
    greyOverlap: 0.5,
    greyVehicles: 3,
    nightGrey: 3,
    denseTraffic: 25,
    crowd: 10,
    manyLights: 12,
    manyStopSigns: 3,
  }),
});

export const FOUR_WHEEL = ['car', 'truck', 'bus'];
export const TWO_WHEEL = ['motorcycle', 'bicycle'];
export const VEHICLES = [...FOUR_WHEEL, ...TWO_WHEEL];
export const LARGE_VEHICLES = ['truck', 'bus'];
// Core labels decide the frame tier; bonus labels are scored and reported but never block.
export const CORE_LABELS = [...VEHICLES, 'person'];
export const BONUS_LABELS = ['traffic_light', 'traffic_sign', 'barrier', 'pole'];
// Long side in pixels (height for pole). Smaller boxes are neither right nor wrong.
export const MIN_SIDE: Readonly<Record<string, number>> = Object.freeze({
  car: 10,
  truck: 10,
  bus: 10,
  motorcycle: 10,
  bicycle: 10,
  person: 16,
  traffic_light: 10,
  traffic_sign: 10,
  barrier: 32,
  pole: 32,
});
const ALIASES: Record<string, string> = {
  stop_sign: 'traffic_sign',
  motor: 'motorcycle',
  motorbike: 'motorcycle',
  bike: 'bicycle',
  pedestrian: 'person',
  rider: 'person',
};
export function canonicalLabel(label: string) {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ALIASES[key] || key;
}
// Labels outside the policy have no label rules, so they stay blocking like core labels.
export const labelGroup = (label: string): LabelGroup =>
  CORE_LABELS.includes(label) ? 'core' : BONUS_LABELS.includes(label) ? 'bonus' : 'other';
