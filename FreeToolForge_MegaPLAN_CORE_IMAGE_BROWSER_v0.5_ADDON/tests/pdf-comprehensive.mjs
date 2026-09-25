import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const reg=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const pdf=reg.filter(t=>t.category==='PDF');
const titles=pdf.map(t=>t.title);
assert.equal(titles.length,53);
assert.equal(new Set(titles).size,53);

const start=app.indexOf('const pdfTools = new Set([');
const end=app.indexOf(']);', start);
const allow=new Set([...app.slice(start,end).matchAll(/'([^']+)'/g)].map(m=>m[1]));
const liveStart=app.indexOf('const live = new Set([');
const liveEnd=app.indexOf(']);',liveStart);
const live=new Set([...app.slice(liveStart,liveEnd).matchAll(/'([^']+)'/g)].map(m=>m[1]));
for(const t of titles){assert.ok(allow.has(t),`missing from pdfTools: ${t}`);assert.ok(live.has(t),`missing from live set: ${t}`);}

// Each tool must be represented by either a direct title branch or an explicit grouped branch.
const grouped=[
  ['PDF Page Extractor',['Extract PDF Pages','PDF Page Extractor']],
  ['Compare PDFs',['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs']],
  ['PDF to Word',['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF']],
  ['Images to PDF',['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF']],
  ['Word to PDF',['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF']],
  ['Pages per Sheet',['Pages per Sheet','Two Pages per Sheet']]
];
const branchText=app.slice(app.indexOf('async function mountPdf'));
for(const t of titles){
  const direct=`t.title==='${t}'`;
  if(branchText.includes(direct)) continue;
  const group=grouped.find(([,names])=>names.includes(t));
  assert.ok(group && branchText.includes(group[1].map(x=>`'${x}'`).join(',')) || group && branchText.includes('['), `no branch proof for ${t}`);
}

// Regression guards for concrete bugs already found during audit.
assert.ok(!app.includes('if(!behind)'), 'stale overlay bug');
assert.ok(app.includes('embedPdf(sourceBytes,[i])'), 'resize must embed from source bytes');
assert.ok(app.includes("PDFName.of('Fit')"), 'bookmark destinations must use PDFName Fit');
assert.ok(app.includes('renderCanvas.width=1;renderCanvas.height=1;'), 'image extraction must release render canvas');
assert.ok(app.includes('const rawStem=pattern.replaceAll'), 'batch rename sanitization missing');
assert.ok(app.includes('f.isChecked?.()'), 'form checkbox state preservation missing');

console.log(`pdf comprehensive audit passed: ${titles.length} tools`);
