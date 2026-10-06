import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const data = {
  schema_version: '1.0.0',
  dataset: { id: 'frame-ui', name: 'Kiểm tra ảnh' },
  media: [
    { id: 'a', name: 'a.png', type: 'image', width: 160, height: 100 },
    { id: 'b', name: 'b.png', type: 'image', width: 160, height: 100 },
  ],
  frames: [
    { id: 'a:0', media_id: 'a', index: 0, image: 'a.png' },
    { id: 'b:0', media_id: 'b', index: 0, image: 'b.png' },
  ],
  annotations: [
    {
      id: 'box-1',
      frame_id: 'a:0',
      label: 'car',
      geometry: { type: 'bbox', x: 10, y: 10, width: 20, height: 20 },
    },
    {
      id: 'box-2',
      frame_id: 'a:0',
      label: 'person',
      geometry: { type: 'bbox', x: 50, y: 20, width: 20, height: 30 },
    },
  ],
};
async function create(request) {
  const project = await (
    await request.post('/api/projects', {
      data: { name: 'Frame review UI', format: 'smartreview-json' },
    })
  ).json();
  const image = await fs.readFile(new URL('../../fixtures/upload/street.png', import.meta.url));
  const form = new FormData();
  form.append('annotation', new Blob([JSON.stringify(data)]), 'data.json');
  form.append('media', new Blob([image]), 'a.png');
  form.append('media', new Blob([image]), 'b.png');
  // APIRequestContext needs explicit multipart fields for repeated media names.
  const base = 'http://127.0.0.1:3110';
  const response = await fetch(`${base}/api/projects/${project.id}/import`, {
    method: 'POST',
    body: form,
  });
  expect(response.status).toBe(201);
  return project.id;
}
test('all boxes, empty image, draw missing region, save/reload and unsaved navigation', async ({
  page,
  request,
}) => {
  const id = await create(request);
  await page.goto(`/projects/${id}/frames/a%3A0`);
  await expect(page.getByRole('img', { name: /2 annotation/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ảnh sau →' }).click();
  await expect(page.getByText(/Ảnh chưa có annotation/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vẽ vùng thiếu', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Vẽ vùng thiếu', exact: true }).click();
  const coords = await page.getByRole('img').evaluate((svg) => {
    const m = svg.getScreenCTM();
    const p = (x, y) => {
      const q = svg.createSVGPoint();
      q.x = x;
      q.y = y;
      const r = q.matrixTransform(m);
      return { x: r.x, y: r.y };
    };
    return [p(20, 20), p(60, 50)];
  });
  await page.mouse.move(coords[0].x, coords[0].y);
  await page.mouse.down();
  await page.mouse.move(coords[1].x, coords[1].y);
  await page.mouse.up();
  await expect(page.getByText('Vùng thiếu 1', { exact: true })).toBeVisible();
  await page.getByLabel('Tên đối tượng (không bắt buộc)').fill('car');
  await page.getByLabel('Trạng thái kiểm tra').selectOption('REVIEWED');
  await page.getByRole('button', { name: 'Lưu đánh giá ảnh', exact: true }).click();
  await expect(page.getByText('Đã lưu đánh giá ảnh.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tên đối tượng (không bắt buộc)')).toHaveValue('car');
  await expect(page.getByLabel('Trạng thái kiểm tra')).toHaveValue('REVIEWED');
  const saved = await (await request.get(`/api/projects/${id}/frames/b%3A0`)).json();
  expect(saved.review.missing_regions[0].geometry.x).toBeCloseTo(20, 0);
  expect(saved.review.missing_regions[0].geometry.width).toBeCloseTo(40, 0);
  await page.getByLabel('Ghi chú ảnh').fill('chưa lưu');
  await page.getByRole('button', { name: '← Ảnh trước' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Ở lại để lưu' }).click();
  await expect(page.getByLabel('Ghi chú ảnh')).toHaveValue('chưa lưu');
  await page.route('**/frames/*/review', (r) =>
    r.fulfill({ status: 503, json: { error: 'Lỗi lưu thử nghiệm' } }),
  );
  await page.getByRole('button', { name: 'Lưu đánh giá ảnh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Lỗi lưu thử nghiệm');
  await expect(page.getByLabel('Ghi chú ảnh')).toHaveValue('chưa lưu');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
