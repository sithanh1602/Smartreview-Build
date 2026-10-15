import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import { hashPassword, usernameValue, verifyPassword } from './password.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Db, Role, Rows, User } from '../types.ts';
// One token per sign-in, valid for a fixed hour from then: nothing extends it, so the user is
// signed out when it runs out and has to sign in again.
export const SESSION_MINUTES = 60;
export const SESSION_SECONDS = SESSION_MINUTES * 60;
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
  // SHA-256 of the code that lets someone register as a leader (LEADER_SIGNUP_CODE); without
  // one, leaders are created only with the CLI.
  leaderCode: Buffer | null;
  constructor(pool: Db, { leaderCode = '' }: { leaderCode?: string } = {}) {
    this.pool = pool;
    this.passwordChecks = 0;
    this.leaderCode = leaderCode ? createHash('sha256').update(leaderCode).digest() : null;
  }
  async cleanup() {
    await this.pool.execute<Rows>(
      'DELETE FROM auth_sessions WHERE access_expires_at<=UTC_TIMESTAMP(3)',
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
      Object.keys(input).some(
        (k) => !['username', 'password', 'role', 'leaderCode', 'website'].includes(k),
      ) ||
      typeof input.password !== 'string' ||
      (input.leaderCode !== undefined && typeof input.leaderCode !== 'string') ||
      (input.website !== undefined && typeof input.website !== 'string') ||
      input.password.length < 12 ||
      input.password.length > 128
    )
      throw new ReviewError(
        400,
        'Tên đăng nhập hợp lệ và mật khẩu từ 12 đến 128 ký tự là bắt buộc.',
      );
    const role: Role = input.role ?? 'member';
    if (!ROLES.includes(role))
      throw new ReviewError(400, 'Loại tài khoản phải là Leader hoặc Thành viên.');
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
    if (role === 'leader' && !this.leaderCodeMatches(input.leaderCode))
      throw new ReviewError(403, 'Mã Leader không đúng.');
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
  leaderCodeMatches(code: unknown) {
    if (!this.leaderCode || typeof code !== 'string' || !code) return false;
    return timingSafeEqual(createHash('sha256').update(code).digest(), this.leaderCode);
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
        `INSERT INTO auth_sessions(id,user_id,access_hash,access_expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_MINUTES} MINUTE))`,
        [randomUUID(), u.id, tokenHash(accessToken)],
      );
      const [[session]] = await c.execute<Rows>(
        'SELECT access_expires_at FROM auth_sessions WHERE access_hash=?',
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
  // The signed-in user and when the session ends (ISO time), for the client to sign out then.
  async session(accessToken: unknown) {
    if (!validToken(accessToken)) throw unauthorized();
    const [[u]] = await this.pool.execute<Rows>(
      'SELECT u.id,u.username,u.role,s.access_expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.access_hash=? AND s.access_expires_at>UTC_TIMESTAMP(3) AND u.enabled=1',
      [tokenHash(accessToken)],
    );
    if (!u) throw unauthorized();
    return { user: userView(u as User), expiresAt: expiry(u.access_expires_at) };
  }
  async logout(accessToken: unknown) {
    if (validToken(accessToken))
      await this.pool.execute<Rows>('DELETE FROM auth_sessions WHERE access_hash=?', [
        tokenHash(accessToken),
      ]);
  }
}
