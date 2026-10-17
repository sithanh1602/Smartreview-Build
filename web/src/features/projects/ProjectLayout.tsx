import { Spinner } from '../../components/Spinner';
import { hint } from '../../lib/englishHints';
import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AccountMenu } from '../auth/AuthGate';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';
// A page locks the layout while it waits for something that must not be interrupted by
// another action. Signing out and the language and theme toggles stay usable.
export type ProjectLayoutContext = { setLocked: (locked: boolean) => void };
export function ProjectLayout() {
  const [locked, setLocked] = useState(false);
  // The page checking a round of fixes fills exactly one screen from laptop width up, like the
  // review workspace; only its list of items scrolls.
  const fill = useLocation().pathname.endsWith('/fixes');
  return (
    <div
      className={`min-h-screen ${fill ? 'lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden' : ''}`}
    >
      <header
        className={`bg-panel flex flex-wrap items-center gap-8 border-b border-line px-8 ${fill ? 'py-3' : 'py-5'}`}
      >
        <div className="page-lock flex flex-wrap items-center gap-8" inert={locked}>
          <Link to="/projects" aria-label="SmartReview">
            <Logo />
          </Link>
          <Link to="/projects" className="text-sm text-accent">
            {hint('Projects')}
          </Link>
        </div>
        <span className="ml-auto text-xs text-muted">{hint('ANNOTATION QA')}</span>
        <AccountMenu locked={locked} />
        <LanguageToggle />
        <ThemeToggle />
      </header>
      <main
        className={`page-lock mx-auto px-5 ${fill ? 'w-full py-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:px-5' : 'max-w-[1400px] py-9 lg:px-8'}`}
        inert={locked}
      >
        <Outlet context={{ setLocked } satisfies ProjectLayoutContext} />
      </main>
    </div>
  );
}
export const statusLabel: Record<string, string> = {
  CREATED: 'Chờ upload',
  UPLOADING: 'Đang nhận files…',
  VALIDATING: 'Đang kiểm tra annotations…',
  NORMALIZING: 'Đang chuẩn hóa…',
  ANALYZING: 'Đang chạy QA checks…',
  READY: 'Ready',
  FAILED: 'Import Failed',
};
// `label` replaces the usual wording of a status where the step means something else (3D).
export function ProjectStatus({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs ${status === 'READY' ? 'border-accent/30 text-accent' : status === 'FAILED' ? 'border-rose-400/30 text-rose-700' : 'border-amber-400/30 text-amber-800'}`}
    >
      {['UPLOADING', 'VALIDATING', 'NORMALIZING', 'ANALYZING'].includes(status) && <Spinner />}
      {hint(label || statusLabel[status] || status)}
    </span>
  );
}
