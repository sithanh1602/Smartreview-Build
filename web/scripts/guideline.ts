import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import '../server/env.ts';
import { extractGuideline } from '../server/guideline/model-call.ts';

// npm run guideline:extract -- path/to/guideline.txt [--out rules.json] [--model MODEL]
// The JSON goes to stdout (or --out) and nothing else does; progress goes to stderr.
const { values, positionals } = parseArgs({
  options: { out: { type: 'string' }, model: { type: 'string' } },
  allowPositionals: true,
});
const [file] = positionals;
if (!file) throw new Error('Dùng: npm run guideline:extract -- <guideline.txt> [--out rules.json]');
const result = await extractGuideline(await fs.readFile(file, 'utf8'), {
  ...(values.model && { model: values.model }),
});
const json = `${JSON.stringify(result, null, 2)}\n`;
if (values.out) await fs.writeFile(values.out, json);
else process.stdout.write(json);
const count = (kind: string) => result.rules.filter((r) => r.kind === kind).length;
console.error(
  `${result.model}: ${result.classes.length} class, ${count('check')} check, ` +
    `${count('reviewer')} cho reviewer, ${count('definition')} định nghĩa, ` +
    `${result.conflicts.length} mâu thuẫn, ${result.rejected.length} bị loại.`,
);
