import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../../lib/api';
import { ProjectStatus } from '../projects/ProjectLayout';
import { DeleteProjectButton } from '../projects/DeleteProjectButton';
import { roleLabel } from '../auth/AuthGate';
import { useAuth } from '../auth/AuthProvider';
import type { Project3D } from '../../types.ts';

const STATUS_3D: Record<string, string> = {
  NORMALIZING: 'Đang chuyển point cloud…',
  ANALYZING: 'Đang lưu point cloud…',
};
const count = (value: number) => value.toLocaleString('en-US');

// The 3D projects of the signed-in user, below the 2D ones. A failure here (the 3D tables not
// migrated yet, for one) is reported in place and leaves the rest of the page working.
export function Projects3DList() {
  const [rows, setRows] = useState<Project3D[] | null>(null),
    [error, setError] = useState('');
  const { user, workRole } = useAuth();
  const leader = user?.role === 'leader';
  useEffect(() => {
    const c = new AbortController();
    request<Project3D[]>('/projects3d', { signal: c.signal })
      .then(setRows)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  const shown = rows && (leader ? rows : rows.filter((p) => p.my_role === workRole));
  // A leader sees every 3D project: its own first, those of other leaders below.
  const groups = !shown
    ? []
    : !leader
      ? [{ title: '', rows: shown }]
      : [
          { title: 'Project 3D của tôi', rows: shown.filter((p) => p.created_by === user.id) },
          {
            title: 'Project 3D của Leader khác',
            rows: shown.filter((p) => p.created_by !== user.id),
          },
        ].filter((group, i) => !i || group.rows.length);
  // Nothing to show a member who is in no 3D project.
  if (!error && (!shown || (!shown.length && !leader))) return null;
  return (
    <section className="mt-12" aria-labelledby="projects-3d" data-testid="projects-3d">
      <h2 id="projects-3d" className="mb-5 text-xl font-semibold">
        Project 3D
      </h2>
      {error ? (
        <p role="alert" className="panel p-6 text-sm">
          {error}
        </p>
      ) : !shown!.length ? (
        <div className="panel p-10 text-muted">
          Chưa có project 3D. Chọn + Project 3D mới để bắt đầu.
        </div>
      ) : (
        groups.map((group) => (
          <section
            key={group.title}
            className="mb-10 last:mb-0"
            aria-label={group.title || undefined}
            data-testid="project-3d-group"
          >
            {group.title && (
              <p className="eyebrow mb-4 text-muted">
                {group.title} · {group.rows.length}
              </p>
            )}
            {!group.rows.length ? (
              <div className="panel p-6 text-sm text-muted">
                Bạn chưa tạo project 3D nào. Chọn + Project 3D mới để bắt đầu.
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((p) => (
                  <article
                    key={p.id}
                    className="panel block p-6 hover:border-accent/40"
                    data-testid="project-3d"
                  >
                    {/* The whole card opens the project, as the 2D cards do; only the delete button
                  below stays outside the link. */}
                    <Link className="block" to={`/projects3d/${p.id}`}>
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <h3 className="break-words text-xl font-semibold">{p.name}</h3>
                        <ProjectStatus status={p.status} label={STATUS_3D[p.status]} />
                      </div>
                      <p className="mb-6 line-clamp-2 text-sm text-muted">
                        {p.description || 'LiDAR segment'}
                      </p>
                      {p.status === 'FAILED' && p.error_message && (
                        <p className="mb-4 text-sm text-rose-700">{p.error_message}</p>
                      )}
                      {p.metadata && (
                        <>
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                            <span>{count(p.metadata.total_frames)} frame</span>
                            <span className="text-accent">
                              {count(p.metadata.total_boxes)} cuboid
                            </span>
                            <span>{count(p.metadata.tracked_objects)} đối tượng</span>
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            {Object.entries(p.metadata.boxes_by_type)
                              .map(([type, n]) => `${type} ${count(n)}`)
                              .join(' · ')}
                          </p>
                        </>
                      )}
                      <p className="mt-4 text-xs text-muted">
                        {p.format} · {p.created_at?.slice(0, 10)}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>Leader: {p.creator_name ?? '—'}</span>
                        <span>Reviewer: {p.reviewer_count}</span>
                        <span>Annotator: {p.annotator_count}</span>
                        <span>
                          Vai trò của bạn: <b>{roleLabel[p.my_role]}</b>
                        </span>
                      </p>
                    </Link>
                    {/* Only the creator deletes. */}
                    {leader && p.created_by === user.id && (
                      <div className="mt-5">
                        <DeleteProjectButton
                          project={p}
                          base="/projects3d"
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
    </section>
  );
}
