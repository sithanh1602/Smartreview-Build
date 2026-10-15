import type { Dataset } from '../schema/types.ts';

const escape = (value: unknown) =>
  String(value).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (value: number) => value.toFixed(2);

// CVAT for images 1.1, the XML CVAT imports and exports itself. Boxes, polygons and polylines
// are written; other geometry has no place in this format and is counted in `skipped`.
// Every medium must be a single image: video frames belong to CVAT for video.
export function exportCvatImages(dataset: Dataset) {
  const byFrame = new Map<string, Dataset['annotations']>();
  for (const a of dataset.annotations)
    byFrame.set(a.frame_id, [...(byFrame.get(a.frame_id) ?? []), a]);
  const media = new Map(dataset.media.map((m) => [m.id, m]));
  const labels = [...new Set(dataset.annotations.map((a) => a.label))].sort();
  let skipped = 0;
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<annotations>',
    '  <version>1.1</version>',
    '  <meta>',
    '    <task>',
    `      <name>${escape(dataset.dataset.name)}</name>`,
    `      <size>${dataset.frames.length}</size>`,
    '      <mode>annotation</mode>',
    '      <labels>',
    ...labels.map(
      (label) => `        <label><name>${escape(label)}</name><attributes></attributes></label>`,
    ),
    '      </labels>',
    '    </task>',
    '  </meta>',
  ];
  dataset.frames.forEach((frame, index) => {
    const m = media.get(frame.media_id)!;
    if (m.type !== 'image') throw new Error('CVAT for images cannot hold video frames');
    lines.push(
      `  <image id="${index}" name="${escape(m.name)}" width="${m.width}" height="${m.height}">`,
    );
    for (const a of byFrame.get(frame.id) ?? []) {
      const g = a.geometry,
        head = `label="${escape(a.label)}" source="manual" occluded="0"`;
      if (g.type === 'bbox')
        lines.push(
          `    <box ${head} xtl="${n(g.x)}" ytl="${n(g.y)}" xbr="${n(g.x + g.width)}" ybr="${n(g.y + g.height)}" z_order="0"></box>`,
        );
      else if (g.type === 'polygon' || g.type === 'polyline')
        lines.push(
          `    <${g.type} ${head} points="${g.points.map(([x, y]) => `${n(x)},${n(y)}`).join(';')}" z_order="0"></${g.type}>`,
        );
      else skipped++;
    }
    lines.push('  </image>');
  });
  lines.push('</annotations>', '');
  return { xml: lines.join('\n'), skipped };
}
