// Existing domain tests inject a reviewer identity; auth.test.mjs tests real cookies and sessions.
import { createApp as createRealApp } from '../server/app.mjs';
export function createApp(options) {
  return createRealApp({
    auth: {
      authenticate: async () => ({
        id: 'test-reviewer',
        username: 'test-reviewer',
        role: 'reviewer',
      }),
    },
    ...options,
  });
}
