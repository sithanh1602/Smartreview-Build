import { loginContext } from './fixtures.ts';
import { hint } from '../../src/lib/englishHints.ts';
import { test, expect } from './fixtures.ts';
test('overview → real case → context → case navigation → refresh', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/overview');
  await expect(page.getByText(hint('Chất lượng annotation, trong một workspace.'))).toBeVisible();
  await page
    .getByRole('link', {
      name: hint('Bắt đầu review'),
    })
    .click();
  await expect(page).toHaveURL(/\/review\/2-422$/);
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 422'),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('img', {
        name: hint('Frame 422, track 2, truck, Risk 70'),
      })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(hint('29.28%'), {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: hint('Trước: frame 421'),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 421'),
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: hint('Sau: frame 423'),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 423'),
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: hint('Phóng to vật thể'),
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: hint('Toàn cảnh'),
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', {
      name: hint('BBox'),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: hint('BBox'),
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page
    .getByRole('button', {
      name: hint('Case tiếp theo'),
    })
    .click();
  await expect(page).not.toHaveURL(/2-422$/);
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: hint('Temporal context'),
    }),
  ).toBeVisible();
  await page.locator('h1').click();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/review\/2-422$/);
  expect(errors).toEqual([]);
});
test('risk filter, search, empty state, URL state and browser back', async ({ page }) => {
  await page.goto('/review');
  await page.getByLabel(hint('Lọc mức risk')).selectOption('medium');
  await expect(page).toHaveURL(/level=medium/);
  const queue = page.getByRole('complementary', {
    name: hint('Danh sách risk cases'),
  });
  await expect(
    queue.getByText(hint('Risk 70'), {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel(hint('Tìm frame, track hoặc class')).fill('470');
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 470'),
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(hint('Tìm frame, track hoặc class'))).toHaveValue('470');
  await page.getByLabel(hint('Tìm frame, track hoặc class')).fill('not-found');
  await expect(page.getByText(hint('Không có case khớp bộ lọc.'))).toBeVisible();
  await page
    .getByRole('button', {
      name: hint('Xóa bộ lọc'),
    })
    .click();
  await expect(queue.getByRole('link')).toHaveCount(9);
  await queue.getByRole('link').first().click();
  await queue.getByRole('link').nth(1).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/review\/2-422$/);
});
test('API error offers retry; unknown routes and cases are handled', async ({ page }) => {
  await page.route('**/api/meta', (route) =>
    route.fulfill({
      status: 503,
      body: '{}',
    }),
  );
  await page.goto('/review');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/meta');
  await page
    .getByRole('button', {
      name: hint('Thử lại'),
    })
    .click();
  await expect(page).toHaveURL(/2-422$/);
  await page.goto('/review/does-not-exist');
  await expect(page.getByText(hint('Không tìm thấy case này'))).toBeVisible();
  await page.goto('/does-not-exist');
  await expect(page.getByText(hint('Trang này không tồn tại.'))).toBeVisible();
});
test('all cached frame images load and small viewport has no horizontal overflow', async ({
  page,
}) => {
  const imageFailures = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/assets/') && !response.ok())
      imageFailures.push(response.url());
  });
  await page.goto('/review/2-422');
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 422'),
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('svg image')).length === 4);
  await expect(page.getByText(hint('Đang tải frame…'))).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/review-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 422'),
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/review-mobile.png',
    fullPage: true,
  });
  expect(imageFailures).toEqual([]);
});
test('review decision persists across reload and a fresh browser context, then can be edited', async ({
  page,
  browser,
}) => {
  await page.goto('/review/2-422');
  await page
    .getByRole('radio', {
      name: hint('Annotation Error'),
      exact: true,
    })
    .check();
  await page
    .getByLabel(hint('Correct Label'), {
      exact: true,
    })
    .fill('car');
  await page
    .getByLabel(hint('Note (optional)'), {
      exact: true,
    })
    .fill('Xe vàng, đã đối chiếu 3 frame.');
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(
    page.getByText(hint('Đã lưu vào MySQL.'), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', {
      name: hint('Reviewed'),
      exact: true,
    }),
  ).toContainText('1');
  await page.reload();
  await expect(
    page.getByLabel(hint('Correct Label'), {
      exact: true,
    }),
  ).toHaveValue('car');
  const context = await browser.newContext();
  await loginContext(context);
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:3110/review/2-422');
  await expect(
    other.getByLabel(hint('Correct Label'), {
      exact: true,
    }),
  ).toHaveValue('car');
  await context.close();
  await page
    .getByRole('radio', {
      name: hint('Correct / False Alarm'),
      exact: true,
    })
    .check();
  await page
    .getByRole('button', {
      name: hint('Update Review'),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', {
      name: hint('Correct / False Alarm'),
      exact: true,
    }),
  ).toContainText('1');
  await page.getByLabel(hint('Lọc trạng thái review')).selectOption('CORRECT');
  await expect(
    page
      .getByRole('complementary', {
        name: hint('Danh sách risk cases'),
      })
      .getByRole('link'),
  ).toHaveCount(1);
});
test('human CVAT dataset shows N/A, no fake track, geometry evidence and all-annotation review', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3111/review');
  await expect(page.getByText(hint('Annotation đơn lẻ.'))).toBeVisible();
  await expect(
    page.getByText(hint('Confidence'), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(hint('N/A'), {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Track #undefined|NaN|YOLO/)).toHaveCount(0);
  await page.getByText(hint('Check coverage · đã chạy / bỏ qua')).click();
  await expect(page.getByText(hint('skipped · missing_track_id'))).toHaveCount(4);
  await expect(page.getByText(hint('Đang tải frame…'))).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/human-desktop.png',
    fullPage: true,
  });
  await page.getByLabel(hint('Phạm vi review')).selectOption('all');
  await expect(page).toHaveURL(/scope=all/);
  const queue = page.getByRole('complementary', {
    name: hint('Danh sách risk cases'),
  });
  await expect(queue.getByRole('link')).toHaveCount(4);
  await queue
    .getByRole('link')
    .filter({
      hasText: 'road',
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: hint('Geometry'),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(hint('Chưa phát hiện bất thường trong các check hiện có.')),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: hint('Geometry'),
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('risk sort and API save failure keep form values without reporting success', async ({
  page,
}) => {
  await page.goto('/review/1-470');
  await page.getByLabel(hint('Sắp xếp case')).selectOption('risk-asc');
  const queue = page.getByRole('complementary', {
    name: hint('Danh sách risk cases'),
  });
  await expect(queue.getByRole('link').first()).toContainText(hint('Risk 50'));
  await page
    .getByRole('radio', {
      name: hint('Unsure'),
      exact: true,
    })
    .check();
  await page
    .getByLabel(hint('Note (optional)'), {
      exact: true,
    })
    .fill('Cần xem thêm.');
  await page.route('**/api/cases/1-470/review', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'MySQL unavailable',
      }),
    }),
  );
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(page.getByRole('alert')).toContainText('MySQL unavailable');
  await expect(
    page.getByLabel(hint('Note (optional)'), {
      exact: true,
    }),
  ).toHaveValue('Cần xem thêm.');
  await expect(
    page.getByRole('region', {
      name: hint('Reviewed'),
      exact: true,
    }),
  ).toContainText('1');
  await page.unroute('**/api/cases/1-470/review');
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(
    page.getByText(hint('Đã lưu vào MySQL.'), {
      exact: true,
    }),
  ).toBeVisible();
});
test('human dataset saves decisions without confidence or track and metrics update', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:3111/review');
  await page
    .getByRole('radio', {
      name: hint('Annotation Error'),
      exact: true,
    })
    .check();
  await page
    .getByLabel(hint('Error Type'), {
      exact: true,
    })
    .selectOption('BBOX');
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('region', {
      name: hint('Confirmed Errors'),
      exact: true,
    }),
  ).toContainText('1');
  await page.reload();
  await expect(
    page.getByLabel(hint('Error Type'), {
      exact: true,
    }),
  ).toHaveValue('BBOX');
});
