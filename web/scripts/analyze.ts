import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeLayout } from '../core/analysis/layout.ts';
import { cropUnits, readDatasetArchive } from '../server/analysis/archive.ts';

// Reads a dataset .zip (annotations, and images when it has them) and reports where the boxes
// sit, which ones overlap and how they are grouped for review (docs/box-layout.md). With
// --crops every group is also cut out of its image.
// Usage: npm run analyze -- --input DATASET.zip [--out layout.json] [--crops DIRECTORY] [--outline]
const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    out: { type: 'string' },
    crops: { type: 'string' },
    outline: { type: 'boolean' },
    'max-members': { type: 'string' },
    'link-share': { type: 'string' },
  },
});
if (!values.input)
  throw new Error(
    'Usage: npm run analyze -- --input DATASET.zip [--out layout.json] [--crops DIRECTORY] [--outline] [--link-share 0.2] [--max-members 6]',
  );
const archive = await readDatasetArchive(path.resolve(values.input));
const report = analyzeLayout(archive.data, {
  ...(values['max-members'] && { max_members: Number(values['max-members']) }),
  ...(values['link-share'] && { link_share: Number(values['link-share']) }),
});
if (values.out) await fs.writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`);

const { summary } = report;
console.error(
  `${archive.format}: ${summary.frames} ảnh có nhãn (${archive.images} ảnh có trong ZIP), ${summary.boxes} box, ${report.skipped.length} bỏ qua.`,
);
console.error(
  `Đơn vị xem xét: ${summary.units.single} box lẻ, ${summary.units.cluster} cụm cùng nhãn, ` +
    `${summary.units.rider} cặp người lái – xe, ${summary.units.mixed} cụm người và xe.`,
);
console.error(
  `Cặp chồng nhau: ${summary.links.duplicate} gần trùng, ${summary.links.nested} lồng nhau, ` +
    `${summary.links.heavy} chồng trên nửa, ${summary.links.partial} chồng một phần, ${summary.links.rider} người lái.`,
);
console.table(summary.labels);
for (const unit of report.units.filter((u) => u.kind !== 'single').slice(0, 20)) {
  const { crop } = unit;
  console.error(
    `  ${unit.kind.padEnd(7)} ${unit.id}  ${unit.members.map((m) => m.label).join('+')}  ` +
      `cắt ${crop.width}x${crop.height} tại (${crop.x}, ${crop.y})  ` +
      unit.links.map((l) => `${l.relation} ${Math.round(l.share_small * 100)}%`).join(', '),
  );
}
if (values.crops) {
  const written = await cropUnits(archive, report, path.resolve(values.crops), {
    outline: values.outline,
  });
  console.error(`Đã cắt ${written.size}/${report.units.length} đơn vị vào ${values.crops}.`);
}
if (!values.out && !values.crops) process.stdout.write(`${JSON.stringify(report)}\n`);
