import fs from 'node:fs';
import assert from 'node:assert/strict';

const pdf = fs.readFileSync(new URL('../public/js/pdf-engine.js', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const titles = registry.filter(t => t.category === 'PDF').map(t => t.title);
assert.ok(titles.length >= 50, 'PDF registry shrank');
assert.ok(pdf.includes('export async function mountPdf'), 'mountPdf missing');
for (const title of ['Merge PDFs', 'Split PDF', 'Rotate PDF', 'Text to PDF', 'Compress PDF', 'Redact PDF']) {
  assert.ok(pdf.includes(title), `PDF engine missing ${title}`);
}
console.log(`pdf engine coverage ok: ${titles.length} PDF registry tools; core engines present`);
