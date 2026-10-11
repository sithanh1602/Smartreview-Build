import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { request } from '../../lib/api';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import { POLICY_RULES } from '../../../shared/policy-rules.ts';
import { waiversFrom } from '../../../shared/guideline-waivers.ts';
import { analysisMarkdown, downloadText } from './analysisMarkdown';
import type { GuidelineExtraction, RuleDraft } from '../../../server/guideline/model-call.ts';

const RELATIONS: Record<RuleDraft['relation'], string> = {
  new: 'Mới',
  stricter: 'Chặt hơn',
  looser: 'Nới hơn',
};

// Which rule a person keeps where a guideline rule meets the tool's own policy.
export type Choice = 'guideline' | 'policy';
export type Choices = Record<string, Choice>;
type View = 'compare' | 'reviewer' | 'conflicts';
const TONE: Record<RuleDraft['relation'], string> = {
  new: 'bg-accent/10 text-accent',
  stricter: 'bg-rose-500/10 text-rose-700',
  looser: 'bg-amber-500/15 text-amber-700',
};
const th = 'sticky top-0 z-10 bg-panel px-3 py-2 text-left font-semibold whitespace-nowrap';
const td = 'px-3 py-3 align-top';
// Rows alternate in shade so a long table stays easy to follow across its columns.
const zebra = 'border-t border-line odd:bg-panel even:bg-slate-100';

