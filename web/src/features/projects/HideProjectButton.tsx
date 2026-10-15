import { Spinner } from '../../components/Spinner';
import React, { useState } from 'react';
import { request } from '../../lib/api';
import type { Project } from '../../types.ts';

// The creator hides a project from other leaders, or shows it again. Members who joined keep
// their access either way; the server decides who sees what.
export function HideProjectButton({
  project,
  onChanged,
  base = '/projects',
}: {
  project: Pick<Project, 'id' | 'hidden'>;
  onChanged: (hidden: boolean) => void;
  // The API collection the project belongs to: 3D projects have their own.
  base?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const result = await request<{ hidden: boolean }>(`${base}/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !project.hidden }),
      });
      onChanged(result.hidden);
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
        className="sr-button"
        disabled={busy}
        aria-pressed={project.hidden}
        title={
          project.hidden
            ? 'Leader khác đang không thấy project này.'
            : 'Leader khác đang thấy project này.'
        }
        onClick={toggle}
      >
        {busy && <Spinner />}
        {project.hidden ? 'Hiện với Leader khác' : 'Ẩn với Leader khác'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
