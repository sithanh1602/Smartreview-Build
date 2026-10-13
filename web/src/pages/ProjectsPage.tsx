import { Spinner } from '../components/Spinner';
import { hint } from '../lib/englishHints';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../lib/api';
import { ProjectStatus } from '../features/projects/ProjectLayout';
import { DeleteProjectButton } from '../features/projects/DeleteProjectButton';
import { JoinProjectForm } from '../features/projects/JoinProjectForm';
import { Projects3DList } from '../features/projects3d/Projects3DList';
import { roleLabel } from '../features/auth/AuthGate';
import { useAuth } from '../features/auth/AuthProvider';
import type { Project } from '../types.ts';

export function ProjectsPage() {
  const [rows, setRows] = useState<Project[] | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [joined, setJoined] = useState('');
  const { user, workRole, chooseWorkRole } = useAuth();
  const leader = user?.role === 'leader';
  // A member works in one role at a time and sees the projects joined in that role.
  const shown = rows && (leader ? rows : rows.filter((p) => p.my_role === workRole));
  // A leader sees every project: its own first, those of other leaders below.
  const groups = !shown
    ? []
    : !leader
      ? [{ title: '', rows: shown }]
      : [
          { title: 'Project của tôi', rows: shown.filter((p) => p.created_by === user.id) },
          { title: 'Project của Leader khác', rows: shown.filter((p) => p.created_by !== user.id) },
        ].filter((group, i) => !i || group.rows.length);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    request<Project[]>('/projects', {
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
            {leader
              ? hint('Import dữ liệu đã gán nhãn, kiểm tra chất lượng và lưu quyết định review.')
              : 'Các project bạn đã tham gia bằng mã mời của Leader.'}
          </p>
        </div>
        {leader && (
          <div className="flex flex-wrap gap-3">
            <Link className="sr-button border-accent/40 text-accent" to="/projects/new">
              {hint('+ New Project')}
            </Link>
            <Link className="sr-button" to="/projects/new-3d">
              + Project 3D mới
            </Link>
          </div>
        )}
      </div>
      {!leader && (
        <JoinProjectForm
          onJoined={(result) => {
            // The code may belong to the other role: follow it so the project is listed.
            chooseWorkRole(result.role);
            setJoined(result.name);
            setAttempt((a) => a + 1);
          }}
        />
      )}
      {joined && (
        <p role="status" className="panel mb-6 p-4 text-sm text-accent">
          Đã tham gia project: {joined}
        </p>
      )}
      {error ? (
        <div role="alert" className="panel p-6">
          {error}
          <button className="sr-button ml-4" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </div>
      ) : !shown ? (
        <p role="status" className="panel p-6 text-muted">
          <Spinner />
          {hint('Đang tải projects…')}
        </p>
      ) : !shown.length ? (
        <div className="panel p-10 text-muted">
          {leader
            ? hint('Chưa có project. Chọn + New Project để bắt đầu.')
            : 'Bạn chưa tham gia project nào với vai trò này. Nhập mã mời ở trên để bắt đầu.'}
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.title}
            className="mb-10 last:mb-0"
            aria-label={group.title || undefined}
            data-testid="project-group"
          >
            {group.title && (
              <p className="eyebrow mb-4 text-muted">
                {group.title} · {group.rows.length}
              </p>
            )}
            {!group.rows.length ? (
              <div className="panel p-6 text-sm text-muted">
                {hint('Bạn chưa tạo project nào. Chọn + New Project để bắt đầu.')}
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((p) => (
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
                      <p
                        className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted"
                        data-testid="project-people-summary"
                      >
                        <span>Leader: {p.creator_name ?? '—'}</span>
                        <span>Reviewer: {p.reviewer_count}</span>
                        <span>Annotator: {p.annotator_count}</span>
                        <span>
                          Vai trò của bạn: <b>{roleLabel[p.my_role]}</b>
                        </span>
                      </p>
                    </Link>
                    {/* Only the creator deletes; a project without one is every leader's. */}
                    {leader && (p.created_by === null || p.created_by === user.id) && (
                      <div className="mt-5">
                        <DeleteProjectButton
                          project={p}
                          onDeleted={() =>
                            setRows(
                              (current) => current && current.filter((row) => row.id !== p.id),
                            )
                          }
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        ))
      )}
      <Projects3DList />
    </>
  );
}
