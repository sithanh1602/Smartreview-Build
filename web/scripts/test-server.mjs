import fs from 'node:fs/promises';
import os from 'node:os';
import { ProjectService } from '../server/projects/service.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { datasetPath, webRoot } from '../server/config.mjs';
import { loadDataset } from '../server/repository.mjs';
import { createApp } from '../server/app.mjs';
import { ReviewStore } from '../server/reviews/store.mjs';
import { migrate } from '../server/db/migrate.mjs';
import { testPool } from '../tests/db-helpers.mjs';
import { AuthService } from '../server/auth/service.mjs';
if (!process.env.SMARTREVIEW_TEST_RUN) throw new Error('Missing unique browser test run ID');
const manifest = path.join(
  os.tmpdir(),
  `smartreview-browser-${process.env.SMARTREVIEW_TEST_RUN}-${process.env.PORT}.jsonl`,
);
const record = (data) => fs.appendFile(manifest, JSON.stringify(data) + '\n');
const pool = testPool();
await migrate(pool);
const auth = new AuthService(pool);
for (const role of ['reviewer', 'annotator']) {
  const user = await auth.createUser({
    username: `test_${role}_${process.env.SMARTREVIEW_TEST_RUN.slice(0, 8)}_${process.env.PORT}`,
    password: process.env.SMARTREVIEW_TEST_PASSWORD,
    role,
  });
  await record({ user: user.id });
}
const dataset = await loadDataset(datasetPath);
dataset.meta.dataset_id = createHash('sha256')
  .update(process.env.SMARTREVIEW_TEST_RUN + dataset.meta.dataset_id)
  .digest('hex')
  .slice(0, 20);
for (const item of dataset.allCases)
  for (const o of Object.values(item.context))
    if (o.image_url)
      o.image_url = o.image_url.replace(/dataset=[^&]+/, `dataset=${dataset.meta.dataset_id}`);
for (const item of dataset.cases)
  for (const o of Object.values(item.context))
    if (o.image_url)
      o.image_url = o.image_url.replace(/dataset=[^&]+/, `dataset=${dataset.meta.dataset_id}`);
const reviews = new ReviewStore(pool, dataset);
await reviews.initialize();
await record({ revision: reviews.datasetId });
const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-browser-projects-'));
await record({ storage });
const projects = new ProjectService(pool, storage);
const projectIds = [];
const createProject = projects.create.bind(projects);
projects.create = async (input) => {
  const p = await createProject(input);
  projectIds.push(p.id);
  await record({ project: p.id });
  return p;
};
const demoDataset = await loadDataset(datasetPath);
const demoReviews = new ReviewStore(pool, demoDataset);
await demoReviews.initialize();
const demoId = await projects.registerDemo(demoDataset, demoReviews, datasetPath);
projectIds.push(demoId);
await record({ project: demoId });
const server = createApp({
  dataset,
  reviews,
  projects,
  auth,
  distRoot: path.join(webRoot, 'dist'),
});
server.listen(Number(process.env.PORT), '127.0.0.1');
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopped) return;
    stopped = true;
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
