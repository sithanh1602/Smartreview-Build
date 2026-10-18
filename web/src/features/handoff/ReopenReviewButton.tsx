import React, { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import type { Handoff } from '../../types.ts';

// Withdraws a sent review: the file sent to the annotators is removed and the decisions can be
// edited again. Leaders and reviewers only, while the review waits on the annotators.
export function ReopenReviewButton({
  projectId,
  handoff,
  onReopened,
  base = '/projects',
}: {
  projectId: string;
  base?: string;
  handoff: Handoff;
  onReopened: () => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function reopen() {
    setBusy(true);
    setError('');
    try {
      await request(`${base}/${projectId}/handoff`, { method: 'DELETE' });
      setOpen(false);
      onReopened();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="sr-button"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        Mở lại review
      </button>
      {open && (
        <Modal isOpen onOpenChange={(next) => !next && !busy && setOpen(false)}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog aria-label="Mở lại review">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>Mở lại review</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="text-sm">
                    File kết quả đã gửi cho{' '}
                    <strong>{handoff.recipients.map((r) => r.username).join(', ')}</strong> sẽ bị
                    thu hồi. Annotator không xem được lỗi cần sửa nữa.
                  </p>
                  <p className="mt-3 text-sm">
                    Quyết định review được mở khoá để sửa tiếp; sau đó bấm Hoàn thành để gửi lại.
                  </p>
                  {error && (
                    <p role="alert" className="mt-3 text-sm text-rose-700">
                      {error}
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" isDisabled={busy} onPress={() => setOpen(false)}>
                    Hủy
                  </Button>
                  <Button variant="danger" isDisabled={busy} onPress={reopen}>
                    {busy && <Spinner />}
                    {busy ? 'Đang mở lại…' : 'Thu hồi và mở lại'}
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </>
  );
}
