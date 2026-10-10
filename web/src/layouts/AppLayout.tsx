import { hint } from '../lib/englishHints';
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { DatasetProvider, useDataset } from '../app/DatasetProvider';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { AccountMenu } from '../features/auth/AuthGate';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';
export type LayoutContext = { headerSlot: HTMLElement | null };
function Shell() {
  const { data, error, loading, projectId, reviewPath } = useDataset();
  // The review workspace fills exactly one screen from laptop width up; its page puts
  // progress into the header slot instead of spending a row on it.
  const workspace = useLocation().pathname.split('/').includes('review');
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <div
      className={`min-h-screen ${workspace ? 'lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden' : ''}`}
    >
      <header
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel ${workspace ? 'px-3 py-1.5' : 'min-h-18 px-5 py-4 lg:px-8'}`}
      >
        <div
          className={`flex max-w-full flex-wrap items-center ${workspace ? 'gap-3' : 'gap-4 lg:gap-8'}`}
        >
          <NavLink to="/projects" aria-label={hint('SmartReview — Tổng quan')}>
            <Logo markClassName={workspace ? 'h-7 w-7' : undefined} />
          </NavLink>
          <nav
            aria-label={hint('Điều hướng chính')}
            className={`flex gap-1 ${workspace ? 'text-xs' : 'text-sm'}`}
          >
            {(
              [
                ['/projects', hint('Projects'), 'grid'],
                [
                  projectId ? `/projects/${projectId}` : '/overview',
                  projectId ? hint('Current Project') : 'Tổng quan',
                  'grid',
                ],
                [reviewPath, hint('Review'), 'layers'],
              ] as [string, string, IconName][]
            ).map(([to, label, icon]) => (
              <NavLink
                key={to}
                end={to !== reviewPath}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg ${workspace ? 'px-2 py-1.5' : 'px-3 py-2'} ${isActive ? 'bg-slate-100 text-slate-900' : 'text-muted hover:text-slate-900'}`
                }
              >
                {!workspace && <Icon name={icon} />}
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div
          ref={setHeaderSlot}
          className="flex min-w-0 flex-1 items-center justify-end empty:hidden"
        />
        <div className="flex items-center gap-3 text-xs text-muted">
          <AccountMenu />
          {!workspace && (
            <>
              <span
                className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-400' : loading ? 'bg-amber-400' : 'bg-accent'}`}
              />
              {data ? 'Dữ liệu sẵn sàng' : error ? 'Chưa kết nối' : 'Đang kết nối'}
              <span className="ml-2 rounded-md border border-line px-2 py-1 text-[10px] tracking-widest">
                {hint('ANNOTATION QA')}
              </span>
            </>
          )}
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      <Outlet context={{ headerSlot } satisfies LayoutContext} />
      <footer
        className={`flex flex-wrap justify-between gap-2 border-t border-line px-6 py-4 text-[11px] text-muted ${workspace ? 'lg:hidden' : ''}`}
      >
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
