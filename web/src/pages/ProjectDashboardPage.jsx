import { hint } from '../lib/englishHints';
import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { DeleteProjectButton } from '../features/projects/DeleteProjectButton';
import { useProject } from '../features/projects/useProject';
import { ProjectStatus } from '../features/projects/ProjectLayout';
import { ImportForm } from '../features/projects/ImportForm';
import { request } from '../lib/api';
export function ProjectDashboardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data: p, error, loading, retry } = useProject(projectId);
  const [dashboard, setDashboard] = useState(null),
    [failure, setFailure] = useState('');
  useEffect(() => {
    setDashboard(null);
    setFailure('');
    if (p?.status !== 'READY') return;
    const c = new AbortController();
    request(`/projects/${projectId}/dashboard`, {
      signal: c.signal,
    })
      .then(setDashboard)
      .catch((e) => {
        if (!c.signal.aborted) setFailure(e.message);
      });
    return () => c.abort();
  }, [projectId, p]);
  if (loading) return <p role="status">Đang tải project…</p>;
  if (error)
    return (
      <div role="alert">
        {error}
        <button className="sr-button ml-4" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
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
        <DeleteProjectButton
          project={p}
          onDeleted={() => navigate('/projects', { replace: true })}
        />
      </div>
      {p.error_message && (
        <p role="alert" className="panel mb-6 p-5 text-rose-700">
          {p.error_message}
        </p>
      )}
      {['CREATED', 'FAILED'].includes(p.status) ? (
        <ImportForm key={p.id} project={p} onImported={retry} />
      ) : p.status !== 'READY' ? (
        <p role="status" className="panel p-8">
          {hint('Đang xử lý dataset. Trạng thái tự cập nhật; bạn có thể quay lại Projects.')}
        </p>
      ) : failure ? (
        <p role="alert">
          {failure}
          <button className="sr-button ml-4" onClick={retry}>
            Thử lại
          </button>
        </p>
      ) : !dashboard ? (
        <p role="status">Đang tải thống kê…</p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            {[
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
            ].map(([title, rows]) => (
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
          <Link
            className="sr-button mt-7 border-accent/40 text-accent"
            to={`/projects/${projectId}/review`}
          >
            {hint('Start Review →')}
          </Link>
          <Link className="sr-button ml-3 mt-7" to={`/projects/${projectId}/frames`}>
            Kiểm tra toàn bộ ảnh →
          </Link>
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
