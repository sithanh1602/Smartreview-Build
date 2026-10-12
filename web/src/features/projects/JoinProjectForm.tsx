import React, { useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import type { MemberRole } from '../../types.ts';

export interface Joined {
  project_id: string;
  name: string;
  role: MemberRole;
}
// The leader's invite code decides both the project and the role.
export function JoinProjectForm({ onJoined }: { onJoined: (joined: Joined) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="panel mb-8 flex flex-wrap items-end gap-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const joined = await request<Joined>('/projects/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          setCode('');
          onJoined(joined);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex min-w-56 flex-1 flex-col gap-2 text-sm">
        <span className="font-medium">Mã mời từ Leader</span>
        <input
          className="rounded-lg border border-line bg-transparent px-3 py-2 font-mono tracking-widest uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={10}
          placeholder="VD: K7M2QX9RTB"
          autoComplete="off"
          spellCheck={false}
          required
          disabled={busy}
        />
      </label>
      <button className="sr-button border-accent/40 text-accent" disabled={busy || !code.trim()}>
        {busy && <Spinner />}
        Tham gia project
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-rose-700">
          {error}
        </p>
      )}
    </form>
  );
}
