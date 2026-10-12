import { normalizeDataset } from '../schema/normalize.ts';
import { importCvatImages } from './cvat-images.ts';
import { importCocoDetection } from './coco-detection.ts';
import { applySignals } from './signals.ts';
import { FORMAT_INFO, PARSERS, isFormat } from './catalog.ts';
import type { FormatId, FormatInfo, SourceFile } from './catalog.ts';
import type { ImportOptions } from './signals.ts';
import type { Dataset } from '../schema/types.ts';

export { FORMAT_INFO, detectFormats, imageResolver, isFormat, namesImages } from './catalog.ts';
export type { FormatId, FormatInfo, SourceFile } from './catalog.ts';
export interface FormatSpec extends FormatInfo {
  // Reads an annotation set into a dataset that passed the schema.
  read(files: SourceFile[], options?: ImportOptions): Dataset;
}
const single =
  (read: (text: string, options?: ImportOptions) => Dataset) =>
  (files: SourceFile[], options?: ImportOptions) => {
    if (files.length !== 1) throw new Error('Định dạng này cần đúng một tệp nhãn.');
    return read(files[0].text, options);
  };
function importNative(text: string) {
  const data = JSON.parse(text);
  if (Array.isArray(data?.annotations))
    for (const a of data.annotations) if (a && typeof a === 'object') applySignals(a);
  return normalizeDataset(data);
}
// The three older importers validate as they go; the rest are validated here.
const VALIDATING: Partial<Record<FormatId, FormatSpec['read']>> = {
  'cvat-images': single(importCvatImages),
  'coco-detection': single(importCocoDetection),
  'smartreview-json': single(importNative),
};
export const FORMAT_SPECS = Object.fromEntries(
  (Object.keys(FORMAT_INFO) as FormatId[]).map((id) => [
    id,
    {
      ...FORMAT_INFO[id],
      read:
        VALIDATING[id] ??
        ((files: SourceFile[], options?: ImportOptions) =>
          normalizeDataset(PARSERS[id]!(files, options))),
    },
  ]),
) as Record<FormatId, FormatSpec>;

export function importDataset(format: string, files: SourceFile[], options?: ImportOptions) {
  if (!isFormat(format))
    throw new Error(
      `Unsupported importer ${format}; available: ${Object.keys(FORMAT_SPECS).join(', ')}`,
    );
  return FORMAT_SPECS[format].read(files, options);
}
