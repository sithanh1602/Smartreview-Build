// Colours shared by the viewer and the pages around it. Kept apart from the engine so a page
// that only needs a swatch does not load three.js.
export const BOX_COLORS: Record<string, number> = {
  VEHICLE: 0x4da3ff,
  PEDESTRIAN: 0xff5c5c,
  CYCLIST: 0x4ade80,
  SIGN: 0xfacc15,
  UNKNOWN: 0x9ca3af,
};
export const LASER_COLORS = [0xe5e7eb, 0xf97316, 0x22d3ee, 0xa78bfa, 0xf472b6];
export const BACKGROUND = 0x0d1117;
export const cssColor = (hex: number) => '#' + hex.toString(16).padStart(6, '0');
// A cuboid's colour when cuboids are coloured by what the review said about them.
export const REVIEW_COLORS: Record<string, number> = {
  NONE: 0x9ca3af,
  CORRECT: 0x4ade80,
  ERROR: 0xff5c5c,
  UNSURE: 0xfacc15,
};
export const SELECTED_COLOR = 0xffffff;
