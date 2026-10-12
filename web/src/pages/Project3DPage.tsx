import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { DeleteProjectButton } from '../features/projects/DeleteProjectButton';
import { ProjectStatus } from '../features/projects/ProjectLayout';
import { Import3DForm, stageText } from '../features/projects3d/Import3DForm';
import { useProject3D } from '../features/projects3d/useProject3D';
import { BOX_COLORS, cssColor } from '../features/projects3d/viewer/colors';
import { roleLabel } from '../features/auth/AuthGate';

const count = (value: number) => value.toLocaleString('en-US');
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function Project3DPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data: p, error, loading, retry } = useProject3D(projectId);
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
  const leader = p.my_role === 'leader',
    meta = p.metadata,
    importing = !['READY', 'CREATED', 'FAILED'].includes(p.status);
  const types = meta ? Object.entries(meta.boxes_by_type).sort((a, b) => b[1] - a[1]) : [];
  return (
    <>
      <Link to="/projects" className="text-sm text-muted">
        ← Dự án
      </Link>
      <div className="my-6 flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <p className="eyebrow mb-2 text-accent">PROJECT 3D · LIDAR</p>
          <h1 className="break-words text-3xl font-semibold">{p.name}</h1>
          {p.description && <p className="mt-3 text-sm text-muted">{p.description}</p>}
        </div>
        <ProjectStatus status={p.status} />
        {leader && (
          <DeleteProjectButton
            project={p}
            base="/projects3d"
            onDeleted={() => navigate('/projects', { replace: true })}
          />
        )}
      </div>
      {p.error_message && (
        <p role="alert" className="panel mb-6 p-5 text-rose-700">
          {p.error_message}
        </p>
      )}
      {importing && (
        <p role="status" className="panel mb-6 p-5 text-sm text-accent">
          <Spinner />
          {stageText(p) ?? 'Đang xử lý…'}
        </p>
      )}
      {p.status === 'READY' && meta && (
        <>
          <section className="panel mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-semibold">Review cuboid trên point cloud</h2>
              <p className="mt-1 text-sm text-muted">
                Xem từng frame của segment, chọn một cuboid để xem chi tiết và lưu quyết định
                review.
              </p>
              {p.review_summary && (
                <p className="mt-2 text-sm tabular-nums" data-testid="review-summary">
                  Đã review {count(p.review_summary.reviewed)}/{count(meta.total_boxes)} cuboid ·{' '}
                  <span className="text-rose-700">{count(p.review_summary.errors)} lỗi</span> ·{' '}
                  {count(p.review_summary.correct)} đúng · {count(p.review_summary.unsure)} chưa
                  chắc
                </p>
              )}
            </div>
            <Link
              className="sr-button border-accent text-accent"
              to={`/projects3d/${p.id}/viewer`}
              data-testid="open-viewer"
            >
              Mở review 3D →
            </Link>
          </section>
          <div className="mb-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Frame"
              value={count(meta.total_frames)}
              note={`${meta.duration_seconds.toFixed(1)} giây`}
            />
            <Stat
              label="Cuboid"
              value={count(meta.total_boxes)}
              note={`${count(meta.tracked_objects)} đối tượng được theo dõi`}
            />
            <Stat
              label="Điểm"
              value={`${(meta.total_points / 1e6).toFixed(1)} triệu`}
              note={`${count(Math.round(meta.total_points / meta.total_frames))} điểm mỗi frame`}
            />
            <Stat label="Lidar" value={String(meta.lasers.length)} note={meta.lasers.join(' · ')} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel p-5" data-testid="boxes-by-type">
              <h2 className="mb-4 font-semibold">Cuboid theo loại</h2>
              <ul className="space-y-3 text-sm">
                {types.map(([type, n]) => (
                  <li key={type}>
                    <div className="mb-1 flex justify-between gap-3">
                      <span>{type}</span>
                      <span className="tabular-nums text-muted">
                        {count(n)} · {((n / meta.total_boxes) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(n / types[0][1]) * 100}%`,
                          background: cssColor(BOX_COLORS[type] ?? BOX_COLORS.UNKNOWN),
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-5">
              <h2 className="mb-4 font-semibold">Dữ liệu</h2>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">Segment</dt>
                <dd className="break-all">{meta.segment}</dd>
                <dt className="text-muted">Định dạng</dt>
                <dd>{p.format}</dd>
                <dt className="text-muted">Bù chuyển động</dt>
                <dd>
                  {meta.motion_compensated
                    ? 'Có (lidar TOP, từ lidar_pose)'
                    : 'Không: segment không có lidar_pose'}
                </dd>
                <dt className="text-muted">Ảnh camera</dt>
                <dd>
                  {meta.cameras?.length
                    ? `${count(meta.total_images ?? 0)} ảnh · ${meta.cameras.join(' · ')}`
                    : 'Không có'}
                </dd>
                <dt className="text-muted">Dung lượng lưu</dt>
                <dd>{(meta.stored_bytes / 1024 / 1024).toFixed(0)} MB</dd>
                <dt className="text-muted">Ngày tạo</dt>
                <dd>{p.created_at?.slice(0, 10)}</dd>
                <dt className="text-muted">Leader</dt>
                <dd>{p.creator_name ?? '—'}</dd>
                <dt className="text-muted">Vai trò của bạn</dt>
                <dd>{roleLabel[p.my_role]}</dd>
              </dl>
            </section>
          </div>
        </>
      )}
      {leader && ['CREATED', 'FAILED'].includes(p.status) && (
        <>
          <h2 className="mb-4 text-xl font-semibold">Chọn dữ liệu của segment</h2>
          <Import3DForm project={p} onImported={retry} />
        </>
      )}
    </>
  );
}
