import { test, expect } from '@playwright/test';
import { credentials } from './fixtures.js';
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
