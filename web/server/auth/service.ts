import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import { EXTENSION_MINUTES, MAX_EXTENSIONS, SESSION_MINUTES } from '../../shared/session.ts';
import { hashPassword, usernameValue, verifyPassword } from './password.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Db, Result, Role, Rows, User } from '../types.ts';
// One token per sign-in, valid for an hour from then. In its last minutes the user may ask for
// 5 more minutes, at most 3 times (so 75 minutes in all); after that they have to sign in again.
export { SESSION_MINUTES };
export const SESSION_SECONDS = SESSION_MINUTES * 60;
// An extension is only granted this close to the end, so they cannot be stacked up early.
const EXTEND_WITHIN_MINUTES = 2;
const LONGEST_MINUTES = SESSION_MINUTES + MAX_EXTENSIONS * EXTENSION_MINUTES;
// Extensions left, from how far the expiry still is from the longest a session may last. A
// session written before created_at was UTC can sit in the future there: it gets none.
const EXTENSIONS_LEFT = `IF(s.created_at>UTC_TIMESTAMP(3), 0, GREATEST(0, FLOOR(TIMESTAMPDIFF(SECOND, s.access_expires_at, DATE_ADD(s.created_at, INTERVAL ${LONGEST_MINUTES} MINUTE))/${EXTENSION_MINUTES * 60})))`;
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const validToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const userView = (u: User): User => ({ id: u.id, username: u.username, role: u.role });
const ROLES: Role[] = ['leader', 'member'];
// The pool returns DATETIME as UTC text ("2026-10-15 08:00:00.000").
const expiry = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toISOString();
const unauthorized = () => new ReviewError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

