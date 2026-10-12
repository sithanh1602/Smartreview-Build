import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const envPath =
  process.env.SMARTREVIEW_ENV_FILE || fileURLToPath(new URL('../.env', import.meta.url));
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
