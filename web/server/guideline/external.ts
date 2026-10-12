import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checks } from '../../core/risk/engine.ts';
import { POLICY_RULES } from '../../shared/policy-rules.ts';
import { webRoot } from '../config.ts';
import type { GuidelineExtraction } from './model-call.ts';

// The guideline-rules repo next to SmartReview works line by line instead of in one call: no
// line of the guideline is dropped silently. It is loaded at run time, from the directory
// GUIDELINE_RULES_DIR names, so SmartReview still runs on a machine that does not have it.
export function externalExtract(dir: string) {
  const load = (file: string) =>
    import(pathToFileURL(path.resolve(webRoot, dir, 'src', file)).href);
  return async (text: string): Promise<GuidelineExtraction> => {
    const [{ extractGuideline }, { createGemini }] = await Promise.all([
      load('extract.ts'),
      load('gemini.ts'),
    ]);
    const gemini = createGemini();
    const found = await extractGuideline(text, {
      ask: gemini.ask,
      // The checks this server runs today, not the snapshot kept in that repo.
      checks: Object.fromEntries(checks.map((c) => [c.id, POLICY_RULES[c.id] ?? 'chưa có mô tả'])),
    });
    // That engine sends a doubtful check to the reviewer instead of rejecting it.
    return { ...found, model: gemini.model, rejected: [] };
  };
}
