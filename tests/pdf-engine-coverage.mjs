import fs from 'node:fs';
import assert from 'node:assert/strict';

const pdf = fs.readFileSync(new URL('../public/js/pdf-engine.js', import.meta.url), 'utf8');
const ops = fs.readFileSync(new URL('../public/js/pdf-ops.js', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const titles = registry.filter(t => t.category === 'PDF').map(t => t.title);
assert.ok(titles.length >= 50, 'PDF registry shrank');
assert.ok(pdf.includes('export async function mountPdf'), 'mountPdf missing');
assert.ok(pdf.includes('id="thumbs"'), 'studio thumbs missing');
assert.ok(pdf.includes('preview-stage'), 'preview stage missing');
assert.ok(pdf.includes('form-fields'), 'fillable form UI missing');
assert.ok(pdf.includes('drawPlaced'), 'booklet imposition missing');
assert.ok(pdf.includes('pages per sheet') || pdf.includes('Pages per Sheet'), 'n-up missing');
assert.ok(ops.includes('addSimplePageBookmarks'), 'bookmark outline helper missing');
assert.ok(ops.includes('wrapDocx'), 'PDF to Word wrap missing');
assert.ok(pdf.includes('downloadText'), 'text download path missing');
assert.ok(pdf.includes('tesseract.js'), 'OCR PDF should read pages in-browser');
assert.ok(!/freetoolforge-ocr/i.test(pdf), 'old OCR service URL leaked');
for (const title of titles) {
  assert.ok(pdf.includes(title) || ops.includes(title), `PDF engine missing ${title}`);
}
console.log(`pdf engine coverage ok: ${titles.length} PDF registry tools; studio + n-up + booklet + fill + OCR present`);
