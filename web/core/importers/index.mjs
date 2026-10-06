import { normalizeDataset } from '../schema/normalize.mjs';
import { importCvatImages } from './cvat-images.mjs';

export const importers = {
  'smartreview-json': (text) => normalizeDataset(JSON.parse(text)),
  'cvat-images': importCvatImages,
};
export function importAnnotations(format, text, options) {
  const importer = importers[format];
  if (!importer)
    throw new Error(
      `Unsupported importer ${format}; available: ${Object.keys(importers).join(', ')}`,
    );
  return importer(text, options);
}
