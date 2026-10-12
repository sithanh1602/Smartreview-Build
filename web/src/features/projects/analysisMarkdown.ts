import { ui } from '../../lib/i18n.ts';
import { POLICY_RULES } from '../../../shared/policy-rules.ts';
import type { GuidelineExtraction, RuleDraft } from '../../../server/guideline/model-call.ts';

// The whole analysis as a Markdown document, in the language the interface is showing. Unlike
// the pop-up it leaves nothing out, so the file can be read and passed on without the tool.
const RELATION = { new: 'Mới', stricter: 'Chặt hơn', looser: 'Nới hơn' } as const;
const REASON: Record<string, string> = {
  empty_quote: 'Không có câu trích',
  quote_not_in_guideline: 'Câu trích không có trong guideline',
  check_needs_unavailable_data: 'Cần dữ liệu công cụ không có',
  incomplete_check: 'Kiểm tra khai báo thiếu',
  relation_without_overrides: 'Không nêu check bị thay',
};
// A table cell is one line and must not end its own column.
const cell = (text: string) =>
  text
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim() || '—';
const table = (head: string[], rows: string[][]) =>
  [head.map(ui), head.map(() => '---'), ...rows.map((row) => row.map(cell))]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');

export function analysisMarkdown(
  result: GuidelineExtraction,
  choices: Record<string, 'guideline' | 'policy'>,
  source: string,
  now = new Date(),
) {
  const of = (kind: RuleDraft['kind']) => result.rules.filter((r) => r.kind === kind);
  const choice = (rule: RuleDraft) =>
    !choices[rule.id]
      ? ui('Chưa chọn')
      : choices[rule.id] === 'guideline'
        ? ui(rule.relation === 'new' ? 'Thêm vào' : 'Theo guideline')
        : ui(rule.relation === 'new' ? 'Bỏ qua' : 'Giữ policy');
  const policy = (rule: RuleDraft) =>
    rule.overrides.length
      ? rule.overrides
          .map((id) => `${ui(POLICY_RULES[id] ?? 'Chưa có mô tả cho kiểm tra này.')} (\`${id}\`)`)
          .join(' ')
      : ui('Chưa có quy tắc tương ứng trong công cụ.');
  const checks = of('check'),
    reviewer = of('reviewer'),
    definitions = of('definition');
  const parts = [
    `# ${ui('Phân tích guideline')}`,
    [
      source && `- ${ui('Guideline')}: ${source}`,
      `- ${ui('Mô hình')}: ${result.model}`,
      `- ${ui('Thời điểm')}: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      `- ${ui('Đã chọn')}: ${checks.filter((r) => choices[r.id]).length}/${checks.length}`,
    ]
      .filter(Boolean)
      .join('\n'),
    `> ${ui('Đây là bản nháp để người duyệt. Công cụ chưa tự đổi cách chấm điểm theo lựa chọn này.')}`,
    `## ${ui('So sánh với policy')} (${checks.length})`,
    checks.length
      ? table(
          ['ID', 'Mục', 'Quy tắc từ guideline', 'So sánh', 'Policy đang áp dụng', 'Lựa chọn'],
          checks.map((r) => [
            r.id,
            r.section,
            r.condition,
            ui(RELATION[r.relation]),
            policy(r),
            choice(r),
          ]),
        )
      : ui('Không có.'),
    ...checks.map((r) =>
      [
        `### ${r.id} · § ${r.section}`,
        `- ${ui('Lớp')}: ${r.classes.join(', ') || '—'}`,
        `- ${ui('Điều kiện')}: ${r.condition}`,
        `- ${ui('Câu trích từ guideline')}: “${cell(r.quote)}”`,
        r.missing_parameters.length &&
          `- ${ui('Guideline chưa nêu:')} ${r.missing_parameters.join('; ')}`,
        `- ${ui('Policy đang áp dụng')}: ${policy(r)}`,
        `- ${ui('Lựa chọn')}: **${choice(r)}**`,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    `## ${ui('Cần người kiểm tra')} (${reviewer.length})`,
    reviewer.length
      ? table(
          ['ID', 'Mục', 'Yêu cầu trong guideline', 'Vì sao công cụ chưa tự kiểm được'],
          reviewer.map((r) => [
            r.id,
            r.section,
            r.condition,
            r.needs.length
              ? ui(`Cần thêm dữ liệu: ${r.needs.join('; ')}`)
              : ui('Cần nhìn ảnh hoặc phán đoán của con người.'),
          ]),
        )
      : ui('Không có.'),
    `## ${ui('Mâu thuẫn')} (${result.conflicts.length})`,
    result.conflicts.length
      ? result.conflicts
          .map((c, i) =>
            [`${i + 1}. ${c.issue}`, ...c.quotes.map((q) => `   > ${cell(q)}`)].join('\n'),
          )
          .join('\n')
      : ui('Không có.'),
    `## ${ui('Lớp và thuộc tính')} (${result.classes.length})`,
    result.classes.length
      ? table(
          ['Lớp', 'Thuộc tính bắt buộc và giá trị'],
          result.classes.map((c) => [
            c.name,
            c.attributes.map((a) => `${a.name}: ${a.values.join(' / ')}`).join('; '),
          ]),
        )
      : ui('Không có.'),
    `## ${ui('Định nghĩa, hướng dẫn')} (${definitions.length})`,
    definitions.length
      ? table(
          ['ID', 'Mục', 'Nội dung'],
          definitions.map((r) => [r.id, r.section, r.condition]),
        )
      : ui('Không có.'),
    `## ${ui('Bị loại khi đối chiếu với guideline')} (${result.rejected.length})`,
    result.rejected.length
      ? table(
          ['ID', 'Mục', 'Nội dung', 'Lý do'],
          result.rejected.map(({ rule, reason }) => [
            rule.id,
            rule.section,
            rule.condition,
            ui(REASON[reason] ?? reason),
          ]),
        )
      : ui('Không có.'),
  ];
  return parts.join('\n\n') + '\n';
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
