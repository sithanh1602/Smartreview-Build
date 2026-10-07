import { Spinner } from '../../components/Spinner';
import React, { useState } from 'react';
import { request } from '../../lib/api';

export function DeleteProjectButton({ project, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (
      !window.confirm(
        `Xóa project “${project.name}”? Toàn bộ ảnh upload, annotation, kết quả AI và đánh giá của project sẽ bị xóa vĩnh viễn.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const result = await request(`/projects/${project.id}`, { method: 'DELETE' });
      if (result.cleanupPending)
        window.alert(
          'Project đã xóa. Một số file chờ dọn trong storage/.trash; kiểm tra quyền thư mục trên máy chủ.',
        );
      onDeleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button border-rose-300 text-rose-700"
        disabled={busy}
        onClick={remove}
      >
        {busy && <Spinner />}
        {busy ? 'Đang xóa…' : 'Xóa project'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
