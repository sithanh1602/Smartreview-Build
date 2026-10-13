import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import '../server/env.ts';
import { importAnnotations } from '../core/importers/index.ts';
import { mergeLabels } from '../core/risk/policy.ts';
import { verifierReport, verifierRequest } from '../core/risk/label-verify.ts';
import { labelVerifier } from '../server/verify/label-verifier.ts';

// Checks every box's label against the pixels inside it, with the model in the label-verifier
// repo (docs/label-verifier.md). The report goes to --out (or stdout); progress goes to stderr.
// Usage: npm run verify -- --format FORMAT --input FILE --images IMAGE_DIRECTORY [--out report.json]
const { values } = parseArgs({
  options: {
    format: { type: 'string' },
    input: { type: 'string' },
    images: { type: 'string' },
    out: { type: 'string' },
    dir: { type: 'string' },
  },
});
if (!values.input || !values.images)
  throw new Error(
    'Usage: npm run verify -- --format cvat-images|coco-detection|datumaro|smartreview-json --input FILE --images IMAGE_DIRECTORY [--out report.json] [--dir LABEL_VERIFIER_DIRECTORY]',
  );
const verifier = labelVerifier(values.dir ? path.resolve(values.dir) : undefined);
if (!(await verifier.available()))
  throw new Error(
    `No label verifier at ${verifier.root ?? '(LABEL_VERIFIER_DIR is not set)'}; see docs/label-verifier.md`,
  );
const data = mergeLabels(
  importAnnotations(values.format || 'smartreview-json', await fs.readFile(values.input, 'utf8')),
);
const images = await fs.realpath(values.images);
// Importers name images "images/<file>"; --images is the directory holding <file>.
const { request, skipped } = verifierRequest(data, (frame) =>
  frame.image ? path.join(images, frame.image.replace(/^images\//, '')) : undefined,
);
const response = await verifier.run(request, (done, total) =>
  process.stderr.write(`\r${done}/${total} box`),
);
process.stderr.write('\n');
const report = verifierReport(data, response, skipped);
const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) await fs.writeFile(values.out, json);
else process.stdout.write(json);
console.error(
  `${report.model} (${response.device}): ${report.checked} box đã kiểm, ${report.cases.length} nghi sai nhãn, ` +
    `${report.warnings.length} cảnh báo, ${report.skipped.length} bỏ qua.`,
);
for (const box of report.cases)
  console.error(
    `  ${String(box.score).padStart(3)}  ${box.annotation_id.padEnd(12)} ${box.reason}`,
  );
