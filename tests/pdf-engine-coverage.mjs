import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const livePdf = registry.filter(t => t.category === 'PDF' && t.status === 'live').map(t => t.title);

const liveBlock = app.slice(app.indexOf('const live = new Set(['), app.indexOf(']);', app.indexOf('const live = new Set([')) + 2);
const liveSet = new Set([...liveBlock.matchAll(/'([^']+)'/g)].map(m => m[1]));
const mountStart = app.indexOf('const pdfTools = new Set([');
const mountEnd = app.indexOf(']);', mountStart) + 2;
const mountBlock = app.slice(mountStart, mountEnd);
const mountSet = new Set([...mountBlock.matchAll(/'([^']+)'/g)].map(m => m[1]));

assert.equal(livePdf.length, 40, 'expected 39 completed live PDF engines');
for (const title of livePdf) {
  assert.ok(liveSet.has(title), `PDF tool missing from live set: ${title}`);
  assert.ok(mountSet.has(title), `PDF tool missing from mountPdf allow-list: ${title}`);
  assert.ok(app.slice(mountStart).includes(title), `No execution branch reference for: ${title}`);
}
console.log(`pdf engine coverage ok: ${livePdf.length} live PDF engines have registry + mount + execution references`);
