import { test, expect } from '@playwright/test';
import { credentials } from './fixtures.ts';
async function signIn(page, role) {
  await page.goto('/login');
  const account = credentials(role);
  await page.getByLabel('Tên đăng nhập').fill(account.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}
test('leader login, reload and logout protect the main page', async ({ page, context }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'leader');
  await expect(page).toHaveURL(/\/projects$/);
  // One HttpOnly cookie that the browser drops after the session's hour.
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).toEqual(['access_token']);
  expect(cookies[0].httpOnly).toBe(true);
  const minutes = (cookies[0].expires * 1000 - Date.now()) / 60000;
  expect(minutes).toBeGreaterThan(59);
  expect(minutes).toBeLessThanOrEqual(60);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/projects')).status()).toBe(401);
});
test('member chooses a role after login and cannot open leader pages or APIs', async ({
  page,
  context,
}) => {
  await signIn(page, 'member');
  await expect(page).toHaveURL(/\/role$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/role$/);
  await page.getByRole('button', { name: /Annotator/ }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByLabel('Mã mời từ Leader')).toBeVisible();
  await page.goto('/projects/new');
  await expect(page).toHaveURL(/\/projects$/);
  expect(await (await context.request.get('/api/projects')).json()).toEqual([]);
  for (const route of ['/api/cases', '/api/assets/test'])
    expect((await context.request.get(route)).status()).toBe(403);
  expect((await context.request.post('/api/projects', { data: {} })).status()).toBe(403);
  expect((await context.request.get('/api/projects/demo/annotations')).status()).toBe(404);
});

test('register from login, confirm password, then sign in as a member', async ({ page }) => {
  const { randomUUID } = await import('node:crypto');
  const { testPool } = await import('../db-helpers.ts');
  const { tokenHash } = await import('../../server/auth/service.ts');
  const username = 'browser_signup_' + randomUUID();
  const password = randomUUID();
  const pool = testPool();
  try {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Đăng ký', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(password + 'x');
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await expect(page.getByText('Mật khẩu xác nhận không khớp.')).toBeVisible();
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Đã tạo tài khoản')).toBeVisible();
    await expect(page.getByLabel('Tên đăng nhập')).toHaveValue(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/\/role$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  } finally {
    await pool.execute('DELETE FROM users WHERE username=?', [username]);
    await pool.execute('DELETE FROM auth_login_limits WHERE bucket=?', [
      tokenHash('register:account:' + username),
    ]);
    await pool.end();
  }
});
test('an ended session signs the user out with no refresh', async ({ page, context }) => {
  await signIn(page, 'leader');
  await expect(page).toHaveURL(/\/projects$/);
  await context.clearCookies({ name: 'access_token' });
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});
