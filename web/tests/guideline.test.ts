import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  CONFLICT_INSTRUCTION,
  conflictSchema,
  extractGuideline,
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
} from '../server/guideline/model-call.ts';
import { handleGuideline } from '../server/guideline/http.ts';
import { externalExtract } from '../server/guideline/external.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checks } from '../core/risk/engine.ts';
import { POLICY_RULES } from '../shared/policy-rules.ts';

const GUIDELINE = `4.2. Nguyên tắc gán box\nGán nhãn box phải có track_id.\nNgười bên trong xe\n  không gán.`;
const rule = (over) => ({
  id: 'G-01',
  section: '4.2',
  quote: 'Gán nhãn box phải có track_id.',
  kind: 'check',
  level: 'box',
  classes: ['*'],
  condition: 'Box không có track_id',
  quantities: ['box.track_id'],
  verdict: 'flag',
  overrides: [],
  missing_parameters: [],
  needs: [],
  ...over,
});
// Replies are served in order: the rule draft first, then the conflict pass.
const reply = (drafts: any[], { status = 200, state = 'completed' } = {}) => {
  const calls: any[] = [];
  const request = async (url, init) => {
    const draft = drafts[calls.length];
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify(
        status === 200
          ? {
              status: state,
              steps: [
                { type: 'thought' },
                {
                  type: 'model_output',
                  content: [
                    {
                      type: 'text',
                      text: typeof draft === 'string' ? draft : JSON.stringify(draft),
                    },
                  ],
                },
              ],
            }
          : { error: { message: 'quota' } },
      ),
      { status },
    );
  };
  return { calls, request: request as typeof fetch };
};
const run = (draft, options?, conflicts: any = { conflicts: [] }) => {
  const { calls, request } = reply([draft, conflicts], options);
  return { calls, result: extractGuideline(GUIDELINE, { apiKey: 'k', model: 'm', request }) };
};

test('the request asks for schema-bound JSON and keeps the key out of the URL', async () => {
  const { calls, result } = run({ classes: [], rules: [rule({})] });
  assert.equal((await result).rules.length, 1);
  // One rule has nothing to contradict, so the conflict pass is not paid for.
  assert.equal(calls.length, 1);
  const [{ url, init, body }] = calls;
  assert.equal(url.includes('k'), false);
  assert.equal(init.headers['x-goog-api-key'], 'k');
  assert.deepEqual(body.response_format, {
    type: 'text',
    mime_type: 'application/json',
    schema: RESPONSE_SCHEMA,
  });
  assert.equal(body.store, false);
  assert.equal(body.input, `<guideline>\n${GUIDELINE}\n</guideline>`);
  assert.equal(body.system_instruction, SYSTEM_INSTRUCTION);
});

test('the prompt describes every check the model may name', () => {
  for (const { id } of checks) {
    assert.ok(POLICY_RULES[id], `no description for ${id}`);
    assert.ok(SYSTEM_INSTRUCTION.includes(`- ${id}: ${POLICY_RULES[id]}`));
  }
});

test('rules the guideline does not support are rejected, not passed on', async () => {
  const { result } = run({
    classes: [],
    rules: [
      rule({}),
      // Line breaks in the source do not break a quote.
      rule({ id: 'G-02', quote: 'Người bên trong xe không gán.', kind: 'reviewer' }),
      rule({ id: 'G-03', quote: 'Box phải cao hơn 1.5 m.' }),
      rule({ id: 'G-04', needs: ['số điểm LiDAR'] }),
      rule({ id: 'G-05', quantities: [] }),
    ],
  });
  const { rules, rejected } = await result;
  assert.deepEqual(
    rules.map((r) => r.id),
    ['G-01', 'G-02'],
  );
  assert.deepEqual(
    rejected.map((r) => [r.rule.id, r.reason]),
    [
      ['G-03', 'quote_not_in_guideline'],
      ['G-04', 'check_needs_unavailable_data'],
      ['G-05', 'incomplete_check'],
    ],
  );
});

test('how a rule relates to the policy follows from its verdict, not from the model', async () => {
  const { result } = run({
    classes: [],
    rules: [
      rule({ id: 'G-01' }),
      rule({ id: 'G-02', verdict: 'accept', overrides: ['context.person_two_wheeler'] }),
      rule({ id: 'G-03', overrides: ['temporal.class_inconsistency'] }),
      // A rule for the reviewer runs no check, so it cannot replace one.
      rule({
        id: 'G-04',
        kind: 'reviewer',
        level: 'none',
        verdict: 'none',
        quantities: [],
        overrides: ['context.ego_vehicle'],
      }),
    ],
  });
  assert.deepEqual(
    (await result).rules.map((r) => [r.id, r.relation, r.overrides]),
    [
      ['G-01', 'new', []],
      ['G-02', 'looser', ['context.person_two_wheeler']],
      ['G-03', 'stricter', ['temporal.class_inconsistency']],
      ['G-04', 'new', []],
    ],
  );
  // The model is no longer asked for it.
  await assert.rejects(
    run({ classes: [], rules: [rule({ relation: 'looser' })] }).result,
    /sai schema/,
  );
});

