import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { expired } from '../../lib/api';
import { EXTENSION_MINUTES, MAX_EXTENSIONS, SESSION_MINUTES } from '../../../shared/session.ts';
import { useAuth } from './AuthProvider';

// The minute before the session ends, while extensions are left: ask for 5 more minutes or
// sign out. With none left, the last 10 seconds: an OK that signs out at once. Either way the
// user is signed out when the session ends (AuthProvider), whatever they do here.
const WARN_MS = 60_000;
const FINAL_MS = 10_000;

export function SessionTimeout() {
  const { user, expiresAt, extensionsLeft, extend, logout } = useAuth();
  const end = expiresAt ? Date.parse(expiresAt) : null;
  const final = extensionsLeft <= 0;
  const [shown, setShown] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setShown(false);
    setError('');
    if (!user || end === null) return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
        setShown(true);
      },
      Math.max(0, end - (final ? FINAL_MS : WARN_MS) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [user, end, final]);
  useEffect(() => {
    if (!shown) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [shown]);
  if (!shown || !user || end === null) return null;
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const minutes = SESSION_MINUTES + (MAX_EXTENSIONS - extensionsLeft) * EXTENSION_MINUTES;
  async function more() {
    setBusy(true);
    setError('');
    try {
      await extend();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    // A session that is already gone signs out here too.
    await logout().catch(expired);
  }
  return (
    <Modal isOpen>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container>
          <Modal.Dialog aria-label="Hết giờ làm việc" role="alertdialog">
            <Modal.Header>
              <Modal.Heading>{final ? 'Đã hết thời gian' : 'Hết giờ làm việc'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm">
                {final
                  ? `Bạn đã dùng hết ${MAX_EXTENSIONS} lần gia hạn (thêm ${MAX_EXTENSIONS * EXTENSION_MINUTES} phút).`
                  : `Phiên đăng nhập đã đủ ${minutes} phút.`}{' '}
                Hệ thống sẽ đăng xuất sau{' '}
                <strong className="tabular-nums" aria-live="polite">
                  {seconds} giây
                </strong>
                .
              </p>
              <p className="mt-2 text-sm text-muted">
                Những gì chưa lưu sẽ mất; hãy lưu quyết định đang làm.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              {final ? (
                <Button variant="primary" isDisabled={busy} onPress={leave}>
                  OK
                </Button>
              ) : (
                <>
                  <Button variant="secondary" isDisabled={busy} onPress={leave}>
                    Đăng xuất
                  </Button>
                  <Button variant="primary" isDisabled={busy} onPress={more}>
                    {busy && <Spinner />}
                    Cho tôi thêm {EXTENSION_MINUTES} phút
                    <span className="font-normal opacity-80">
                      (còn {extensionsLeft}/{MAX_EXTENSIONS} lần)
                    </span>
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
