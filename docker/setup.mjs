import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const destination = new URL('../.env.docker', import.meta.url);
const content = `DOCKER_DB_PASSWORD=${randomBytes(32).toString('hex')}
DOCKER_DB_ROOT_PASSWORD=${randomBytes(32).toString('hex')}
DOCKER_HTTP_PORT=3100
DOCKER_NODE_ENV=development
DOCKER_AUTH_COOKIE_SECURE=false
`;
try {
  await fs.writeFile(destination, content, { flag: 'wx', mode: 0o600 });
  console.log('Created private .env.docker. Start: docker compose --env-file .env.docker up -d --build');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.docker already exists; existing credentials preserved.');
}
