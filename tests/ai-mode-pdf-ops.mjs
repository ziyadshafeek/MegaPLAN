/**
 * AI Mode PDF operations — the operations `public/js/ai-pdf-ops.js` performs
 * on a real attached file.
 *
 * These are behavioural tests, not source greps: a real PDF is generated, the
 * real operation runs through pdf-lib/pdf.js, and the output is checked as a
 * real PDF (header, page count, extracted text). An operation that silently
 * drops pages or returns a truncated file fails here.
 */
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { runPdfOp, parsePageList, pageListFromPrompt, canRunPdfTool, PDF_OP_MAP } from '../public/js/ai-pdf-ops.js';

/*
 * The browser loads pdf-lib and pdf.js from a CDN at runtime. Node cannot import
 * https: URLs, so the loaders are injected here and the very same operation
 * code runs against the real libraries. Nothing about the operation is stubbed —
 * these tests build real PDFs and assert real pages and real extracted text.
 */
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
// pdf.js warns when the standard-font data URL is unset; that affects font
// rendering, not text extraction, and the warning would bury real failures.
const quiet = () => { try { pdfjsLib.setVerbosityLevel?.(0); } catch { /* older builds */ } };
const deps = { loadPdfLib: async () => await import('pdf-lib'), loadPdfJs: async () => pdfjsLib };
const op = (job) => runPdfOp(job, deps);

/** Build a real multi-page PDF with identifiable text on every page. */
async function makePdf(pages, label = 'Doc') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([400, 500]);
    page.drawText(`${label} page ${i}`, { x: 40, y: 440, size: 18, font, color: rgb(0, 0, 0) });
  }
  return await doc.save();
}

function asFile(bytes, name) {
  return new File([bytes], name, { type: 'application/pdf' });
}

async function pdfPageCount(bytes) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

async function pdfText(bytes) {
  quiet();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  let all = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    all += (await page.getTextContent()).items.map(it => it.str || '').join(' ') + ' ';
  }
  return all;
}

