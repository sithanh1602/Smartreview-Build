import { Spinner } from '../../components/Spinner';
import React, { useState } from 'react';
import { request } from '../../lib/api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { Project } from '../../types.ts';

export function DeleteProjectButton({
  project,
  onDeleted,
  base = '/projects',
}: {
  project: Pick<Project, 'id' | 'name'>;
  onDeleted: () => void;
  base?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leftovers, setLeftovers] = useState(false);
  async function remove() {
    setBusy(true);
    setError('');
    try {
      const result = await request(`${base}/${project.id}`, { method: 'DELETE' });
      setAsking(false);
      if (result.cleanupPending) setLeftovers(true);
      else onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="sr-button border-rose-300 text-rose-700"
        disabled={busy || leftovers}
        onClick={() => {
          setError('');
          setAsking(true);
        }}
      >
        {busy && <Spinner />}
        {busy ? 'Đang xóa…' : 'Xóa project'}
      </button>
      <ConfirmDialog
        open={asking}
        title="Xóa project?"
        confirmLabel={busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
        cancelLabel="Hủy"
        busy={busy}
        error={error}
        onCancel={() => setAsking(false)}
        onConfirm={remove}
      >
        <p className="break-words font-semibold">{project.name}</p>
        <p className="mt-2">
          Toàn bộ ảnh upload, annotation, kết quả AI và đánh giá của project sẽ bị xóa vĩnh viễn.
          Không hoàn tác được.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={leftovers}
        title="Đã xóa project"
        status="warning"
        confirmLabel="Đã hiểu"
        onConfirm={onDeleted}
      >
        Một số file chưa dọn được và đang chờ trong storage/.trash. Kiểm tra quyền thư mục trên máy
        chủ.
      </ConfirmDialog>
    </div>
  );
}
