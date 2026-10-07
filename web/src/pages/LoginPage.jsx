import { Spinner } from '../components/Spinner';
import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authRequest } from '../lib/api';
import { homeFor, useAuth } from '../features/auth/AuthProvider';
export function LoginPage({ register = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login, error: sessionError, retry } = useAuth();
  const [username, setUsername] = useState(location.state?.username || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading)
    return (
      <p role="status" className="p-8">
        <Spinner />
        Đang kiểm tra phiên đăng nhập…
      </p>
    );
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="panel w-full max-w-md p-8">
        <p className="eyebrow text-accent">SmartReview</p>
        <h1 className="mt-3 text-2xl font-semibold">{register ? 'Đăng ký' : 'Đăng nhập'}</h1>
        <p className="mt-3 text-sm text-muted">
          {register
            ? 'Tạo tài khoản annotator để vào không gian gán nhãn. Quyền reviewer do người quản lý cấp.'
            : 'Đăng nhập để vào không gian làm việc của bạn.'}
        </p>
        {!register && location.state?.registered && (
          <p role="status" className="mt-4 text-sm text-accent">
            Đăng ký thành công. Hãy đăng nhập bằng tài khoản vừa tạo.
          </p>
        )}
        <form
          aria-busy={busy}
          className="mt-7 space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (register && password !== confirmation) {
              setError('Mật khẩu nhập lại không khớp.');
              return;
            }
            setBusy(true);
            setError('');
            try {
              if (register) {
                const result = await authRequest('register', { username, password });
                navigate('/login', {
                  replace: true,
                  state: { registered: true, username: result.user.username },
                });
              } else await login(username, password);
            } catch (e) {
              setError(e.message);
            } finally {
              setPassword('');
              setConfirmation('');
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
              minLength={3}
              pattern="[a-zA-Z0-9_.\-]{3,64}"
              title="3–64 ký tự: chữ, số, dấu gạch dưới, dấu chấm hoặc dấu gạch ngang."
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
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={register ? 12 : undefined}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {register && (
            <>
              <p className="text-xs text-muted">Mật khẩu cần từ 12 đến 128 ký tự.</p>
              <label className="block text-sm">
                Nhập lại mật khẩu
                <input
                  className="field mt-2"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={busy}
                />
              </label>
            </>
          )}
          <button type="submit" className="button w-full border-accent text-accent" disabled={busy}>
            {busy && <Spinner />}
            {register
              ? busy
                ? 'Đang đăng ký…'
                : 'Đăng ký'
              : busy
                ? 'Đang đăng nhập…'
                : 'Đăng nhập'}
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
          {register ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
          <Link className="text-accent underline" to={register ? '/login' : '/register'}>
            {register ? 'Đăng nhập' : 'Đăng ký'}
          </Link>
        </p>
        {!register && (
          <p className="mt-3 text-xs text-muted">Quên mật khẩu? Liên hệ người quản lý hệ thống.</p>
        )}
      </section>
    </main>
  );
}