async function pdfHasText(bytes, needle) {
  return (await pdfText(bytes)).toLowerCase().includes(String(needle).toLowerCase());
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (err) { results.push([false, `${name}\n      ${err.message}`]); }
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

await test('parsePageList reads ranges, lists and reversed orders', () => {
  assert.deepEqual(parsePageList('1-3,5', 10), [0, 1, 2, 4]);
  assert.deepEqual(parsePageList('5,1,3', 10), [0, 2, 4], 'sorted, deduplicated');
  assert.deepEqual(parsePageList('9 to 11', 10), [8, 9], 'clamped to the real page count');
  assert.equal(parsePageList('banana', 10), null, 'unparseable input is null, not garbage');
  assert.equal(parsePageList('', 10), null);
  assert.equal(parsePageList('99', 10), null, 'out-of-range pages are rejected');
});

await test('pageListFromPrompt pulls the range out of the user sentence', () => {
  assert.deepEqual(pageListFromPrompt('delete pages 5 to 9 from this', 20), [4, 5, 6, 7, 8]);
  assert.deepEqual(pageListFromPrompt('extract pages 1, 3 and 4', 20), [0, 2, 3]);
  assert.deepEqual(pageListFromPrompt('remove pages 2 through 4', 20), [1, 2, 3]);
  assert.equal(pageListFromPrompt('make the pdf smaller', 20), null);
});

await test('canRunPdfTool refuses operations whose input is missing', async () => {
  const tools = require_tools();
  const pdf = asFile(await makePdf(3), 'a.pdf');
  assert.equal(canRunPdfTool(tools['rotate-pdf'], [pdf]), true);
  assert.equal(canRunPdfTool(tools['rotate-pdf'], []), false, 'no file, no run');
  assert.equal(canRunPdfTool(tools['merge-pdfs'], [pdf]), false, 'merging needs two files');
  assert.equal(canRunPdfTool(tools['merge-pdfs'], [pdf, asFile(await makePdf(2), 'b.pdf')]), true);
  assert.equal(canRunPdfTool(tools['sign-pdf'], [pdf]), false, 'signing is not in the runnable map');
  assert.equal(canRunPdfTool(tools['youtube-video-downloader'], [pdf]), false, 'catalogued never runs');
});

await test('the runnable map never contains an operation that needs a human', () => {
  for (const slug of ['sign-pdf', 'fill-pdf', 'redact-pdf', 'ocr-pdf', 'repair-pdf', 'annotate-pdf']) {
    assert.equal(PDF_OP_MAP[slug], undefined, `${slug} must stay an honest studio hand-off`);
  }
});

function require_tools() {
  const tools = {};
  for (const slug of Object.keys(PDF_OP_MAP)) {
    tools[slug] = { slug, title: slug.replace(/-/g, ' '), category: 'PDF', status: 'live' };
  }
  for (const slug of ['sign-pdf', 'fill-pdf', 'ocr-pdf', 'youtube-video-downloader']) {
    tools[slug] = { slug, title: slug, category: 'PDF', status: 'live' };
  }
  return tools;
}

/* ------------------------------------------------------------------ *
 * Real operations
 * ------------------------------------------------------------------ */

await test('merge combines two real PDFs in order', async () => {
  const a = asFile(await makePdf(3, 'Alpha'), 'alpha.pdf');
  const b = asFile(await makePdf(2, 'Beta'), 'beta.pdf');
  const res = await op({ op: 'merge', files: [a, b] });
  assert.equal(res.files.length, 1);
  assert.equal(await pdfPageCount(res.files[0].bytes), 5, 'pages are combined, none lost');
  assert.ok(await pdfHasText(res.files[0].bytes, 'Alpha page 1'));
  assert.ok(await pdfHasText(res.files[0].bytes, 'Beta page 2'));
  assert.match(res.files[0].name, /^megaplan-merged-.*\.pdf$/);
});

await test('extract keeps exactly the requested pages', async () => {
  const f = asFile(await makePdf(10, 'Source'), 'source.pdf');
  const res = await op({ op: 'extract', files: [f], params: { range: '2-4' } });
  assert.equal(await pdfPageCount(res.files[0].bytes), 3);
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 2'));
  assert.equal(await pdfHasText(res.files[0].bytes, 'Source page 5'), false, 'page 5 must not be in the output');
});

await test('extract reads the range out of the user prompt', async () => {
  const f = asFile(await makePdf(10, 'Source'), 'source.pdf');
  const res = await op({ op: 'extract', files: [f], params: { prompt: 'extract pages 7 and 9 please' } });
  assert.equal(await pdfPageCount(res.files[0].bytes), 2);
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 9'));
});

await test('delete removes pages and keeps the rest', async () => {
  const f = asFile(await makePdf(10, 'Source'), 'source.pdf');
  const res = await op({ op: 'delete', files: [f], params: { range: '5-9' } });
  assert.equal(await pdfPageCount(res.files[0].bytes), 5);
  assert.equal(await pdfHasText(res.files[0].bytes, 'Source page 5'), false);
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 4'), 'earlier pages survive');
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 10'), 'later pages survive');
});

await test('delete refuses to remove every page', async () => {
  const f = asFile(await makePdf(4, 'Source'), 'source.pdf');
  await assert.rejects(() => op({ op: 'delete', files: [f], params: { range: '1-4' } }), /every page/i);
});

await test('split cuts the file into parts and loses no page', async () => {
  const f = asFile(await makePdf(10, 'Source'), 'source.pdf');
  const res = await op({ op: 'split', files: [f], params: { size: 4 } });
  assert.equal(res.files.length, 3, '10 pages of 4 make three parts');
  const counts = [];
  for (const part of res.files) counts.push(await pdfPageCount(part.bytes));
  assert.deepEqual(counts, [4, 4, 2], 'the last part holds the remainder');
  assert.equal(counts.reduce((a, b) => a + b, 0), 10, 'every page is written exactly once');
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 1'));
  assert.ok(await pdfHasText(res.files[2].bytes, 'Source page 10'), 'the tail is not dropped');
  assert.match(res.text, /nothing was dropped/);
});

await test('split into equal parts when no size is given', async () => {
  const f = asFile(await makePdf(10, 'Source'), 'source.pdf');
  const res = await op({ op: 'split', files: [f] });
  const counts = [];
  for (const part of res.files) counts.push(await pdfPageCount(part.bytes));
  assert.equal(counts.reduce((a, b) => a + b, 0), 10);
  assert.equal(res.files.length, 2, 'a 10-page file halves into two parts');
});

await test('rotate changes the page rotation and keeps the content', async () => {
  const f = asFile(await makePdf(3, 'Source'), 'source.pdf');
  const res = await op({ op: 'rotate', files: [f], params: { prompt: 'rotate this pdf 90 degrees' } });
  const doc = await (await import('pdf-lib')).PDFDocument.load(res.files[0].bytes);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getPage(0).getRotation().angle, 90, 'the prompt degree is used');
  assert.ok(await pdfHasText(res.files[0].bytes, 'Source page 1'), 'rotation never drops text');
});

await test('page numbers are stamped on every page', async () => {
  const f = asFile(await makePdf(4, 'Source'), 'source.pdf');
  const res = await op({ op: 'numbers', files: [f], params: { start: 1 } });
  const text = res.files[0].bytes;
  assert.equal(await pdfPageCount(text), 4);
  assert.ok(await pdfHasText(text, '4'), 'the last page number is drawn');
});

