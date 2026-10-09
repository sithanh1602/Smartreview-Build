import { test as base, expect } from '@playwright/test';
export { expect };
export const credentials = (role = 'reviewer') => ({
  username: `test_${role}_${process.env.SMARTREVIEW_TEST_RUN.slice(0, 8)}_3110`,
  password: process.env.SMARTREVIEW_TEST_PASSWORD,
});
export async function loginContext(context, role = 'reviewer') {
  const res = await context.request.post('http://127.0.0.1:3110/api/auth/login', {
    data: credentials(role),
  });
  expect(res.status()).toBe(200);
}
export const test = base.extend({
  context: async ({ context }, use) => {
    await loginContext(context);
    await use(context);
  },
  request: async ({ context }, use) => {
    await use(context.request);
  },
});
