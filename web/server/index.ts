import { ProjectService } from './projects/service.ts';
import path from 'node:path';
import { createPool } from './db/pool.ts';
import { ReviewStore } from './reviews/store.ts';
import { loadDataset } from './repository.ts';
import { createApp } from './app.ts';
import { datasetPath, webRoot } from './config.ts';
import { AuthService } from './auth/service.ts';
import type { LoadedDataset } from './types.ts';

try {
  let dataset: LoadedDataset | undefined;
  try {
    dataset = await loadDataset(datasetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    console.log('Default demo unavailable. Create a project and import annotated data.');
  }
  const pool = createPool();
  const reviews = dataset ? new ReviewStore(pool, dataset) : null;
  if (reviews) await reviews.initialize();
  const projects = new ProjectService(
    pool,
    process.env.SMARTREVIEW_STORAGE || path.join(webRoot, 'storage'),
  );
  await projects.recover();
  if (dataset && reviews) await projects.registerDemo(dataset, reviews, datasetPath);
  const auth = new AuthService(pool);
  await auth.cleanup();
  const sessionCleanup = setInterval(
    () => auth.cleanup().catch(() => console.error('Session cleanup failed.')),
    60 * 60 * 1000,
  );
  sessionCleanup.unref();
  const app = createApp({
    dataset,
    reviews,
    projects,
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
      `SmartReview: http://${host}:${process.env.PORT || 3100} · ${dataset?.cases.length ?? 0} demo cases · Projects ready`,
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
    `Startup failed: ${(e as Error).message}\nCheck .env and MySQL; run npm run db:migrate. Dataset missing: npm run prepare:data`,
  );
  process.exit(1);
}
