import { normalizeDataset } from '../schema/normalize.mjs';
import { importCvatImages } from './cvat-images.mjs';
import { importCocoDetection } from './coco-detection.mjs';

export const importers = {
  'smartreview-json': (text) => normalizeDataset(JSON.parse(text)),
  'cvat-images': importCvatImages,
  'coco-detection': importCocoDetection,
};
export function importAnnotations(format, text, options) {
  const importer = Object.hasOwn(importers, format) ? importers[format] : null;
  if (!importer)
    throw new Error(
      `Unsupported importer ${format}; available: ${Object.keys(importers).join(', ')}`,
    );
  return importer(text, options);
}
