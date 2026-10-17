import React from 'react';
import { AlertDialog, Button } from '@heroui/react';
import { Spinner } from './Spinner';

type Status = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  status = 'danger',
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  status?: Status;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const close = onCancel ?? onConfirm;
  return (
    <AlertDialog isOpen={open} onOpenChange={(next) => !next && !busy && close()}>
      <AlertDialog.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status={status} />
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="text-sm">{children}</div>
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              {cancelLabel && (
                <Button variant="secondary" isDisabled={busy} onPress={onCancel}>
                  {cancelLabel}
                </Button>
              )}
              <Button
                variant={status === 'danger' ? 'danger' : 'primary'}
                isDisabled={busy}
                onPress={onConfirm}
              >
                {busy && <Spinner />}
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
