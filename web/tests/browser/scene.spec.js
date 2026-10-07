import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import { hint } from '../../src/lib/englishHints.js';

async function sceneProject(request, count = 4) {
  const data = JSON.parse(await fs.readFile('fixtures/upload/dataset.json', 'utf8'));
  data.annotations = Array.from({ length: count }, (_, i) => ({
    id: `object-${i}`,
    frame_id: 'image-0:0',
    label: ['car', 'person', 'truck', 'bus'][i % 4],
    confidence: null,
    track_id: null,
    geometry: {
      type: 'bbox',
      x: i === 2 ? 145 : (i % 8) * 17,
      y: 40,
      width: 15,
      height: i === 2 ? 70 : 20,
    },
  }));
  const created = await request.post('/api/projects', {
    data: { name: 'Scene visibility', format: 'smartreview-json' },
  });
  expect(created.status()).toBe(201);
  const p = await created.json();
  const uploaded = await request.post(`/api/projects/${p.id}/import`, {
    multipart: {
      annotation: {
        name: 'dataset.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
      },
      media: {
        name: 'street.png',
        mimeType: 'image/png',
        buffer: await fs.readFile('fixtures/upload/street.png'),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  return p.id;
}

test('all scene boxes, focus, selection, draft, save target and responsive coordinates', async ({
  page,
  request,
}) => {
  const id = await sceneProject(request);
  await page.goto(`/projects/${id}/review/object-2`);
  const viewer = page
    .locator('svg')
    .filter({ has: page.locator('image') })
    .first();
  await expect(viewer.getByTestId('annotation-box')).toHaveCount(4);
  await expect(viewer.locator('[data-active="true"]')).toHaveAttribute(
    'data-annotation-id',
    'object-2',
  );
  const why = page
    .getByRole('heading', { name: hint('Why flagged') })
    .locator('..')
    .locator('..');
  const originalWhy = await why.innerText();
  const url = page.url();
  const note = page.getByLabel(hint('Note (optional)'), { exact: true });
  await note.fill('Draft for truck');
  await page.getByRole('button', { name: 'Risk only', exact: true }).click();
  await expect(viewer.getByTestId('annotation-box')).toHaveCount(1);
  await page.getByRole('button', { name: 'All annotations', exact: true }).click();
  await page
    .getByLabel('Annotations in frame')
    .getByRole('button', { name: 'car · object-0', exact: true })
    .click();
  await expect(viewer.locator('[data-selected="true"]')).toHaveAttribute(
    'data-annotation-id',
    'object-0',
  );
  await viewer.getByRole('button', { name: 'Inspect person (object-1)', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(viewer.locator('[data-selected="true"]')).toHaveAttribute(
    'data-annotation-id',
    'object-1',
  );
  await viewer
    .getByRole('button', { name: 'Inspect bus (object-3)', exact: true })
    .click({ position: { x: 5, y: 5 } });
  await expect(viewer.locator('[data-selected="true"]')).toHaveAttribute(
    'data-annotation-id',
    'object-3',
  );
  expect(page.url()).toBe(url);
  expect(await why.innerText()).toBe(originalWhy);
  await expect(note).toHaveValue('Draft for truck');
  for (const viewport of [
    { width: 1600, height: 1100 },
    { width: 1100, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await viewer
      .locator('[data-annotation-id="object-0"] rect[data-testid="annotation-box"]')
      .evaluate((rect) => {
        const box = rect.getBoundingClientRect();
        const matrix = rect.getScreenCTM();
        const p = new DOMPoint(0, 40).matrixTransform(matrix);
        return {
          x: box.x,
          y: box.y,
          expectedX: p.x,
          expectedY: p.y,
          width: box.width,
          expectedWidth: 15 * matrix.a,
        };
      });
    expect(geometry.x).toBeCloseTo(geometry.expectedX, 1);
    expect(geometry.y).toBeCloseTo(geometry.expectedY, 1);
    expect(geometry.width).toBeCloseTo(geometry.expectedWidth, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'test-results/scene-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.screenshot({ path: 'test-results/scene-desktop.png', fullPage: true });
  await page.getByRole('radio', { name: hint('Unsure'), exact: true }).check();
  await page.getByRole('button', { name: hint('Save Review'), exact: true }).click();
  await expect(page.getByText(hint('Đã lưu vào MySQL.'), { exact: true })).toBeVisible();
  const saved = await (await request.get(`/api/projects/${id}/reviews`)).json();
  expect(Object.keys(saved)).toEqual(['object-2']);
  expect(saved['object-2'].note).toBe('Draft for truck');
  await page.getByRole('button', { name: 'Tải lại quyết định', exact: true }).click();
  await expect(note).toHaveValue('Draft for truck');
});

test('50+ annotations and missing or invalid focus fallback remain usable', async ({
  page,
  request,
}) => {
  const id = await sceneProject(request, 55);
  await page.goto(`/projects/${id}/review/object-2`);
  await expect(page.getByTestId('annotation-box')).toHaveCount(55);
  await page.route('**/annotations?*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.annotations = body.annotations.filter((a) => a.annotation_id !== 'object-2');
    body.annotations[0].geometry.width = -10;
    await route.fulfill({ json: body });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy annotation');
  await expect(page.getByTestId('annotation-box')).toHaveCount(54);
  await expect(page.locator('[data-active="true"]')).toHaveAttribute(
    'data-annotation-id',
    'object-2',
  );
});

test('Traffic frame 422 stays Risk 70 and context switches never mix frames', async ({ page }) => {
  await page.goto('/review/2-422');
  const viewer = page
    .locator('svg')
    .filter({ has: page.locator('image') })
    .first();
  await expect(viewer.locator('[data-active="true"]')).toContainText('RISK 70 · truck');
  await expect(page.getByRole('heading', { name: /^Annotations \(/ })).toBeVisible();
  const ids = await viewer
    .locator('[data-annotation-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.annotationId));
  expect(ids.length).toBeGreaterThan(1);
  expect(ids.every((id) => id.endsWith('-422'))).toBe(true);
  await page.getByRole('button', { name: hint('Trước: frame 421') }).click();
  await expect.poll(async () => viewer.locator('[data-annotation-id]').count()).toBeGreaterThan(1);
  const previous = await viewer
    .locator('[data-annotation-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.annotationId));
  expect(previous.every((id) => id.endsWith('-421'))).toBe(true);
  await expect(
    page.getByText('temporal.class_inconsistency', { exact: true }).first(),
  ).toBeVisible();
});
