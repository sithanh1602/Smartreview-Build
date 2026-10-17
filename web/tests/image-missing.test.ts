import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImageRules } from '../core/risk/image-rules.ts';
import type { Policy } from '../core/risk/rules.ts';

const policy = {
  frameRules: [
    {
      id: 'coverage.model_missing',
      template: 'model_missing',
      params: { labels: ['car'], min_confidence: 0.4 },
    },
  ],
} as unknown as Policy;
const [rule] = buildImageRules(policy);
const hint = (confidence: number) => ({
  label: 'car',
  confidence,
  geometry: { type: 'bbox' as const, x: 0, y: 0, width: 10, height: 10 },
});
const base = { drafts: [], greys: [], missing: [] };

test('model_missing judges hints on the scoring model floor, not the policy default', () => {
  // Cut at yolo26s' own 0.3055: kept here, dropped under the policy 0.4.
  assert.ok(rule.run({ ...base, hints: [hint(0.35)], flagged: [], model_confidence: 0.3055 }));
  assert.equal(rule.run({ ...base, hints: [hint(0.35)], flagged: [] }), null);
});

test('the model floor still cuts, it only lowers the bar', () => {
  assert.equal(
    rule.run({ ...base, hints: [hint(0.2)], flagged: [], model_confidence: 0.3055 }),
    null,
  );
  assert.ok(rule.run({ ...base, hints: [hint(0.45)], flagged: [] }));
});
