import React, { useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import { EXPORT_FORMATS } from '../../../core/exporters/formats.ts';
import type { ExportFormat } from '../../../core/exporters/formats.ts';
import { FixList, ReturnForm, useSent } from './fixes';

type CvatTask = {
  task_id: number;
  job_id: number;
  url: string;
  created: boolean;
  issues: number;
};
const TOOLS = { cvat: 'CVAT local' } as const;

export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel mb-5 p-5" aria-label={title}>
      <h2 className="flex items-center gap-3 font-semibold">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-sm text-white">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Take the dataset away as a file, or put it straight into a tool.
function GetData({ projectId }: { projectId: string }) {
  const [format, setFormat] = useState<ExportFormat>('cvat-images'),
    [tool, setTool] = useState<keyof typeof TOOLS>('cvat'),
    [busy, setBusy] = useState(false),
    [task, setTask] = useState<CvatTask | null>(null),
    [error, setError] = useState('');
  async function assign() {
    setBusy(true);
    setError('');
    try {
      setTask(
        await request<CvatTask>(`/projects/${projectId}/handoff/cvat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold">Đưa vào công cụ</h3>
        <p className="mt-1 text-xs text-muted">
          Tạo task với toàn bộ ảnh và nhãn hiện tại, mỗi lần gửi một task.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            className="field max-w-full sm:w-auto"
            aria-label="Công cụ"
            value={tool}
            disabled={busy}
            onChange={(e) => setTool(e.target.value as keyof typeof TOOLS)}
          >
            {Object.entries(TOOLS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sr-button border-accent text-accent"
            disabled={busy}
            onClick={assign}
          >
            {busy && <Spinner />}
            {busy ? 'Đang đưa vào CVAT…' : 'Đưa vào CVAT'}
          </button>
          {task && (
            <a className="sr-button" href={task.url} target="_blank" rel="noreferrer">
              Mở task #{task.task_id} trong CVAT ↗
            </a>
          )}
        </div>
        {busy && (
          <p role="status" className="mt-2 text-xs text-muted">
            Đang tải ảnh lên CVAT; dataset lớn có thể mất vài phút.
          </p>
        )}
        {!busy && task && (
          <p role="status" className="mt-2 text-xs text-muted">
            {task.created
              ? 'Đã tạo task với đủ ảnh và nhãn hiện tại.'
              : 'Task của lần gửi này đã có trong CVAT; mở lại task đó.'}{' '}
            <strong>{task.issues}</strong> issue trên ảnh: [Lỗi], [Thiếu nhãn], [Cần xem lại]. Trong
            CVAT bấm vào vùng đỏ để đọc, sửa xong bấm Resolve.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold">Hoặc tải về (.zip)</h3>
        <p className="mt-1 text-xs text-muted">
          Toàn bộ ảnh và nhãn, để nhập vào công cụ khác. Giữ: {EXPORT_FORMATS[format].keeps}.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            className="field max-w-full sm:w-auto"
            aria-label="Định dạng"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((id) => (
              <option key={id} value={id}>
                {EXPORT_FORMATS[id].label}
              </option>
            ))}
          </select>
          <a
            className="sr-button"
            href={`/api/projects/${projectId}/handoff/dataset.zip?format=${format}`}
            download
          >
            Tải .zip
          </a>
        </div>
      </div>
    </div>
  );
}

// The annotator's work on a project the reviewers sent back: get the data, see on the images
// what to fix, return the fixed file. Everything happens on the project page.
export function AnnotatorWork({
  projectId,
  onReturned,
}: {
  projectId: string;
  onReturned: () => void;
}) {
  const { sent, error, reload } = useSent(projectId);
  if (!sent)
    return (
      <p role={error ? 'alert' : 'status'} className="panel p-6">
        {!error && <Spinner />}
        {error || 'Đang tải lỗi cần sửa…'}
      </p>
    );
  const { handoff } = sent;
  const waiting = handoff.status === 'SENT';
  return (
    <>
      <section className="panel mb-5 border-amber-500 p-5" data-testid="handoff-banner">
        <h2 className="font-semibold">
          {waiting ? 'Bạn có lỗi cần sửa' : 'Bạn đã gửi lại bản đã sửa'}
        </h2>
        <p className="mt-2 text-sm">
          {waiting ? (
            <>
              {handoff.sent_by_name} gửi lúc {new Date(handoff.sent_at).toLocaleString('vi-VN')}.
              Làm theo ba bước dưới đây.
            </>
          ) : (
            <>
              {handoff.returned_by_name} gửi lại lúc{' '}
              {new Date(handoff.returned_at ?? '').toLocaleString('vi-VN')}. Reviewer đang kiểm tra;
              bên dưới là kết quả từng lỗi.
            </>
          )}
        </p>
        {handoff.note && <p className="mt-2 text-sm text-muted">“{handoff.note}”</p>}
        {waiting && !handoff.current && (
          <p className="mt-2 text-sm text-amber-800">
            Dataset đã thay đổi sau khi gửi; danh sách lỗi là của bản dataset trước.
          </p>
        )}
      </section>
      {waiting ? (
        <>
          <Step n={1} title="Lấy dữ liệu để sửa">
            <GetData projectId={projectId} />
          </Step>
          <Step n={2} title="Xem ảnh cần sửa">
            <FixList key={handoff.status} sent={sent} projectId={projectId} role="annotator" />
          </Step>
          <Step n={3} title="Gửi lại cho Reviewer">
            <ReturnForm
              projectId={projectId}
              onReturned={() => {
                reload();
                onReturned();
              }}
            >
              <p className="text-sm text-muted">
                Sửa xong thì xuất nhãn từ công cụ (không cần kèm ảnh, định dạng nào ở bước 1 cũng
                được) rồi chọn file ở đây: .zip, .xml, .json hoặc .txt.
              </p>
            </ReturnForm>
          </Step>
        </>
      ) : (
        <FixList key={handoff.status} sent={sent} projectId={projectId} role="annotator" />
      )}
    </>
  );
}
