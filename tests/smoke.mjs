import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
assert.equal(registry.length, 555, 'registry size changed unexpectedly');
assert.ok(registry.every(t => t.slug && t.title && t.category && t.processing), 'registry schema broken');

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
assert.ok(index.includes('MegaPLAN'), 'brand missing from index');
assert.ok(!/Local model shelf|modelShelf|TrOCR|Hugging Face/i.test(index), 'customer home still exposes local models');

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
for (const needle of ['Wiki Agent', 'Self Agent', 'openFolder', 'openTool', 'android']) {
  assert.ok(app.includes(needle), `missing ${needle}`);
}

const engines = fs.readFileSync(new URL('../public/js/engines.js', import.meta.url), 'utf8');
assert.ok(engines.includes('export async function mountTool'), 'mountTool missing');
assert.ok(fs.existsSync(new URL('../public/js/pdf-engine.js', import.meta.url)), 'pdf engine missing');
assert.ok(fs.existsSync(new URL('../public/js/engines-rest.js', import.meta.url)), 'rest engines missing');
assert.ok(fs.existsSync(new URL('../api/ai.js', import.meta.url)), 'ai api missing');
assert.ok(fs.existsSync(new URL('../api/lib/nvidia.js', import.meta.url)), 'nvidia helper missing');

const nvidia = fs.readFileSync(new URL('../api/lib/nvidia.js', import.meta.url), 'utf8');
assert.ok(nvidia.includes('integrate.api.nvidia.com'), 'NVIDIA endpoint missing');
assert.ok(nvidia.includes('NEVER return the model'), 'identity rule missing');

for (const title of ['Merge PDFs', 'Split PDF', 'Word Counter', 'Wiki Agent']) {
  assert.ok(
    engines.includes(title) || app.includes(title) || fs.readFileSync(new URL('../public/js/pdf-engine.js', import.meta.url), 'utf8').includes(title) || fs.readFileSync(new URL('../public/js/engines-rest.js', import.meta.url), 'utf8').includes(title),
    `missing engine/UI for ${title}`
  );
}

const files = [
  'public/js/kit.js', 'public/js/engines.js', 'public/js/engines-rest.js', 'public/js/pdf-engine.js',
  'public/js/pdf-ops.js', 'public/app.js', 'public/agent/agent.js', 'api/ai.js', 'api/agent-plan.js', 'api/inspect.js',
  'api/lib/nvidia.js', 'scripts/dev-server.mjs', 'scripts/sync-github-ai-to-vercel.mjs'
];
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${f} syntax failed: ${r.stderr}`);
}

console.log(`smoke ok: ${registry.length} tools; MegaPLAN OS + engines + APIs parse`);
