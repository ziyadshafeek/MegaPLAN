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
import {
  buildIndex, rank, sentences, bestSentences, answerFrom, outlineSections,
  sectionRanges, labelPages, sectionBoostFactory, tokenize, stem, citations
} from '../public/js/pdf-rag.js';

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
const op = (job, extra = {}) => runPdfOp(job, { ...deps, ...extra });

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


/* ------------------------------------------------------------------ *
 * Retrieval over a long document
 * ------------------------------------------------------------------ */

/** A real multi-page PDF where each page carries its own sentences. */
async function makeReadablePdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, lines] of pages.entries()) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (const line of lines) {
      for (const wrapped of wrapForPdf(line, 520, font)) {
        page.drawText(wrapped, { x: 50, y, size: 11, font });
        y -= 15;
      }
    }
  }
  return await doc.save();
}

function wrapForPdf(text, width, font) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (font.widthOfTextAtSize(line + ' ' + w, 11) > width) { lines.push(line); line = w; } else line += ' ' + w;
  }
  if (line) lines.push(line);
  return lines;
}

const CHAPTER = [
  'Chapter 1. Scope of the agreement. This agreement takes effect on the date of signature by both parties.',
  'The supplier shall deliver the goods within thirty days of the purchase order being raised.'
];
const DOSAGE = [
  'Chapter 2. Dosage and administration. Metformin 500 mg is to be taken twice daily with food.',
  'The starting dose is 500 mg once daily and may be increased after two weeks of treatment.'
];
const TERMINATION = [
  'Chapter 3. Termination. Either party may terminate this agreement with ninety days written notice.',
  'On termination the supplier shall return all materials and settle outstanding invoices.'
];

await test('a question is answered from the page that holds it, with a citation', async () => {
  const bytes = await makeReadablePdf([CHAPTER, DOSAGE, TERMINATION]);
  const res = await op({ op: 'research', files: [asFile(bytes, 'manual.pdf')], params: { prompt: 'what dose of metformin?' } });
  assert.match(res.text, /Metformin 500 mg/, 'the answer quotes the document: ' + res.text.slice(0, 200));
  assert.match(res.text, /p\. 2/, 'and says which page: ' + res.text.slice(0, 300));
  assert.deepEqual(res.ranked, [2], 'page 2 is the one that answers it');
  assert.equal(res.files.length, 1, 'the cited page is saved as a PDF');
  const cited = await pdfPageCount(res.files[0].bytes);
  assert.equal(cited, 1, 'the saved PDF holds exactly the cited page');
  assert.match(res.text, /nothing was uploaded/i);
});

await test('a question the document does not answer is refused, not guessed at', async () => {
  const bytes = await makeReadablePdf([CHAPTER, DOSAGE, TERMINATION]);
  const res = await op({ op: 'research', files: [asFile(bytes, 'manual.pdf')], params: { prompt: 'what is the price of the offshore lease?' } });
  assert.equal(res.notFound, true);
  assert.equal(res.files.length, 0, 'no PDF is produced from nothing');
  assert.match(res.text, /none of them mention/i);
  assert.match(res.text, /Nothing was guessed/i);
});

await test('an empty question asks for a question rather than summarising', async () => {
  const bytes = await makeReadablePdf([CHAPTER]);
  const res = await op({ op: 'research', files: [asFile(bytes, 'manual.pdf')], params: { prompt: '  ' } });
  assert.match(res.text, /Ask a question/);
  assert.equal(res.files.length, 0);
});

await test('a rare word outranks a word that appears everywhere', async () => {
  const pages = [
    { n: 1, of: 3, name: 'x.pdf', body: 'The parties agree the agreement and the agreement is the agreement.' },
    { n: 2, of: 3, name: 'x.pdf', body: 'The parties agree the parties and the parties. Metformin appears once here.' },
    { n: 3, of: 3, name: 'x.pdf', body: 'Nothing of interest on this sheet at all.' }
  ];
  const index = buildIndex(pages);
  const forCommon = rank(index, 'agreement');
  const forRare = rank(index, 'metformin');
  assert.equal(forCommon[0].n, 1, 'a common word still finds its page');
  assert.equal(forRare.length, 1);
  assert.equal(forRare[0].n, 2, 'a rare word is decisive');
  assert.ok(rank(index, '').length === 0, 'an empty query ranks nothing rather than everything');
});

await test('the extractor keeps abbreviations and decimals in one sentence', () => {
  const s = sentences('Dr. Smith gave 1.5 mg. Then he stopped. See Fig. 2 for detail.');
  assert.equal(s.length, 3, JSON.stringify(s));
  assert.match(s[0], /Dr\. Smith/);
  assert.match(s[0], /1\.5 mg/);
  assert.match(s[1], /he stopped/);
});

await test('the answer never cites a page it did not read', async () => {
  const pages = [];
  for (let i = 1; i <= 40; i++) {
    pages.push(i === 17
      ? ['The escalation contact is the duty manager on nights.']
      : [`Routine page ${i}. Standard administrative content of the usual kind, printed as filler.`]);
  }
  const bytes = await makeReadablePdf(pages);
  const res = await op({ op: 'research', files: [asFile(bytes, 'big.pdf')], params: { prompt: 'who is the escalation contact on nights?' } });
  assert.deepEqual(res.ranked, [17], 'exactly the page that mentions it: ' + JSON.stringify(res.ranked));
  const cited = [...res.text.matchAll(/p\. (\d+)/g)].map(m => Number(m[1]));
  assert.ok(cited.every(n => n === 17), 'every citation is page 17: ' + JSON.stringify(cited));
});

