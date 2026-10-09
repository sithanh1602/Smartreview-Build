import React from 'react';
import type { Drawable } from '../../types.ts';

// Image and overlays share the parent SVG viewBox (including responsive zoom).
export function AnnotationOverlay({
  annotation,
  active,
  selected,
  risk,
  compact,
  bounds,
  onSelect,
}: {
  annotation: Drawable;
  active?: boolean;
  selected?: boolean;
  risk?: number;
  compact?: boolean;
  bounds: number[];
  onSelect?: () => void;
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
  const label = `${active && risk !== undefined ? `RISK ${risk} · ` : ''}${annotation.class_name || annotation.label}`;
  const labelWidth = Math.min(label.length * size * 0.64 + size, width);
  const lx = Math.max(x, Math.min(box ? g.x : g.points[0][0], x + width - labelWidth));
  const ly = Math.min(y + height, Math.max(y + size * 1.8, box ? g.y : g.points[0][1]));
  const color = active
    ? 'var(--color-accent)'
    : selected
      ? 'var(--color-slate-900)'
      : 'var(--color-slate-500)';
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
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      stroke={color}
      fill="none"
      strokeWidth={active ? 3 : selected ? 2 : 1.5}
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
            fill="var(--color-panel)"
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
