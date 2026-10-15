import type { Box3D } from './engine.ts';

// A flag marks a cuboid whose review says it is wrong. Its colour is the kind of error and its
// number is how it is called up, by raising that many fingers or from the list.
export interface Flag {
  number: number;
  objectId: string;
  type: string;
  errorType: string;
  color: number;
}
export const FLAG_COLORS: Record<string, number> = {
  CLASS: 0xf97316,
  BBOX: 0xef4444,
  TRACKING: 0xa855f7,
  EXTRA_OBJECT: 0xec4899,
  OTHER: 0x38bdf8,
};
export const FLAG_NAMES: Record<string, string> = {
  CLASS: 'Class',
  BBOX: 'Cuboid',
  TRACKING: 'Tracking',
  EXTRA_OBJECT: 'Extra Object',
  OTHER: 'Other',
};
// What a flag needs to know of a review.
export interface Verdict {
  decision: string;
  error_type: string | null;
}
export const boxKey = (timestamp: number, objectId: string) => `${timestamp}:${objectId}`;
// The flags of one frame, numbered from 1 in the order of the objects' IDs, so an object keeps
// its place among the same flagged objects from frame to frame.
export function flagsOf(
  frame: { timestamp: number; boxes: Box3D[] },
  reviews: Record<string, Verdict>,
): Flag[] {
  return frame.boxes
    .filter((box) => reviews[boxKey(frame.timestamp, box.id)]?.decision === 'ERROR')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((box, i) => {
      const errorType = reviews[boxKey(frame.timestamp, box.id)].error_type ?? 'OTHER';
      return {
        number: i + 1,
        objectId: box.id,
        type: box.type,
        errorType,
        color: FLAG_COLORS[errorType] ?? FLAG_COLORS.OTHER,
      };
    });
}
