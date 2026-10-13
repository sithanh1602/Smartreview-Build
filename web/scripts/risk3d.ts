import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { analyzeScene } from '../core/risk3d/engine.ts';

// Scores the cuboids of an exported 3D scene with the 3D Risk Engine (docs/risk-3d.md).
// Usage: npm run risk3d -- path/to/scene.json [--out report.json]
// The report goes to --out (or stdout); the summary goes to stderr.
const { values, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});
const [file] = positionals;
if (!file) throw new Error('Usage: npm run risk3d -- path/to/scene.json [--out report.json]');
const report = analyzeScene(JSON.parse(await fs.readFile(file, 'utf8')));
const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) await fs.writeFile(values.out, json);
else process.stdout.write(json);
console.error(
  `engine ${report.engine_version}, policy ${report.policy_version}: ${report.total_boxes} cuboid trong ${report.total_frames} frame, ` +
    `${report.cases.length} case từ ${report.min_score} điểm, ${report.warnings.length} dưới mức đó, ${report.gaps.length} chỗ đối tượng vắng mặt.`,
);
for (const [id, { flagged }] of Object.entries(report.checks))
  if (flagged) console.error(`  ${String(flagged).padStart(5)}  ${id}`);
