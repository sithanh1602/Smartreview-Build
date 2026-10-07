import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../features/auth/AuthProvider';
export function LoginPage() {
  const { user, loading, login, error: sessionError, retry } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading)
    return (
      <p role="status" className="p-8">
        Đang kiểm tra phiên đăng nhập…
      </p>
    );
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="panel w-full max-w-md p-8">
        <p className="eyebrow text-accent">SmartReview</p>
        <h1 className="mt-3 text-2xl font-semibold">Đăng nhập</h1>
        <p className="mt-3 text-sm text-muted">
          Đăng nhập bằng tài khoản được cấp để vào không gian làm việc của bạn.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await login(username, password);
            } catch (e) {
              setError(e.message);
            } finally {
              setPassword('');
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            Tên đăng nhập
            <input
              className="field mt-2"
              autoComplete="username"
              required
              maxLength={64}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-sm">
            Mật khẩu
            <input
              className="field mt-2"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <button type="submit" className="button w-full border-accent text-accent" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        {(error || sessionError) && (
          <p role="alert" className="mt-4 text-sm text-rose-700">
            {error || sessionError}
          </p>
        )}
        {sessionError && (
          <button className="button mt-3" onClick={retry}>
            Kết nối lại
          </button>
        )}
        <p className="mt-5 text-xs text-muted">
          Chưa có tài khoản hoặc quên mật khẩu? Liên hệ người quản lý hệ thống.
        </p>
      </section>
    </main>
  );
}
