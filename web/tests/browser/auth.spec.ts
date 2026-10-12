import { test, expect } from '@playwright/test';
import { credentials } from './fixtures.ts';
async function signIn(page, role) {
  await page.goto('/login');
  const account = credentials(role);
  await page.getByLabel('Tên đăng nhập').fill(account.username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}
test('reviewer login, session restore and logout protect the main page', async ({
  page,
  context,
}) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, 'reviewer');
  await expect(page).toHaveURL(/\/projects$/);
  const cookies = await context.cookies();
  expect(
    cookies.filter((c) => c.name.startsWith('sr_')).every((c) => c.httpOnly && c.expires === -1),
  ).toBe(true);
  await context.clearCookies({ name: 'sr_access' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/projects')).status()).toBe(401);
});
test('annotator lands in its workspace and cannot open reviewer pages or APIs', async ({
  page,
  context,
}) => {
  await signIn(page, 'annotator');
  await expect(page).toHaveURL(/\/annotation$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/annotation$/);
  for (const route of [
    '/api/projects',
    '/api/cases',
    '/api/assets/test',
    '/api/projects/demo/annotations',
  ])
    expect((await context.request.get(route)).status()).toBe(403);
  expect((await context.request.delete('/api/projects/demo')).status()).toBe(403);
  expect((await context.request.post('/api/projects/import', { data: {} })).status()).toBe(403);
});

test('register from login, confirm password, then sign in as annotator', async ({ page }) => {
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
    await expect(page).toHaveURL(/\/annotation$/);
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
