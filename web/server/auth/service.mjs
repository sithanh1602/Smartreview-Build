import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ReviewError } from '../../shared/review.mjs';
import { hashPassword, usernameValue, verifyPassword } from './password.mjs';
export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 7 * 24 * 60 * 60;
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const validToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const userView = (u) => ({ id: u.id, username: u.username, role: u.role });
const unauthorized = () => new ReviewError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');

export class AuthService {
  constructor(pool) {
    this.pool = pool;
    this.passwordChecks = 0;
  }
  async cleanup() {
    await this.pool.execute('DELETE FROM auth_sessions WHERE refresh_expires_at<=UTC_TIMESTAMP(3)');
    await this.pool.execute('DELETE FROM auth_login_limits WHERE resets_at<=UTC_TIMESTAMP(3)');
  }
  async createUser({ username, password, role }) {
    username = usernameValue(username);
    if (!['reviewer', 'annotator'].includes(role))
      throw new Error('Role phải là reviewer hoặc annotator.');
    const passwordHash = await hashPassword(password);
    const id = randomUUID();
    await this.pool.execute('INSERT INTO users(id,username,password_hash,role) VALUES (?,?,?,?)', [
      id,
      username,
      passwordHash,
      role,
    ]);
    return { id, username, role };
  }
  async throttle(username, ip) {
    for (const [key, limit] of [
      [`account:${username}`, 10],
      [`ip:${ip}`, 100],
    ]) {
      const bucket = tokenHash(key);
      await this.pool.execute(
        'INSERT INTO auth_login_limits(bucket,resets_at) VALUES (?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(resets_at<=UTC_TIMESTAMP(3),1,attempts+1),resets_at=IF(resets_at<=UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),resets_at)',
        [bucket],
      );
      const [[row]] = await this.pool.execute(
        'SELECT attempts FROM auth_login_limits WHERE bucket=?',
        [bucket],
      );
      if (row.attempts > limit)
        throw new ReviewError(429, 'Đăng nhập quá nhiều lần. Thử lại sau 15 phút.');
    }
  }
  async login(input, ip) {
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
      [[u]] = await this.pool.execute('SELECT * FROM users WHERE username=?', [username]);
      if (!(await verifyPassword(input.password, u?.password_hash)) || !u?.enabled)
        throw new ReviewError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    } finally {
      this.passwordChecks--;
    }
    const accessToken = token(),
      refreshToken = token();
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      // A password reset or disabled account during scrypt must not create a session.
      const [[current]] = await c.execute('SELECT * FROM users WHERE id=? FOR UPDATE', [u.id]);
      if (!current?.enabled || current.password_hash !== u.password_hash) throw unauthorized();
      await c.execute(
        'INSERT INTO auth_sessions(id,user_id,access_hash,refresh_hash,access_expires_at,refresh_expires_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY))',
        [randomUUID(), u.id, tokenHash(accessToken), tokenHash(refreshToken)],
      );
      await c.execute('DELETE FROM auth_login_limits WHERE bucket=?', [
        tokenHash(`account:${username}`),
      ]);
      await c.commit();
      return { user: userView(current), accessToken, refreshToken };
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async authenticate(accessToken) {
    if (!validToken(accessToken)) throw unauthorized();
    const [[u]] = await this.pool.execute(
      'SELECT u.id,u.username,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.access_hash=? AND s.access_expires_at>UTC_TIMESTAMP(3) AND s.refresh_expires_at>UTC_TIMESTAMP(3) AND u.enabled=1',
      [tokenHash(accessToken)],
    );
    if (!u) throw unauthorized();
    return userView(u);
  }
  async refresh(refreshToken) {
    if (!validToken(refreshToken)) throw unauthorized();
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const [[session]] = await c.execute(
        'SELECT s.id AS session_id,u.id,u.username,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=? AND s.refresh_expires_at>UTC_TIMESTAMP(3) AND u.enabled=1 FOR UPDATE',
        [tokenHash(refreshToken)],
      );
      if (!session) throw unauthorized();
      const accessToken = token(),
        nextRefresh = token();
      await c.execute(
        'UPDATE auth_sessions SET access_hash=?,refresh_hash=?,access_expires_at=LEAST(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE),refresh_expires_at) WHERE id=?',
        [tokenHash(accessToken), tokenHash(nextRefresh), session.session_id],
      );
      await c.commit();
      return { user: userView(session), accessToken, refreshToken: nextRefresh };
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async logout(accessToken, refreshToken) {
    for (const [field, value] of [
      ['access_hash', accessToken],
      ['refresh_hash', refreshToken],
    ])
      if (validToken(value))
        await this.pool.execute(`DELETE FROM auth_sessions WHERE ${field}=?`, [tokenHash(value)]);
  }
}
