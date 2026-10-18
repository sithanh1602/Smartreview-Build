import { ReviewError } from '../../shared/review.ts';
import { usernameValue } from '../auth/password.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Db, MemberRole, ProjectRole, Rows, User } from '../types.ts';

export const MEMBER_ROLES: MemberRole[] = ['reviewer', 'annotator'];
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

export interface MemberTables {
  projects: string;
  members: string;
}
const TABLES_2D: MemberTables = {
  projects: 'projects',
  members: 'project_members',
};
export const TABLES_3D: MemberTables = {
  projects: 'projects_3d',
  members: 'project_members_3d',
};

export class ProjectMembers {
  pool: Db;
  t: MemberTables;
  constructor(pool: Db, tables: MemberTables = TABLES_2D) {
    this.pool = pool;
    this.t = tables;
  }
  async role(projectId: string, user: User): Promise<ProjectRole> {
    if (!/^[a-f0-9-]{36}$/.test(projectId)) throw missing();
    const [[row]] = await this.pool.execute<Rows>(
      `SELECT p.created_by,p.hidden,m.role FROM ${this.t.projects} p LEFT JOIN ${this.t.members} m ON m.project_id=p.id AND m.user_id=? WHERE p.id=?`,
      [user.id, projectId],
    );
    if (!row) throw missing();
    if (user.role === 'leader') {
      if (row.hidden && row.created_by !== user.id) throw missing();
      return 'leader';
    }
    if (!row.role) throw missing();
    return row.role;
  }
  async owns(projectId: string, user: User) {
    const [[row]] = await this.pool.execute<Rows>(
      `SELECT created_by FROM ${this.t.projects} WHERE id=?`,
      [projectId],
    );
    if (!row) throw missing();
    return user.role === 'leader' && (row.created_by === null || row.created_by === user.id);
  }
  async people(projectId: string): Promise<ProjectPeople> {
    const [[creator]] = await this.pool.execute<Rows>(
      `SELECT u.id,u.username FROM ${this.t.projects} p JOIN users u ON u.id=p.created_by WHERE p.id=?`,
      [projectId],
    );
    const [members] = await this.pool.execute<Rows>(
      `SELECT u.id,u.username,m.role,m.joined_at FROM ${this.t.members} m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.joined_at,u.username`,
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
  async candidates(projectId: string): Promise<string[]> {
    const [rows] = await this.pool.execute<Rows>(
      `SELECT u.username FROM users u WHERE u.role='member' AND u.enabled=1 AND NOT EXISTS (SELECT 1 FROM ${this.t.members} m WHERE m.project_id=? AND m.user_id=u.id) ORDER BY u.username LIMIT 200`,
      [projectId],
    );
    return rows.map((r) => r.username);
  }
  async add(projectId: string, input: Untrusted) {
    const role = memberRole(input?.role);
    const given = Array.isArray(input?.usernames) ? input.usernames : [input?.username];
    if (!given.length || given.length > 200)
      throw new ReviewError(400, 'Chọn từ 1 đến 200 tài khoản.');
    let usernames: string[];
    try {
      usernames = [...new Set(given.map((u: Untrusted) => usernameValue(u)))] as string[];
    } catch {
      throw new ReviewError(400, 'Tên đăng nhập không hợp lệ.');
    }
    const [users] = await this.pool.query<Rows>(
      'SELECT id,username,role,enabled FROM users WHERE username IN (?)',
      [usernames],
    );
    const found = new Map(users.map((u) => [u.username.toLowerCase(), u]));
    const unknown = usernames.filter((u) => !found.get(u.toLowerCase())?.enabled);
    if (unknown.length)
      throw new ReviewError(
        404,
        unknown.length === 1 && usernames.length === 1
          ? 'Không tìm thấy tài khoản này.'
          : `Không tìm thấy tài khoản: ${unknown.join(', ')}`,
      );
    if (users.some((u) => u.role !== 'member'))
      throw new ReviewError(409, 'Tài khoản Leader không thể làm thành viên project.');
    const ids = users.map((u) => u.id);
    const [taken] = await this.pool.query<Rows>(
      `SELECT u.username,m.role FROM ${this.t.members} m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.user_id IN (?) AND m.role<>?`,
      [projectId, ids, role],
    );
    if (taken.length)
      throw new ReviewError(
        409,
        taken.length === 1 && usernames.length === 1
          ? `Tài khoản này đã là ${taken[0].role === 'reviewer' ? 'Reviewer' : 'Annotator'} của project. Đổi vai trò trong danh sách thành viên.`
          : `Đã ở project với vai trò khác: ${taken.map((t) => t.username).join(', ')}. Đổi vai trò trong danh sách thành viên.`,
      );
    await this.pool.query<Rows>(
      `INSERT IGNORE INTO ${this.t.members}(project_id,user_id,role) VALUES ?`,
      [ids.map((id) => [projectId, id, role])],
    );
    return this.people(projectId);
  }
  async member(projectId: string, userId: string) {
    const [[member]] = await this.pool.execute<Rows>(
      `SELECT 1 FROM ${this.t.members} WHERE project_id=? AND user_id=?`,
      [projectId, userId],
    );
    if (!member) throw new ReviewError(404, 'Thành viên không thuộc project này.');
  }
  async setRole(projectId: string, userId: string, input: Untrusted) {
    const role = memberRole(input?.role);
    await this.member(projectId, userId);
    await this.pool.execute<Rows>(
      `UPDATE ${this.t.members} SET role=? WHERE project_id=? AND user_id=?`,
      [role, projectId, userId],
    );
    return this.people(projectId);
  }
  async remove(projectId: string, userId: string) {
    await this.member(projectId, userId);
    await this.pool.execute<Rows>(
      `DELETE FROM ${this.t.members} WHERE project_id=? AND user_id=?`,
      [projectId, userId],
    );
    return this.people(projectId);
  }
}
