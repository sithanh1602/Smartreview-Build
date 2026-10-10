import { spawn } from 'node:child_process';

function tar(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('tar', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let diagnostic = '';
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('tar failed: ' + diagnostic.trim())),
    );
  });
}
// Images are already compressed, so the archive is a plain tar.
export const pack = (directory: string, file: string) => tar(['-cf', file, '-C', directory, '.']);
export const unpack = (file: string, directory: string) => tar(['-xf', file, '-C', directory]);
