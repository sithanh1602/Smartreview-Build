import fs from 'node:fs/promises';
import path from 'node:path';
import { ReviewError } from '../../shared/review.ts';
import { webRoot } from '../config.ts';
import type { VerifierEngine } from '../../core/risk/label-verify.ts';

export interface UsableModel {
  name: string;
  engine: VerifierEngine;
}

const WEIGHTS = /\.(safetensors|bin)$/;

export function modelsRoot() {
  return path.resolve(webRoot, process.env.LABEL_VERIFIER_MODELS_DIR || '../model-usage');
}

function engineOf(config: Record<string, unknown>): VerifierEngine | null {
  const type = String(config.model_type ?? '').toLowerCase();
  if (type.includes('siglip')) return 'siglip';
  if (/^qwen2(_5)?_vl$/.test(type)) return 'qwen';
  return null;
}

export async function listModels(root = modelsRoot()): Promise<UsableModel[]> {
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const models: UsableModel[] = [];
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue;
    const dir = path.join(root, name);
    try {
      if (!(await fs.stat(dir)).isDirectory()) continue;
      const config = JSON.parse(await fs.readFile(path.join(dir, 'config.json'), 'utf8'));
      const engine = engineOf(config);
      if (!engine || !(await fs.readdir(dir)).some((f) => WEIGHTS.test(f))) continue;
      models.push({ name, engine });
    } catch {
      continue;
    }
  }
  return models;
}

export async function findModel(name: unknown, engine: VerifierEngine, root = modelsRoot()) {
  const model = (await listModels(root)).find((m) => m.name === name);
  if (!model)
    throw new ReviewError(400, `Không có model "${String(name)}" trong thư mục model-usage.`);
  if (model.engine !== engine)
    throw new ReviewError(400, `Model "${model.name}" không dùng được cho bước này.`);
  return { name: model.name, dir: path.join(root, model.name) };
}
