import { hint } from '../../lib/englishHints';
import React from 'react';
import { Link, Outlet } from 'react-router-dom';
export function ProjectLayout() {
  return (
    <div className="min-h-screen">
      <header className="bg-white flex flex-wrap items-center gap-8 border-b border-line px-8 py-5">
        <Link to="/projects" className="text-lg font-semibold">
          Smart<span className="text-accent">Review</span>
        </Link>
        <Link to="/projects" className="text-sm text-accent">
          {hint('Projects')}
        </Link>
        <span className="ml-auto text-xs text-muted">{hint('ANNOTATION QA')}</span>
      </header>
      <main className="mx-auto max-w-[1400px] px-5 py-9 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
export const statusLabel = {
  CREATED: 'Chờ upload',
  UPLOADING: 'Đang nhận files…',
  VALIDATING: 'Đang kiểm tra annotations…',
  NORMALIZING: 'Đang chuẩn hóa…',
  ANALYZING: 'Đang chạy QA checks…',
  READY: 'Ready',
  FAILED: 'Import Failed',
};
export function ProjectStatus({ status }) {
  return (
    <span
      className={`rounded-none border px-3 py-1 text-xs ${status === 'READY' ? 'border-accent/30 text-accent' : status === 'FAILED' ? 'border-rose-400/30 text-rose-700' : 'border-amber-400/30 text-amber-800'}`}
    >
      {hint(statusLabel[status] || status)}
    </span>
  );
}
