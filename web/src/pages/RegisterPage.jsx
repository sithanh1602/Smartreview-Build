import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { homeFor, useAuth } from '../features/auth/AuthProvider';
import { AuthLayout, AuthLoading, PasswordField, fieldError } from '../features/auth/AuthLayout';
import { authRequest } from '../lib/api';

// Cùng quy tắc với backend (docs/auth.md): tên 3–64 ký tự chữ, số, _ . -; mật khẩu 12–128 ký tự.
const checkUsername = (value) =>
  value && !/^[A-Za-z0-9_.-]{3,64}$/.test(value)
    ? 'Tên đăng nhập gồm 3–64 ký tự: chữ, số, dấu _ . hoặc -'
    : null;
const checkPassword = (value) =>
  value && value.length < 12 ? 'Mật khẩu cần ít nhất 12 ký tự.' : null;

export function RegisterPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <AuthLayout
      title="Tạo tài khoản"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-foreground underline underline-offset-4">
            Đăng nhập
          </Link>
        </>
      }
    >
      {error && (
        <Alert status="danger" role="alert" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Form
        aria-busy={busy}
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await authRequest('register', { username, password });
            navigate('/login', { replace: true, state: { registered: username } });
          } catch (e) {
            setError(e.status === 404 ? 'Máy chủ chưa mở chức năng đăng ký.' : e.message);
            setBusy(false);
          }
        }}
      >
        <TextField
          fullWidth
          isRequired
          name="username"
          autoComplete="username"
          maxLength={64}
          value={username}
          onChange={setUsername}
          validate={checkUsername}
          isDisabled={busy}
          autoFocus
        >
          <Label>Tên đăng nhập</Label>
          <Input />
          <FieldError>{fieldError('Nhập tên đăng nhập.')}</FieldError>
        </TextField>
        <PasswordField
          label="Mật khẩu"
          missing="Nhập mật khẩu."
          name="password"
          autoComplete="new-password"
          maxLength={128}
          value={password}
          onChange={setPassword}
          validate={checkPassword}
          isDisabled={busy}
        />
        <PasswordField
          label="Xác nhận mật khẩu"
          missing="Nhập lại mật khẩu."
          name="confirm"
          autoComplete="new-password"
          maxLength={128}
          value={confirm}
          onChange={setConfirm}
          validate={(value) =>
            value && value !== password ? 'Mật khẩu xác nhận không khớp.' : null
          }
          isDisabled={busy}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={busy}>
          {busy && <Spinner size="sm" color="current" data-testid="loading-spinner" />}
          {busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </Button>
      </Form>
    </AuthLayout>
  );
}
