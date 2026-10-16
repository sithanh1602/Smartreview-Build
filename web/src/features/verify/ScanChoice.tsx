import React, { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';

// Shown once the files of a new project are uploaded: the person chooses what scans the
// labels, and only then goes on to the project. The Risk Engine runs at import whatever is
// chosen; an image model crops the boxes and runs only when it is ticked here.
export function ScanChoice({
  projectId,
  ready,
  onDone,
}: {
  projectId: string;
  // False while the backend is still finishing the import.
  ready: boolean;
  onDone: () => void;
}) {
  const [first, setFirst] = useState(true),
    [second, setSecond] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function go() {
    if (!first) return onDone();
    setBusy(true);
    setError('');
    try {
      await request(`/projects/${projectId}/label-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ second }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && !busy && onDone()}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog aria-label="Chọn cách quét nhãn">
            <Modal.Header>
              <Modal.Heading>Chọn cách quét nhãn</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm" data-testid="import-accepted">
                Dataset đã được tải lên và kiểm tra xong. Chọn những gì dùng để quét nhãn rồi vào
                project.
              </p>
              <fieldset className="mt-4 grid gap-4" disabled={busy}>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" checked disabled readOnly />
                  <span>
                    <strong>Risk Engine</strong>
                    <span className="block text-muted">
                      Luôn chạy khi import, như trước giờ. Kết quả của nó không đổi dù bạn chọn gì
                      bên dưới.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={first}
                    onChange={(e) => {
                      setFirst(e.target.checked);
                      if (!e.target.checked) setSecond(false);
                    }}
                  />
                  <span>
                    <strong>SigLIP 2</strong>
                    <span className="block text-muted">
                      Cắt phần ảnh trong từng khung để so với nhãn. Chỉ cắt ảnh và chạy khi được
                      chọn; khung bị phát hiện sai vào hàng đợi kiểm tra.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={second}
                    disabled={!first}
                    onChange={(e) => setSecond(e.target.checked)}
                  />
                  <span>
                    <strong>Qwen2.5-VL</strong>
                    <span className="block text-muted">
                      Xem lại các khung SigLIP 2 đã nghi và xác nhận. Chậm hơn nhiều.
                    </span>
                  </span>
                </label>
              </fieldset>
              <p className="mt-4 text-sm text-muted">
                {ready
                  ? 'Lượt quét chỉ chạy một lần, ngay lúc này.'
                  : 'Lượt quét chỉ chạy một lần, ngay lúc này. Hệ thống còn đang đưa ảnh lên kho lưu trữ và lưu kết quả ở chế độ nền; lượt quét tự bắt đầu khi project sang Ready.'}
              </p>
              {error && (
                <p role="alert" className="mt-4 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" isDisabled={busy} onPress={go}>
                {busy && <Spinner />}
                {busy ? 'Đang gửi lựa chọn…' : first ? 'Quét và vào project' : 'Vào project'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
