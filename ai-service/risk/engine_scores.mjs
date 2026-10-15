// Bridge: run the web app's own risk engine over detector output, so the
// benchmark measures the engine that ships, not a Python re-implementation.
// Usage: node engine_scores.mjs <predictions.json> <out.json> [engineVersion]
import fs from 'node:fs';
import { analyzeDataset, LATEST_ENGINE_VERSION } from '../../web/core/risk/engine.ts';

const [input, output, version = LATEST_ENGINE_VERSION] = process.argv.slice(2);
const WORKING_CONF = 0.3;
const { frames } = JSON.parse(fs.readFileSync(input, 'utf8'));
const dataset = {
  schema_version: '1.0.0',
  dataset: { id: 'bdd100k-subset', name: 'BDD100K subset predictions' },
  media: [],
  frames: [],
  annotations: [],
};
for (const [name, boxes] of Object.entries(frames)) {
  dataset.media.push({ id: name, type: 'image', name, width: 1280, height: 720 });
  dataset.frames.push({ id: name, media_id: name, index: 0 });
  boxes
    .filter((b) => b.confidence >= WORKING_CONF)
    .forEach((b, i) =>
      dataset.annotations.push({
        id: `${name}#${i}`,
        frame_id: name,
        label: b.label,
        confidence: b.confidence,
        geometry: { type: 'bbox', x: b.x, y: b.y, width: b.width, height: b.height },
        source: { kind: 'model', name: 'yolo11n' },
      }),
    );
}
const report = analyzeDataset(dataset, { engineVersion: version });
const perImage = {};
for (const r of report.results) {
  const image = r.reference.frame_id;
  const entry = (perImage[image] ??= { max: 0, sum: 0, cases: 0 });
  entry.max = Math.max(entry.max, r.score);
  entry.sum += r.score;
  if (r.score >= report.min_score) entry.cases++;
}
fs.writeFileSync(output, JSON.stringify({ engine_version: report.engine_version, perImage }));
console.log(`engine ${report.engine_version}: ${report.results.length} boxes, ${report.cases.length} cases`);
