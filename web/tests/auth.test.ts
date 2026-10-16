import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ProjectService } from '../server/projects/service.ts';
import { createApp } from '../server/app.ts';
import { AuthService, tokenHash } from '../server/auth/service.ts';
import { migrate } from '../server/db/migrate.ts';
import { testPool } from './db-helpers.ts';
let pool, auth, server, base, reviewer, annotator;
const password = randomUUID();
const LEADER_CODE = 'leader-' + randomUUID();
const jar = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
const value = (cookies, name) =>
  cookies
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    .slice(name.length + 1);
async function call(route: string, method = 'GET', cookies = '', data?: any, extra = {}) {
  return fetch(base + route, {
    method,
    headers: {
      Cookie: cookies,
      ...extra,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const login = (user) => call('/api/auth/login', 'POST', '', { username: user.username, password });
before(async () => {
  pool = testPool();
  await migrate(pool);
  auth = new AuthService(pool, { leaderCode: LEADER_CODE });
  reviewer = await auth.createUser({
    username: 'review_' + randomUUID(),
    password,
    role: 'leader',
  });
  annotator = await auth.createUser({
    username: 'anno_' + randomUUID(),
    password,
    role: 'member',
  });
  server = createApp({
    auth,
    projects: new ProjectService(pool, '/tmp/smartreview-auth-no-storage'),
    distRoot: '/tmp/smartreview-auth-no-dist',
    dataset: { meta: { dataset_id: 'auth-test' } } as any,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) {
    for (const user of [reviewer, annotator].filter(Boolean)) {
      await pool.execute('DELETE FROM users WHERE id=?', [user.id]);
      await pool.execute('DELETE FROM auth_login_limits WHERE bucket=?', [
        tokenHash('account:' + user.username),
      ]);
    }
    await pool.end();
  }
});
test('all APIs require authentication; members reach only projects they joined', async () => {
  const cookies = jar(await login(annotator));
  // Leader-only routes, then project routes of a project the member is not part of.
  for (const [route, method, denied] of [
    ['/api/projects', 'POST', 403],
    ['/api/cases', 'GET', 403],
    ['/api/reviews', 'GET', 403],
    ['/api/assets/test', 'GET', 403],
    ['/api/guideline/analyze', 'POST', 403],
    ['/api/projects/anything', 'DELETE', 404],
    ['/api/projects/demo/annotations', 'GET', 404],
    ['/api/projects/demo/ai-check', 'POST', 404],
  ] as [string, string, number][]) {
    assert.equal((await call(route, method)).status, 401, route);
    assert.equal((await call(route, method, cookies)).status, denied, route);
  }
  assert.equal((await call('/api/annotator/home', 'GET', cookies)).status, 403);
  const reviewCookies = jar(await login(reviewer));
  assert.equal((await call('/api/meta', 'GET', reviewCookies)).status, 200);
});
test('the only cookie is an HttpOnly access_token; secrets are hashed in DB, absent from JSON', async () => {
  const res = await login(reviewer),
    cookies = jar(res);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'user']);
  const set = res.headers.getSetCookie();
  const session = set.filter((c) => !/Max-Age=0/.test(c));
  assert.equal(session.length, 1);
  assert.match(session[0], /^access_token=[A-Za-z0-9_-]{43}; Path=\/api;/);
  assert.match(session[0], /Max-Age=3600/);
  for (const c of set) {
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Strict/);
  }
  // Cookies from the version with a refresh token are removed.
  assert.ok(set.some((c) => /^sr_refresh=; Path=\/api\/auth;.*Max-Age=0/.test(c)));
  const [[row]] = await pool.execute('SELECT * FROM auth_sessions WHERE access_hash=?', [
    tokenHash(value(cookies, 'access_token')),
  ]);
  assert.equal(row.refresh_hash, null);
  assert.notEqual(row.access_hash, value(cookies, 'access_token'));
  const minutes = (Date.parse(body.expiresAt) - Date.now()) / 60000;
  assert.ok(minutes > 59 && minutes <= 60, `session lasts an hour, got ${minutes} minutes`);
  const me = await (await call('/api/auth/me', 'GET', cookies)).json();
  assert.equal(me.expiresAt, body.expiresAt);
  const [[u]] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [reviewer.id]);
  assert.match(u.password_hash, /^scrypt\$/);
  assert.notEqual(u.password_hash, password);
});
test('the session ends after its hour and cannot be extended; logout revokes it', async () => {
  const old = jar(await login(reviewer));
  assert.equal((await call('/api/auth/me', 'GET', old)).status, 200);
  await pool.execute(
    'UPDATE auth_sessions SET access_expires_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE access_hash=?',
    [tokenHash(value(old, 'access_token'))],
  );
  assert.equal((await call('/api/auth/me', 'GET', old)).status, 401);
  assert.equal((await call('/api/projects', 'GET', old)).status, 401);
  assert.equal((await call('/api/auth/refresh', 'POST', old, {})).status, 404);
  const fresh = jar(await login(reviewer));
  assert.equal((await call('/api/auth/me', 'GET', fresh)).status, 200);
  const logout = await call('/api/auth/logout', 'POST', fresh, {});
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
  assert.equal((await call('/api/auth/me', 'GET', fresh)).status, 401);
});
test('role changes and disabled accounts take effect for existing tokens', async () => {
  const cookies = jar(await login(reviewer));
  try {
    await pool.execute("UPDATE users SET role='member' WHERE id=?", [reviewer.id]);
    assert.equal((await call('/api/meta', 'GET', cookies)).status, 403);
    await pool.execute('UPDATE users SET enabled=0 WHERE id=?', [reviewer.id]);
    assert.equal((await call('/api/auth/me', 'GET', cookies)).status, 401);
  } finally {
    await pool.execute("UPDATE users SET enabled=1,role='leader' WHERE id=?", [reviewer.id]);
  }
});
test('rejects role injection, wrong passwords, cross-origin writes and brute force', async () => {
  assert.equal(
    (
      await call('/api/auth/login', 'POST', '', {
        username: reviewer.username,
        password,
        role: 'reviewer',
      })
    ).status,
    400,
  );
  assert.equal(
    (await call('/api/auth/login', 'POST', '', { username: reviewer.username, password: 'wrong' }))
      .status,
    401,
  );
  const cookies = jar(await login(reviewer));
  for (const route of ['/api/auth/login', '/api/auth/logout', '/api/projects/demo'])
    assert.equal(
      (await call(route, 'POST', cookies, {}, { Origin: 'https://other.invalid' })).status,
      403,
    );
  const username = 'throttle_' + randomUUID(),
    ip = randomUUID();
  try {
    for (let i = 0; i < 10; i++) await auth.throttle(username, ip);
    await assert.rejects(auth.throttle(username, ip), { status: 429 });
  } finally {
    await pool.execute('DELETE FROM auth_login_limits WHERE bucket IN (?,?)', [
      tokenHash('account:' + username),
      tokenHash('ip:' + ip),
    ]);
  }
});

test('registration validates input and account type, hashes password and supports login', async () => {
  const username = 'signup_' + randomUUID();
  const ipBucket = tokenHash('register:ip:127.0.0.1');
  try {
    for (const data of [
      null,
      [],
      { username, password: 'short' },
      { username: 'bad name', password },
      { username, password, role: 'reviewer' },
      { username, password, admin: true },
    ]) {
      assert.equal((await call('/api/auth/register', 'POST', '', data)).status, 400);
    }
    assert.equal((await call('/api/auth/register', 'GET')).status, 405);
    assert.equal(
      (
        await call(
          '/api/auth/register',
          'POST',
          '',
          { username, password },
          { Origin: 'https://other.invalid' },
        )
      ).status,
      403,
    );
    const res = await call('/api/auth/register', 'POST', '', {
      username: username.toUpperCase(),
      password,
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.headers.getSetCookie(), []);
    const body = await res.json();
    assert.equal(body.user.username, username);
    assert.equal(body.user.role, 'member');
    assert.deepEqual(Object.keys(body.user).sort(), ['id', 'role', 'username']);
    const [[row]] = await pool.execute('SELECT password_hash FROM users WHERE username=?', [
      username,
    ]);
    assert.match(row.password_hash, /^scrypt\$/);
    assert.equal(
      (await call('/api/auth/register', 'POST', '', { username, password })).status,
      409,
    );
    const signedIn = await login({ username });
    assert.equal(signedIn.status, 200);
    assert.equal((await call('/api/meta', 'GET', jar(signedIn))).status, 403);
    assert.equal((await call('/api/projects', 'POST', jar(signedIn), {})).status, 403);
    assert.deepEqual(await (await call('/api/projects', 'GET', jar(signedIn))).json(), []);
    await pool.execute('UPDATE auth_login_limits SET attempts=10 WHERE bucket=?', [ipBucket]);
    assert.equal(
      (await call('/api/auth/register', 'POST', '', { username, password })).status,
      429,
    );
  } finally {
    await pool.execute('DELETE FROM users WHERE username=?', [username]);
    await pool.execute('DELETE FROM auth_login_limits WHERE bucket IN (?,?,?)', [
      ipBucket,
      tokenHash('register:account:' + username),
      tokenHash('account:' + username),
    ]);
  }
});
test('a leader account needs the leader code; the hidden field makes registration a no-op', async () => {
  const username = 'lead_' + randomUUID(),
    bot = 'bot_' + randomUUID();
  const ipBucket = tokenHash('register:ip:127.0.0.1');
  const register = (data) => call('/api/auth/register', 'POST', '', data);
  try {
    assert.equal((await register({ username, password, role: 'leader' })).status, 403);
    assert.equal(
      (await register({ username, password, role: 'leader', leaderCode: 'wrong' })).status,
      403,
    );
    assert.equal((await register({ username, password, leaderCode: 1 })).status, 400);
    const res = await register({ username, password, role: 'leader', leaderCode: LEADER_CODE });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).user.role, 'leader');
    const caught = await register({ username: bot, password, website: 'https://spam.invalid' });
    assert.equal(caught.status, 201);
    const [rows] = await pool.execute('SELECT id FROM users WHERE username=?', [bot]);
    assert.equal(rows.length, 0);
    // Without a configured code nobody registers as a leader.
    await assert.rejects(
      new AuthService(pool).register(
        { username: 'x' + username.slice(1), password, role: 'leader', leaderCode: '' },
        randomUUID(),
      ),
      { status: 403 },
    );
  } finally {
    await pool.execute('DELETE FROM users WHERE username IN (?,?)', [username, bot]);
    await pool.execute('DELETE FROM auth_login_limits WHERE bucket IN (?,?,?)', [
      ipBucket,
      tokenHash('register:account:' + username),
      tokenHash('register:account:' + bot),
    ]);
  }
});
test('the creator hides a project from other leaders and shows it again', async () => {
  const other = await auth.createUser({
    username: 'other_' + randomUUID(),
    password,
    role: 'leader',
  });
  const mine = jar(await login(reviewer)),
    theirs = jar(await login(other));
  const created = await call('/api/projects', 'POST', mine, {
    name: 'hidden-' + randomUUID(),
    format: 'smartreview-json',
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const listed = async (cookies) =>
    (await (await call('/api/projects', 'GET', cookies)).json()).find((p) => p.id === id);
  try {
    assert.equal((await listed(theirs)).hidden, false);
    for (const data of [{}, { hidden: 'yes' }, { hidden: true, name: 'x' }])
      assert.equal((await call(`/api/projects/${id}`, 'PATCH', mine, data)).status, 400);
    // Another leader can neither hide it nor, once hidden, see or open it.
    assert.equal(
      (await call(`/api/projects/${id}`, 'PATCH', theirs, { hidden: true })).status,
      403,
    );
    const hide = await call(`/api/projects/${id}`, 'PATCH', mine, { hidden: true });
    assert.deepEqual(await hide.json(), { id, hidden: true });
    assert.equal(await listed(theirs), undefined);
    assert.equal((await call(`/api/projects/${id}/members`, 'GET', theirs)).status, 404);
    assert.equal(
      (await call(`/api/projects/${id}`, 'PATCH', theirs, { hidden: false })).status,
      404,
    );
    assert.equal((await listed(mine)).hidden, true);
    assert.equal((await call(`/api/projects/${id}/members`, 'GET', mine)).status, 200);
    await call(`/api/projects/${id}`, 'PATCH', mine, { hidden: false });
    assert.equal((await listed(theirs)).hidden, false);
  } finally {
    await call(`/api/projects/${id}`, 'DELETE', mine);
    await pool.execute('DELETE FROM users WHERE id=?', [other.id]);
    await pool.execute('DELETE FROM auth_login_limits WHERE bucket=?', [
      tokenHash('account:' + other.username),
    ]);
  }
});
