// Existing domain tests inject a leader identity, which manages every project without a creator; auth.test.ts tests real cookies and sessions.
import { createApp as createRealApp } from '../server/app.ts';
export function createApp(options: any) {
  return createRealApp({
    auth: {
      authenticate: async () => ({
        id: 'test-reviewer',
        username: 'test-reviewer',
        role: 'leader',
      }),
    },
    ...options,
  });
}
