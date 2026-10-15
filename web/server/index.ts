import { ProjectService } from './projects/service.ts';
import { Project3DService } from './projects3d/service.ts';
import path from 'node:path';
import { createPool } from './db/pool.ts';
import { createApp } from './app.ts';
import { webRoot } from './config.ts';
import { AuthService } from './auth/service.ts';
import { remoteStorageFromEnv } from './storage/remote.ts';

try {
  // Startup serves imported projects only; never recreate the removed Traffic Demo.
  const pool = createPool();
  const storageRoot = process.env.SMARTREVIEW_STORAGE || path.join(webRoot, 'storage'),
    remote = remoteStorageFromEnv();
  const projects = new ProjectService(pool, storageRoot, remote);
  projects.background = true;
  await projects.recover();
  const projects3d = new Project3DService(pool, storageRoot, remote);
  await projects3d.recover();
  const auth = new AuthService(pool, { leaderCode: process.env.LEADER_SIGNUP_CODE });
  await auth.cleanup();
  const sessionCleanup = setInterval(
    () => auth.cleanup().catch(() => console.error('Session cleanup failed.')),
    60 * 60 * 1000,
  );
  sessionCleanup.unref();
  const app = createApp({
    projects,
    projects3d,
    auth,
    secureCookies: process.env.AUTH_COOKIE_SECURE === 'true',
    distRoot: path.join(webRoot, 'dist'),
  });
  app.on('error', (e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
  const host = process.env.HOST || '127.0.0.1';
  app.listen(Number(process.env.PORT || 3100), host, () =>
    console.log(
      `SmartReview: http://${host}:${process.env.PORT || 3100} · Projects ready · Storage ${projects.remote?.name ?? 'local'}`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () =>
      app.close(async () => {
        clearInterval(sessionCleanup);
        await pool.end();
        process.exit(0);
      }),
    );
} catch (e) {
  console.error(
    `Startup failed: ${(e as Error).message}\nCheck .env and MySQL; run npm run db:migrate.`,
  );
  process.exit(1);
}
