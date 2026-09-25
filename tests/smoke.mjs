import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
assert.equal(registry.length, 555, 'registry size changed unexpectedly');
assert.ok(registry.every(t => t.slug && t.title && t.category && t.processing), 'registry schema broken');

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
for (const needle of ["function route()", "mountPdf", "const live = new Set", "loadRegistry().catch"]) {
  assert.ok(app.includes(needle), `missing ${needle}`);
}
for (const title of ['Merge PDFs','Split PDF','Rotate PDF','Reorder PDF Pages','Extract PDF Pages','Delete PDF Pages','Text to PDF']) {
  assert.ok(app.includes(title), `missing PDF engine ${title}`);
}

console.log(`smoke ok: ${registry.length} registry entries; route + PDF engine checks passed`);