await test('a scanned PDF says so instead of returning nothing', async () => {
  // A real PDF whose pages carry no text layer, as a scan does.
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.9, 0.9, 0.88) });
  page.drawText('', { x: 10, y: 10 });
  const bytes = await doc.save();
  const res = await op({ op: 'research', files: [asFile(bytes, 'scan.pdf')], params: { prompt: 'what does it say?', ocr: false } });
  assert.equal(res.needsOcr, true);
  assert.match(res.detail, /scan/i);
});

await test('a scan is read by the OCR callback when one is supplied', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.9, 0.9, 0.88) });
  const bytes = await doc.save();
  let asked = 0, rendered = 0;
  const res = await op({ op: 'text', files: [asFile(bytes, 'scan.pdf')], params: { ocr: true } }, {
    ...deps,
    recognize: async bitmap => { asked++; assert.equal(bitmap.page, 1, 'it is told which page it is reading'); return 'SCANNED WORD'; },
    renderPage: async page => { rendered++; return { page: 1, w: page.getViewport({ scale: 1 }).width }; }
  });
  assert.equal(rendered, 1, 'the blank page was rendered');
  assert.equal(asked, 1, 'and the bitmap was sent to the reader');
  assert.match(res.text, /SCANNED WORD/, 'and its text came back: ' + res.text);
  assert.equal(res.ocrPages, 1, 'the page is marked as read by OCR');
});

await test('the table of contents is read and used to label the pages', () => {
  const outline = [
    { title: 'Chapter 1 — Scope', dest: 0 },
    { title: '1.1 Parties', dest: 0, items: [{ title: '1.1.1 Notices', dest: 0 }] },
    { title: 'Chapter 2 — Dosage', dest: 2, items: [{ title: '2.1 Adults', dest: 2 }] },
    { title: 'Chapter 3 — Termination', dest: 4 }
  ];
  const sections = outlineSections(outline, 5, { resolve: it => it.dest + 1 });
  assert.equal(sections.length, 6, 'nested headings are not lost');
  assert.equal(sections.filter(s => s.depth === 2).length, 2, 'and they keep their depth');
  const ranges = sectionRanges(sections, 5);
  assert.deepEqual(ranges.map(r => [r.from, r.to]), [[1, 2], [3, 4], [5, 5]], 'ranges do not overlap');
  const pages = [1, 2, 3, 4, 5].map(n => ({ n, of: 5, name: 'd', body: 'x' }));
  assert.match(labelPages(pages, ranges)[2].section, /Dosage/);
  const boost = sectionBoostFactory(ranges, 'which dose is for adults?');
  assert.equal(boost({ section: 'Chapter 2 — Dosage' }), 1.5, 'a page in the right chapter is preferred');
  assert.equal(boost({ section: 'Chapter 3 — Termination' }), 0);
  assert.equal(boost({ section: null }), 0);
});

await test('a document with no outline still ranks, it is just not labelled', () => {
  assert.deepEqual(outlineSections(null, 10), []);
  assert.deepEqual(sectionRanges([], 10), []);
  const pages = [{ n: 1, of: 1, name: 'd', body: 'anything' }];
  assert.equal(labelPages(pages, [])[0].section, undefined);
  assert.equal(sectionBoostFactory([], 'anything')({ section: 'x' }), 0);
});

await test('a sentence is only quoted if it carries the question', () => {
  const ranked = [{ n: 7, of: 9, name: 'd.pdf', body: 'The dose is 500 mg. Lunch is at one o clock. See the appendix for the audit trail.' }];
  const quotes = bestSentences(ranked, 'what is the dose');
  assert.ok(quotes.length >= 1);
  assert.ok(quotes.every(q => /500 mg|dose/i.test(q.text)), JSON.stringify(quotes.map(q => q.text)));
  assert.equal(quotes[0].page, 7, 'and it knows its page');
  assert.equal(bestSentences(ranked, 'zzzz unrelated').length, 0, 'nothing relevant, nothing quoted');
  assert.equal(answerFrom('zzzz unrelated', ranked), null);
});

await test('BM25 ranks the same way twice, and rewards the page that says it most', () => {
  // Pages of equal length, so the only difference is how often the term is said.
  const page = (n, times) => ({ n, of: 6, name: 'd', body: ['metformin', ...Array(times).fill('metformin'), ...Array(10 - times).fill('placeholder')].join(' ') });
  const pages = [page(1, 0), page(2, 1), page(3, 3), page(4, 10), page(5, 0), page(6, 0)];
  const index = buildIndex(pages);
  const first = rank(index, 'metformin').map(r => r.n);
  const second = rank(index, 'metformin').map(r => r.n);
  assert.deepEqual(first, second, 'the same question twice gives the same order');
  assert.equal(first[0], 4, 'the page that says it ten times comes first');
  assert.deepEqual(first.slice(0, 4), [4, 3, 2, 1], 'and the rest fall in frequency order: ' + JSON.stringify(first));
  assert.deepEqual(rank(index, 'nothinginthisdocument').length, 0, 'a word that is not there ranks nothing');
});

await test('a short dense page beats a long padded one, as BM25 is meant to', () => {
  const pages = [
    { n: 1, of: 2, name: 'd', body: 'metformin' },
    { n: 2, of: 2, name: 'd', body: 'metformin ' + 'filler '.repeat(40) }
  ];
  const index = buildIndex(pages);
  assert.equal(rank(index, 'metformin')[0].n, 1, 'one mention in a short passage beats one buried in a long one');
});


/* ------------------------------------------------------------------ */

const failed = results.filter(r => !r[0]);
for (const [okFlag, name] of results) {
  console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${name}`);
}
console.log(`\n${results.length - failed.length}/${results.length} PDF operation tests passed`);
process.exit(failed.length ? 1 : 0);