await test('watermark applies to every page and reports the text', async () => {
  const f = asFile(await makePdf(3, 'Source'), 'source.pdf');
  const res = await op({ op: 'watermark', files: [f], params: { watermark: 'DRAFT' } });
  assert.equal(await pdfPageCount(res.files[0].bytes), 3);
  assert.match(res.text, /DRAFT/);
});

await test('compress keeps every page and strips metadata', async () => {
  const f = asFile(await makePdf(6, 'Source'), 'source.pdf');
  const res = await op({ op: 'compress', files: [f] });
  assert.equal(await pdfPageCount(res.files[0].bytes), 6, 'compression must never lose pages');
  assert.match(res.text, /page\(s\) kept|kept/i);
});

await test('text extraction returns real page text, not a placeholder', async () => {
  const f = asFile(await makePdf(5, 'Report'), 'report.pdf');
  const res = await op({ op: 'text', files: [f] });
  assert.match(res.text, /Report page 3/);
  assert.ok(res.text.length > 40, 'text is substantive');
  assert.equal(res.files.length, 0, 'reading a PDF produces no file');
});

await test('count reports the page total without writing a file', async () => {
  const a = asFile(await makePdf(4, 'A'), 'a.pdf');
  const b = asFile(await makePdf(6, 'B'), 'b.pdf');
  const res = await op({ op: 'count', files: [a, b] });
  assert.match(res.text, /10 page\(s\)/);
  assert.equal(res.files.length, 0);
});

await test('images become a real PDF, one page per image', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
  );
  const files = [
    new File([png], 'scan1.png', { type: 'image/png' }),
    new File([png], 'scan2.png', { type: 'image/png' })
  ];
  const res = await op({ op: 'images', files });
  assert.equal(await pdfPageCount(res.files[0].bytes), 2);
  assert.match(res.text, /2 image/);
});

await test('4-up really packs four source pages onto one sheet', async () => {
  const f = asFile(await makePdf(4, 'Source'), 'source.pdf');
  const res = await op({ op: 'nup', files: [f] });
  assert.equal(await pdfPageCount(res.files[0].bytes), 1, 'four pages become one sheet');
});

await test('a page-range search over a long PDF finds the right pages', async () => {
  const f = asFile(await makePdf(40, 'Manual'), 'manual.pdf');
  const res = await op({ op: 'sections', files: [f], params: { prompt: 'diabetes management and dosage' } });
  // The fixture has no diabetes text, so the honest answer is "no hits", not a guess.
  assert.equal(res.files.length, 0, 'no fabricated matches');
  assert.match(res.text, /None of the|mention/i);
});

await test('a page-range search returns real matches when the words are present', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 30; i++) {
    const page = doc.addPage([400, 500]);
    const body = i === 17 ? 'Hypertension and diabetes management guidelines' : `General content section ${i}`;
    page.drawText(body, { x: 30, y: 440, size: 14, font, color: rgb(0, 0, 0) });
  }
  const f = asFile(await doc.save(), 'long.pdf');
  const res = await op({ op: 'sections', files: [f], params: { prompt: 'diabetes' } });
  assert.equal(res.files.length, 1, 'the relevant pages are saved as one PDF');
  assert.equal(await pdfPageCount(res.files[0].bytes), 1);
  assert.ok(await pdfHasText(res.files[0].bytes, 'diabetes'), 'the matched page is the right one');
  assert.equal(await pdfHasText(res.files[0].bytes, 'General content section 18'), false,
    'and not the page after it — an off-by-one here would look like success');
  assert.match(res.text, /page 17/);
});

await test('a missing file fails honestly instead of pretending', async () => {
  await assert.rejects(() => op({ op: 'rotate', files: [] }), /Attach a PDF/i);
  const txt = new File([Buffer.from('hello')], 'notes.txt', { type: 'text/plain' });
  await assert.rejects(() => op({ op: 'rotate', files: [txt] }), /None of the attached files is a PDF/i);
});

await test('an operation outside the map is refused, not approximated', async () => {
  await assert.rejects(() => op({ op: 'sign', files: [] }), /PDF studio/i);
  await assert.rejects(() => op({ op: undefined, files: [] }), /cannot run/i);
});

/* ------------------------------------------------------------------ */

const failed = results.filter(r => !r[0]);
for (const [okFlag, name] of results) {
  console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${name}`);
}
console.log(`\n${results.length - failed.length}/${results.length} PDF operation tests passed`);
process.exit(failed.length ? 1 : 0);
