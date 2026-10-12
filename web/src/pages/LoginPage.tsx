import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Alert, Button, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { homeFor, useAuth } from '../features/auth/AuthProvider';
import { AuthLayout, AuthLoading, PasswordField, fieldError } from '../features/auth/AuthLayout';
export function LoginPage() {
  const { user, loading, login, error: sessionError, retry } = useAuth();
  const registered = useLocation().state?.registered;
  const [username, setUsername] = useState(registered || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <AuthLayout
      title="Đăng nhập"
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Đăng ký
          </Link>
        </>
      }
    >
      {registered && !error && !sessionError && (
        <Alert status="success" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Đã tạo tài khoản</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {(error || sessionError) && (
        <Alert status="danger" role="alert" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error || sessionError}</Alert.Description>
            {sessionError && (
              <Button size="sm" variant="danger-soft" className="mt-2" onPress={retry}>
                Kết nối lại
              </Button>
            )}
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
            await login(username, password);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPassword('');
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
          isDisabled={busy}
          autoFocus={!registered}
        >
          <Label>Tên đăng nhập</Label>
          <Input />
          <FieldError>{fieldError('Nhập tên đăng nhập.')}</FieldError>
        </TextField>
        <PasswordField
          label="Mật khẩu"
          missing="Nhập mật khẩu."
          name="password"
          autoComplete="current-password"
          maxLength={128}
          value={password}
          onChange={setPassword}
          isDisabled={busy}
          autoFocus={Boolean(registered)}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={busy}>
          {busy && <Spinner size="sm" color="current" data-testid="loading-spinner" />}
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </Form>
    </AuthLayout>
  );
}
