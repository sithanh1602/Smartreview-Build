import React from 'react';
import { Spinner } from '../../components/Spinner';
import type { AiCheck } from './useAiCheck';

// Shows the AI's label suggestions on the page it sits on. Before a result exists, the leader
// starts the run from here; members wait for the leader.
export function LabelCheckButton({
  ai,
  leader,
  shown,
  onShown,
  count,
  className = 'sr-button',
}: {
  ai: AiCheck;
  leader: boolean;
  shown: boolean;
  onShown: (shown: boolean) => void;
  // Suggestions for what the page is showing now.
  count?: number;
  className?: string;
}) {
  const { report, busy, error } = ai;
  const running = report?.status === 'RUNNING',
    ready = report?.status === 'READY';
  const blocked = !report
    ? error || 'Đang tải trạng thái AI…'
    : ready || running
      ? ''
      : !report.available
        ? 'Chưa tìm thấy Python hoặc model cục bộ. Xem hướng dẫn cấu hình trong docs/ai-check.md.'
        : !leader
          ? 'Leader chưa chạy AI cho project này.'
          : '';
  return (
    <button
      type="button"
      className={className}
      disabled={Boolean(blocked) || running || busy}
      title={
        blocked ||
        (ready
          ? 'Hiện hoặc ẩn gợi ý của AI về nhãn'
          : report?.status === 'FAILED'
            ? report.error
            : 'Chạy AI để kiểm tra nhãn của cả project')
      }
      aria-pressed={ready ? shown : undefined}
      onClick={() => (ready ? onShown(!shown) : void ai.start().then((ok) => ok && onShown(true)))}
    >
      {(running || busy) && <Spinner />}
      Label Checking AI
      {running
        ? ` · ${report.completed}/${report.total}`
        : ready && shown && count !== undefined
          ? ` · ${count}`
          : ''}
    </button>
  );
}
