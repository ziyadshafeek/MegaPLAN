/**
 * Business documents — the arithmetic and structure behind the 24 business
 * tools.
 *
 * The old template silently dropped every line past the bottom of page one and
 * reported "Saved PDF." with no figures. These tests pin the parts that must
 * never be wrong: parsing what people paste, totals that add up, a numbering
 * series that continues, and per-document differences.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import {
  parseItems, splitCells, computeTotals, amountInWords, nextNumber,
  buildDocument, documentToText, schemaFor, DOC_SCHEMAS
} from '../public/js/business-docs.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push([true, name]); }
  catch (err) { results.push([false, `${name}\n      ${err.message}`]); }
}

const r2 = n => Math.round(n * 100) / 100;

test('splitCells handles pipes, tabs, commas and quoted fields', () => {
  assert.deepEqual(splitCells('Chair | 4 | 250'), ['Chair', '4', '250']);
  assert.deepEqual(splitCells('Chair\t4\t250'), ['Chair', '4', '250']);
  assert.deepEqual(splitCells('Chair,4,250'), ['Chair', '4', '250']);
  assert.deepEqual(splitCells('"Widget, large",2,10'), ['Widget, large', '2', '10']);
  assert.deepEqual(splitCells('Single'), ['Single']);
});

test('items parse from every shape a person actually pastes', () => {
  const r = parseItems([
    'Pipes   | 4 | 250',
    'Tabs\t2\t99.50',
    'Commas,3,10.25',
    '3 x Widget | 500',
    'Only an amount | 750'
  ].join('\n'));
  assert.equal(r.items.length, 5);
  assert.deepEqual(r.items[0], { description: 'Pipes', qty: 4, rate: 250, amount: 1000 });
  assert.deepEqual(r.items[1], { description: 'Tabs', qty: 2, rate: 99.5, amount: 199 });
  assert.deepEqual(r.items[2], { description: 'Commas', qty: 3, rate: 10.25, amount: 30.75 });
  assert.equal(r.items[3].description, 'Widget');
  assert.equal(r.items[3].qty, 3, 'quantity moved in front of the name is understood');
  assert.equal(r.items[3].rate, 500);
  assert.equal(r.items[3].amount, 1500, '"3 x Widget | 500" reads as three at five hundred');
  assert.equal(r.items[4].amount, 750);
});

test('a header row is detected, not billed', () => {
  const r = parseItems('Description,Amount\nScrews,120\nNails,80');
  assert.equal(r.items.length, 2);
  assert.ok(!r.items.some(i => /Description/.test(i.description)));
});

test('a total line is never billed as a product', () => {
  const r = parseItems('Chair | 4 | 250\nSubtotal: 1000\nGrand Total: 1000');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].amount, 1000);
});

test('an unreadable line is reported, not turned into a free item', () => {
  const r = parseItems('Chair | 4 | 250\nDeliver to the warehouse');
  assert.equal(r.items.length, 1, 'the note became a note');
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /warehouse/);
  assert.ok(!r.items.some(i => /warehouse/i.test(i.description)), 'a note is never billed at zero');
});

test('a row with an unreadable number is skipped and reported', () => {
  const r = parseItems('Chair | 4 | 250\nWidget | abc | def');
  assert.equal(r.items.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /could not be read/);
});

test('empty and separator-only input produces nothing', () => {
  for (const t of ['', '   ', '\n\n', '---\n===', '| | |']) {
    const r = parseItems(t);
    assert.equal(r.items.length, 0, `"${t}" produced no items`);
  }
});

test('totals add up, including discount and tax', () => {
  const items = [{ amount: 1000 }, { amount: 500.5 }];
  const t = computeTotals(items, { taxPercent: 18, discountPercent: 10, roundOff: false });
  assert.equal(t.subtotal, 1500.5);
  assert.equal(t.discount, 150.05);
  assert.equal(t.taxable, r2(1500.5 - 150.05));
  assert.equal(t.tax, r2((1500.5 - 150.05) * 0.18));
  assert.equal(r2(t.taxable + t.tax), t.total, 'taxable plus tax is the total');
  assert.match(t.taxLabel, /18%/);
});

test('round-off is reported, never hidden', () => {
  const t = computeTotals([{ amount: 333.33 }], { taxPercent: 5, roundOff: true });
  assert.equal(Number.isInteger(t.total), true, 'the total is a whole number');
  assert.equal(r2(t.total - (t.taxable + t.tax)), t.roundOff, 'the difference is stated');
});

test('an empty document totals zero instead of NaN', () => {
  const t = computeTotals([], { taxPercent: 18, discountPercent: 5 });
  for (const k of ['subtotal', 'discount', 'taxable', 'tax', 'total', 'roundOff']) {
    assert.ok(Number.isFinite(t[k]), `${k} is a number`);
    assert.equal(t[k], 0);
  }
});

test('amount in words handles the Indian numbering system', () => {
  assert.match(amountInWords(0, 'INR'), /Zero/);
  assert.match(amountInWords(1, 'INR'), /^Rupees One Only$/);
  assert.match(amountInWords(1500, 'INR'), /One Thousand Five Hundred/);
  assert.match(amountInWords(100000, 'INR'), /One Lakh/);
  assert.match(amountInWords(20000000, 'INR'), /Two Crore/);
  const words = amountInWords(123456.78, 'INR');
  assert.match(words, /^Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only$/);
  // The whole number and the paise must add up to the figure that was printed.
  assert.ok(!/Fifty Seven and Seventy Eight/.test(words), 'the paise are not added on top of a rounded rupee figure');
  assert.match(amountInWords(2500, 'USD'), /US Dollars Two Thousand Five Hundred/);
  assert.match(amountInWords(-500, 'INR'), /^Minus/);
});

test('the numbering series continues instead of restarting', () => {
  assert.equal(nextNumber('INV', [], { prefix: 'INV' }), `INV-${new Date().getFullYear()}-0001`);
  assert.equal(nextNumber('INV', ['INV-2026-0001', 'INV-2026-0007'], { prefix: 'INV' }), 'INV-2026-0008');
  assert.equal(nextNumber('INV', ['INV-2025-0099'], { prefix: 'INV' }), `INV-${new Date().getFullYear()}-0001`,
    'a number from another year does not push the series');
  assert.equal(nextNumber('PI', ['PI-2026-0002'], { prefix: 'PI' }), 'PI-2026-0003');
});

test('every business document has a schema and they genuinely differ', () => {
  assert.ok(Object.keys(DOC_SCHEMAS).length >= 20);
  const quotation = schemaFor('Quotation Maker');
  const invoice = schemaFor('Invoice Maker');
  const challan = schemaFor('Delivery Challan');
  assert.notEqual(quotation.kind, invoice.kind);
  assert.notEqual(quotation.prefix, invoice.prefix, 'each document type has its own series');
  assert.equal(challan.tax, false, 'a delivery challan does not add tax');
  assert.equal(invoice.words, true, 'an invoice states its amount in words');
  assert.match(invoice.terms, /Payment due/);
});

test('an invoice renders every figure it used', () => {
  const doc = buildDocument('Invoice Maker', {
    number: 'INV-2026-0001', date: '2026-03-14', from: 'Kerala Supplies', to: 'City Hospital',
    body: 'Gloves | 100 | 12.50\nMasks | 200 | 8.25', taxPercent: 18, discountPercent: 5
  });
  const text = documentToText(doc);
  assert.match(text, /INVOICE/);
  assert.match(text, /INV-2026-0001/);
  assert.match(text, /City Hospital/);
  assert.match(text, /Gloves/);
  assert.match(text, /1,?250\.00|1250\.00/);
  assert.match(text, /Tax \(18%\)/);
  assert.match(text, /TOTAL/);
  assert.match(text, /Amount in words:/);
  // The number shown must be the number the maths produced.
  assert.ok(text.includes(doc.totals.total.toFixed(2)), 'the printed total matches the computed one');
});

test('a document with no items still renders and says so', () => {
  const doc = buildDocument('Invoice Maker', { body: '' });
  const text = documentToText(doc);
  assert.match(text, /INVOICE/);
  assert.ok(doc.totals.total === 0);
});

test('a quotation is not an invoice', () => {
  const a = buildDocument('Quotation Maker', { body: 'Item | 1 | 100' });
  const b = buildDocument('Invoice Maker', { body: 'Item | 1 | 100' });
  assert.notEqual(a.number, b.number, 'the series differs');
  assert.match(documentToText(a), /QUOTATION/);
  assert.match(a.terms, /not an invoice/i);
});

test('a delivery challan carries no tax and no words', () => {
  const doc = buildDocument('Delivery Challan', { body: 'Crate | 5 | 300' });
  assert.equal(doc.totals.tax, 0);
  assert.equal(doc.words, null);
  assert.equal(doc.totals.total, 1500);
});

test('a payslip computes net pay from earnings minus deductions', () => {
  const doc = buildDocument('Payslip Maker', { body: 'Basic | 1 | 40000\nHRA | 1 | 16000', deductions: 6500 });
  assert.equal(doc.earningsTotal, 56000);
  assert.equal(doc.netPay, 49500);
  assert.match(documentToText(doc), /NET PAY/);
  assert.match(documentToText(doc), /49,?500\.00|49500\.00/);
});

test('petty cash balances receipts against payments', () => {
  const doc = buildDocument('Petty Cash Sheet', { body: 'Cash in opening | 5000\nCash out stationery | 1200\nCash in refund | 300' });
  assert.equal(doc.receiptsTotal, 5300);
  assert.equal(doc.paymentsTotal, 1200);
  assert.equal(doc.balance, 4100);
});

test('a line that could not be read is named in the output', () => {
  const doc = buildDocument('Invoice Maker', { body: 'Good | 1 | 100\n??? | ??' });
  assert.match(documentToText(doc), /Not billed/);
});

/* ------------------------------------------------------------------ *
 * The mounted tool and the PDF it produces
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Harness: mount the real tool, click the real button, read the real PDF
 * ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://megaplan.test/' });
const { window } = dom;
const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element',
  'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser']) {
  if (window[name] !== undefined) define(name, window[name]);
}
const downloads = [];
let pendingBlob = null;
// jsdom's Blob has no arrayBuffer(); take the bytes directly instead.
const blobBytes = blob => new Promise((resolve, reject) => {
  const fr = new window.FileReader();
  fr.onload = () => resolve(new Uint8Array(fr.result));
  fr.onerror = () => reject(fr.error);
  fr.readAsArrayBuffer(blob);
});
define('URL', Object.assign(function (u, b) { return new window.URL(u, b); }, {
  createObjectURL(blob) { pendingBlob = blob; return 'blob:mp/1'; },
  revokeObjectURL() {}
}));
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.alert = () => {};
window.print = () => {};
window.HTMLAnchorElement.prototype.click = function () {
  if (!this.download) return;                       // not a file download
  downloads.push({ name: this.download, blob: pendingBlob });
  pendingBlob = null;
};
globalThis.fetch = async () => { throw new Error('offline in tests'); };
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

const kit = await import('../public/js/kit.js');
kit.LIB_SOURCES.pdfLib = async () => await import('pdf-lib');
const { mountTool } = await import('../public/js/engines.js');
await import('../public/js/engines-rest.js');
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

const settle = async () => { for (let i = 0; i < 14; i++) await new Promise(r => setTimeout(r, 25)); };
const registry = JSON.parse(await readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const toolsRegistry = async () => registry;

/** Re-opens a produced PDF and reports its page count and the text drawn on it. */
async function readPdf(entry) {
  assert.ok(entry.blob, `a PDF blob was handed to the browser for ${entry.name}`);
  const bytes = await blobBytes(entry.blob);
  const { PDFDocument } = await import('pdf-lib');
  const pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= pageCount; i++) {
    text += '\n' + (await (await doc.getPage(i)).getTextContent()).items.map(it => it.str).join(' ');
  }
  return { pageCount, text, bytes: bytes.length };
}

