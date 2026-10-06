import { hint } from '../lib/englishHints';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../lib/api';
import { ProjectStatus } from '../features/projects/ProjectLayout';
import { DeleteProjectButton } from '../features/projects/DeleteProjectButton';
export function ProjectsPage() {
  const [rows, setRows] = useState(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    request('/projects', {
      signal: c.signal,
    })
      .then(setRows)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [attempt]);
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-3 text-accent">{hint('DATASET WORKSPACE')}</p>
          <h1 className="text-3xl font-semibold">{hint('SmartReview Projects')}</h1>
          <p className="mt-3 text-sm text-muted">
            {hint('Import dữ liệu đã gán nhãn, kiểm tra chất lượng và lưu quyết định review.')}
          </p>
        </div>
        <Link className="button border-accent/40 text-accent" to="/projects/new">
          {hint('+ New Project')}
        </Link>
      </div>
      {error ? (
        <div role="alert" className="panel p-6">
          {error}
          <button className="button ml-4" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </div>
      ) : rows === null ? (
        <p role="status">{hint('Đang tải projects…')}</p>
      ) : !rows.length ? (
        <div className="panel p-10 text-muted">
          {hint('Chưa có project. Chọn + New Project để bắt đầu.')}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <article key={p.id} className="panel block p-6 hover:border-accent/40">
              <Link className="block" to={`/projects/${p.id}`}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <h2 className="break-words text-xl font-semibold">{p.name}</h2>
                  <ProjectStatus status={p.status} />
                </div>
                <p className="mb-6 line-clamp-2 text-sm text-muted">
                  {p.description || 'Annotated dataset'}
                </p>
                <div className="flex gap-6 text-sm">
                  <span>
                    {p.metadata?.total_annotations ?? '—'}
                    {hint(' annotations')}
                  </span>
                  <span className="text-accent">
                    {p.metadata?.total_cases ?? '—'}
                    {hint(' risk cases')}
                  </span>
                </div>
                <p className="mt-4 text-xs text-muted">
                  {p.format} · {p.created_at?.slice(0, 10)}
                </p>
              </Link>
              <div className="mt-5">
                <DeleteProjectButton
                  project={p}
                  onDeleted={() => setRows((current) => current.filter((row) => row.id !== p.id))}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
