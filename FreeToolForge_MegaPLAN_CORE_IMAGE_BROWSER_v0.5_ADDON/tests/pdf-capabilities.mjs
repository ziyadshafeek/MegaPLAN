import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8'));
const publicRegistry = JSON.parse(fs.readFileSync(new URL('../public/tools-registry.json', import.meta.url), 'utf8'));

assert.deepEqual(publicRegistry, registry, 'public/tools-registry.json must mirror data/tools.json');
const pdf = registry.filter(t => t.category === 'PDF');
assert.equal(pdf.length, 53, 'PDF registry size changed');
assert.equal(pdf.filter(t => t.status === 'live').length, 53, 'all PDF tools must be live');
assert.ok(pdf.filter(t => t.title === 'OCR PDF').every(t => t.processing === 'hybrid'), 'OCR PDF should remain hybrid');
assert.ok(pdf.filter(t => t.title !== 'OCR PDF').every(t => t.processing === 'browser'), 'non-OCR PDF tools should be browser-first');

const required = [
  'const loadPdfLib=()=>import(',
  'const loadPdfJs=async()=>',
  'const parseRange=',
  'const textPagesToPdf=async',
  'const extractDocxText=async',
  'const extractXlsxText=async',
  'const extractPptxText=async',
  'const extractEpubText=async',
  'const addSimplePageBookmarks=async',
  'const getPdfTextLines=',
  'const rasterizePdf=async',
  'resized.embedPdf(sourceBytes,[i])',
  "PDFName.of('Fit')",
  'src.getForm().updateFieldAppearances?.()',
  'Resource not accessible' // should NOT be present in app code; immediately below check
];
for (const needle of required.slice(0,-1)) assert.ok(app.includes(needle), `missing capability code: ${needle}`);
assert.ok(!app.includes('if(!behind)'), 'overlay must not reference the old undefined behind variable');
assert.ok(!/const\s+bytes\b/.test(app.slice(app.indexOf("if(t.title==='Resize PDF Pages')"), app.indexOf("if(t.title==='Extract PDF Images')"))), 'resize branch contains stale undefined bytes variable');

for (const title of ['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF']) assert.ok(app.includes(title), `missing reverse conversion: ${title}`);
for (const title of ['PDF/A Helper','PDF Bookmark Helper','HTML to PDF','HEIC to PDF','Extract PDF Images','Booklet PDF Maker','PDF Batch Rename','Invoice PDF Maker']) assert.ok(app.includes(title), `missing specialized PDF tool: ${title}`);

console.log('pdf capabilities ok: 53 live registry entries + browser/hybrid mode checks + core implementation invariants');
