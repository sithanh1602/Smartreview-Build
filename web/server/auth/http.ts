import { ReviewError } from '../../shared/review.ts';
import { readJson, sameOrigin } from '../projects/upload.ts';
import { SESSION_SECONDS } from './service.ts';
import type { AuthService } from './service.ts';
import type { Json, Req, Res } from '../types.ts';

export function cookie(req: Req, name: string) {
  const values = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
export function checkOrigin(req: Req) {
  sameOrigin(req);
  if (req.headers['sec-fetch-site'] === 'cross-site')
    throw new ReviewError(403, 'Cross-site requests are not allowed.');
}
// The session's only cookie. HttpOnly keeps it from page scripts; Max-Age makes the browser
// drop it when the session ends, though MySQL's expiry is what decides.
export const SESSION_COOKIE = 'access_token';
function cookies(res: Res, accessToken: string | null, secure: boolean) {
  const flags = `; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=${accessToken || ''}; Path=/api${flags}; Max-Age=${accessToken ? SESSION_SECONDS : 0}`,
    // Left by versions that also had a refresh token.
    `sr_access=; Path=/api${flags}; Max-Age=0`,
    `sr_refresh=; Path=/api/auth${flags}; Max-Age=0`,
  ]);
}
export async function handleAuth(
  req: Req,
  res: Res,
  pathname: string,
  { auth, json, secureCookies }: { auth?: AuthService | null; json: Json; secureCookies: boolean },
) {
  if (!pathname.startsWith('/api/auth/')) return false;
  if (!auth) throw new ReviewError(503, 'Dịch vụ đăng nhập chưa sẵn sàng.');
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    json(res, 200, await auth.session(cookie(req, SESSION_COOKIE)));
    return true;
  }
  if (!['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(pathname))
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
    await auth.logout(cookie(req, SESSION_COOKIE));
    cookies(res, null, secureCookies);
    json(res, 200, { ok: true });
  } else {
    const result = await auth.login(body, req.socket.remoteAddress || 'unknown');
    await auth.logout(cookie(req, SESSION_COOKIE));
    cookies(res, result.accessToken, secureCookies);
    json(res, 200, { user: result.user, expiresAt: result.expiresAt });
  }
  return true;
}
