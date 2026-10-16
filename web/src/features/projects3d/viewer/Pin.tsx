import React from 'react';
import { cssColor } from './colors.ts';
import { PIN_COLORS, PIN_PATH, PIN_TEXT } from './flags.ts';
import type { Flag, PinLevel } from './flags.ts';

// The map pin of a flag, as drawn over its cuboid in the point cloud (flags.ts pinSvg), for the
// lists and cards around it. Without a number it is the swatch of a legend.
export function Pin({
  level,
  number,
  size = 16,
  title,
}: {
  level: PinLevel;
  number?: Flag['number'];
  size?: number;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 32"
      width={size}
      height={(size * 4) / 3}
      className="inline-block shrink-0"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <path d={PIN_PATH} fill={cssColor(PIN_COLORS[level])} stroke="#0d1117" strokeWidth={1.5} />
      {number !== undefined && (
        <text
          x="12"
          y="15.5"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontSize={number > 99 ? 7 : number > 9 ? 9 : 11}
          fontWeight={700}
          fill={PIN_TEXT[level]}
        >
          {number}
        </text>
      )}
    </svg>
  );
}
