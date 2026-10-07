import { SessionImage } from '../auth/SessionImage';
import { hint } from '../../lib/englishHints';
import React, { useState } from 'react';
import { AnnotationOverlay } from './AnnotationOverlay';
export function FrameViewer({
  observation,
  trackId,
  risk,
  compact = false,
  zoom = false,
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
  const { width: imageWidth, height: imageHeight, geometry: g } = observation;
  const validBox = g.type === 'bbox' && g.width > 0 && g.height > 0;
  const pad = validBox ? Math.max(g.width, g.height) * 0.65 : 0;
  const x = validBox ? Math.max(0, g.x - pad) : 0,
    y = validBox ? Math.max(0, g.y - pad) : 0;
  const width = validBox ? Math.min(imageWidth, g.x + g.width + pad) - x : imageWidth;
  const height = validBox ? Math.min(imageHeight, g.y + g.height + pad) - y : imageHeight;
  const cropped = zoom && validBox && width > 0 && height > 0;
  const viewBox = cropped ? `${x} ${y} ${width} ${height}` : `0 0 ${imageWidth} ${imageHeight}`;
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
                    bounds={cropped ? [x, y, width, height] : [0, 0, imageWidth, imageHeight]}
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
    </div>
  );
}
