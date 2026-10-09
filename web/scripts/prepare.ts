import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, webRoot } from '../server/config.ts';
import { importDemo } from '../core/importers/demo.ts';
import { analyzeDataset } from '../core/risk/engine.ts';

const python = process.env.SMARTREVIEW_PYTHON || path.join(projectRoot, '.venv/bin/python');
const output = path.join(webRoot, 'datasets/demo');
await fs.mkdir(output, { recursive: true });
const run = (args: string[]) => {
  const result = spawnSync(python, [path.join(webRoot, 'scripts/extract_frames.py'), ...args], {
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result.stdout;
};
const video = path.join(projectRoot, 'data/traffic_test.mp4');
const meta = JSON.parse(run(['probe', video]));
const tracks = JSON.parse(await fs.readFile(path.join(projectRoot, 'outputs/tracks.json'), 'utf8'));
const data = importDemo(tracks, meta);
const analysis = analyzeDataset(data);
const annotationFrames = new Map(data.annotations.map((a) => [a.id, a.frame_id]));
const required = new Set(
  process.argv.includes('--all-frames')
    ? data.frames.map((f) => f.id)
    : analysis.cases.flatMap((c) => Object.values(c.context).map((id) => annotationFrames.get(id))),
);
const indices = data.frames.filter((f) => required.has(f.id)).map((f) => f.index);
const request = path.join(output, 'extraction-request.json');
await fs.writeFile(request, JSON.stringify(indices));
run(['extract', video, path.join(output, 'frames'), request]);
for (const frame of data.frames)
  if (required.has(frame.id)) frame.image = `frames/${frame.index}.jpg`;
await fs.writeFile(path.join(output, 'dataset.json.tmp'), JSON.stringify(data, null, 2));
await fs.rename(path.join(output, 'dataset.json.tmp'), path.join(output, 'dataset.json'));
await fs.writeFile(path.join(output, 'risk-report.json'), JSON.stringify(analysis, null, 2));
console.log(
  `Imported ${data.annotations.length} annotations; ${analysis.cases.length} cases, ${indices.length} frames. Schema ${data.schema_version}.`,
);