/** Mounts a tool, fills the form, clicks Run, and reports what came out. */
async function runTool(title, fields = {}) {
  const tool = registry.find(t => t.title === title);
  assert.ok(tool, `${title} is in the registry`);
  const root = document.createElement('div');
  const before = downloads.length;
  await mountTool(root, tool);
  for (const [name, value] of Object.entries(fields)) {
    const el = root.querySelector('#' + (name === 'body' ? 'tool-in' : name));
    assert.ok(el, `${title} has a "${name}" input`);
    el.value = value;
  }
  const run = root.querySelector('#run');
  assert.ok(run, `${title} has a run button`);
  run.click();
  await settle();
  const pdfs = [];
  for (const d of downloads.slice(before)) pdfs.push({ name: d.name, ...(await readPdf(d)) });
  return { root, out: () => root.querySelector('#tool-out')?.textContent || '', pdfs: () => pdfs };
}

const UI_TESTS = [];
const uiTest = (name, fn) => UI_TESTS.push({ name, fn });

uiTest('an invoice pastes, totals and downloads a PDF that holds every line', async () => {
  const { out, pdfs } = await runTool('Invoice Maker', {
    from: 'Kerala Supplies', to: 'City Hospital', tax: '18',
    body: 'Gloves | 100 | 12.50\nMasks | 200 | 8.25'
  });
  // 100 x 12.50 = 1250 and 200 x 8.25 = 1650, so 2900 before tax.
  assert.match(out(), /Subtotal\s+2\.?900\.00/, 'the subtotal is shown: ' + out().slice(0, 300));
  assert.match(out(), /Tax \(18%\)\s+522\.00/, '18% of 2900 is 522');
  assert.match(out(), /TOTAL\s+3\.?422\.00/);
  assert.equal(pdfs().length, 1, 'a PDF was offered');
  assert.match(pdfs()[0].name, /^megaplan-inv-.*\.pdf$/);
  assert.match(pdfs()[0].text, /Item/, 'the item table is drawn on the page');
  assert.match(pdfs()[0].text, /3,?422\.00/, 'the total is printed on the PDF, not only in the text box');
});

