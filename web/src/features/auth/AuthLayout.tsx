import React, { useState } from 'react';
import { FieldError, InputGroup, Label, Spinner, TextField } from '@heroui/react';
import { Icon } from '../../components/Icon';
import { Logo } from '../../components/Logo';

// Bảng xám theo giao diện tối mặc định của Discord, đè lên token tối của HeroUI cho riêng vùng này.
const discordGray: React.CSSProperties & Record<`--${string}`, string> = {
  '--background': '#1e1f22',
  '--surface': '#313338',
  '--field-background': '#1e1f22',
  '--border': '#3f4147',
  // --color-muted của app là màu cố định cho nền sáng; trả về màu chữ phụ của theme tối.
  '--color-muted': 'var(--muted)',
};

function AuthSurface({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-theme="dark"
      style={discordGray}
      className={`min-h-dvh bg-background text-foreground ${className}`}
      {...props}
    />
  );
}

export function AuthLayout({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <AuthSurface className="flex flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 shadow-xl sm:p-10">
        <div className="flex justify-center">
          <Logo tone="light" />
        </div>
        <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-8">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-(--muted)">{footer}</p>}
      </main>
    </AuthSurface>
  );
}

export function AuthLoading() {
  return (
    <AuthSurface role="status" className="flex items-center justify-center gap-3 text-sm">
      <Spinner size="sm" />
      Đang kiểm tra phiên đăng nhập…
    </AuthSurface>
  );
}

export const fieldError =
  (missing: string) =>
  ({
    validationDetails,
    validationErrors,
  }: {
    validationDetails: ValidityState;
    validationErrors: string[];
  }) =>
    validationDetails.valueMissing ? missing : validationErrors.join(' ');

export function PasswordField({
  label,
  missing,
  ...props
}: { label: string; missing: string } & React.ComponentProps<typeof TextField>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField fullWidth isRequired type={visible ? 'text' : 'password'} {...props}>
      <Label>{label}</Label>
      <InputGroup fullWidth>
        <InputGroup.Input />
        <InputGroup.Suffix>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-(--muted) hover:text-foreground"
            aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} />
          </button>
        </InputGroup.Suffix>
      </InputGroup>
      <FieldError>{fieldError(missing)}</FieldError>
    </TextField>
  );
}
