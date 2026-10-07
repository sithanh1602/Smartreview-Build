import { Spinner } from '../../components/Spinner';
import { SessionImage } from '../auth/SessionImage';
import { hint } from '../../lib/englishHints';
import React, { useEffect, useRef, useState } from 'react';
import { AnnotationOverlay } from './AnnotationOverlay';
export function FrameViewer({
  observation,
  trackId,
  risk,
  compact = false,
  zoom = false,
  interactive = false,
  showBox = true,
  proposal,
  maxHeight,
  annotations = [observation],
  activeAnnotationId = observation.annotation_id,
  selectedAnnotationId,
  onSelectAnnotation,
}) {
  const [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const dragged = useRef(false);
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [zoom, observation.image_url]);
  const { width: imageWidth, height: imageHeight, geometry: g } = observation;
  const validBox = g.type === 'bbox' && g.width > 0 && g.height > 0;
  const pad = validBox ? Math.max(g.width, g.height) * 0.65 : 0;
  const x = validBox ? Math.max(0, g.x - pad) : 0,
    y = validBox ? Math.max(0, g.y - pad) : 0;
  const width = validBox ? Math.min(imageWidth, g.x + g.width + pad) - x : imageWidth;
  const height = validBox ? Math.min(imageHeight, g.y + g.height + pad) - y : imageHeight;
  const cropped = zoom && validBox && width > 0 && height > 0;
  const base = cropped ? [x, y, width, height] : [0, 0, imageWidth, imageHeight];
  const factor = interactive ? scale : 1;
  const vw = base[2] / factor,
    vh = base[3] / factor;
  const limitX = (base[2] - vw) / 2,
    limitY = (base[3] - vh) / 2;
  const px = Math.max(-limitX, Math.min(limitX, pan.x));
  const py = Math.max(-limitY, Math.min(limitY, pan.y));
  const bounds = [base[0] + limitX + px, base[1] + limitY + py, vw, vh];
  const viewBox = bounds.join(' ');
  const unavailable = !observation.image_url;
  const unsupported = !['bbox', 'polygon', 'polyline'].includes(g.type);
  return (
    <div
      className={`relative overflow-hidden bg-slate-100 ${compact ? 'rounded-none' : ''}`}
      style={{
        aspectRatio: `${imageWidth}/${imageHeight}`,
        maxHeight,
      }}
    >
      {failed || unavailable ? (
        <div
          role={failed ? 'alert' : 'status'}
          className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted"
        >
          {failed ? 'Không tải được ảnh. Hãy tải lại trang.' : 'Chưa có ảnh cho frame này.'}
        </div>
      ) : (
        <>
          {!loaded && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center text-xs text-muted"
            >
              <Spinner />
              {hint('Đang tải frame…')}
            </div>
          )}
          <svg
            role="img"
            aria-label={hint(
              `Frame ${observation.frame_id}, ${trackId === undefined ? `object ${observation.annotation_id}` : `track ${trackId}`}, ${observation.class_name}${risk === undefined ? '' : `, Risk ${risk}`}`,
            )}
            viewBox={viewBox}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            style={{
              touchAction: interactive && scale > 1 ? 'none' : 'auto',
              cursor: interactive && scale > 1 ? 'grab' : undefined,
            }}
            onPointerDown={(e) => {
              dragged.current = false;
              if (!interactive || scale <= 1 || e.button !== 0) return;
              const matrix = e.currentTarget.getScreenCTM();
              if (!matrix) return;
              drag.current = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                px,
                py,
                unit: matrix.a,
              };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (!start || start.id !== e.pointerId) return;
              const dx = e.clientX - start.x,
                dy = e.clientY - start.y;
              if (!dragged.current && Math.hypot(dx, dy) < 4) return;
              dragged.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPan({
                x: Math.max(-limitX, Math.min(limitX, start.px - dx / start.unit)),
                y: Math.max(-limitY, Math.min(limitY, start.py - dy / start.unit)),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onClickCapture={(e) => {
              if (dragged.current) {
                e.stopPropagation();
                dragged.current = false;
              }
            }}
          >
            <SessionImage
              key={observation.image_url}
              href={observation.image_url}
              width={imageWidth}
              height={imageHeight}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
            {showBox &&
              [...annotations]
                .sort(
                  (a, b) =>
                    Number(a.annotation_id === activeAnnotationId) -
                    Number(b.annotation_id === activeAnnotationId),
                )
                .map((a) => (
                  <AnnotationOverlay
                    key={a.annotation_id || a.id}
                    annotation={a}
                    active={a.annotation_id === activeAnnotationId}
                    selected={a.annotation_id === selectedAnnotationId}
                    risk={risk}
                    compact={compact}
                    bounds={bounds}
                    onSelect={
                      onSelectAnnotation ? () => onSelectAnnotation(a.annotation_id) : undefined
                    }
                  />
                ))}
            {proposal?.geometry?.type === 'bbox' && (
              <g fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray="8 5">
                <rect
                  x={proposal.geometry.x}
                  y={proposal.geometry.y}
                  width={proposal.geometry.width}
                  height={proposal.geometry.height}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </svg>
          {unsupported && !compact && (
            <p className="absolute bottom-3 left-3 rounded-none bg-white/95 p-2 text-xs text-muted">
              Chưa có overlay cho {g.type}; dữ liệu đã được giữ nguyên.
            </p>
          )}
        </>
      )}
      {interactive && (
        <div
          className="absolute bottom-3 right-3 flex items-center gap-1 border border-line bg-white/95 p-1 shadow-sm"
          role="group"
          aria-label="Thu phóng ảnh"
        >
          <button
            type="button"
            className="button px-3"
            aria-label="Thu nhỏ ảnh"
            disabled={scale <= 1 || failed || unavailable}
            onClick={() => setScale((v) => Math.max(1, v / 1.5))}
          >
            −
          </button>
          <output
            className="min-w-14 text-center text-xs tabular-nums"
            aria-label="Mức thu phóng"
            aria-live="polite"
          >
            {Math.round(scale * 100)}%
          </output>
          <button
            type="button"
            className="button px-3"
            aria-label="Phóng to ảnh"
            disabled={scale >= 8 || failed || unavailable}
            onClick={() => setScale((v) => Math.min(8, v * 1.5))}
          >
            +
          </button>
          <button
            type="button"
            className="button text-xs"
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            }}
            disabled={scale === 1}
          >
            Đặt lại zoom
          </button>
        </div>
      )}
    </div>
  );
}
