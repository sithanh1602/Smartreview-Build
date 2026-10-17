import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { request } from '../../lib/api';
import { roleLabel } from '../auth/AuthGate';
import type { MemberRole, Person, Project, ProjectPeople as People } from '../../types.ts';

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

export function ProjectPeople({
  project,
  collection = '/projects',
}: {
  project: Pick<Project, 'id' | 'my_role'>;
  collection?: string;
}) {
  const leader = project.my_role === 'leader';
  const canAdd = leader || project.my_role === 'reviewer';
  const base = `${collection}/${project.id}`;
  const [people, setPeople] = useState<People | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    request<People>(`${base}/members`, { signal: c.signal })
      .then(setPeople)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [base, attempt]);
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError('');
    setAdded([]);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
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
              setRemoveError('');
              setRemoving(person);
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="project-people" className="text-lg font-semibold">
          Thành viên project
        </h2>
        {canAdd && people && (
          <button
            className="sr-button border-accent/40 text-accent"
            data-testid="open-add-members"
            disabled={Boolean(busy)}
            onClick={() => {
              setAdded([]);
              setAdding(true);
            }}
          >
            Xem thành viên
          </button>
        )}
      </div>
      {added.length > 0 && (
        <p role="status" className="mb-4 text-sm text-accent">
          Đã thêm: {added.join(', ')}
        </p>
      )}
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
        </>
      )}
      {adding && (
        <AddMembersDialog
          base={base}
          leader={leader}
          onClose={() => setAdding(false)}
          onAdded={(next, names) => {
            setPeople(next);
            setAdded(names);
            setAdding(false);
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Xóa thành viên khỏi project?"
        confirmLabel="Xóa thành viên"
        cancelLabel="Hủy"
        busy={busy === 'remove'}
        error={removeError}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy('remove');
          setRemoveError('');
          setAdded([]);
          try {
            setPeople(
              await request<People>(`${base}/members/${removing.id}`, { method: 'DELETE' }),
            );
            setRemoving(null);
          } catch (e) {
            setRemoveError((e as Error).message);
          } finally {
            setBusy('');
          }
        }}
      >
        <strong className="break-all">{removing?.username}</strong> sẽ không vào được project này
        nữa. Bạn thêm lại được bất cứ lúc nào.
      </ConfirmDialog>
    </section>
  );
}

function AddMembersDialog({
  base,
  leader,
  onClose,
  onAdded,
}: {
  base: string;
  leader: boolean;
  onClose: () => void;
  onAdded: (people: People, names: string[]) => void;
}) {
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [role, setRole] = useState<MemberRole>(leader ? 'reviewer' : 'annotator');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    request<string[]>(`${base}/members/candidates`, { signal: c.signal })
      .then(setCandidates)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [base]);
  const needle = filter.trim().toLowerCase();
  const shown = candidates?.filter((name) => name.includes(needle)) ?? [];
  const allShown = shown.length > 0 && shown.every((name) => chosen.has(name));
  const toggle = (names: string[], on: boolean) => {
    const next = new Set(chosen);
    for (const name of names) on ? next.add(name) : next.delete(name);
    setChosen(next);
  };
  async function add() {
    setSending(true);
    setError('');
    try {
      const names = [...chosen];
      onAdded(
        await request<People>(`${base}/members`, json('POST', { usernames: names, role })),
        names,
      );
    } catch (e) {
      setError((e as Error).message);
      setSending(false);
    }
  }
  return (
    <Modal isOpen onOpenChange={(open) => !open && !sending && onClose()}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog aria-label="Thêm thành viên" data-testid="add-members">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{leader ? 'Thêm thành viên' : 'Thêm Annotator'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <fieldset disabled={sending}>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-40 flex-1 flex-col gap-2 text-sm">
                    <span className="font-medium">Tìm tài khoản</span>
                    <input
                      className="rounded-lg border border-line bg-transparent px-3 py-2"
                      type="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Tên đăng nhập"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  {leader && (
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="font-medium">Vai trò</span>
                      <select
                        className="rounded-lg border border-line bg-transparent px-3 py-2"
                        value={role}
                        onChange={(e) => setRole(e.target.value as MemberRole)}
                      >
                        {GROUPS.map(([value]) => (
                          <option key={value} value={value}>
                            {roleLabel[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {!candidates ? (
                  !error && (
                    <p role="status" className="mt-4 text-sm text-muted">
                      <Spinner />
                      Đang tải danh sách tài khoản…
                    </p>
                  )
                ) : !candidates.length ? (
                  <p className="mt-4 text-sm text-muted">
                    Mọi tài khoản thành viên đều đã ở trong project.
                  </p>
                ) : (
                  <>
                    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allShown}
                          disabled={!shown.length}
                          onChange={(e) => toggle(shown, e.target.checked)}
                        />
                        {needle ? 'Chọn tất cả kết quả' : 'Chọn tất cả'}
                      </label>
                      <span className="text-muted">Đã chọn {chosen.size}</span>
                    </div>
                    <ul
                      className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-2"
                      data-testid="member-candidates"
                    >
                      {shown.map((name) => (
                        <li key={name}>
                          <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/5">
                            <input
                              type="checkbox"
                              checked={chosen.has(name)}
                              onChange={(e) => toggle([name], e.target.checked)}
                            />
                            <span className="break-all">{name}</span>
                          </label>
                        </li>
                      ))}
                      {!shown.length && (
                        <li className="px-2 py-1 text-sm text-muted">Không có tài khoản khớp.</li>
                      )}
                    </ul>
                  </>
                )}
              </fieldset>
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-700">
                  {error}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={sending} onPress={onClose}>
                Hủy
              </Button>
              <Button variant="primary" isDisabled={sending || !chosen.size} onPress={add}>
                {sending && <Spinner />}
                {chosen.size > 1 ? `Thêm ${chosen.size} thành viên` : 'Thêm thành viên'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
