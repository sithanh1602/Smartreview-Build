import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { importAnnotations } from '../core/importers/index.ts';
import { analyzeDataset } from '../core/risk/engine.ts';
import { applyEnvRisk, parseImageTable } from '../core/importers/signals.ts';

const { values } = parseArgs({
  options: {
    format: { type: 'string' },
    input: { type: 'string' },
    out: { type: 'string' },
    images: { type: 'string' },
    metadata: { type: 'string' },
    id: { type: 'string' },
  },
});
if (!values.format || !values.input || !values.out)
  throw new Error(
    'Usage: npm run import -- --format cvat-images|coco-detection|smartreview-json --input FILE --out NEW_DIRECTORY [--images IMAGE_DIRECTORY] [--metadata IMAGES_CSV] [--id DATASET_ID]',
  );
const data = importAnnotations(values.format, await fs.readFile(values.input, 'utf8'), {
  ...(values.id ? { id: values.id } : {}),
});
if (values.metadata)
  applyEnvRisk(data, parseImageTable(await fs.readFile(values.metadata, 'utf8')));
const destination = path.resolve(values.out);
// A new directory is required, preserving every earlier import.
await fs.mkdir(destination, { recursive: false });
try {
  for (const frame of data.frames) {
    if (!frame.image) continue;
    const base = await fs.realpath(
      ['cvat-images', 'coco-detection'].includes(values.format)
        ? values.images || path.dirname(values.input)
        : path.dirname(values.input),
    );
    const relative = ['cvat-images', 'coco-detection'].includes(values.format)
      ? frame.image.slice('images/'.length)
      : frame.image;
    const source = await fs.realpath(path.resolve(base, relative));
    if (!source.startsWith(base + path.sep)) throw new Error('Image path escapes input directory');
    const target = path.join(destination, frame.image);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  const report = analyzeDataset(data);
  await fs.writeFile(path.join(destination, 'dataset.json'), JSON.stringify(data, null, 2));
  await fs.writeFile(path.join(destination, 'risk-report.json'), JSON.stringify(report, null, 2));
  console.log(
    `Imported ${data.annotations.length} annotations, ${report.cases.length} suspicious cases into ${destination}`,
  );
} catch (error) {
  throw new Error(
    `Import incomplete at ${destination}; no dataset is published until all images copy successfully. ${(error as Error).message}`,
  );
}
