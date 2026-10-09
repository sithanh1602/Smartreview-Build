import { test, expect } from './fixtures.js';
const geometry = { type: 'bbox', x: 5, y: 5, width: 30, height: 30 };
const finding = {
  id: 'a',
  annotation_id: 'a',
  frame_id: 'f',
  check_id: 'ai.class_disagreement',
  score: 70,
  severity: 'high',
  reason: 'Nhãn hiện tại car, AI gợi ý truck.',
  annotation: { label: 'car', geometry },
  prediction: { label: 'truck', geometry, confidence: 0.9 },
  iou: 0.8,
  observation: {
    id: 'a',
    annotation_id: 'a',
    frame_id: 0,
    width: 160,
    height: 100,
    class_name: 'car',
    media_name: 'street.png',
    geometry,
    image_url: null,
  },
};
const ready = {
  status: 'READY',
  available: true,
  dataset_revision: 'rev',
  completed: 1,
  total: 1,
  skipped_frames: 0,
  matched_annotations: 1,
  skipped: {
    unsupported_label: 0,
    unsupported_geometry: 0,
    no_matching_prediction: 0,
  },
  model: { name: 'test-model' },
  thresholds: { confidence: 0.65, classIou: 0.5, positionIou: 0.15 },
  findings: [finding],
};
test('AI start, poll, evidence, filter, review link and mobile layout', async ({ page }) => {
  let status = 'IDLE',
    polls = 0;
  await page.route('**/api/projects/test/ai-check', async (route) => {
    if (route.request().method() === 'POST') {
      status = 'RUNNING';
      await route.fulfill({
        json: { status, available: true, completed: 0, total: 1 },
      });
    } else if (status === 'RUNNING' && ++polls === 1)
      await route.fulfill({
        json: { status, available: true, completed: 0, total: 1 },
      });
    else
      await route.fulfill({
        json: status === 'IDLE' ? { status, available: true } : ready,
      });
  });
  await page.goto('/projects/test/ai-check');
  await page.getByRole('button', { name: 'Bắt đầu AI Check', exact: true }).click();
  await expect(page.getByText('1 gợi ý cần kiểm tra')).toBeVisible();
  await expect(page.getByText(finding.reason)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở annotation để lưu đánh giá →' })).toHaveAttribute(
    'href',
    '/projects/test/review/a?scope=all',
  );
  await page.getByRole('combobox').selectOption('ai.bbox_disagreement');
  await expect(page.getByText(/Không có gợi ý phù hợp/)).toBeVisible();
  await page.getByRole('combobox').selectOption('all');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('missing-object finding shows frame context and links to whole-frame review', async ({
  page,
}) => {
  const missing = {
    id: 'missing:f:1',
    annotation_id: null,
    frame_id: 'f',
    check_id: 'ai.missing_annotation',
    score: 76,
    severity: 'high',
    reason: 'AI thấy “truck” (90%) nhưng chưa có annotation tại vị trí này.',
    annotation: null,
    prediction: { label: 'truck', geometry, confidence: 0.9 },
    iou: null,
    frame_annotations: [{ id: 'a', annotation_id: 'a', label: 'car', geometry }],
    observation: {
      id: 'missing:f:1',
      annotation_id: null,
      frame_id: 0,
      width: 160,
      height: 100,
      class_name: 'truck',
      media_name: 'street.png',
      geometry,
      image_url: null,
    },
  };
  await page.route('**/api/projects/test/ai-check', (route) =>
    route.fulfill({ json: { ...ready, findings: [missing] } }),
  );
  await page.goto('/projects/test/ai-check');
  await expect(page.getByText(missing.reason).first()).toBeVisible();
  await expect(page.getByText('Chưa có nhãn · AI: truck')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở ảnh để đánh dấu vùng thiếu →' })).toHaveAttribute(
    'href',
    '/projects/test/frames/f',
  );
  await page.getByRole('combobox').selectOption('ai.missing_annotation');
  await expect(page.getByText('1 gợi ý cần kiểm tra')).toBeVisible();
});
test('AI unavailable and failed requests offer clear recovery', async ({ page }) => {
  await page.route('**/api/projects/test/ai-check', (route) =>
    route.fulfill({
      json: {
        status: 'FAILED',
        available: false,
        error: 'Lượt kiểm tra bị ngắt.',
      },
    }),
  );
  await page.goto('/projects/test/ai-check');
  await expect(page.getByText('Lượt kiểm tra bị ngắt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bắt đầu AI Check' })).toBeDisabled();
  await page.unroute('**/api/projects/test/ai-check');
  await page.route('**/api/projects/test/ai-check', (route) =>
    route.fulfill({ status: 503, json: { error: 'Dịch vụ chưa sẵn sàng' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Dịch vụ chưa sẵn sàng');
  await expect(page.getByRole('button', { name: 'Tải lại', exact: true })).toBeVisible();
});
