import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthLoading } from './AuthLayout';
import { useAuth } from './AuthProvider';
import type { ProjectRole } from '../../types.ts';

export const roleLabel: Record<ProjectRole, string> = {
  leader: 'Leader',
  reviewer: 'Reviewer',
  annotator: 'Annotator',
};
// `leader`: pages only a leader account may open (creating projects, the default dataset).
export function AuthGate({ leader = false }: { leader?: boolean }) {
  const { user, loading, error, retry, workRole } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <AuthLoading />;
  if (error)
    return (
      <div role="alert" className="p-8">
        {error}{' '}
        <button className="sr-button" onClick={retry}>
          Thử lại
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (leader && user.role !== 'leader') return <Navigate to="/projects" replace />;
  if (user.role === 'member' && !workRole && pathname !== '/role')
    return <Navigate to="/role" replace />;
  return <Outlet />;
}
export function AccountMenu() {
  const { user, logout, workRole } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span>
        {user?.username} · {roleLabel[user?.role === 'leader' ? 'leader' : workRole || 'reviewer']}
      </span>
      {user?.role === 'member' && (
        <Link className="sr-button min-h-8 py-1 text-xs" to="/role">
          Đổi vai trò
        </Link>
      )}
      <button
        className="sr-button min-h-8 py-1 text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await logout();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </button>
      {error && (
        <span role="alert" className="text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}
