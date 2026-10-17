import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useProject } from '../features/projects/useProject';
import { FixList, ReturnForm, useSent } from '../features/handoff/fixes';

// What the reviewers sent to the annotators, for the leader and the reviewers. Annotators do
// the same work on the project page, so they are sent there.
export function FixesPage() {
  const { projectId } = useParams();
  return <Fixes key={projectId} projectId={projectId} />;
}
function Fixes({ projectId }: { projectId: string | undefined }) {
  const role = useProject(projectId).data?.my_role;
  const { sent, error, reload, setSent } = useSent(projectId);
  if (role === 'annotator') return <Navigate to={`/projects/${projectId}`} replace />;
  const back = (
    <Link className="text-sm text-muted" to={`/projects/${projectId}`}>
      ← Về dự án
    </Link>
  );
  if (!sent)
    return (
      <>
        {back}
        <p role={error ? 'alert' : 'status'} className="panel mt-6 p-6">
          {!error && <Spinner />}
          {error || 'Đang tải kết quả review…'}
        </p>
      </>
    );
  const { handoff, report, result } = sent;
  const returned = handoff.status === 'RETURNED' && result !== null;
  return (
    <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <h1 className="sr-only">
        {returned ? 'Kiểm tra lại' : 'File đã gửi'} · {report.project.name}
      </h1>
      {!returned && (
        <p className="mb-3 truncate text-xs text-muted">
          {handoff.sent_by_name} gửi lúc {new Date(handoff.sent_at).toLocaleString('vi-VN')} cho{' '}
          {handoff.recipients.map((r) => r.username).join(', ')}
          {handoff.note ? ` · “${handoff.note}”` : ''}
        </p>
      )}
      {handoff.status === 'SENT' && !handoff.current && (
        <p className="panel mb-3 p-3 text-sm text-amber-800">
          Dataset đã thay đổi sau khi gửi; danh sách này là của bản dataset trước.
        </p>
      )}
      {handoff.status === 'SENT' && role === 'leader' && (
        <section className="panel mb-3 p-4" aria-label="Gửi lại bản đã sửa">
          <ReturnForm projectId={projectId} onReturned={reload}>
            <h2 className="font-semibold">Gửi lại bản đã sửa thay Annotator</h2>
            <p className="mt-2 text-sm text-muted">
              Chọn file nhãn đã sửa (.zip, .xml, .json hoặc .txt, ở bất kỳ định dạng nào SmartReview
              import được).
            </p>
          </ReturnForm>
        </section>
      )}
      <FixList
        key={handoff.status}
        sent={sent}
        projectId={projectId}
        role={role}
        onJudged={(next) => setSent({ ...sent, result: next })}
        fill
      />
    </div>
  );
}
