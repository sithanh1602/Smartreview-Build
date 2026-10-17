import React, { useEffect, useRef } from 'react';
import { Spinner } from '../../components/Spinner';
import { useLabelVerify } from './useLabelVerify';

const ENGINE_NAMES: Record<string, string> = { siglip: 'SigLIP 2', qwen: 'Qwen2.5-VL' };

// One line on the project page about the label scan chosen when the data was put up. The scan
// has no page of its own: what it finds wrong is in the review queue.
export function ScanStatus({
  projectId,
  leader,
  onQueueChanged,
}: {
  projectId: string;
  leader: boolean;
  onQueueChanged: () => void;
}) {
  const { report, busy, error, start } = useLabelVerify(projectId);
  // The counts on the page were read before the scan ended.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (report?.status === 'RUNNING') wasRunning.current = true;
    else if (report?.status === 'READY' && wasRunning.current) {
      wasRunning.current = false;
      onQueueChanged();
    }
  }, [report?.status, onQueueChanged]);
  if (!report || (report.status === 'IDLE' && !report.queued)) return null;
  return (
    <section className="panel mb-5 p-4 text-sm" data-testid="scan-status">
      {report.status === 'IDLE' && (
        <p role="status">
          <Spinner />
          Lượt quét nhãn bằng ảnh đã chọn đang chờ tới lượt.
        </p>
      )}
      {report.status === 'RUNNING' && (
        <>
          <p role="status">
            <Spinner />
            Đang quét nhãn bằng ảnh ·{' '}
            <strong>
              {(report.stage === report.engine
                ? report.models?.model
                : report.models?.second_model) ?? ENGINE_NAMES[report.stage]}
            </strong>{' '}
            đã xem {report.completed}/{report.total} khung. Khung bị phát hiện sai sẽ vào hàng đợi
            kiểm tra khi quét xong.
          </p>
          <progress className="mt-3 w-full" value={report.completed} max={report.total || 1} />
        </>
      )}
      {report.status === 'READY' && (
        <p>
          Đã quét nhãn bằng ảnh ({report.model}
          {report.second_model && <> + {report.second_model}</>}): <strong>{report.flagged}</strong>{' '}
          khung nghi sai nhãn nằm trong hàng đợi kiểm tra, trong đó{' '}
          <strong>{report.added_to_queue}</strong> khung Risk Engine chưa bắt được
          {report.confirmed !== undefined && (
            <>
              ; {report.second_model} xác nhận {report.confirmed} khung
            </>
          )}
          .
        </p>
      )}
      {report.status === 'FAILED' && (
        <p role="alert" className="text-rose-700">
          Quét nhãn bằng ảnh chưa xong: {report.error}
          {leader && report.models && (
            <button
              className="sr-button ml-3"
              disabled={busy}
              onClick={() => start(report.models!)}
            >
              Thử lại
            </button>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
