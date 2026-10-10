import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthLoading } from './AuthLayout';
import { homeFor, useAuth } from './AuthProvider';
import type { User } from '../../types.ts';

export function AuthGate({ role }: { role: User['role'] }) {
  const { user, loading, error, retry } = useAuth();
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
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span>
        {user?.username} · {user?.role === 'reviewer' ? 'Reviewer' : 'Annotator'}
      </span>
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
