import React, { useEffect, useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import { ui } from '../../lib/i18n';
import { roleLabel } from '../auth/AuthGate';
import type {
  InviteCodes,
  MemberRole,
  Person,
  Project,
  ProjectPeople as People,
} from '../../types.ts';

const GROUPS: [MemberRole, 'reviewers' | 'annotators'][] = [
  ['reviewer', 'reviewers'],
  ['annotator', 'annotators'],
];
const other = (role: MemberRole): MemberRole => (role === 'reviewer' ? 'annotator' : 'reviewer');

// Who created the project and who reviews and annotates it. The leader also sees the invite
// code of each role and can move or remove members.
export function ProjectPeople({ project }: { project: Pick<Project, 'id' | 'my_role'> }) {
  const leader = project.my_role === 'leader';
  const base = `/projects/${project.id}`;
  const [people, setPeople] = useState<People | null>(null);
  const [codes, setCodes] = useState<InviteCodes | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    Promise.all([
      request<People>(`${base}/members`, { signal: c.signal }),
      leader ? request<InviteCodes>(`${base}/invites`, { signal: c.signal }) : null,
    ])
      .then(([members, invites]) => {
        setPeople(members);
        setCodes(invites);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [base, leader, attempt]);
  // Runs one write; `key` marks which control is busy.
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const json = (method: string, data?: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  });
  const member = (person: Person, role: MemberRole) => (
    <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="break-all font-medium">{person.username}</span>
      {leader && (
        <span className="flex gap-2">
          <button
            className="sr-button min-h-8 py-1 text-xs"
            disabled={Boolean(busy)}
            onClick={() =>
              run(person.id, async () =>
                setPeople(
                  await request<People>(
                    `${base}/members/${person.id}`,
                    json('PATCH', { role: other(role) }),
                  ),
                ),
              )
            }
          >
            Chuyển sang {roleLabel[other(role)]}
          </button>
          <button
            className="sr-button min-h-8 border-rose-300 py-1 text-xs text-rose-700"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!window.confirm(`${ui('Xóa thành viên này khỏi project?')}\n${person.username}`))
                return;
              run(person.id, async () =>
                setPeople(
                  await request<People>(`${base}/members/${person.id}`, { method: 'DELETE' }),
                ),
              );
            }}
          >
            Xóa
          </button>
        </span>
      )}
    </li>
  );
  return (
    <section className="panel mb-6 p-6" aria-labelledby="project-people">
      <h2 id="project-people" className="mb-5 text-lg font-semibold">
        Thành viên project
      </h2>
      {error && (
        <p role="alert" className="mb-4 text-sm text-rose-700">
          {error}
          <button className="sr-button ml-4" onClick={() => setAttempt((a) => a + 1)}>
            Thử lại
          </button>
        </p>
      )}
      {!people ? (
        !error && (
          <p role="status" className="text-sm text-muted">
            <Spinner />
            Đang tải thành viên…
          </p>
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="eyebrow mb-3 text-muted">Người tạo (Leader)</h3>
            <p className="text-sm font-medium" data-testid="project-creator">
              {people.creator?.username ?? 'Chưa gán — mọi Leader cùng quản lý'}
            </p>
          </div>
          {GROUPS.map(([role, key]) => (
            <div key={role}>
              <h3 className="eyebrow mb-3 text-muted">
                {roleLabel[role]} ({people[key].length})
              </h3>
              {people[key].length ? (
                <ul className="space-y-2" data-testid={`project-${key}`}>
                  {people[key].map((person) => member(person, role))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Chưa có ai tham gia.</p>
              )}
              {codes && (
                <div className="mt-4 rounded-lg border border-line p-3">
                  <p className="text-xs text-muted">Mã mời {roleLabel[role]}</p>
                  <p
                    className="mt-1 font-mono text-lg tracking-widest"
                    data-testid={`invite-${role}`}
                  >
                    {codes[role]}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="sr-button min-h-8 py-1 text-xs"
                      onClick={() =>
                        run('', async () => {
                          await navigator.clipboard.writeText(codes[role]);
                          setCopied(role);
                        })
                      }
                    >
                      {copied === role ? 'Đã sao chép' : 'Sao chép'}
                    </button>
                    <button
                      className="sr-button min-h-8 py-1 text-xs"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        if (!window.confirm(ui('Tạo mã mới? Mã cũ sẽ không dùng được nữa.')))
                          return;
                        run('code-' + role, async () => {
                          setCodes(
                            await request<InviteCodes>(`${base}/invites`, json('POST', { role })),
                          );
                          setCopied('');
                        });
                      }}
                    >
                      Tạo mã mới
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
