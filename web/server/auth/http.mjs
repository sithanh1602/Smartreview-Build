import { ReviewError } from '../../shared/review.mjs';
import { readJson, sameOrigin } from '../projects/upload.mjs';
import { ACCESS_SECONDS } from './service.mjs';
export function cookie(req, name) {
  const values = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
export function checkOrigin(req) {
  sameOrigin(req);
  if (req.headers['sec-fetch-site'] === 'cross-site')
    throw new ReviewError(403, 'Cross-site requests are not allowed.');
}
function cookies(res, tokens, secure) {
  // Session cookies: no Max-Age except on logout. Token TTLs are enforced by MySQL.
  const flags = `; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}${tokens ? '' : '; Max-Age=0'}`;
  res.setHeader('Set-Cookie', [
    `sr_access=${tokens?.accessToken || ''}; Path=/api${flags}`,
    `sr_refresh=${tokens?.refreshToken || ''}; Path=/api/auth${flags}`,
  ]);
}
export async function handleAuth(req, res, pathname, { auth, json, secureCookies }) {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!auth) throw new ReviewError(503, 'Dịch vụ đăng nhập chưa sẵn sàng.');
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    json(res, 200, { user: await auth.authenticate(cookie(req, 'sr_access')) });
    return true;
  }
  if (
    !['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(
      pathname,
    )
  )
    throw new ReviewError(404, 'Unknown authentication route.');
  if (req.method !== 'POST') throw new ReviewError(405, 'Use POST.');
  checkOrigin(req);
  const body = await readJson(req);
  if (pathname === '/api/auth/register') {
    const user = await auth.register(body, req.socket.remoteAddress || 'unknown');
    json(res, 201, { user });
    return true;
  }
  if (pathname === '/api/auth/logout') {
    await auth.logout(cookie(req, 'sr_access'), cookie(req, 'sr_refresh'));
    cookies(res, null, secureCookies);
    json(res, 200, { ok: true });
  } else {
    const result =
      pathname === '/api/auth/login'
        ? await auth.login(body, req.socket.remoteAddress || 'unknown')
        : await auth.refresh(cookie(req, 'sr_refresh'));
    if (pathname === '/api/auth/login')
      await auth.logout(cookie(req, 'sr_access'), cookie(req, 'sr_refresh'));
    cookies(res, result, secureCookies);
    json(res, 200, { user: result.user, accessExpiresIn: ACCESS_SECONDS });
  }
  return true;
}
