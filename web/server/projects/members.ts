import { randomInt } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Db, MemberRole, ProjectRole, Rows, User } from '../types.ts';

export const MEMBER_ROLES: MemberRole[] = ['reviewer', 'annotator'];
// No 0/O or 1/I, so a code read aloud or retyped is not mistaken.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const newCode = () =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const missing = () => new ReviewError(404, 'Project không tồn tại.');
const memberRole = (value: Untrusted): MemberRole => {
  if (!MEMBER_ROLES.includes(value))
    throw new ReviewError(400, 'Vai trò phải là Reviewer hoặc Annotator.');
  return value;
};

export interface Person {
  id: string;
  username: string;
  joined_at?: string;
}
export interface ProjectPeople {
  creator: Person | null;
  reviewers: Person[];
  annotators: Person[];
}
export type InviteCodes = Record<MemberRole, string>;

export class ProjectMembers {
  pool: Db;
  constructor(pool: Db) {
    this.pool = pool;
  }
  // What `user` is in the project. A project the user has no part in reads as missing, so its
  // existence is not revealed. Projects without a creator (the demo and those made before
  // roles existed) belong to every leader.
  async role(projectId: string, user: User): Promise<ProjectRole> {
    if (!/^[a-f0-9-]{36}$/.test(projectId)) throw missing();
    const [[row]] = await this.pool.execute<Rows>(
      'SELECT p.created_by,m.role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=?',
      [user.id, projectId],
    );
    if (!row) throw missing();
    if (user.role === 'leader') {
      if (row.created_by !== null && row.created_by !== user.id) throw missing();
      return 'leader';
    }
    if (!row.role) throw missing();
    return row.role;
  }
  async people(projectId: string): Promise<ProjectPeople> {
    const [[creator]] = await this.pool.execute<Rows>(
      'SELECT u.id,u.username FROM projects p JOIN users u ON u.id=p.created_by WHERE p.id=?',
      [projectId],
    );
    const [members] = await this.pool.execute<Rows>(
      'SELECT u.id,u.username,m.role,m.joined_at FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.joined_at,u.username',
      [projectId],
    );
    const of = (role: MemberRole) =>
      members
        .filter((m) => m.role === role)
        .map(({ id, username, joined_at }) => ({ id, username, joined_at }));
    return {
      creator: creator ? { id: creator.id, username: creator.username } : null,
      reviewers: of('reviewer'),
      annotators: of('annotator'),
    };
  }
  // One reusable code per role, created the first time the leader asks for them.
  async invites(projectId: string): Promise<InviteCodes> {
    for (let attempt = 0; ; attempt++) {
      const [rows] = await this.pool.execute<Rows>(
        'SELECT role,code FROM project_invites WHERE project_id=?',
        [projectId],
      );
      const codes = Object.fromEntries(rows.map((r) => [r.role, r.code])) as InviteCodes;
      const absent = MEMBER_ROLES.filter((role) => !codes[role]);
      if (!absent.length) return codes;
      if (attempt === 3) throw new Error('Could not create invite codes.');
      // IGNORE: another request made the code first, or the random code is already taken.
      for (const role of absent)
        await this.pool.execute<Rows>(
          'INSERT IGNORE INTO project_invites(project_id,role,code) VALUES (?,?,?)',
          [projectId, role, newCode()],
        );
    }
  }
  // Replaces a role's code; the old one stops working, people who already joined stay.
  async regenerate(projectId: string, input: Untrusted): Promise<InviteCodes> {
    const role = memberRole(input?.role);
    await this.pool.execute<Rows>(
      'INSERT INTO project_invites(project_id,role,code) VALUES (?,?,?) ON DUPLICATE KEY UPDATE code=VALUES(code),created_at=UTC_TIMESTAMP(3)',
      [projectId, role, newCode()],
    );
    return this.invites(projectId);
  }
  // The code decides the role; a member holds one role per project.
  async join(input: Untrusted, user: User) {
    if (user.role !== 'member')
      throw new ReviewError(403, 'Tài khoản Leader không tham gia project bằng mã mời.');
    const code = typeof input?.code === 'string' ? input.code.trim().toUpperCase() : '';
    if (code.length !== CODE_LENGTH || [...code].some((c) => !ALPHABET.includes(c)))
      throw new ReviewError(400, `Mã mời gồm ${CODE_LENGTH} ký tự chữ và số.`);
    const [[invite]] = await this.pool.execute<Rows>(
      'SELECT i.project_id,i.role,p.name FROM project_invites i JOIN projects p ON p.id=i.project_id WHERE i.code=?',
      [code],
    );
    if (!invite) throw new ReviewError(404, 'Mã mời không đúng hoặc đã bị thay.');
    await this.pool.execute<Rows>(
      'INSERT IGNORE INTO project_members(project_id,user_id,role) VALUES (?,?,?)',
      [invite.project_id, user.id, invite.role],
    );
    const [[member]] = await this.pool.execute<Rows>(
      'SELECT role FROM project_members WHERE project_id=? AND user_id=?',
      [invite.project_id, user.id],
    );
    if (member.role !== invite.role)
      throw new ReviewError(
        409,
        `Bạn đã là ${member.role === 'reviewer' ? 'Reviewer' : 'Annotator'} của project này. Leader có thể đổi vai trò cho bạn.`,
      );
    return { project_id: invite.project_id, name: invite.name, role: invite.role as MemberRole };
  }
  async member(projectId: string, userId: string) {
    const [[member]] = await this.pool.execute<Rows>(
      'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',
      [projectId, userId],
    );
    if (!member) throw new ReviewError(404, 'Thành viên không thuộc project này.');
  }
  async setRole(projectId: string, userId: string, input: Untrusted) {
    const role = memberRole(input?.role);
    await this.member(projectId, userId);
    await this.pool.execute<Rows>(
      'UPDATE project_members SET role=? WHERE project_id=? AND user_id=?',
      [role, projectId, userId],
    );
    return this.people(projectId);
  }
  async remove(projectId: string, userId: string) {
    await this.member(projectId, userId);
    await this.pool.execute<Rows>('DELETE FROM project_members WHERE project_id=? AND user_id=?', [
      projectId,
      userId,
    ]);
    return this.people(projectId);
  }
}
