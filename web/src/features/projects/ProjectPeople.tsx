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
const json = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data ?? {}),
});

// Who created the project and who reviews and annotates it. The leader adds members by
// username, moves or removes them, and can hand out an invite code per role instead. A
// reviewer can add annotators.
export function ProjectPeople({
  project,
  collection = '/projects',
}: {
  project: Pick<Project, 'id' | 'my_role'>;
  // The API collection the project belongs to: 3D projects have their own.
  collection?: string;
}) {
  const leader = project.my_role === 'leader';
  const canAdd = leader || project.my_role === 'reviewer';
  const base = `${collection}/${project.id}`;
  const [people, setPeople] = useState<People | null>(null);
  // Member accounts not in the project yet, offered while typing a username.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<MemberRole>(leader ? 'reviewer' : 'annotator');
  const [added, setAdded] = useState('');
  // Invite codes are created on the server the first time they are asked for, so they are
  // only fetched once the leader opens that section.
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
      canAdd ? request<string[]>(`${base}/members/candidates`, { signal: c.signal }) : [],
    ])
      .then(([members, names]) => {
        setPeople(members);
        setCandidates(names);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [base, canAdd, attempt]);
  // Runs one write; `key` marks which control is busy.
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError('');
    setAdded('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const reloadCandidates = async () =>
    setCandidates(await request<string[]>(`${base}/members/candidates`));
  const member = (person: Person, current: MemberRole) => (
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
                    json('PATCH', { role: other(current) }),
                  ),
                ),
              )
            }
          >
            Chuyển sang {roleLabel[other(current)]}
          </button>
          <button
            className="sr-button min-h-8 border-rose-300 py-1 text-xs text-rose-700"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!window.confirm(`${ui('Xóa thành viên này khỏi project?')}\n${person.username}`))
                return;
              run(person.id, async () => {
                setPeople(
                  await request<People>(`${base}/members/${person.id}`, { method: 'DELETE' }),
                );
                await reloadCandidates();
              });
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
        <>
          {canAdd && (
            <form
              className="mb-6 flex flex-wrap items-end gap-3"
              data-testid="add-member"
              onSubmit={(e) => {
                e.preventDefault();
                const name = username.trim();
                run('add', async () => {
                  setPeople(
                    await request<People>(
                      `${base}/members`,
                      json('POST', { username: name, role }),
                    ),
                  );
                  setUsername('');
                  setAdded(name);
                  setCandidates((names) => names.filter((n) => n !== name.toLowerCase()));
                });
              }}
            >
              <label className="flex min-w-56 flex-1 flex-col gap-2 text-sm">
                <span className="font-medium">
                  {leader
                    ? 'Thêm thành viên theo tên đăng nhập'
                    : 'Thêm Annotator theo tên đăng nhập'}
                </span>
                <input
                  className="rounded-lg border border-line bg-transparent px-3 py-2"
                  list="member-candidates"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={64}
                  placeholder="Tên đăng nhập"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={busy === 'add'}
                />
                <datalist id="member-candidates">
                  {candidates.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              {leader && (
                <label className="flex flex-col gap-2 text-sm">
                  <span className="font-medium">Vai trò</span>
                  <select
                    className="rounded-lg border border-line bg-transparent px-3 py-2"
                    value={role}
                    onChange={(e) => setRole(e.target.value as MemberRole)}
                    disabled={busy === 'add'}
                  >
                    {GROUPS.map(([value]) => (
                      <option key={value} value={value}>
                        {roleLabel[value]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="sr-button border-accent/40 text-accent"
                disabled={Boolean(busy) || !username.trim()}
              >
                {busy === 'add' && <Spinner />}
                Thêm vào project
              </button>
              {added && (
                <p role="status" className="w-full text-sm text-accent">
                  Đã thêm: {added}
                </p>
              )}
            </form>
          )}
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="eyebrow mb-3 text-muted">Người tạo (Leader)</h3>
              <p className="text-sm font-medium" data-testid="project-creator">
                {people.creator?.username ?? 'Chưa gán — mọi Leader cùng quản lý'}
              </p>
            </div>
            {GROUPS.map(([group, key]) => (
              <div key={group}>
                <h3 className="eyebrow mb-3 text-muted">
                  {roleLabel[group]} ({people[key].length})
                </h3>
                {people[key].length ? (
                  <ul className="space-y-2" data-testid={`project-${key}`}>
                    {people[key].map((person) => member(person, group))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Chưa có ai tham gia.</p>
                )}
              </div>
            ))}
          </div>
          {leader && (
            <details
              className="mt-6 border-t border-line pt-4"
              data-testid="invite-codes"
              onToggle={(e) => {
                if (e.currentTarget.open && !codes)
                  run('codes', async () => setCodes(await request<InviteCodes>(`${base}/invites`)));
              }}
            >
              <summary className="cursor-pointer text-sm font-medium">
                Cách khác: mời bằng mã
              </summary>
              <p className="mt-3 text-sm text-muted">
                Gửi mã cho người cần tham gia; họ tự nhập mã ở trang Projects. Mã dùng được nhiều
                lần và quyết định vai trò.
              </p>
              {!codes ? (
                busy === 'codes' && (
                  <p role="status" className="mt-3 text-sm text-muted">
                    <Spinner />
                    Đang tải mã mời…
                  </p>
                )
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {GROUPS.map(([group]) => (
                    <div key={group} className="rounded-lg border border-line p-3">
                      <p className="text-xs text-muted">Mã mời {roleLabel[group]}</p>
                      <p
                        className="mt-1 font-mono text-lg tracking-widest"
                        data-testid={`invite-${group}`}
                      >
                        {codes[group]}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="sr-button min-h-8 py-1 text-xs"
                          onClick={() =>
                            run('', async () => {
                              await navigator.clipboard.writeText(codes[group]);
                              setCopied(group);
                            })
                          }
                        >
                          {copied === group ? 'Đã sao chép' : 'Sao chép'}
                        </button>
                        <button
                          className="sr-button min-h-8 py-1 text-xs"
                          disabled={Boolean(busy)}
                          onClick={() => {
                            if (!window.confirm(ui('Tạo mã mới? Mã cũ sẽ không dùng được nữa.')))
                              return;
                            run('code-' + group, async () => {
                              setCodes(
                                await request<InviteCodes>(
                                  `${base}/invites`,
                                  json('POST', { role: group }),
                                ),
                              );
                              setCopied('');
                            });
                          }}
                        >
                          Tạo mã mới
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </details>
          )}
        </>
      )}
    </section>
  );
}
