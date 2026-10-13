import { Spinner } from '../components/Spinner';
import { hint } from '../lib/englishHints';
import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { DeleteProjectButton } from '../features/projects/DeleteProjectButton';
import { useProject } from '../features/projects/useProject';
import { ProjectStatus } from '../features/projects/ProjectLayout';
import { ImportForm } from '../features/projects/ImportForm';
import { ProjectPeople } from '../features/projects/ProjectPeople';
import { StartReviewButton } from '../features/projects/StartReviewButton';
import { ScanStatus } from '../features/verify/ScanStatus';
import { request } from '../lib/api';
import { CompleteReviewButton } from '../features/handoff/CompleteReviewButton';
import { useAuth } from '../features/auth/AuthProvider';
import { ui } from '../lib/i18n';
import type { Dashboard } from '../types.ts';

export function ProjectDashboardPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resuming, setResuming] = useState(false),
    [resumeError, setResumeError] = useState('');
  const { data: p, error, loading, retry } = useProject(projectId);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [failure, setFailure] = useState('');
  useEffect(() => {
    setDashboard(null);
    setFailure('');
    if (p?.status !== 'READY') return;
    const c = new AbortController();
    request<Dashboard>(`/projects/${projectId}/dashboard`, {
      signal: c.signal,
    })
      .then(setDashboard)
      .catch((e) => {
        if (!c.signal.aborted) setFailure(e.message);
      });
    return () => c.abort();
  }, [projectId, p]);
  if (loading)
    return (
      <p role="status" className="panel p-6 text-muted">
        <Spinner />
        Đang tải project…
      </p>
    );
  if (error)
    return (
      <div role="alert">
        {error}
        <button className="sr-button ml-4" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
  if (!p) return null;
  const leader = p.my_role === 'leader';
  const handoff = p.handoff;
  async function reopen() {
    if (
      !window.confirm(
        ui('Mở lại review? File đã gửi cho Annotator sẽ bị thu hồi và Reviewer sửa lại được.'),
      )
    )
      return;
    try {
      await request(`/projects/${projectId}/handoff`, { method: 'DELETE' });
      retry();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <>
      <Link to="/projects" className="text-sm text-muted">
        {hint('← Projects')}
      </Link>
      <div className="my-6 flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="break-words text-3xl font-semibold">{p.name}</h1>
          <p className="mt-3 text-sm text-muted">{p.description}</p>
        </div>
        <ProjectStatus status={p.status} />
        {leader && (p.created_by === null || p.created_by === user?.id) && (
          <DeleteProjectButton
            project={p}
            onDeleted={() => navigate('/projects', { replace: true })}
          />
        )}
      </div>
      <ProjectPeople project={p} />
      {handoff && (
        <section className="panel mb-6 border-amber-500 p-5" data-testid="handoff-banner">
          {handoff.status === 'SENT' ? (
            <>
              <h2 className="font-semibold">Review đã hoàn thành</h2>
              <p className="mt-2 text-sm">
                {handoff.sent_by_name} đã gửi kết quả cho{' '}
                {handoff.recipients.map((r) => r.username).join(', ')} lúc{' '}
                {new Date(handoff.sent_at).toLocaleString('vi-VN')}. Quyết định review đang bị khoá
                cho tới khi Annotator gửi lại bản đã sửa.
              </p>
              {handoff.note && <p className="mt-2 text-sm text-muted">“{handoff.note}”</p>}
              {!handoff.current && (
                <p className="mt-2 text-sm text-amber-800">
                  Dataset đã thay đổi sau khi gửi; file là của bản dataset trước.
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="font-semibold">Annotator đã gửi lại bản đã sửa</h2>
              <p className="mt-2 text-sm">
                {handoff.returned_by_name} gửi lại lúc{' '}
                {new Date(handoff.returned_at ?? '').toLocaleString('vi-VN')}. Project đang chạy
                trên bản đã sửa; Reviewer kiểm tra lại rồi bấm Hoàn thành lần nữa nếu còn lỗi.
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {(p.my_role !== 'annotator' || handoff.for_me) && (
              <Link
                className="sr-button border-accent text-accent"
                to={`/projects/${projectId}/fixes`}
              >
                {handoff.status === 'RETURNED'
                  ? 'Kiểm tra lại các lỗi đã gửi →'
                  : p.my_role === 'annotator'
                    ? 'Xem lỗi cần sửa →'
                    : 'Xem file đã gửi →'}
              </Link>
            )}
            {leader && handoff.status === 'SENT' && (
              <button className="sr-button" onClick={reopen}>
                Mở lại review
              </button>
            )}
          </div>
        </section>
      )}
      {p.error_message && (
        <p role="alert" className="panel mb-6 p-5 text-rose-700">
          {p.error_message}
        </p>
      )}
      {leader && p.can_resume && (
        <section className="panel mb-6 p-5" data-testid="import-resume">
          <p className="text-sm">
            Dữ liệu đã tải lên và kiểm tra vẫn còn trên backend. Thử lại sẽ làm tiếp từ chỗ dở,
            không cần chọn lại file.
          </p>
          <button
            className="sr-button mt-4 border-accent text-accent"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              setResumeError('');
              try {
                await request(`/projects/${p.id}/import/resume`, { method: 'POST' });
                retry();
              } catch (e) {
                setResumeError((e as Error).message);
              } finally {
                setResuming(false);
              }
            }}
          >
            {resuming && <Spinner />}
            Thử lại
          </button>
          {resumeError && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {resumeError}
            </p>
          )}
        </section>
      )}
      {['CREATED', 'FAILED'].includes(p.status) ? (
        leader ? (
          <ImportForm key={p.id} project={p} onImported={retry} />
        ) : (
          <p className="panel p-8 text-muted">
            Project chưa có dữ liệu. Leader cần import dataset trước khi bạn làm việc.
          </p>
        )
      ) : p.status !== 'READY' ? (
        <div role="status" className="panel p-8" data-testid="import-progress">
          <p>
            <Spinner />
            {p.progress
              ? p.progress.step === 'publish'
                ? `Đang đưa lên kho lưu trữ: ${p.progress.done}/${p.progress.total} file`
                : `Đang lưu risk case: ${p.progress.done}/${p.progress.total}`
              : hint('Đang xử lý dataset. Trạng thái tự cập nhật; bạn có thể quay lại Projects.')}
          </p>
          {p.progress && (
            <>
              <progress
                aria-label="Tiến độ import"
                className="mt-4 h-2 w-full accent-teal-600"
                value={p.progress.done}
                max={p.progress.total || 1}
              />
              <p className="mt-3 text-xs text-muted">
                Chạy nền trên backend: bạn có thể quay lại Projects, trang này tự cập nhật.
              </p>
            </>
          )}
        </div>
      ) : failure ? (
        <p role="alert">
          {failure}
          <button className="sr-button ml-4" onClick={retry}>
            Thử lại
          </button>
        </p>
      ) : !dashboard ? (
        <p role="status" className="panel p-6 text-muted">
          <Spinner />
          Đang tải thống kê…
        </p>
      ) : (
        <>
          <ScanStatus projectId={p.id} leader={leader} onQueueChanged={retry} />
          <div className="grid gap-5 lg:grid-cols-3">
            {(
              [
                [
                  'Dataset',
                  [
                    ['Media', dashboard.dataset.media_count],
                    ['Frames', dashboard.dataset.frame_count],
                    ['Annotations', dashboard.dataset.total_annotations],
                    ['Tracks', dashboard.dataset.total_tracks || hint('N/A')],
                    ['Format', p.format],
                  ],
                ],
                [
                  'QA Analysis',
                  [
                    ['Risk Cases', dashboard.dataset.total_cases],
                    ['High', dashboard.dataset.levels.high],
                    ['Medium', dashboard.dataset.levels.medium],
                    ['Low', dashboard.dataset.levels.low],
                  ],
                ],
                [
                  'Review',
                  [
                    ['Reviewed', dashboard.metrics.reviewed],
                    ['Remaining', dashboard.metrics.unreviewed],
                    ['Confirmed Errors', dashboard.metrics.confirmed_errors],
                    ['Progress', dashboard.metrics.review_progress + '%'],
                  ],
                ],
              ] as [string, [string, React.ReactNode][]][]
            ).map(([title, rows]) => (
              <section key={title} className="panel p-6">
                <h2 className="mb-5 text-lg font-semibold">{hint(title)}</h2>
                <dl className="space-y-4">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-sm text-muted">{hint(label)}</dt>
                      <dd className="font-medium" data-testid={`metric-${label}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <StartReviewButton projectId={p.id} />
          <Link className="sr-button ml-3 mt-7" to={`/projects/${projectId}/frames`}>
            Kiểm tra toàn bộ ảnh →
          </Link>
          <Link className="sr-button ml-3 mt-7" to={`/projects/${projectId}/ai-check`}>
            AI Checking →
          </Link>
          <CompleteReviewButton
            project={p}
            metrics={dashboard.metrics}
            onSent={retry}
            className="sr-button ml-3 mt-7 border-accent text-accent"
          />
          {!dashboard.dataset.total_cases && (
            <p className="mt-4 text-sm text-muted">
              {hint(
                'Không có cảnh báo. Trong Review, chọn Tất cả annotations để kiểm tra thủ công.',
              )}
            </p>
          )}
          <p className="mt-6 text-xs text-muted">
            {hint('Schema ')}
            {dashboard.dataset.schema_version}
            {hint(' · Engine')}
            {dashboard.dataset.engine_version} · Quyết định được lưu riêng cho project này.
          </p>
        </>
      )}
    </>
  );
}