function Pick({
  rule,
  value,
  onChange,
}: {
  rule: RuleDraft;
  value: Choice | undefined;
  onChange: (choice: Choice) => void;
}) {
  const fresh = rule.relation === 'new';
  const options: [Choice, string][] = [
    ['guideline', fresh ? 'Thêm vào' : 'Theo guideline'],
    ['policy', fresh ? 'Bỏ qua' : 'Giữ policy'],
  ];
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={`Chọn cho ${rule.id}`}>
      {options.map(([choice, label]) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={value === choice}
          onClick={() => onChange(choice)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
            value === choice
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-panel hover:border-accent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function RulesModal({
  result,
  open,
  onOpenChange,
  choices,
  onChoices,
  source,
}: {
  result: GuidelineExtraction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: Choices;
  onChoices: (choices: Choices) => void;
  // Name of the guideline, for the heading and the file name of the download.
  source: string;
}) {
  const [view, setView] = useState<View>('compare');
  const of = (kind: RuleDraft['kind']) => result.rules.filter((r) => r.kind === kind);
  const compared = of('check'),
    chosen = compared.filter((r) => choices[r.id]).length;
  const views: [View, string, number][] = [
    ['compare', 'So sánh với policy', compared.length],
    ['reviewer', 'Cần người kiểm tra', of('reviewer').length],
    ['conflicts', 'Mâu thuẫn', result.conflicts.length],
  ];
  const all = (choice: Choice) =>
    onChoices({ ...choices, ...Object.fromEntries(compared.map((r) => [r.id, choice])) });
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size="cover" scroll="inside">
          <Modal.Dialog aria-label="Kiểm tra rules">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Kiểm tra rules</Modal.Heading>
              <p className="text-xs text-muted">
                Đặt quy tắc rút từ guideline cạnh quy tắc policy đang chạy trong công cụ, rồi chọn
                bên nào nên dùng.
              </p>
            </Modal.Header>
            <Modal.Body>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2" role="tablist">
                  {views.map(([id, title, total]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={view === id}
                      disabled={!total}
                      onClick={() => setView(id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                        view === id
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-line hover:border-accent'
                      }`}
                    >
                      {title} <span className="font-normal">{total}</span>
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted">
                  {view === 'compare' && compared.length > 0 && (
                    <>
                      <span data-testid="chosen">
                        Đã chọn {chosen}/{compared.length}
                      </span>
                      <Button size="sm" variant="outline" onPress={() => all('guideline')}>
                        Tất cả theo guideline
                      </Button>
                      <Button size="sm" variant="outline" onPress={() => all('policy')}>
                        Tất cả giữ policy
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      downloadText(
                        `${source.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'guideline'}-phan-tich.md`,
                        analysisMarkdown(result, choices, source),
                      )
                    }
                  >
                    <Icon name="download" />
                    Tải về (.md)
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                {view === 'compare' ? (
                  <table className="w-full min-w-[52rem] border-collapse text-sm">
                    <thead>
                      <tr className="eyebrow">
                        <th className={`${th} w-[36%]`}>Quy tắc từ guideline</th>
                        <th className={th}>So sánh</th>
                        <th className={`${th} w-[36%]`}>Policy đang áp dụng</th>
                        <th className={th}>Chọn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compared.map((rule) => (
                        <tr key={rule.id} className={zebra}>
                          <td className={td}>
                            <p>{rule.condition}</p>
                            <p className="mt-1 text-xs text-muted">
                              {rule.id} · § {rule.section} · {rule.classes.join(', ')}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted italic">
                              “{rule.quote}”
                            </p>
                            {rule.missing_parameters.length > 0 && (
                              <p className="mt-1 text-xs text-amber-700">
                                Guideline chưa nêu: {rule.missing_parameters.join('; ')}
                              </p>
                            )}
                          </td>
                          <td className={td}>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[rule.relation]}`}
                            >
                              {RELATIONS[rule.relation]}
                            </span>
                          </td>
                          <td className={td}>
                            {rule.overrides.length ? (
                              rule.overrides.map((id) => (
                                <div key={id} className="mb-2 last:mb-0">
                                  <p>{POLICY_RULES[id] ?? 'Chưa có mô tả cho kiểm tra này.'}</p>
                                  <p className="mt-1 text-xs text-muted">{id}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-muted">Chưa có quy tắc tương ứng trong công cụ.</p>
                            )}
                          </td>
                          <td className={td}>
                            <Pick
                              rule={rule}
                              value={choices[rule.id]}
                              onChange={(choice) => onChoices({ ...choices, [rule.id]: choice })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : view === 'reviewer' ? (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="eyebrow">
                        <th className={`${th} w-1/2`}>Yêu cầu trong guideline</th>
                        <th className={th}>Vì sao công cụ chưa tự kiểm được</th>
                      </tr>
                    </thead>
                    <tbody>
                      {of('reviewer').map((rule) => (
                        <tr key={rule.id} className={zebra}>
                          <td className={td}>
                            <p>{rule.condition}</p>
                            <p className="mt-1 text-xs text-muted">
                              {rule.id} · § {rule.section}
                            </p>
                          </td>
                          <td className={`${td} text-muted`}>
                            {rule.needs.length
                              ? `Cần thêm dữ liệu: ${rule.needs.join('; ')}`
                              : 'Cần nhìn ảnh hoặc phán đoán của con người.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="eyebrow">
                        <th className={`${th} w-1/2`}>Vấn đề</th>
                        <th className={th}>Câu trích từ guideline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.conflicts.map((c, i) => (
                        <tr key={i} className={zebra}>
                          <td className={td}>{c.issue}</td>
                          <td className={`${td} space-y-1 text-muted`}>
                            {c.quotes.map((q, j) => (
                              <p key={j}>{q}</p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">
                Lựa chọn được lưu kèm dự án khi tạo, ai cũng chọn được (chưa phân quyền). Công cụ
                chưa tự đổi cách chấm điểm theo lựa chọn này.
              </p>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Sends the guideline text to the backend model call (server/guideline/model-call.ts) and shows
// the rule drafts it returns. `read` is null while there is no text to analyse.
export function GuidelineAnalysis({
  read,
  stamp,
  unavailable,
  onReviewed,
  name = '',
}: {
  // File name of the guideline, when it came from a file.
  name?: string;
  // Called with the analysis and the choices made so far, or null once they no longer apply.
  onReviewed?: (reviewed: { result: GuidelineExtraction; choices: Choices } | null) => void;
  read: (() => Promise<string>) | null;
  // Changes whenever the guideline source changes, which discards the previous result.
  stamp: string;
  unavailable?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<GuidelineExtraction | null>(null),
    [open, setOpen] = useState(false),
    [choices, setChoices] = useState<Choices>({});
  const report = useRef(onReviewed);
  report.current = onReviewed;
  useEffect(() => {
    report.current?.(result && { result, choices });
  }, [result, choices]);
  const turn = useRef(0);
  useEffect(() => {
    turn.current++;
    setBusy(false);
    setError('');
    setResult(null);
    setChoices({});
  }, [stamp]);
  async function analyse() {
    if (!read) return;
    const current = ++turn.current;
    setBusy(true);
    setError('');
    setResult(null);
    setChoices({});
    try {
      const text = await read();
      const found = await request<GuidelineExtraction>('/guideline/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (current === turn.current) setResult(found);
    } catch (e) {
      if (current === turn.current) setError((e as Error).message);
    } finally {
      if (current === turn.current) setBusy(false);
    }
  }
  const count = (kind: RuleDraft['kind']) => result?.rules.filter((r) => r.kind === kind).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" isDisabled={!read || busy} onPress={analyse}>
          {busy ? <Spinner /> : <Icon name="focus" />}
          Phân tích Guideline
        </Button>
        <span className="min-w-0 flex-1 text-xs text-muted">
          {busy
            ? 'Đang phân tích, có thể mất vài phút…'
            : (unavailable ??
              'Gửi nội dung guideline tới mô hình ở backend (Gemini) để rút ra bản nháp quy tắc.')}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {result && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-slate-50 p-3"
          data-testid="guideline-analysis"
        >
          <p className="min-w-0 flex-1 text-xs text-muted">
            <span className="font-semibold text-slate-900">Đã phân tích xong.</span>{' '}
            {count('check')} quy tắc so được với policy · {count('reviewer')} cần người kiểm tra ·{' '}
            {result.conflicts.length} mâu thuẫn · đã chọn{' '}
            {result.rules.filter((r) => r.kind === 'check' && choices[r.id]).length}
            {' · '}
            <span data-testid="guideline-waivers">
              {
                Object.keys(
                  waiversFrom({ rules: result.rules, choices }, Object.keys(POLICY_RULES)),
                ).length
              }{' '}
              check sẽ tắt khi chấm
            </span>
            {Boolean(result.unclassified?.length || result.errors?.length) && (
              <span className="mt-1 block text-rose-700" data-testid="guideline-gaps">
                {result.unclassified?.length ?? 0} dòng của guideline chưa được phân loại
                {result.errors?.length ? ` · ${result.errors.length} lần gọi mô hình bị lỗi` : ''}.
                Hãy đọc lại các dòng này bằng tay hoặc phân tích lại.
              </span>
            )}
          </p>
          <Button variant="primary" onPress={() => setOpen(true)}>
            <Icon name="grid" />
            Kiểm tra rules
          </Button>
          <RulesModal
            result={result}
            open={open}
            onOpenChange={setOpen}
            choices={choices}
            onChoices={setChoices}
            source={name}
          />
        </div>
      )}
    </div>
  );
}
