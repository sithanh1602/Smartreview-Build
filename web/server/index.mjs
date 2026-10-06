import { ProjectService } from './projects/service.mjs';
import path from 'node:path';
import { createPool } from './db/pool.mjs';
import { ReviewStore } from './reviews/store.mjs';
import { loadDataset } from './repository.mjs';
import { createApp } from './app.mjs';
import { datasetPath, webRoot } from './config.mjs';
try {
  let dataset;
  try {
    dataset = await loadDataset(datasetPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
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
  if (dataset) await projects.registerDemo(dataset, reviews, datasetPath);
  const app = createApp({ dataset, reviews, projects, distRoot: path.join(webRoot, 'dist') });
  app.on('error', (e) => {
    console.error(e.message);
    process.exit(1);
  });
  app.listen(Number(process.env.PORT || 3100), '127.0.0.1', () =>
    console.log(
      `SmartReview: http://127.0.0.1:${process.env.PORT || 3100} · ${dataset?.cases.length ?? 0} demo cases · Projects ready`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () =>
      app.close(async () => {
        await pool.end();
        process.exit(0);
      }),
    );
} catch (e) {
  console.error(
    `Startup failed: ${e.message}\nCheck .env and MySQL; run npm run db:migrate. Dataset missing: npm run prepare:data`,
  );
  process.exit(1);
}
