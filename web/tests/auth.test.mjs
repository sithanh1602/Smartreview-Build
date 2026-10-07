import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { AuthService, tokenHash } from '../server/auth/service.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { testPool } from './db-helpers.mjs';
let pool, auth, server, base, reviewer, annotator;
const password = randomUUID();
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
async function call(route, method = 'GET', cookies = '', data, extra = {}) {
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
  auth = new AuthService(pool);
  reviewer = await auth.createUser({
    username: 'review_' + randomUUID(),
    password,
    role: 'reviewer',
  });
  annotator = await auth.createUser({
    username: 'anno_' + randomUUID(),
    password,
    role: 'annotator',
  });
  server = createApp({
    auth,
    distRoot: '/tmp/smartreview-auth-no-dist',
    dataset: { meta: { dataset_id: 'auth-test' } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
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
test('all reviewer APIs require authentication and forbid annotators before dispatch', async () => {
  const cookies = jar(await login(annotator));
  for (const [route, method] of [
    ['/api/projects', 'GET'],
    ['/api/projects/anything', 'DELETE'],
    ['/api/projects/import', 'POST'],
    ['/api/cases', 'GET'],
    ['/api/reviews', 'GET'],
    ['/api/assets/test', 'GET'],
    ['/api/projects/demo/annotations', 'GET'],
    ['/api/projects/demo/ai-check', 'POST'],
  ]) {
    assert.equal((await call(route, method)).status, 401, route);
    assert.equal((await call(route, method, cookies)).status, 403, route);
  }
  assert.equal((await call('/api/annotator/home', 'GET', cookies)).status, 200);
  const reviewCookies = jar(await login(reviewer));
  assert.equal((await call('/api/meta', 'GET', reviewCookies)).status, 200);
  assert.equal((await call('/api/annotator/home', 'GET', reviewCookies)).status, 403);
});
test('session cookies are HttpOnly, scoped, and secrets are hashed in DB, absent from JSON', async () => {
  const res = await login(reviewer),
    cookies = jar(res);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['accessExpiresIn', 'user']);
  for (const c of res.headers.getSetCookie()) {
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Strict/);
    assert.doesNotMatch(c, /Max-Age|Expires=/);
  }
  const [[row]] = await pool.execute('SELECT * FROM auth_sessions WHERE access_hash=?', [
    tokenHash(value(cookies, 'sr_access')),
  ]);
  assert.equal(row.refresh_hash, tokenHash(value(cookies, 'sr_refresh')));
  assert.notEqual(row.access_hash, value(cookies, 'sr_access'));
  const [[u]] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [reviewer.id]);
  assert.match(u.password_hash, /^scrypt\$/);
  assert.notEqual(u.password_hash, password);
});
test('refresh rotates tokens atomically; logout and expiry revoke access', async () => {
  const old = jar(await login(reviewer));
  await pool.execute(
    'UPDATE auth_sessions SET access_expires_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE access_hash=?',
    [tokenHash(value(old, 'sr_access'))],
  );
  assert.equal((await call('/api/auth/me', 'GET', old)).status, 401);
  const responses = await Promise.all([
    call('/api/auth/refresh', 'POST', old, {}),
    call('/api/auth/refresh', 'POST', old, {}),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
  const fresh = jar(responses.find((r) => r.status === 200));
  assert.equal((await call('/api/auth/me', 'GET', fresh)).status, 200);
  assert.equal((await call('/api/auth/me', 'GET', old)).status, 401);
  const logout = await call('/api/auth/logout', 'POST', fresh, {});
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().every((c) => c.includes('Max-Age=0')));
  assert.equal((await call('/api/auth/me', 'GET', fresh)).status, 401);
  assert.equal((await call('/api/auth/refresh', 'POST', fresh, {})).status, 401);
  const expired = jar(await login(reviewer));
  await pool.execute(
    'UPDATE auth_sessions SET refresh_expires_at=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE access_hash=?',
    [tokenHash(value(expired, 'sr_access'))],
  );
  assert.equal((await call('/api/auth/refresh', 'POST', expired, {})).status, 401);
});
test('role changes and disabled accounts take effect for existing tokens', async () => {
  const cookies = jar(await login(reviewer));
  try {
    await pool.execute("UPDATE users SET role='annotator' WHERE id=?", [reviewer.id]);
    assert.equal((await call('/api/meta', 'GET', cookies)).status, 403);
    await pool.execute('UPDATE users SET enabled=0 WHERE id=?', [reviewer.id]);
    assert.equal((await call('/api/auth/me', 'GET', cookies)).status, 401);
    assert.equal((await call('/api/auth/refresh', 'POST', cookies, {})).status, 401);
  } finally {
    await pool.execute("UPDATE users SET enabled=1,role='reviewer' WHERE id=?", [reviewer.id]);
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
  for (const route of [
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/projects/demo',
  ])
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

test('registration validates input, fixes role, hashes password and supports login', async () => {
  const username = 'signup_' + randomUUID();
  const ipBucket = tokenHash('register:ip:127.0.0.1');
  try {
    for (const data of [
      null,
      [],
      { username, password: 'short' },
      { username: 'bad name', password },
      { username, password, role: 'reviewer' },
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
    assert.equal(body.user.role, 'annotator');
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
    assert.equal((await call('/api/annotator/home', 'GET', jar(signedIn))).status, 200);
    assert.equal((await call('/api/projects', 'GET', jar(signedIn))).status, 403);
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