test('conflicts come from a second call over the accepted rules, quoted by rule id', async () => {
  const other = rule({ id: 'G-02', quote: 'Người bên trong xe không gán.', kind: 'reviewer' });
  const classes = [{ name: 'person', attributes: [] }];
  const { calls, result } = run(
    { classes, rules: [rule({}), other, rule({ id: 'G-03', quote: 'câu không có' })] },
    undefined,
    {
      conflicts: [
        { rule_ids: ['G-01', 'G-02', 'G-01'], issue: 'a' },
        { rule_ids: ['G-02'], issue: 'b' },
        { rule_ids: [], issue: 'c' },
      ],
    },
  );
  assert.deepEqual((await result).conflicts, [
    { quotes: ['Gán nhãn box phải có track_id.', 'Người bên trong xe không gán.'], issue: 'a' },
    { quotes: ['Người bên trong xe không gán.'], issue: 'b' },
  ]);
  const [, { body }] = calls;
  assert.equal(body.system_instruction, CONFLICT_INSTRUCTION);
  // Only rules that survived verification are compared, and only they can be pointed at.
  assert.deepEqual(body.response_format.schema, conflictSchema(['G-01', 'G-02']));
  assert.ok(body.input.startsWith(`<classes>\n${JSON.stringify(classes)}\n</classes>`));
  assert.equal(body.input.includes('G-03'), false);

  await assert.rejects(
    run({ classes, rules: [rule({}), other] }, undefined, {
      conflicts: [{ rule_ids: ['G-09'], issue: 'x' }],
    }).result,
    /sai schema/,
  );
});

test('anything other than the agreed JSON is an error', async () => {
  await assert.rejects(run('Đây là kết quả: {}').result, /không phải JSON/);
  await assert.rejects(run({ classes: [], rules: [], note: 'x' }).result, /sai schema/);
  await assert.rejects(
    run({ classes: [], rules: [rule({ quantities: ['box.colour'] })] }).result,
    /sai schema/,
  );
  await assert.rejects(
    run({ classes: [], rules: [rule({ overrides: ['made.up'] })] }).result,
    /sai schema/,
  );
  await assert.rejects(run({}, { state: 'incomplete' }).result, /incomplete/);
  await assert.rejects(run({}, { status: 429 }).result, /429: quota/);
  await assert.rejects(extractGuideline(GUIDELINE, { apiKey: '' }), /GEMINI_API_KEY/);
});

test('the analyze route hands the posted text to the model call and returns its result', async () => {
  const post = (body, extract, type = 'application/json') => {
    const req = Object.assign(Readable.from([Buffer.from(body)]), {
      method: 'POST',
      headers: { 'content-type': type },
    });
    let sent;
    const handled = handleGuideline(req as any, {} as any, '/api/guideline/analyze', {
      json: (_res, status, data) => (sent = { status, data }),
      extract,
    });
    return handled.then(() => sent);
  };
  const seen: string[] = [];
  const extract = async (text) => {
    seen.push(text);
    return { model: 'm', classes: [], rules: [], conflicts: [], rejected: [] };
  };
  const sent = await post(JSON.stringify({ text: GUIDELINE }), extract);
  assert.deepEqual(seen, [GUIDELINE]);
  assert.equal(sent.status, 200);
  assert.equal(sent.data.model, 'm');
  await assert.rejects(post(JSON.stringify({ text: ' ' }), extract), /rỗng/);
  await assert.rejects(post('{', extract), /Invalid JSON/);
  await assert.rejects(post(JSON.stringify({ text: 'x'.repeat(600 * 1024) }), extract), /512 KB/);
  await assert.rejects(
    post(JSON.stringify({ text: 'a' }), async () => {
      throw new Error('Gemini API 429: quota');
    }),
    /Không phân tích được guideline: Gemini API 429: quota/,
  );
  assert.equal(
    await handleGuideline({} as any, {} as any, '/api/projects', { json: () => {} }),
    false,
  );
});

test('the line-by-line engine is loaded from the directory it is configured with', async () => {
  // A stand-in for the guideline-rules repo: the two modules the adapter imports.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'guideline-rules-'));
  await fs.mkdir(path.join(dir, 'src'));
  await fs.writeFile(
    path.join(dir, 'src/gemini.ts'),
    `export const createGemini = () => ({ model: 'stub', ask: async () => ({}) });`,
  );
  await fs.writeFile(
    path.join(dir, 'src/extract.ts'),
    `export const extractGuideline = async (text, { checks }) => ({
      lines: 1,
      classes: [],
      rules: [{ id: 'G-001', line: 1, quote: text, checks: Object.keys(checks).length }],
      conflicts: [],
      unclassified: [{ n: 2, text: 'x' }],
      dropped_classes: [],
      errors: [],
    });`,
  );
  try {
    const found: any = await externalExtract(dir)('một dòng');
    assert.equal(found.model, 'stub');
    assert.deepEqual(found.rejected, []);
    assert.deepEqual(found.unclassified, [{ n: 2, text: 'x' }]);
    // It is handed the checks this server runs, each with a description.
    assert.deepEqual(found.rules, [
      { id: 'G-001', line: 1, quote: 'một dòng', checks: checks.length },
    ]);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
  await assert.rejects(externalExtract('/no/such/dir')('x'), /Cannot find module/);
});
