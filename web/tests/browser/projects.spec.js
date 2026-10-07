import { loginContext } from './fixtures.js';
import { hint } from '../../src/lib/englishHints.js';
import { test, expect } from './fixtures.js';
import path from 'node:path';
const fixture = path.resolve('fixtures/upload');
async function importProject(page, name, format = 'cvat-images') {
  await page.goto('/projects');
  await page
    .getByRole('link', {
      name: hint('+ New Project'),
    })
    .click();
  await page
    .getByLabel(hint('Project Name'), {
      exact: true,
    })
    .fill(name);
  await page
    .getByLabel(hint('Annotation Format'), {
      exact: true,
    })
    .selectOption(format);
  await page
    .getByLabel(hint('Annotation File'), {
      exact: true,
    })
    .setInputFiles(
      path.join(
        fixture,
        format === 'cvat-images'
          ? 'annotations.xml'
          : format === 'coco-detection'
            ? 'coco.json'
            : 'dataset.json',
      ),
    );
  await page
    .getByLabel(hint('Media images'), {
      exact: true,
    })
    .setInputFiles(path.join(fixture, 'street.png'));
  await page
    .getByRole('button', {
      name: hint('Create & Import'),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId('metric-Risk Cases')).toHaveText('1');
  return page.url();
}
test('COCO Detection can be selected, imported and reviewed with custom categories', async ({
  page,
}) => {
  const url = await importProject(page, 'Custom COCO', 'coco-detection');
  await expect(page.getByTestId('metric-Tracks')).toHaveText(hint('N/A'));
  await page.goto(url + '/review/coco-100');
  await expect(page.getByLabel('Annotations in frame')).toContainText('delivery_vehicle');
  await expect(page.getByTestId('annotation-box')).toHaveCount(1);
  await page.getByRole('radio', { name: hint('Unsure'), exact: true }).check();
  await page.getByRole('button', { name: hint('Save Review'), exact: true }).click();
  await expect(page.getByText(hint('Đã lưu vào MySQL.'), { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: hint('Unsure'), exact: true })).toBeChecked();
});
test('create CVAT project, import, review, reload, second identical JSON project stays independent', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const a = await importProject(page, 'Human Road A');
  await expect(page.getByTestId('metric-Tracks')).toHaveText(hint('N/A'));
  await page.screenshot({
    path: 'test-results/project-dashboard.png',
    fullPage: true,
  });
  await page
    .getByRole('link', {
      name: hint('Start Review'),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: hint('Why flagged'),
    }),
  ).toBeVisible();
  await expect(page.getByText(hint('N/A')).first()).toBeVisible();
  await expect(page.getByText(hint('Đang tải frame…'))).toHaveCount(0);
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
    .getByLabel(hint('Note (optional)'), {
      exact: true,
    })
    .fill('BBox vượt mép ảnh — kiểm thử project A');
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(page.getByText(hint('Đã lưu vào MySQL'))).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel(hint('Note (optional)'), {
      exact: true,
    }),
  ).toHaveValue('BBox vượt mép ảnh — kiểm thử project A');
  const b = await importProject(page, 'Human Road B', 'smartreview-json');
  expect(b).not.toBe(a);
  await expect(page.getByTestId('metric-Reviewed')).toHaveText('0');
  await page
    .getByRole('link', {
      name: hint('Start Review'),
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel(hint('Note (optional)'), {
      exact: true,
    }),
  ).toHaveValue('');
  await page
    .getByRole('radio', {
      name: hint('Unsure'),
      exact: true,
    })
    .check();
  await page
    .getByRole('button', {
      name: hint('Save Review'),
      exact: true,
    })
    .click();
  await expect(page.getByText(hint('Đã lưu vào MySQL'))).toBeVisible();
  await page
    .getByRole('link', {
      name: hint('Current Project'),
      exact: true,
    })
    .click();
  await expect(page.getByTestId('metric-Reviewed')).toHaveText('1');
  const fresh = await browser.newContext();
  await loginContext(fresh);
  const tab = await fresh.newPage();
  await tab.goto(a);
  await expect(tab.getByTestId('metric-Reviewed')).toHaveText('1');
  await fresh.close();
  await page.goto('/projects');
  await expect(
    page.getByRole('heading', {
      name: 'Human Road A',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Human Road B',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/projects-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/projects-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('invalid import shows error and retry succeeds without creating another project', async ({
  page,
}) => {
  await page.goto('/projects/new');
  await page
    .getByLabel(hint('Project Name'), {
      exact: true,
    })
    .fill('Retry dataset');
  await page.getByLabel(hint('Annotation Format')).selectOption('smartreview-json');
  await page
    .getByLabel(hint('Annotation File'), {
      exact: true,
    })
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{'),
    });
  await page
    .getByLabel(hint('Media images'), {
      exact: true,
    })
    .setInputFiles(path.join(fixture, 'street.png'));
  await page
    .getByRole('button', {
      name: hint('Create & Import'),
    })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page
    .getByLabel(hint('Annotation File'), {
      exact: true,
    })
    .setInputFiles(path.join(fixture, 'dataset.json'));
  await page
    .getByRole('button', {
      name: hint('Create & Import'),
    })
    .click();
  await expect(page.getByTestId('metric-Risk Cases')).toHaveText('1');
  await page.goto('/projects');
  await expect(
    page.getByRole('heading', {
      name: 'Retry dataset',
      exact: true,
    }),
  ).toHaveCount(1);
});
test('registered demo project retains frame 422 and project scoped navigation', async ({
  page,
}) => {
  await page.goto('/projects');
  await page
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', {
        name: 'Traffic Demo',
        exact: true,
      }),
    })
    .click();
  await expect(page.getByTestId('metric-Annotations')).toHaveText('3742');
  await expect(page.getByTestId('metric-Risk Cases')).toHaveText('9');
  const projectUrl = page.url();
  await page
    .getByRole('link', {
      name: hint('Start Review'),
    })
    .click();
  await expect(page).toHaveURL(projectUrl + '/review/2-422');
  await expect(
    page.getByRole('heading', {
      name: hint('Frame 422'),
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: hint('Case tiếp theo'),
    })
    .click();
  expect(page.url()).toContain(projectUrl + '/review/');
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: hint('Temporal context'),
    }),
  ).toBeVisible();
});
test('created project can be reopened and imported from its dashboard', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/projects', {
    data: {
      name: 'Resume upload',
      format: 'smartreview-json',
    },
  });
  expect(res.status()).toBe(201);
  const p = await res.json();
  await page.goto(`/projects/${p.id}`);
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Resume upload',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel(hint('Annotation File'), {
      exact: true,
    })
    .setInputFiles(path.join(fixture, 'dataset.json'));
  await page
    .getByLabel(hint('Media images'), {
      exact: true,
    })
    .setInputFiles(path.join(fixture, 'street.png'));
  await page
    .getByRole('button', {
      name: hint('Import Dataset'),
      exact: true,
    })
    .click();
  await expect(page.getByTestId('metric-Risk Cases')).toHaveText('1');
});
