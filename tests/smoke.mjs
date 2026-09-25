import fs from 'node:fs';
import assert from 'node:assert/strict';

const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
assert.equal(registry.length, 555, 'registry size changed unexpectedly');
assert.ok(registry.every(t => t.slug && t.title && t.category && t.processing), 'registry schema broken');

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
for (const needle of ["function route()", "mountPdf", "const live = new Set", "loadRegistry().catch"]) {
  assert.ok(app.includes(needle), `missing ${needle}`);
}
for (const title of ['Merge PDFs','Split PDF','Compress PDF','Repair PDF','OCR PDF','Redact PDF','Rotate PDF','Reorder PDF Pages','Extract PDF Pages','Delete PDF Pages','PDF Metadata Viewer','Remove PDF Metadata','Add PDF Watermark','Add PDF Page Numbers','Overlay PDFs','Compare PDFs','Crop PDF','Resize PDF Pages','PDF to Images','PDF to Text','PDF to Markdown','PDF to HTML','Fill PDF','Annotate PDF','Sign PDF','PDF Form Field Viewer','Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF','Text to PDF','Markdown to PDF','Pages per Sheet','Two Pages per Sheet','Booklet PDF Maker','PDF Page Counter','PDF Page Extractor','PDF Batch Rename','Invoice PDF Maker']) {
  assert.ok(app.includes(title), `missing PDF engine ${title}`);
}

console.log(`smoke ok: ${registry.length} registry entries; route + PDF engine checks passed`);
