import fs from 'node:fs/promises';
import path from 'node:path';

// Checks that policy/*.json loads into the engine, and prints what it runs.
// Usage: npm run policy:check
const dir = path.resolve(import.meta.dirname, '../policy');
const count = (items: string[]) =>
  [...new Set(items)].map((key) => `${key} ${items.filter((i) => i === key).length}`).join(', ');
try {
  // Loading the engine compiles the policy: an active rule it cannot run is an error here.
  const { checks, imageRules, ENGINE_VERSION, ENGINE_VERSIONS } = await import(
    '../core/risk/engine.ts'
  );
  const { POLICY_VERSION } = await import('../core/risk/policy.ts');
  console.log(`engine ${ENGINE_VERSION}, policy ${POLICY_VERSION}`);
  for (const name of (await fs.readdir(dir)).sort()) {
    const file = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    const { rules = [] } = Object.values(file)[0] as { rules?: { status: string }[] };
    console.log(`  ${name.padEnd(20)} ${count(rules.map((rule) => rule.status))}`);
  }
  console.log(`${checks.length} checks: ${checks.map((c) => c.id).join(', ')}`);
  console.log(`${imageRules.length} frame rules: ${imageRules.map((r) => r.id).join(', ')}`);
  console.log(`engines that still run: ${ENGINE_VERSIONS.join(', ')}`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
