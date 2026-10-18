import React from 'react';
import {
  RUN_SCORE,
  RUN_TEMPLATES,
  describeRun,
  ruleLabels,
  runMismatch,
  runProblem,
  type RunSpec,
  type RunTemplate,
} from '../../../shared/guideline-rules.ts';
import type { RuleDraft } from '../../../server/guideline/model-call.ts';

const field = 'field mt-1 min-h-8 py-1 text-xs';

// How a new or stricter guideline rule runs as a check: a template of the policy and the numbers
// the guideline gives. The fields are uncontrolled so a number or a list can be typed freely;
// changing the template starts them afresh.
export function RunEditor({
  rule,
  spec,
  onChange,
}: {
  rule: RuleDraft;
  spec: RunSpec | undefined;
  onChange: (spec: RunSpec | undefined) => void;
}) {
  const labels = ruleLabels(rule.classes);
  const problem = spec && runProblem(spec);
  // A run that says the opposite of the guideline (another score, the other side of the
  // number) is flagged here, before it scores a project.
  const mismatch = spec && !problem ? runMismatch(rule, spec) : null;
  const set = (key: string, value: unknown) =>
    spec && onChange({ ...spec, params: { ...spec.params, [key]: value } });
  return (
    <div
      className="rounded-lg border border-line bg-panel p-3 text-xs"
      data-testid={`run-${rule.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56">
          Chạy thành check
          <select
            className={field}
            aria-label={`Cách kiểm tra ${rule.id}`}
            value={spec?.template ?? ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? {
                      template: e.target.value as RunTemplate,
                      params: {},
                      score: spec?.score ?? RUN_SCORE,
                    }
                  : undefined,
              )
            }
          >
            <option value="">Không chạy, chỉ ghi lại</option>
            {(Object.keys(RUN_TEMPLATES) as RunTemplate[]).map((t) => (
              <option key={t} value={t}>
                {RUN_TEMPLATES[t].name}
              </option>
            ))}
          </select>
        </label>
        {spec &&
          RUN_TEMPLATES[spec.template].fields.map((f) => (
            <label key={spec.template + f.key} className="w-36">
              {f.label}
              {f.optional && <span className="text-muted"> (tuỳ chọn)</span>}
              {f.kind === 'choice' ? (
                <select
                  className={field}
                  value={String(spec.params[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value || undefined)}
                >
                  <option value="">—</option>
                  {f.options!.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={field}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined}
                  placeholder={f.kind === 'list' ? 'cách nhau bởi dấu phẩy' : undefined}
                  defaultValue={
                    Array.isArray(spec.params[f.key])
                      ? (spec.params[f.key] as string[]).join(', ')
                      : String(spec.params[f.key] ?? '')
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (f.kind === 'list')
                      set(
                        f.key,
                        raw
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      );
                    else set(f.key, raw ? Number(raw.replace(',', '.')) : undefined);
                  }}
                />
              )}
            </label>
          ))}
        {spec && (
          <label className="w-20">
            Điểm
            <input
              key={spec.template}
              className={field}
              inputMode="numeric"
              defaultValue={spec.score}
              onChange={(e) => onChange({ ...spec, score: Number(e.target.value) })}
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-muted">
        {!labels.length
          ? 'Không có nhãn nào của policy trong quy tắc này, nên check sẽ không chạy.'
          : `Áp cho nhãn: ${labels.join(', ')}.`}{' '}
        {spec && RUN_TEMPLATES[spec.template].model && 'Chỉ chạy trên box có confidence của model.'}
        {spec?.template === 'score_range' &&
          (spec.params.source === 'confidence'
            ? 'Box không có confidence (box người vẽ) được bỏ qua.'
            : 'Box chưa có rescore (chưa chấm điểm bằng model khi import) được bỏ qua.')}
      </p>
      {spec && !problem && (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
          <dt className="text-muted">Guideline</dt>
          <dd>“{rule.condition}”</dd>
          <dt className="text-muted">Check sẽ chạy</dt>
          <dd className="font-semibold" data-testid={`run-says-${rule.id}`}>
            {describeRun(spec)}
          </dd>
        </dl>
      )}
      {mismatch && (
        <p
          className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 font-semibold text-amber-900"
          role="alert"
          data-testid={`run-mismatch-${rule.id}`}
        >
          ⚠ {mismatch} Sửa cách chạy cho khớp guideline trước khi tạo project.
        </p>
      )}
      {problem && (
        <p className="mt-1 text-rose-700" role="alert">
          {problem} Check này chưa chạy.
        </p>
      )}
    </div>
  );
}
