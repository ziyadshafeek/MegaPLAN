import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const livePdf = registry.filter(t => t.category === 'PDF' && t.status === 'live').map(t => t.title);

const liveStart = app.indexOf('const live = new Set([');
const liveEnd = app.indexOf(']);', liveStart) + 2;
const liveSet = new Set([...app.slice(liveStart, liveEnd).matchAll(/'([^']+)'/g)].map(m => m[1]));
const mountStart = app.indexOf('const pdfTools = new Set([');
const mountEnd = app.indexOf(']);', mountStart) + 2;
const mountSet = new Set([...app.slice(mountStart, mountEnd).matchAll(/'([^']+)'/g)].map(m => m[1]));

const executionMatchers = {
  'Merge PDFs': "t.title==='Merge PDFs'",
  'Split PDF': "t.title==='Split PDF'",
  'Compress PDF': "t.title==='Compress PDF'",
  'Repair PDF': "t.title==='Repair PDF'",
  'OCR PDF': "t.title==='OCR PDF'",
  'Redact PDF': "t.title==='Redact PDF'",
  'Sign PDF': "t.title==='Sign PDF'",
  'Fill PDF': "t.title==='Fill PDF'",
  'Annotate PDF': "t.title==='Annotate PDF'",
  'Rotate PDF': "t.title==='Rotate PDF'",
  'Reorder PDF Pages': "t.title==='Reorder PDF Pages'",
  'Extract PDF Pages': "['Extract PDF Pages','PDF Page Extractor'].includes(t.title)",
  'PDF Page Extractor': "['Extract PDF Pages','PDF Page Extractor'].includes(t.title)",
  'Delete PDF Pages': "t.title==='Delete PDF Pages'",
  'Extract PDF Images': "t.title==='Extract PDF Images'",
  'PDF Metadata Viewer': "t.title==='PDF Metadata Viewer'",
  'Remove PDF Metadata': "t.title==='Remove PDF Metadata'",
  'Add PDF Watermark': "t.title==='Add PDF Watermark'",
  'Add PDF Page Numbers': "t.title==='Add PDF Page Numbers'",
  'Overlay PDFs': "t.title==='Overlay PDFs'",
  'Compare PDFs': "['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)",
  'Crop PDF': "t.title==='Crop PDF'",
  'Resize PDF Pages': "t.title==='Resize PDF Pages'",
  'PDF to Images': "t.title==='PDF to Images'",
  'PDF to Text': "['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)",
  'PDF to Markdown': "['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)",
  'PDF to HTML': "['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)",
  'PDF to Word': "['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)",
  'PDF to Excel': "['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)",
  'PDF to PowerPoint': "['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)",
  'PDF to EPUB': "['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)",
  'PDF to RTF': "['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)",
  'Images to PDF': "['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)",
  'JPG to PDF': "['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)",
  'PNG to PDF': "['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)",
  'WEBP to PDF': "['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)",
  'HEIC to PDF': "t.title==='HEIC to PDF'",
  'Word to PDF': "['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF'].includes(t.title)",
  'Excel to PDF': "['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF'].includes(t.title)",
  'PowerPoint to PDF': "['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF'].includes(t.title)",
  'Text to PDF': "t.title==='Text to PDF'",
  'Markdown to PDF': "t.title==='Markdown to PDF'",
  'HTML to PDF': "t.title==='HTML to PDF'",
  'EPUB to PDF': "['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF'].includes(t.title)",
  'PDF/A Helper': "t.title==='PDF/A Helper'",
  'Booklet PDF Maker': "t.title==='Booklet PDF Maker'",
  'Pages per Sheet': "['Pages per Sheet','Two Pages per Sheet'].includes(t.title)",
  'Two Pages per Sheet': "['Pages per Sheet','Two Pages per Sheet'].includes(t.title)",
  'PDF Page Counter': "t.title==='PDF Page Counter'",
  'PDF Bookmark Helper': "t.title==='PDF Bookmark Helper'",
  'PDF Form Field Viewer': "t.title==='PDF Form Field Viewer'",
  'Invoice PDF Maker': "t.title==='Invoice PDF Maker'",
  'PDF Batch Rename': "t.title==='PDF Batch Rename'"
};

assert.equal(livePdf.length, 53, 'expected all 53 PDF tools to be live in the registry');
assert.equal(Object.keys(executionMatchers).length, 53, 'coverage map must contain all PDF tools');
for (const title of livePdf) {
  assert.ok(liveSet.has(title), `PDF tool missing from live set: ${title}`);
  assert.ok(mountSet.has(title), `PDF tool missing from mountPdf allow-list: ${title}`);
  assert.ok(app.slice(mountStart).includes(executionMatchers[title]), `No execution branch reference for: ${title}`);
}
console.log(`pdf engine coverage ok: ${livePdf.length} live PDF engines have registry + mount + execution references`);
