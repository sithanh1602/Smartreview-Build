import './env.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const projectRoot = path.resolve(process.env.SMARTREVIEW_ROOT || path.join(webRoot, '..'));

export const datasetPath = path.resolve(
  process.env.SMARTREVIEW_DATASET || path.join(webRoot, 'datasets/demo/dataset.json'),
);
