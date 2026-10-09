import { normalizeDataset } from '../schema/normalize.ts';
import { importCvatImages } from './cvat-images.ts';
import { importCocoDetection } from './coco-detection.ts';
import { applySignals } from './signals.ts';
import type { ImportOptions } from './signals.ts';
import type { Dataset } from '../schema/types.ts';

export type Importer = (text: string, options?: ImportOptions) => Dataset;

export const importers: Record<string, Importer> = {
  'smartreview-json': (text) => {
    const data = JSON.parse(text);
    if (Array.isArray(data?.annotations))
      for (const a of data.annotations) if (a && typeof a === 'object') applySignals(a);
    return normalizeDataset(data);
  },
  'cvat-images': importCvatImages,
  'coco-detection': importCocoDetection,
};
export function importAnnotations(format: string, text: string, options?: ImportOptions) {
  const importer = Object.hasOwn(importers, format) ? importers[format] : null;
  if (!importer)
    throw new Error(
      `Unsupported importer ${format}; available: ${Object.keys(importers).join(', ')}`,
    );
  return importer(text, options);
}
