import React, { useRef, useState } from 'react';
export function WholeFrameViewer({
  frame,
  annotations,
  regions,
  drawing,
  onAdd,
  onSelect,
  selected,
  onReady,
}) {
  const svg = useRef(null),
    anchor = useRef(null);
  const [draft, setDraft] = useState(null),
    [failed, setFailed] = useState(false),
    [loaded, setLoaded] = useState(false),
    [labels, setLabels] = useState(true);
  const point = (e) => {
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return null;
    const p = svg.current.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(matrix.inverse());
  };
  const within = (p) => p && p.x >= 0 && p.y >= 0 && p.x <= frame.width && p.y <= frame.height;
  const rect = (a, b) => ({
    type: 'bbox',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  });
  const clamp = (p) => ({
    x: Math.max(0, Math.min(frame.width, p.x)),
    y: Math.max(0, Math.min(frame.height, p.y)),
  });
  function down(e) {
    if (!drawing || !loaded || failed || e.button !== 0) return;
    const p = point(e);
    if (!within(p)) return;
    anchor.current = p;
    svg.current.setPointerCapture(e.pointerId);
    setDraft(rect(p, p));
  }
  function move(e) {
    if (!anchor.current) return;
    const p = point(e);
    if (p) setDraft(rect(anchor.current, clamp(p)));
  }
  function up(e) {
    if (!anchor.current) return;
    const p = point(e),
      g = p ? rect(anchor.current, clamp(p)) : null;
    anchor.current = null;
    setDraft(null);
    if (svg.current.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    if (g && g.width >= 1 && g.height >= 1) onAdd(g);
  }
  function shape(g, color, id, label, selectable = false) {
    const props = {
      stroke: color,
      strokeWidth: selected === id ? 3 : 2,
      fill: 'transparent',
      vectorEffect: 'non-scaling-stroke',
    };
    return (
      <g
        key={id}
        onClick={(e) => {
          if (!drawing && selectable) {
            e.stopPropagation();
            onSelect(id);
          }
        }}
        style={{ cursor: selectable && !drawing ? 'pointer' : undefined }}
      >
        <title>{label}</title>
        {g.type === 'bbox' && g.width > 0 && g.height > 0 && (
          <rect {...props} x={g.x} y={g.y} width={g.width} height={g.height} />
        )}
        {g.type === 'polygon' && (
          <polygon {...props} points={g.points.map((p) => p.join(',')).join(' ')} />
        )}
        {g.type === 'polyline' && (
          <polyline {...props} points={g.points.map((p) => p.join(',')).join(' ')} />
        )}
        {labels && g.type === 'bbox' && (
          <text
            x={Math.max(0, g.x)}
            y={Math.max(12, g.y - 3)}
            fill={color}
            stroke="white"
            strokeWidth="2"
            paintOrder="stroke"
            fontSize={Math.max(frame.width / 65, 10)}
          >
            {label}
          </text>
        )}
      </g>
    );
  }
  return (
    <>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
        Hiện tên đối tượng
      </label>
      {!frame.image_url || failed ? (
        <div role="alert" className="bg-slate-100 p-10 text-center">
          {failed
            ? 'Không tải được ảnh. Tải lại trang để thử lại.'
            : 'Frame này chưa có ảnh. Chưa thể xác nhận đã kiểm tra.'}
        </div>
      ) : (
        <div
          className="relative bg-slate-100"
          style={{ aspectRatio: `${frame.width}/${frame.height}`, maxHeight: '68vh' }}
        >
          {!loaded && (
            <p role="status" className="absolute inset-0 grid place-items-center">
              Đang tải ảnh…
            </p>
          )}
          <svg
            ref={svg}
            role="img"
            aria-label={`Ảnh ${frame.media_name}: ${annotations.length} annotation, ${regions.length} vùng thiếu`}
            viewBox={`0 0 ${frame.width} ${frame.height}`}
            className="absolute inset-0 h-full w-full"
            style={{
              touchAction: drawing ? 'none' : 'auto',
              cursor: drawing ? 'crosshair' : 'default',
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              anchor.current = null;
              setDraft(null);
            }}
          >
            <image
              href={frame.image_url}
              width={frame.width}
              height={frame.height}
              onLoad={() => {
                setLoaded(true);
                onReady(true);
              }}
              onError={() => {
                setFailed(true);
                onReady(false);
              }}
            />
            {annotations.map((a) =>
              shape(a.geometry, selected === a.id ? '#0f766e' : '#2563eb', a.id, a.label, true),
            )}
            <g strokeDasharray="7 4">
              {regions.map((r, i) =>
                shape(
                  r.geometry,
                  '#be123c',
                  r.id,
                  `Thiếu ${i + 1}${r.label ? ': ' + r.label : ''}`,
                ),
              )}
            </g>
            {draft && shape(draft, '#be123c', 'draft', 'Vùng đang vẽ')}
          </svg>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Khung xanh liền: annotation gốc · Khung đỏ nét đứt: vùng thiếu do bạn đánh dấu.
      </p>
    </>
  );
}
