import { randomUUID } from 'node:crypto';
import './server/env.mjs';
const runId = process.env.SMARTREVIEW_TEST_RUN || randomUUID();
process.env.SMARTREVIEW_TEST_RUN = runId;
process.env.SMARTREVIEW_TEST_PASSWORD ||= randomUUID() + randomUUID();
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  globalTeardown: './tests/browser-teardown.mjs',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3110',
    browserName: 'chromium',
    channel: 'chromium',
    viewport: { width: 1600, height: 1100 },
  },
  webServer: [
    {
      command: 'node scripts/test-server.mjs',
      env: {
        SMARTREVIEW_TEST_RUN: runId,
        PORT: '3110',
        SMARTREVIEW_DATASET: 'datasets/demo/dataset.json',
      },
      url: 'http://127.0.0.1:3110/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/test-server.mjs',
      env: {
        SMARTREVIEW_TEST_RUN: runId,
        PORT: '3111',
        SMARTREVIEW_DATASET: 'datasets/human/dataset.json',
      },
      url: 'http://127.0.0.1:3111/api/health',
      reuseExistingServer: false,
    },
  ],
});
