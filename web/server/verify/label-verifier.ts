import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { webRoot } from '../config.ts';
import type {
  VerifierEngine,
  VerifierRequest,
  VerifierResponse,
} from '../../core/risk/label-verify.ts';

const repoRoot = path.resolve(webRoot, '..');
const worker = path.join(import.meta.dirname, 'verify.py');
// Each engine's model has its own folder outside the repo; web/.env names it, relative to web/.
const MODEL_DIR: Record<VerifierEngine, string> = {
  siglip: 'LABEL_VERIFIER_SIGLIP_DIR',
  qwen: 'LABEL_VERIFIER_QWEN_DIR',
};

// The engines (verify.py) run in the repo's Python environment, which ./setup.sh --verifier
// fills. SmartReview still runs on a machine that has neither the packages nor the models.
export function labelVerifier() {
  const python = process.env.LABEL_VERIFIER_PYTHON || path.join(repoRoot, '.venv/bin/python');
  const modelDir = (engine: VerifierEngine) => {
    const dir = process.env[MODEL_DIR[engine]];
    return dir ? path.resolve(webRoot, dir) : undefined;
  };
  return {
    python,
    modelDir,
    async available() {
      try {
        await fs.access(python);
        return true;
      } catch {
        return false;
      }
    },
    // One process per run: the model loads, answers for every box, and exits.
    run(
      request: VerifierRequest,
      onProgress?: (done: number, total: number) => void,
      timeoutMs?: number,
    ): Promise<VerifierResponse> {
      // Without a folder for the engine the model comes from the Hugging Face cache.
      const model_dir = modelDir(request.engine);
      return new Promise((resolve, reject) => {
        const child = spawn(python, [worker], { stdio: ['pipe', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        let log = '';
        child.stdout.on('data', (chunk) => out.push(chunk));
        child.stderr.on('data', (chunk) => {
          log = (log + chunk).slice(-4000);
          for (const [, done, total] of String(chunk).matchAll(/^progress (\d+) (\d+)$/gm))
            onProgress?.(Number(done), Number(total));
        });
        const timer =
          timeoutMs &&
          setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`label-verifier timed out after ${timeoutMs / 60000} minutes`));
          }, timeoutMs);
        child.on('error', reject);
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0)
            return reject(new Error(`label-verifier exited with ${code}: ${log.trim()}`));
          try {
            resolve(JSON.parse(Buffer.concat(out).toString('utf8')));
          } catch {
            reject(new Error(`label-verifier did not return JSON: ${log.trim()}`));
          }
        });
        child.stdin.on('error', reject);
        child.stdin.end(JSON.stringify({ ...request, ...(model_dir && { model_dir }) }));
      });
    },
  };
}
