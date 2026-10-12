import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { webRoot } from '../config.ts';
import type { VerifierRequest, VerifierResponse } from '../../core/risk/label-verify.ts';

// The label-verifier repo next to SmartReview holds the model and its Python environment. It
// is found at run time, from the directory LABEL_VERIFIER_DIR names (relative to web/), so
// SmartReview still runs on a machine that does not have it.
export function labelVerifier(dir = process.env.LABEL_VERIFIER_DIR) {
  const root = dir ? path.resolve(webRoot, dir) : undefined;
  const python = process.env.LABEL_VERIFIER_PYTHON || (root && path.join(root, '.venv/bin/python'));
  const worker = root && path.join(root, 'verify.py');
  return {
    root,
    async available() {
      if (!python || !worker) return false;
      try {
        await Promise.all([fs.access(python), fs.access(worker)]);
        return true;
      } catch {
        return false;
      }
    },
    // One process per run: the model loads, answers for every box, and exits.
    run(
      request: VerifierRequest,
      onProgress?: (done: number, total: number) => void,
    ): Promise<VerifierResponse> {
      if (!python || !worker)
        return Promise.reject(
          new Error('LABEL_VERIFIER_DIR is not set; see docs/label-verifier.md'),
        );
      return new Promise((resolve, reject) => {
        const child = spawn(python, [worker], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        let log = '';
        child.stdout.on('data', (chunk) => out.push(chunk));
        child.stderr.on('data', (chunk) => {
          log = (log + chunk).slice(-4000);
          for (const [, done, total] of String(chunk).matchAll(/^progress (\d+) (\d+)$/gm))
            onProgress?.(Number(done), Number(total));
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code !== 0)
            return reject(new Error(`label-verifier exited with ${code}: ${log.trim()}`));
          try {
            resolve(JSON.parse(Buffer.concat(out).toString('utf8')));
          } catch {
            reject(new Error(`label-verifier did not return JSON: ${log.trim()}`));
          }
        });
        child.stdin.on('error', reject);
        child.stdin.end(JSON.stringify(request));
      });
    },
  };
}