uiTest('a long invoice paginates instead of dropping the lines past page one', async () => {
  const body = Array.from({ length: 60 }, (_, i) => `Item ${i + 1} | ${i + 1} | 10.00`).join('\n');
  const { out, pdfs } = await runTool('Invoice Maker', { body });
  assert.ok(pdfs()[0].pageCount > 1, `60 items must run onto more than one page (got ${pdfs()[0].pageCount})`);
  assert.match(out(), /Item 60/, 'the last item survives in the text');
  const drawn = pdfs()[0].text.match(/Item \d+/g) || [];
  assert.equal(new Set(drawn).size, 60, 'all 60 items appear somewhere in the PDF');
  assert.match(pdfs()[0].text, /page 1 of \d+/, 'pages are numbered');
});

uiTest('the numbering carries to the next document in the series', async () => {
  const first = await runTool('Invoice Maker', { body: 'Widget | 1 | 100' });
  const second = await runTool('Invoice Maker', { body: 'Widget | 1 | 100' });
  const n1 = first.out().match(/Number: (\S+)/)[1];
  const n2 = second.out().match(/Number: (\S+)/)[1];
  assert.notEqual(n1, n2, 'the second invoice is not a copy of the first');
  assert.equal(n1.slice(0, -1), n2.slice(0, -1), 'the series prefix is the same');
});

