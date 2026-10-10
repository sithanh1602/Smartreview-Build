import React from 'react';
import { hint } from '../../lib/englishHints';
import type { Drawable } from '../../types.ts';

export type Mark = { n: number; color: string; dim: boolean; done: boolean };

// Image and overlays share the parent SVG viewBox (including responsive zoom).
export function AnnotationOverlay({
  annotation,
  active,
  selected,
  risk,
  compact,
  bounds,
  onSelect,
  onOpen,
  mark,
}: {
  annotation: Drawable;
  active?: boolean;
  selected?: boolean;
  risk?: number;
  compact?: boolean;
  bounds: number[];
  onSelect?: () => void;
  // A numbered case of the image: clicking opens it rather than only inspecting it.
  onOpen?: () => void;
  mark?: Mark;
}) {
  // Stored geometry is drawn only after its numbers have been checked here.
  const g: any = annotation.geometry || {};
  const box = g.type === 'bbox' && [g.x, g.y, g.width, g.height].every(Number.isFinite);
  const validBox = box && g.width > 0 && g.height > 0;
  const points =
    ['polygon', 'polyline'].includes(g.type) &&
    Array.isArray(g.points) &&
    g.points.length > 1 &&
    g.points.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (!box && !points) return null;
  const [x, y, width, height] = bounds;
  const size = width * 0.016;
  const tag = mark ? `${mark.n}${mark.done ? ' ✓' : ''}` : '';
  const name = `${active && risk !== undefined ? `${hint('Risk').toUpperCase()} ${risk} · ` : ''}${annotation.class_name || annotation.label}`;
  const label = !tag ? name : mark!.dim && !active ? tag : `${tag} · ${name}`;
  const labelWidth = Math.min(label.length * size * 0.64 + size, width);
  const lx = Math.max(x, Math.min(box ? g.x : g.points[0][0], x + width - labelWidth));
  const ly = Math.min(y + height, Math.max(y + size * 1.8, box ? g.y : g.points[0][1]));
  // Fixed colours: the canvas stays dark in both themes.
  const color = active ? '#2dd4bf' : mark ? mark.color : selected ? '#ffffff' : '#94a3b8';
  return (
    <g
      data-annotation-id={annotation.annotation_id || annotation.id}
      data-active={active ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      role={onSelect ? 'button' : undefined}
      style={{ outline: 'none' }}
      onFocus={onSelect}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={
        onSelect
          ? `Inspect ${annotation.class_name || annotation.label} (${annotation.annotation_id || annotation.id})`
          : undefined
      }
      onClick={onOpen ?? onSelect}
      opacity={mark?.dim && !active ? 0.45 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (onOpen ?? onSelect)();
              }
            }
          : undefined
      }
      stroke={color}
      fill="none"
      strokeWidth={active ? 3 : mark ? 2.5 : selected ? 2 : 1.5}
      strokeDasharray={selected && !active ? '5 3' : undefined}
    >
      {validBox && (
        <rect
          data-testid="annotation-box"
          x={g.x}
          y={g.y}
          width={g.width}
          height={g.height}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {box && !validBox && (
        <path d={`M${g.x - 12},${g.y - 12}l24,24m-24,0l24,-24`} vectorEffect="non-scaling-stroke" />
      )}
      {points &&
        (g.type === 'polygon' ? (
          <polygon
            points={g.points.map((p: number[]) => p.join(',')).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <polyline
            points={g.points.map((p: number[]) => p.join(',')).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {!compact && (
        <g stroke="none" strokeDasharray="none">
          <rect x={lx} y={ly - size * 1.8} width={labelWidth} height={size * 1.8} fill={color} />
          <text
            x={lx + size * 0.5}
            y={ly - size * 0.5}
            fill="#0f172a"
            fontSize={size}
            fontWeight={active ? '700' : '500'}
            fontFamily="system-ui,sans-serif"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
