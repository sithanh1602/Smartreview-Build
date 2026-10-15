import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { analyzeScene, calibrateScene } from '../core/risk3d/engine.ts';

// Scores the cuboids of an exported 3D scene with the 3D Risk Engine (docs/risk-3d.md).
// Usage: npm run risk3d -- path/to/scene.json [--out report.json]
// The report goes to --out (or stdout); the summary goes to stderr.
// With --calibrate the scene's labels are taken as right and, instead of a report, what they
// measure against each threshold is printed, with suggested thresholds (docs/policy-3d.md, 6).
const { values, positionals } = parseArgs({
  options: { out: { type: 'string' }, calibrate: { type: 'boolean' } },
  allowPositionals: true,
});
const [file] = positionals;
if (!file)
  throw new Error('Usage: npm run risk3d -- path/to/scene.json [--out report.json] [--calibrate]');
const scene = JSON.parse(await fs.readFile(file, 'utf8'));
if (values.calibrate) {
  const calibration = calibrateScene(scene);
  console.error(
    `Hiệu chỉnh trên ${calibration.frames} frame của ${calibration.segment} (nhãn coi là đúng):`,
  );
  for (const [type, fields] of Object.entries(calibration.types)) {
    console.error(`  ${type}`);
    for (const [field, e] of Object.entries(fields))
      console.error(
        `    ${field.padEnd(20)} đo được ${String(e.observed).padStart(6)}  mức hiện tại ${String(e.current).padStart(5)}  đề xuất ${String(e.suggested).padStart(5)}${e.tight ? '  ← mức hiện tại sẽ báo nhầm' : ''}`,
      );
  }
  const json = `${JSON.stringify(calibration, null, 2)}\n`;
  if (values.out) await fs.writeFile(values.out, json);
  else process.stdout.write(json);
  process.exit(0);
}
const report = analyzeScene(scene);
const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) await fs.writeFile(values.out, json);
else process.stdout.write(json);
console.error(
  `engine ${report.engine_version}, policy ${report.policy_version}: ${report.total_boxes} cuboid trong ${report.total_frames} frame, ` +
    `${report.cases.length} case từ ${report.min_score} điểm, ${report.warnings.length} dưới mức đó, ${report.gaps.length} chỗ đối tượng vắng mặt.`,
);
for (const [id, { flagged }] of Object.entries(report.checks))
  if (flagged) console.error(`  ${String(flagged).padStart(5)}  ${id}`);