uiTest('a bad paste is explained instead of billing zero', async () => {
  const { out } = await runTool('Invoice Maker', { body: 'Widget | abc | def' });
  assert.match(out(), /could not be read/);
  assert.doesNotMatch(out(), /TOTAL\s+0\.00/, 'a zero invoice is not presented as a real one');
});

uiTest('a PDF says which lines were not billed', async () => {
  const { out, pdfs } = await runTool('Invoice Maker', { body: 'Good | 1 | 100\nWidget | abc | def' });
  assert.match(out(), /Not billed/);
  assert.match(pdfs()[0].text, /not billed/i, 'the PDF says so too');
  assert.match(pdfs()[0].text, /Widget \| abc \| def/, 'the offending line is named on the PDF');
});

uiTest('a quotation says it is not an invoice', async () => {
  const { out } = await runTool('Quotation Maker', { body: 'Consulting | 10 | 2000' });
  assert.match(out(), /QUOTATION/);
  assert.match(out(), /not an invoice|offer/i);
});

uiTest('a delivery challan prints no tax and no amount in words', async () => {
  const { out, pdfs } = await runTool('Delivery Challan', { body: 'Crate | 5 | 300' });
  assert.doesNotMatch(out(), /^Tax\s/m);
  assert.doesNotMatch(out(), /Amount in words/);
  assert.match(out(), /TOTAL\s+1\.?500\.00/);
  assert.doesNotMatch(pdfs()[0].text, /Tax:/);
});

