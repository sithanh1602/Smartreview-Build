import { hint } from '../lib/englishHints';
import React from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { DatasetProvider, useDataset } from '../app/DatasetProvider';
import { Icon } from '../components/Icon';
function Shell() {
  const { data, error, loading, projectId, reviewPath } = useDataset();
  return (
    <div className="min-h-screen">
      <header className="bg-white flex min-h-18 flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-8">
        <div className="flex max-w-full flex-wrap items-center gap-4 lg:gap-8">
          <NavLink
            to="/projects"
            className="flex items-center gap-3"
            aria-label={hint('SmartReview — Tổng quan')}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-none border border-accent/30 bg-accent/10 text-accent">
              <Icon name="scan" className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Smart<span className="text-accent">Review</span>
            </span>
          </NavLink>
          <nav aria-label={hint('Điều hướng chính')} className="flex gap-1 text-sm">
            {[
              ['/projects', hint('Projects'), 'grid'],
              [
                projectId ? `/projects/${projectId}` : '/overview',
                projectId ? hint('Current Project') : 'Tổng quan',
                'grid',
              ],
              [reviewPath, hint('Review'), 'layers'],
            ].map(([to, label, icon]) => (
              <NavLink
                key={to}
                end={to !== reviewPath}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-none px-3 py-2 ${isActive ? 'bg-slate-100 text-slate-900' : 'text-muted hover:text-slate-900'}`
                }
              >
                <Icon name={icon} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-none ${error ? 'bg-rose-400' : loading ? 'bg-amber-400' : 'bg-accent'}`}
          />
          {data ? 'Dữ liệu sẵn sàng' : error ? 'Chưa kết nối' : 'Đang kết nối'}
          <span className="ml-2 rounded-none border border-line px-2 py-1 text-[10px] tracking-widest">
            {hint('ANNOTATION QA')}
          </span>
        </div>
      </header>
      <Outlet />
      <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-6 py-4 text-[11px] text-muted">
        <span>{hint('SmartReview · Annotation Quality Assurance')}</span>
        <span>{hint('Independent of models · Human-led review')}</span>
      </footer>
    </div>
  );
}
export function AppLayout() {
  const { projectId } = useParams();
  return (
    <DatasetProvider key={projectId || 'legacy'}>
      <Shell />
    </DatasetProvider>
  );
}
