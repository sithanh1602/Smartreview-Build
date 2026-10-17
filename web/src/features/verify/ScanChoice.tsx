import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import type { UsableModels } from '../../types.ts';
import type { listScoreModels } from '../../../server/ai/rescore.ts';

export type ScoreModel = Awaited<ReturnType<typeof listScoreModels>>[number];
// What a label scan runs with: the image model, and the model that looks again, if any.
export interface ScanPick {
  model: string;
  second_model?: string;
}
// Everything the import runs with besides the Risk Engine; null means "not run".
export interface ImportPick {
  rescore: string | null;
  scan: ScanPick | null;
}

// Shown when a project's data is submitted, before anything is created or uploaded. Step 1
// picks the model that scores the boxes (model/Model_rescore), step 2 the models that read and
// check them (model/Model_bbox); only on confirming the last step does the import start. Step 1
// is left out when Model_rescore holds no model.
export function ScanChoice({
  rescoreByDefault,
  onConfirm,
  onCancel,
}: {
  // The labels carry no confidence: scoring is ticked unless the person says otherwise.
  rescoreByDefault: boolean;
  onConfirm: (pick: ImportPick) => void;
  onCancel: () => void;
}) {
  const [scoreModels, setScoreModels] = useState<ScoreModel[] | null>(null),
    [models, setModels] = useState<UsableModels | null>(null),
    [step, setStep] = useState<1 | 2>(1),
    [rescore, setRescore] = useState(''),
    [first, setFirst] = useState(false),
    [second, setSecond] = useState(false),
    [model, setModel] = useState(''),
    [secondModel, setSecondModel] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    const failed = (e: Error) => {
      if (!c.signal.aborted) setError(e.message);
    };
    request<ScoreModel[]>('/projects/score-models', { signal: c.signal })
      .then((found) => {
        setScoreModels(found);
        const pick = found.find((m) => m.default) ?? found[0];
        setRescore(rescoreByDefault && pick ? pick.id : '');
        if (!found.length) setStep(2);
      })
      .catch((e) => {
        failed(e);
        setScoreModels([]);
        setStep(2);
      });
    request<UsableModels>('/projects/label-verify/models', { signal: c.signal })
      .then((found) => {
        setModels(found);
        setModel(found.first[0]?.name ?? '');
        setSecondModel(found.second[0]?.name ?? '');
        setFirst(found.first.length > 0);
      })
      .catch(failed);
    return () => c.abort();
  }, [rescoreByDefault]);
  const noFirst = models !== null && !models.first.length;
  const noSecond = models !== null && !models.second.length;
  const twoSteps = !!scoreModels?.length;
  function go() {
    onConfirm({
      rescore: rescore || null,
      scan:
        first && model
          ? { model, ...(second && secondModel && { second_model: secondModel }) }
          : null,
    });
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && onCancel()}>
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog aria-label="Chọn model cho dữ liệu">
            <Modal.Header>
              <Modal.Heading>
                {twoSteps && <span className="mr-2 text-muted">Bước {step}/2 ·</span>}
                {step === 1 ? 'Model chấm điểm box' : 'Model đọc và xét box'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm" data-testid="scan-choice">
                Dữ liệu chưa được tải lên: project chỉ được tạo và xử lý sau khi bạn chọn xong và
                bấm “Nhập dữ liệu”. Risk Engine luôn chạy khi nhập.
              </p>
              {scoreModels === null ? (
                <p role="status" className="mt-4 text-sm text-muted">
                  <Spinner />
                  Đang đọc thư mục model…
                </p>
              ) : step === 1 ? (
                <fieldset className="mt-4 grid gap-2 text-sm" data-testid="score-model">
                  <legend className="mb-2 text-muted">
                    Model chạy một lần trên mỗi ảnh: mỗi box người vẽ được chấm điểm cho đúng nhãn
                    của nó, vật model thấy mà chưa có box thành gợi ý. Không thêm, không sửa nhãn.
                    Nên chọn khi tệp nhãn chưa có confidence. Đọc từ thư mục model/Model_rescore.
                  </legend>
                  {scoreModels.map((m) => (
                    <Choice
                      key={m.id}
                      name="score-model"
                      checked={rescore === m.id}
                      onChange={() => setRescore(m.id)}
                    >
                      <strong>{m.name}</strong>
                      {m.default && <span className="ml-1 text-xs text-accent">(mặc định)</span>}
                      <span className="ml-1 text-xs text-muted">· {m.file}</span>
                      <span className="mt-1 block text-xs">Tốc độ: {m.speed}</span>
                      <span className="block text-xs">Hiệu quả: {m.quality}</span>
                      <span className="mt-1 block text-xs text-muted">{m.note}</span>
                    </Choice>
                  ))}
                  <Choice name="score-model" checked={!rescore} onChange={() => setRescore('')}>
                    <strong>Không chấm điểm</strong>
                    <span className="mt-1 block text-xs text-muted">
                      Dùng confidence có sẵn trong tệp nhãn, nếu có.
                    </span>
                  </Choice>
                </fieldset>
              ) : (
                <fieldset className="mt-4 grid gap-4">
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
                        Cắt phần ảnh trong từng khung để so với nhãn. Khung bị phát hiện sai vào
                        hàng đợi kiểm tra.
                      </span>
                      <ModelPicker
                        label="Model quét"
                        models={models?.first}
                        value={model}
                        onChange={setModel}
                        disabled={!first}
                        empty="Chưa có model loại SigLIP trong thư mục model/Model_bbox."
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
                        empty="Chưa có model loại Qwen2.5-VL trong thư mục model/Model_bbox."
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted">
                    Lượt quét chạy một lần, tự bắt đầu khi dữ liệu đã nhập xong (project sang
                    Ready).
                  </p>
                </fieldset>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              {step === 2 && twoSteps ? (
                <Button variant="outline" onPress={() => setStep(1)}>
                  ← Bước trước
                </Button>
              ) : (
                <Button variant="outline" onPress={onCancel}>
                  Huỷ
                </Button>
              )}
              {step === 1 ? (
                <Button
                  variant="primary"
                  isDisabled={scoreModels === null}
                  onPress={() => setStep(2)}
                >
                  Tiếp →
                </Button>
              ) : (
                <Button variant="primary" isDisabled={!models && !error} onPress={go}>
                  {first ? 'Nhập dữ liệu và quét' : 'Nhập dữ liệu'}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-2 rounded-lg border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${checked ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'}`}
    >
      <input type="radio" name={name} className="mt-1" checked={checked} onChange={onChange} />
      <span className="min-w-0">{children}</span>
    </label>
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
        Đang đọc thư mục model/Model_bbox…
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
