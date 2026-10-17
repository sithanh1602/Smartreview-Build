import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../core/risk/checks/templates.ts';
import type { StaticContext } from '../core/risk/checks/shared.ts';

const rule = { params: { below: 0.02, warning_side_below_px: 16 } } as never;
const ctx = (rescore: number, rescore_floor?: number) =>
  ({
    current: { attributes: { rescore } },
    box: { width: 100, height: 100 },
    rescore_floor,
  }) as unknown as StaticContext;

test('rescore_low judges on the scoring model floor, not the policy default', () => {
  const test = TEMPLATES.rescore_low.test as (rule: never, ctx: StaticContext) => unknown;
  // Measured at 0.05: 0.03 flags here, passes under the policy 0.02.
  assert.ok(test(rule, ctx(0.03, 0.05)));
  assert.ok(!test(rule, ctx(0.03)));
});

test('the model floor still cuts, it only moves the bar', () => {
  const test = TEMPLATES.rescore_low.test as (rule: never, ctx: StaticContext) => unknown;
  assert.ok(!test(rule, ctx(0.06, 0.05)));
  assert.ok(test(rule, ctx(0.01)));
});