export class AuthService {
  pool: Db;
  passwordChecks: number;
  constructor(pool: Db) {
    this.pool = pool;
    this.passwordChecks = 0;
  }
  async cleanup() {
    await this.pool.execute<Rows>(
      // A session from the old code (refresh token) lives until its refresh expiry.
      'DELETE FROM auth_sessions WHERE access_expires_at<=UTC_TIMESTAMP(3) AND (refresh_expires_at IS NULL OR refresh_expires_at<=UTC_TIMESTAMP(3))',
    );
    await this.pool.execute<Rows>(
      'DELETE FROM auth_login_limits WHERE resets_at<=UTC_TIMESTAMP(3)',
    );
  }
  async createUser({
    username,
    password,
    role,
  }: {
    username: unknown;
    password: unknown;
    role: Role;
  }): Promise<User> {
    const name = usernameValue(username);
    if (!ROLES.includes(role)) throw new Error('Role phải là leader hoặc member.');
    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    await this.pool.execute<Rows>(
      'INSERT INTO users(id,username,password_hash,role) VALUES (?,?,?,?)',
      [id, name, passwordHash, role],
    );
    return { id, username: name, role };
  }
  async register(input: Untrusted, ip: string) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => !['username', 'password', 'website'].includes(k)) ||
      typeof input.password !== 'string' ||
      (input.website !== undefined && typeof input.website !== 'string') ||
      input.password.length < 12 ||
      input.password.length > 128
    )
      throw new ReviewError(
        400,
        'Tên đăng nhập hợp lệ và mật khẩu từ 12 đến 128 ký tự là bắt buộc.',
      );
    const role: Role = 'member';
    let username;
    try {
      username = usernameValue(input.username);
    } catch (e) {
      throw new ReviewError(400, (e as Error).message);
    }
    await this.throttle(username, ip, 'register');
    // `website` is a field people never see: a bot that fills it is told it succeeded, and
    // nothing is created.
    if (input.website) return { id: randomUUID(), username, role: 'member' as Role };
    if (this.passwordChecks >= 2)
      throw new ReviewError(429, 'Hệ thống đang bận. Vui lòng thử lại.');
    this.passwordChecks++;
    try {
      return await this.createUser({ username, password: input.password, role });
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ReviewError(409, 'Tên đăng nhập đã tồn tại.');
      throw e;
    } finally {
      this.passwordChecks--;
    }
  }
  async throttle(username: string, ip: string, action = 'login') {
    for (const [key, limit] of [
      [action === 'login' ? `account:${username}` : `register:account:${username}`, 10],
      [action === 'login' ? `ip:${ip}` : `register:ip:${ip}`, action === 'login' ? 100 : 10],
    ] as [string, number][]) {
      const bucket = tokenHash(key);
      await this.pool.execute<Rows>(
        'INSERT INTO auth_login_limits(bucket,resets_at) VALUES (?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(resets_at<=UTC_TIMESTAMP(3),1,attempts+1),resets_at=IF(resets_at<=UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),resets_at)',
        [bucket],
      );
      const [[row]] = await this.pool.execute<Rows>(
        'SELECT attempts FROM auth_login_limits WHERE bucket=?',
        [bucket],
      );
      if (row.attempts > limit)
        throw new ReviewError(
          429,
          `${action === 'login' ? 'Đăng nhập' : 'Đăng ký'} quá nhiều lần. Thử lại sau 15 phút.`,
        );
    }
  }
  async login(input: Untrusted, ip: string) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => !['username', 'password'].includes(k)) ||
      typeof input.password !== 'string' ||
      input.password.length > 128 ||
      !input.password.length
    )
      throw new ReviewError(400, 'Nhập tên đăng nhập và mật khẩu hợp lệ.');
    let username;
    try {
      username = usernameValue(input.username);
    } catch {
      throw new ReviewError(400, 'Tên đăng nhập không hợp lệ.');
    }
    await this.throttle(username, ip);
    if (this.passwordChecks >= 2)
      throw new ReviewError(429, 'Hệ thống đang bận. Vui lòng thử lại.');
    this.passwordChecks++;
    let u;
    try {
      [[u]] = await this.pool.execute<Rows>('SELECT * FROM users WHERE username=?', [username]);
      if (!(await verifyPassword(input.password, u?.password_hash)) || !u?.enabled)
        throw new ReviewError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    } finally {
      this.passwordChecks--;
    }
    const accessToken = token();
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      // A password reset or disabled account during scrypt must not create a session.
      const [[current]] = await c.execute<Rows>('SELECT * FROM users WHERE id=? FOR UPDATE', [
        u.id,
      ]);
      if (!current?.enabled || current.password_hash !== u.password_hash) throw unauthorized();
      await c.execute<Rows>(
        // created_at in UTC like the expiry: the extension limit is counted from it.
        `INSERT INTO auth_sessions(id,user_id,access_hash,access_expires_at,created_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_MINUTES} MINUTE),UTC_TIMESTAMP(3))`,
        [randomUUID(), u.id, tokenHash(accessToken)],
      );
      const [[session]] = await c.execute<Rows>(
        `SELECT s.access_expires_at, ${EXTENSIONS_LEFT} AS extensions_left FROM auth_sessions s WHERE s.access_hash=?`,
        [tokenHash(accessToken)],
      );
      await c.execute<Rows>('DELETE FROM auth_login_limits WHERE bucket=?', [
        tokenHash(`account:${username}`),
      ]);
      await c.commit();
      return {
        user: userView(current as User),
        accessToken,
        expiresAt: expiry(session.access_expires_at),
        extensionsLeft: Number(session.extensions_left),
      };
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async authenticate(accessToken: unknown) {
    return (await this.session(accessToken)).user;
  }
  // The signed-in user, when the session ends (ISO time) for the client to sign out then, and
  // how many 5-minute extensions are left.
  async session(accessToken: unknown) {
    if (!validToken(accessToken)) throw unauthorized();
    const [[u]] = await this.pool.execute<Rows>(
      `SELECT u.id,u.username,u.role,s.access_expires_at,${EXTENSIONS_LEFT} AS extensions_left FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.access_hash=? AND s.access_expires_at>UTC_TIMESTAMP(3) AND u.enabled=1`,
      [tokenHash(accessToken)],
    );
    if (!u) throw unauthorized();
    return {
      user: userView(u as User),
      expiresAt: expiry(u.access_expires_at),
      extensionsLeft: Number(u.extensions_left),
    };
  }
  // 5 more minutes for a live session in its last minutes, while it has extensions left.
  async extend(accessToken: unknown) {
    if (!validToken(accessToken)) throw unauthorized();
    const [result] = await this.pool.execute<Result>(
      `UPDATE auth_sessions SET access_expires_at=DATE_ADD(access_expires_at, INTERVAL ${EXTENSION_MINUTES} MINUTE) WHERE access_hash=? AND access_expires_at>UTC_TIMESTAMP(3) AND access_expires_at<=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${EXTEND_WITHIN_MINUTES} MINUTE) AND created_at<=UTC_TIMESTAMP(3) AND DATE_ADD(access_expires_at, INTERVAL ${EXTENSION_MINUTES} MINUTE)<=DATE_ADD(created_at, INTERVAL ${LONGEST_MINUTES} MINUTE)`,
      [tokenHash(accessToken)],
    );
    const session = await this.session(accessToken);
    if (!result.affectedRows)
      throw new ReviewError(
        409,
        session.extensionsLeft
          ? `Chỉ gia hạn được trong ${EXTEND_WITHIN_MINUTES} phút cuối của phiên.`
          : 'Đã dùng hết lượt gia hạn. Hãy đăng nhập lại.',
      );
    return session;
  }
  async logout(accessToken: unknown) {
    if (validToken(accessToken))
      await this.pool.execute<Rows>('DELETE FROM auth_sessions WHERE access_hash=?', [
        tokenHash(accessToken),
      ]);
  }
}