uiTest('a payslip shows earnings, deductions and net pay', async () => {
  const { out, pdfs } = await runTool('Payslip Maker', { deductions: '6500', body: 'Basic | 1 | 40000\nHRA | 1 | 16000' });
  assert.match(out(), /Earnings\s+56\.?000\.00/);
  assert.match(out(), /Deductions\s+6\.?500\.00/);
  assert.match(out(), /NET PAY\s+49\.?500\.00/);
  assert.match(pdfs()[0].text, /NET PAY/);
});

uiTest('every business document tool mounts and produces a document', async () => {
  const all = await toolsRegistry();
  // Every schema in business-docs.js must have a real tool behind it in the
  // registry, and every one of them must produce a document and a PDF.
  const titles = Object.keys(DOC_SCHEMAS);
  assert.ok(titles.length >= 20, `there are at least twenty business documents (${titles.length})`);
  for (const title of titles) {
    assert.ok(all.some(t => t.title === title), `${title} is a registered tool`);
    const { out, pdfs } = await runTool(title, { body: 'Sample | 2 | 50', from: 'A', to: 'B' });
    assert.ok(out().trim().length > 20, `${title} writes something`);
    assert.equal(pdfs().length, 1, `${title} offers a PDF`);
    assert.ok(pdfs()[0].pageCount >= 1, `${title} produces a readable page`);
    assert.ok(pdfs()[0].text.trim().length > 20, `${title} draws something on the page`);
  }
});

/* ------------------------------------------------------------------ */

for (const [okFlag, name] of results) console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${name}`);
const coreFailed = results.length - results.filter(r => r[0]).length;
console.log(`\n${results.length - coreFailed}/${results.length} business-document core tests passed`);

for (const t of UI_TESTS) {
  try { t.ok = (await t.fn()) !== false; } catch (e) { t.ok = false; t.err = e; }
}
for (const t of UI_TESTS) console.log(`${t.ok ? 'ok  ' : 'FAIL'} ${t.name}${t.err ? '\n       ' + String(t.err.message).split('\n')[0] : ''}`);
const uiFailed = UI_TESTS.length - UI_TESTS.filter(t => t.ok).length;
console.log(`\n${UI_TESTS.length - uiFailed}/${UI_TESTS.length} business-document tool tests passed`);

const total = results.length + UI_TESTS.length;
const passed = total - coreFailed - uiFailed;
console.log(`\n${passed}/${total} business-document tests passed`);
process.exit(passed === total ? 0 : 1);
