import { test, expect } from '@playwright/test';
import { loginContext } from './fixtures.ts';
import { hint } from '../../src/lib/englishHints.ts';

for (const mode of ['login', 'register']) {
  test(`${mode} shows busy spinner and recovers after failure`, async ({ page }) => {
    await page.goto('/' + mode);
    await page.getByLabel('Tên đăng nhập').fill('loading_test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('loading-test-password');
    if (mode === 'register')
      await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill('loading-test-password');
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/auth/${mode}`, async (route) => {
      await pending;
      await route.fulfill({ status: 400, json: { error: 'Lỗi kiểm thử, vui lòng thử lại.' } });
    });
    const label = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
    await page.getByRole('button', { name: label, exact: true }).click();
    try {
      const busy = page.getByRole('button', {
        name: mode === 'login' ? 'Đang đăng nhập…' : 'Đang tạo tài khoản…',
      });
      await expect(busy).toBeDisabled();
      await expect(busy.getByTestId('loading-spinner')).toBeVisible();
      await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
    } finally {
      release();
    }
    await expect(page.getByRole('alert')).toHaveText('Lỗi kiểm thử, vui lòng thử lại.');
    await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
    await expect(page.getByTestId('loading-spinner')).toHaveCount(0);
  });
}

test('page navigation shows loading until projects arrive, with reduced motion support', async ({
  page,
  context,
}) => {
  await loginContext(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projects/new');
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects', async (route) => {
    await pending;
    await route.continue();
  });
  await page.getByRole('link', { name: hint('Projects'), exact: true }).click();
  try {
    const status = page.getByRole('status').filter({ hasText: 'Đang tải projects' });
    await expect(status.getByTestId('loading-spinner')).toBeVisible();
    expect(await status.locator('svg').evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'none',
    );
  } finally {
    release();
  }
  await expect(page.getByText(hint('Đang tải projects…'), { exact: true })).toHaveCount(0);
});

test('upload stays busy while server processes and clears on error', async ({ page, context }) => {
  await loginContext(context);
  await page.goto('/projects/new');
  await page.getByLabel(hint('Project Name'), { exact: true }).fill('Loading upload test');
  await page
    .getByLabel(hint('Annotation File'), { exact: true })
    .setInputFiles('fixtures/upload/annotations.xml');
  await page
    .getByLabel(hint('Media images'), { exact: true })
    .setInputFiles('fixtures/upload/street.png');
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/import', async (route) => {
    await pending;
    await route.fulfill({ status: 422, json: { error: 'Lỗi upload kiểm thử.' } });
  });
  await page.getByRole('button', { name: hint('Create & Import') }).click();
  try {
    await expect(page.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled();
    await expect(page.getByRole('status').getByTestId('loading-spinner')).toBeVisible();
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('Lỗi upload kiểm thử.');
  await expect(page.getByRole('button', { name: hint('Create & Import') })).toBeEnabled();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByTestId('loading-spinner')).toHaveCount(0);
});
