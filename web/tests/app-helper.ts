// Existing domain tests inject a reviewer identity; auth.test.ts tests real cookies and sessions.
import { createApp as createRealApp } from '../server/app.ts';
export function createApp(options: any) {
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
