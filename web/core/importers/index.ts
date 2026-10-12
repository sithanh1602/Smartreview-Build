import { FORMAT_SPECS, importDataset, isFormat } from './formats.ts';
import type { SourceFile } from './formats.ts';
import type { ImportOptions } from './signals.ts';
import type { Dataset } from '../schema/types.ts';

export {
  FORMAT_SPECS,
  detectFormats,
  imageResolver,
  importDataset,
  isFormat,
  namesImages,
} from './formats.ts';
export type { FormatId, FormatInfo, FormatSpec, SourceFile } from './formats.ts';
export type Importer = (text: string, options?: ImportOptions) => Dataset;

// The formats that are one text file, kept under this name for callers that read one file.
export const importers: Record<string, Importer> = Object.fromEntries(
  Object.entries(FORMAT_SPECS)
    .filter(([, spec]) => !spec.multiple)
    .map(([id, spec]) => [
      id,
      (text: string, options?: ImportOptions) => spec.read([{ name: id, text }], options),
    ]),
);
// `source` is the text of a single annotation file, or the files of a per-image format.
export function importAnnotations(
  format: string,
  source: string | SourceFile[],
  options?: ImportOptions,
) {
  if (!isFormat(format))
    throw new Error(
      `Unsupported importer ${format}; available: ${Object.keys(FORMAT_SPECS).join(', ')}`,
    );
  return importDataset(
    format,
    typeof source === 'string' ? [{ name: format, text: source }] : source,
    options,
  );
}
