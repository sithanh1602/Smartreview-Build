import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import type { UsableModels } from '../../types.ts';

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
  const [models, setModels] = useState<UsableModels | null>(null),
    [first, setFirst] = useState(false),
    [second, setSecond] = useState(false),
    [model, setModel] = useState(''),
    [secondModel, setSecondModel] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    request<UsableModels>(`/projects/${projectId}/label-verify/models`, { signal: c.signal })
      .then((found) => {
        setModels(found);
        setModel(found.first[0]?.name ?? '');
        setSecondModel(found.second[0]?.name ?? '');
        setFirst(found.first.length > 0);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [projectId]);
  const noFirst = models !== null && !models.first.length;
  const noSecond = models !== null && !models.second.length;
  async function go() {
    if (!first || !model) return onDone();
    setBusy(true);
    setError('');
    try {
      await request(`/projects/${projectId}/label-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ...(second && secondModel && { second_model: secondModel }),
        }),
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
                <div className="flex items-start gap-3 text-sm">
                  <input
                    id="scan-first"
                    type="checkbox"
                    className="mt-1"
                    checked={first}
                    disabled={!models || noFirst}
                    onChange={(e) => {
                      setFirst(e.target.checked);
                      if (!e.target.checked) setSecond(false);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="scan-first" className="font-semibold">
                      Quét bằng model ảnh
                    </label>
                    <span className="block text-muted">
                      Cắt phần ảnh trong từng khung để so với nhãn. Khung bị phát hiện sai vào hàng
                      đợi kiểm tra.
                    </span>
                    <ModelPicker
                      label="Model quét"
                      models={models?.first}
                      value={model}
                      onChange={setModel}
                      disabled={!first}
                      empty="Chưa có model loại SigLIP trong thư mục model-usage."
                    />
                  </div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <input
                    id="scan-second"
                    type="checkbox"
                    className="mt-1"
                    checked={second}
                    disabled={!first || noSecond}
                    onChange={(e) => setSecond(e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="scan-second" className="font-semibold">
                      Xem lại bằng model thứ hai
                    </label>
                    <span className="block text-muted">
                      Xem lại các khung model quét đã nghi và xác nhận. Chậm hơn nhiều.
                    </span>
                    <ModelPicker
                      label="Model xem lại"
                      models={models?.second}
                      value={secondModel}
                      onChange={setSecondModel}
                      disabled={!second}
                      empty="Chưa có model loại Qwen2.5-VL trong thư mục model-usage."
                    />
                  </div>
                </div>
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

function ModelPicker({
  label,
  models,
  value,
  onChange,
  disabled,
  empty,
}: {
  label: string;
  models: UsableModels['first'] | undefined;
  value: string;
  onChange: (name: string) => void;
  disabled: boolean;
  empty: string;
}) {
  if (!models)
    return (
      <p role="status" className="mt-2 text-muted">
        <Spinner />
        Đang đọc thư mục model-usage…
      </p>
    );
  if (!models.length) return <p className="mt-2 text-amber-700">{empty}</p>;
  return (
    <select
      aria-label={label}
      className="mt-2 w-full rounded-lg border border-line bg-transparent px-3 py-2"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {models.map((m) => (
        <option key={m.name} value={m.name}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
