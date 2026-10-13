import type { Case } from '../../types.ts';

// Cases that sit on the same image (for video, the same frame) are reviewed together.
export type ImageGroup = { key: string; name: string; cases: Case[] };

const imageKey = (c: Case) => `${c.media_name}\u0000${c.frame_id}`;

// Groups keep the order in which their first case appears, and cases keep their order inside
// a group, so a list sorted by risk yields images sorted by their highest risk.
export function groupByImage(cases: Case[]): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();
  for (const c of cases) {
    const key = imageKey(c);
    const group = groups.get(key);
    if (group) group.cases.push(c);
    else
      groups.set(key, {
        key,
        name: c.media_type === 'image' ? c.media_name : `${c.media_name} · F${c.frame_id}`,
        cases: [c],
      });
  }
  return [...groups.values()];
}

// Stroke colours for numbered cases on the image; fixed because images are not themed.
export const levelColor: Record<string, string> = {
  high: '#fb7185',
  medium: '#fbbf24',
  low: '#38bdf8',
};
export const levelText: Record<string, string> = {
  high: 'text-rose-700',
  medium: 'text-amber-800',
  low: 'text-sky-700',
};
