import './env.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const projectRoot = path.resolve(process.env.SMARTREVIEW_ROOT || path.join(webRoot, '..'));
// The Python of the repo's .venv (setup.sh): Windows keeps it in Scripts/, everything else in bin/.
export const venvPython = path.join(
  projectRoot,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);

export const datasetPath = path.resolve(
  process.env.SMARTREVIEW_DATASET || path.join(webRoot, 'datasets/demo/dataset.json'),
);
