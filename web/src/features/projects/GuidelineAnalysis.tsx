import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { request } from '../../lib/api';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../components/Icon';
import { POLICY_RULES } from '../../../shared/policy-rules.ts';
import { waiversFrom } from '../../../shared/guideline-waivers.ts';
import {
  MAX_CAPTIONS,
  POLICY_LABELS,
  guessRun,
  patchesFrom,
  ruleLabels,
  runnable,
  type RunSpec,
} from '../../../shared/guideline-rules.ts';
import { RunEditor } from './RunEditor';
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
// How each chosen new or stricter rule runs, and captions per label for the label verifier.
export type Runs = Record<string, RunSpec | undefined>;
export type Captions = Record<string, string[]>;
export interface Reviewed {
  result: GuidelineExtraction;
  choices: Choices;
  runs: Runs;
  captions: Captions;
}
type View = 'compare' | 'reviewer' | 'captions' | 'conflicts';
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

// The guideline's definitions next to the captions the label verifier reads for each label of
// the policy. A caption is a short English phrase, one per line ("a photo of a delivery tricycle").
function CaptionsView({
  definitions,
  captions,
  onCaptions,
}: {
  definitions: RuleDraft[];
  captions: Captions;
  onCaptions: (captions: Captions) => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm">
      <p className="text-xs text-muted">
        Model xét box so phần ảnh trong box với các câu mô tả (caption) tiếng Anh của từng nhãn. Câu
        bạn thêm ở đây được ghép vào câu có sẵn của policy, để model hiểu nhãn theo guideline (ví dụ
        “a photo of a person riding a motorcycle” cho person). Mỗi dòng một câu, tối đa{' '}
        {MAX_CAPTIONS} câu mỗi nhãn. Bảng điểm của model đã đo với câu có sẵn, nên thêm câu có thể
        làm điểm lệch đi.
      </p>
      {POLICY_LABELS.map((label) => {
        const own = definitions.filter((r) =>
          ruleLabels(r.classes).some((l) => l === label || l === '*'),
        );
        return (
          <div key={label} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-2">
            <div>
              <p className="font-semibold">{label}</p>
              {own.length ? (
                own.map((r) => (
                  <p key={r.id} className="mt-1 text-xs text-muted">
                    {r.id} · {r.condition}
                  </p>
                ))
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Guideline không định nghĩa riêng nhãn này.
                </p>
              )}
            </div>
            <textarea
              aria-label={`Caption cho ${label}`}
              className="field min-h-16 text-xs"
              placeholder="a photo of …"
              defaultValue={(captions[label] ?? []).join('\n')}
              onChange={(e) =>
                onCaptions({
                  ...captions,
                  [label]: e.target.value
                    .split('\n')
                    .map((c) => c.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function RulesModal({
  result,
  open,
  onOpenChange,
  choices,
  onChoices,
  runs,
  onRuns,
  captions,
  onCaptions,
  source,
}: {
  result: GuidelineExtraction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: Choices;
  onChoices: (choices: Choices) => void;
  runs: Runs;
  onRuns: (runs: Runs) => void;
  captions: Captions;
  onCaptions: (captions: Captions) => void;
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
    ['captions', 'Định nghĩa nhãn', of('definition').length],
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
                      disabled={!total && id !== 'captions'}
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
                        <React.Fragment key={rule.id}>
                          <tr className={zebra}>
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
                                <p className="text-muted">
                                  Chưa có quy tắc tương ứng trong công cụ.
                                </p>
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
                          {runnable(rule) && choices[rule.id] === 'guideline' && (
                            <tr className="border-t border-dashed border-line">
                              <td colSpan={4} className="px-3 pb-3">
                                <RunEditor
                                  rule={rule}
                                  spec={runs[rule.id]}
                                  onChange={(spec) => onRuns({ ...runs, [rule.id]: spec })}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
                ) : view === 'captions' ? (
                  <CaptionsView
                    definitions={of('definition')}
                    captions={captions}
                    onCaptions={onCaptions}
                  />
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
                Lựa chọn được lưu kèm dự án khi tạo. Quy tắc nới hơn mà bạn chọn theo guideline sẽ
                tắt check tương ứng; quy tắc mới hoặc chặt hơn chỉ chạy khi đã chọn cách kiểm tra và
                điền đủ số. Caption ở tab Định nghĩa nhãn được gửi kèm cho model xét box.
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
  onReviewed?: (reviewed: Reviewed | null) => void;
  read: (() => Promise<string>) | null;
  // Changes whenever the guideline source changes, which discards the previous result.
  stamp: string;
  unavailable?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<GuidelineExtraction | null>(null),
    [open, setOpen] = useState(false),
    [choices, setChoices] = useState<Choices>({}),
    [runs, setRuns] = useState<Runs>({}),
    [captions, setCaptions] = useState<Captions>({});
  // The Gemini key dialog. The key lives only in this field until the request is sent: it is
  // never stored, and the field is emptied as soon as it is sent or the dialog closes.
  const [asking, setAsking] = useState(false),
    [apiKey, setApiKey] = useState(''),
    [shownKey, setShownKey] = useState(false);
  const closeKey = () => {
    setAsking(false);
    setApiKey('');
    setShownKey(false);
  };
  const report = useRef(onReviewed);
  report.current = onReviewed;
  useEffect(() => {
    report.current?.(result && { result, choices, runs, captions });
  }, [result, choices, runs, captions]);
  const turn = useRef(0);
  useEffect(() => {
    turn.current++;
    setBusy(false);
    setError('');
    setResult(null);
    setChoices({});
    setRuns({});
    setCaptions({});
  }, [stamp]);
  async function analyse(key: string) {
    if (!read) return;
    const current = ++turn.current;
    setBusy(true);
    setError('');
    setResult(null);
    setChoices({});
    setRuns({});
    setCaptions({});
    try {
      const text = await read();
      const found = await request<GuidelineExtraction>('/guideline/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, api_key: key }),
      });
      if (current === turn.current) {
        setResult(found);
        // A first guess at how each new or stricter rule runs; a person checks it in the table.
        setRuns(
          Object.fromEntries(
            found.rules
              .filter(runnable)
              .map((r) => [r.id, guessRun(r, found.classes) ?? undefined]),
          ),
        );
      }
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
        <Button variant="secondary" isDisabled={!read || busy} onPress={() => setAsking(true)}>
          {busy ? <Spinner /> : <Icon name="focus" />}
          Phân tích Guideline
        </Button>
        <span className="min-w-0 flex-1 text-xs text-muted">
          {busy
            ? 'Đang phân tích, có thể mất vài phút…'
            : (unavailable ??
              'Gửi nội dung guideline tới mô hình Gemini (bằng API key của bạn) để rút ra bản nháp quy tắc.')}
        </span>
      </div>
      {asking && (
        <Modal isOpen onOpenChange={(next) => !next && closeKey()}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog aria-label="Gemini API key">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>Phân tích Guideline bằng Gemini</Modal.Heading>
                </Modal.Header>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const key = apiKey.trim();
                    if (!key) return;
                    closeKey();
                    analyse(key);
                  }}
                >
                  <Modal.Body>
                    <label className="block text-sm font-medium" htmlFor="gemini-api-key">
                      Gemini API key của bạn
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="gemini-api-key"
                        className="field min-w-0 flex-1 rounded-lg px-2.5 py-2 font-mono text-sm"
                        type={shownKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="AIza…"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        maxLength={200}
                        required
                        autoFocus
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="self-center"
                        onPress={() => setShownKey((v) => !v)}
                      >
                        {shownKey ? 'Ẩn' : 'Hiện'}
                      </Button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      Key chỉ dùng cho lần phân tích này: gửi kèm guideline tới backend, rồi backend
                      chuyển thẳng cho Gemini. SmartReview không lưu key (không vào database, log
                      hay bộ nhớ trình duyệt); lần sau cần nhập lại. Lấy key tại{' '}
                      <a
                        className="text-accent underline"
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Google AI Studio
                      </a>
                      .
                    </p>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" onPress={closeKey}>
                      Hủy
                    </Button>
                    <Button variant="primary" type="submit" isDisabled={!apiKey.trim()}>
                      <Icon name="focus" />
                      Phân tích
                    </Button>
                  </Modal.Footer>
                </form>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
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
            {' · '}
            <span data-testid="guideline-added">
              {
                new Set(
                  patchesFrom({ rules: result.rules, choices, runs }).map(
                    (p) => p.op === 'add' && p.rule.check,
                  ),
                ).size
              }{' '}
              check mới sẽ chạy
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
            runs={runs}
            onRuns={setRuns}
            captions={captions}
            onCaptions={setCaptions}
            source={name}
          />
        </div>
      )}
    </div>
  );
}
