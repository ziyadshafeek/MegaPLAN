/**
 * MegaPLAN AI Mode — programmatic PDF operations.
 *
 * The PDF studio is a full-screen app, so the planner used to mark every PDF
 * tool as "open this instead". That was honest but useless: a user who says
 * "rotate this PDF 90 degrees" or "delete pages 5 to 9" still had to click
 * through the app by hand.
 *
 * This module runs the common, unambiguous operations straight from the
 * uploaded file, in the browser, with pdf-lib — and returns real downloadable
 * files. Operations that genuinely need a human (signing, filling a form,
 * redaction review, OCR of a scan) are NOT faked here; `PDF_OP_MAP` leaves
 * them out so the planner keeps offering the real tool.
 *
 * Honesty rules:
 *   - never claim an operation ran when it did not;
 *   - never silently drop pages — every output reports the page count;
 *   - if pdf-lib is unavailable, fail with a reason the UI can show.
 */

import { loadPdfLib, loadPdfJs } from './kit.js';
import {
  tokenize, stem, buildIndex, rank, sentences, queryTerms, bestSentences, citations,
  answerFrom, outlineSections, sectionRanges, labelPages, sectionBoostFactory
} from './pdf-rag.js';

/** Registry slug → the operation this module can genuinely perform. */
export const PDF_OP_MAP = {
  'merge-pdfs': 'merge',
  'split-pdf': 'split',
  'compress-pdf': 'compress',
  'rotate-pdf': 'rotate',
  'extract-pdf-pages': 'extract',
  'pdf-page-extractor': 'extract',
  'delete-pdf-pages': 'delete',
  'reorder-pdf-pages': 'reorder',
  'add-pdf-page-numbers': 'numbers',
  'add-pdf-watermark': 'watermark',
  'remove-pdf-metadata': 'metadata',
  'pdf-metadata-viewer': 'metadata',
  'crop-pdf': 'crop',
  'pages-per-sheet': 'nup',
  'two-pages-per-sheet': 'nup2',
  'booklet-pdf-maker': 'nup2',
  'overlay-pdfs': 'overlay',
  'compare-pdfs': 'compare',
  'images-to-pdf': 'images',
  'jpg-to-pdf': 'images',
  'png-to-pdf': 'images',
  'webp-to-pdf': 'images',
  'pdf-page-counter': 'count',
  'pdf-to-text': 'text',
  'pdf-to-markdown': 'text',
  'pdf-form-field-viewer': 'forms',
  'agentic-pdf-splitter': 'sections',
  // The 1000-page ask: ask a question, get quoted answers with page numbers.
  'pdf-question-answerer': 'research',
  'ask-this-pdf': 'research',
  'pdf-search': 'research',
  'chat-with-pdf': 'research',
  'pdf-knowledge-base': 'research',
  'pdf-section-finder': 'sections',
  'find-in-pdf': 'research'
};

export function pdfOpForSlug(slug) {
  return PDF_OP_MAP[String(slug || '')] || null;
}

/** True when AI Mode should try to run this tool itself instead of only opening it. */
export function canRunPdfTool(tool, files = []) {
  if (!tool) return false;
  if (tool.status === 'catalogued') return false;
  const op = pdfOpForSlug(tool.slug);
  if (!op) return false;
  const pdfs = (files || []).filter(isPdf);
  if (op === 'merge' || op === 'overlay') return pdfs.length >= 2;
  if (op === 'images') return (files || []).some(f => /^image\//.test(f.type || ''));
  return pdfs.length >= 1;
}

function isPdf(f) {
  return /\.pdf$/i.test(f?.name || '') || f?.type === 'application/pdf';
}

function baseName(name) {
  return String(name || 'document').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60) || 'document';
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Parse "1-3,5,8-10" into 0-based indices.
 * @returns {number[]|null} null when the range is unparseable.
 */
export function parsePageList(spec, pageCount) {
  if (pageCount == null || !Number.isFinite(pageCount)) return null;
  const text = String(spec || '').trim();
  if (!text) return null;
  const out = new Set();
  for (const part of text.split(/[,;&\n]+/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const range = chunk.match(/^(\d+)\s*(?:-|–|—|\.\.|to)\s*(\d+)$/i);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      if (a < 1) a = 1;
      if (b > pageCount) b = pageCount;
      for (let i = a; i <= b; i++) out.add(i - 1);
      continue;
    }
    const one = chunk.match(/^(\d+)$/);
    if (one) {
      const n = Number(one[1]);
      if (n >= 1 && n <= pageCount) out.add(n - 1);
      continue;
    }
    return null;
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** Pull the page list a user typed out of their own request. */
export function pageListFromPrompt(prompt, pageCount) {
  const text = String(prompt || '')
    // "pages 5 to 9", "pages 5-9", "pages 5 and 9" all mean the same thing.
    .replace(/\s+(?:and|or)\s+/gi, ',')
    .replace(/\s*\b(?:to|through|thru|until)\b\s*/gi, '-');
  const explicit = text.match(/\b(?:pages?|page)\s+(\d+(?:\s*(?:-|,)\s*\d+)*)/i);
  if (explicit) {
    const list = parsePageList(explicit[1].replace(/\s*-\s*/g, '-').replace(/\s*,\s*/g, ','), pageCount);
    if (list) return list;
  }
  return null;
}

function degreesFromPrompt(prompt) {
  const m = String(prompt || '').match(/\b(90|180|270)\s*(?:°|deg|degrees)?\b/i);
  return m ? Number(m[1]) : 90;
}

async function loadDoc(PDFLib, bytes) {
  return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function helvetica(PDFLib) {
  return { regular: PDFLib.StandardFonts.Helvetica, bold: PDFLib.StandardFonts.HelveticaBold, oblique: PDFLib.StandardFonts.HelveticaOblique };
}

/**
 * The standard PDF fonts are named constants until they are embedded in a
 * specific document — every op that draws therefore needs its own font object.
 * Cached per document so one op never embeds the same font twice.
 */
async function font(PDFLib, doc, which = 'regular') {
  doc.__fonts ||= new Map();
  if (!doc.__fonts.has(which)) {
    doc.__fonts.set(which, await doc.embedFont(helvetica(PDFLib)[which]));
  }
  return doc.__fonts.get(which);
}

/* ------------------------------------------------------------------ *
 * Individual operations. Each returns { files:[{name, bytes}], text }
 * `bytes` is a Uint8Array; the caller turns it into a Blob.
 * ------------------------------------------------------------------ */

async function opCount(PDFLib, docs) {
  const doc = docs[0];
  const total = docs.reduce((n, d) => n + d.getPageCount(), 0);
  return {
    files: [],
    text: `Page count:\n${docs.map((d, i) => `- ${docs[i].__name}: ${d.getPageCount()} page(s)`).join('\n')}\n- Total: ${total} page(s)`,
    detail: `${total} page(s) across ${docs.length} file(s)`
  };
}

async function opMetadata(PDFLib, docs) {
  const lines = [];
  for (const doc of docs) {
    lines.push(`${doc.__name} — ${doc.getPageCount()} page(s)`);
    for (const key of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate']) {
      let value = '';
      try { value = doc.getTitle?.() ?? ''; } catch { value = ''; }
      if (key !== 'Title') {
        try { value = (key === 'Author' ? doc.getAuthor?.() : key === 'Subject' ? doc.getSubject?.() : key === 'Keywords' ? doc.getKeywords?.() : key === 'Creator' ? doc.getCreator?.() : key === 'Producer' ? doc.getProducer?.() : key === 'CreationDate' ? doc.getCreationDate?.() : doc.getModificationDate?.()) ?? ''; } catch { value = ''; }
      }
      if (value) lines.push(`  ${key}: ${String(value)}`);
    }
  }
  return { files: [], text: lines.join('\n'), detail: 'read metadata (no file written)' };
}

async function opMerge(PDFLib, docs, params) {
  const out = await PDFLib.PDFDocument.create();
  let pages = 0;
  for (const doc of docs) { const copied = await out.copyPages(doc, doc.getPageIndices()); copied.forEach(p => out.addPage(p)); pages += copied.length; }
  return { files: [{ name: `megaplan-merged-${stamp()}.pdf`, bytes: await out.save() }], text: `Merged ${docs.length} file(s) into ${pages} page(s) in one PDF.`, detail: `merged ${docs.length} PDFs → ${pages} pages` };
}

async function opExtract(PDFLib, docs, params) {
  const doc = docs[0];
  const list = resolveList(params, doc.getPageCount());
  if (!list) throw new Error('Tell me which pages, for example “extract pages 1-3 and 5”.');
  const out = await PDFLib.PDFDocument.create();
  const copied = await out.copyPages(doc, list);
  copied.forEach(p => out.addPage(p));
  return { files: [{ name: `megaplan-extracted-${stamp()}.pdf`, bytes: await out.save() }], text: `Extracted page(s) ${formatList(list)} of ${doc.__name} (${list.length} of ${doc.getPageCount()}).`, detail: `${list.length} of ${doc.getPageCount()} pages extracted` };
}

async function opDelete(PDFLib, docs, params) {
  const doc = docs[0];
  const list = resolveList(params, doc.getPageCount());
  if (!list) throw new Error('Tell me which pages to remove, for example “delete pages 5 to 9”.');
  const drop = new Set(list);
  if (drop.size >= doc.getPageCount()) throw new Error('That would remove every page — nothing would be left.');
  // pdf-lib removes one page at a time, and every removal renumbers the rest,
  // so the pages have to go from the back forward or the wrong ones disappear.
  for (const i of [...list].sort((a, b) => b - a)) doc.removePage(i);
  return { files: [{ name: `megaplan-trimmed-${baseName(doc.__name)}-${stamp()}.pdf`, bytes: await doc.save() }], text: `Removed page(s) ${formatList(list)} from ${doc.__name}. ${doc.getPageCount()} page(s) remain.`, detail: `removed ${list.length} of ${doc.getPageCount()} pages` };
}

async function opReorder(PDFLib, docs, params) {
  const doc = docs[0];
  const order = String(params.order || '').split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= doc.getPageCount());
  if (order.length < 2) throw new Error('Give the new page order, for example “reorder pages 3,1,2,4”.');
  const out = await PDFLib.PDFDocument.create();
  const copied = await out.copyPages(doc, order.map(n => n - 1));
  copied.forEach(p => out.addPage(p));
  return { files: [{ name: `megaplan-reordered-${stamp()}.pdf`, bytes: await out.save() }], text: `Reordered into ${order.join(', ')} — ${order.length} page(s). Pages not listed were left out on purpose.`, detail: `reordered ${order.length} pages` };
}

async function opRotate(PDFLib, docs, params) {
  const doc = docs[0];
  const deg = [90, 180, 270].includes(Number(params.degrees)) ? Number(params.degrees) : degreesFromPrompt(params.prompt);
  doc.getPages().forEach(p => p.setRotation(PDFLib.degrees((p.getRotation().angle + deg) % 360)));
  return { files: [{ name: `megaplan-rotated-${stamp()}.pdf`, bytes: await doc.save() }], text: `Rotated all ${doc.getPageCount()} page(s) by ${deg}° clockwise.`, detail: `rotated ${doc.getPageCount()} pages by ${deg}°` };
}

/**
 * Split a PDF into parts. `params.range` cuts at those pages; otherwise the
 * file is cut into `params.parts` equal parts (or pages of `params.size`).
 */
async function opSplit(PDFLib, docs, params) {
  const doc = docs[0];
  const count = doc.getPageCount();
  const perPart = Number(params.size) > 0 ? Math.floor(Number(params.size)) : 0;
  const wanted = Number(params.parts) > 0 ? Math.floor(Number(params.parts)) : 0;
  const size = perPart || Math.ceil(count / (wanted || 2));
  const cut = resolveList(params, count);
  const src = await PDFLib.PDFDocument.create();
  (await src.copyPages(doc, doc.getPageIndices())).forEach(p => src.addPage(p));
  const out = [];
  let made = 0;
  for (let start = 0; start < count; start += size) {
    const indices = [];
    for (let i = start; i < Math.min(start + size, count); i++) indices.push(i);
    if (cut && !indices.some(i => cut.includes(i))) continue;      // skip parts the user excluded
    const part = await PDFLib.PDFDocument.create();
    (await part.copyPages(src, indices)).forEach(p => part.addPage(p));
    out.push({ name: `megaplan-part-${String(made + 1).padStart(2, '0')}-${baseName(doc.__name)}.pdf`, bytes: await part.save(), pages: indices.length });
    made++;
  }
  if (!out.length) throw new Error('That page range leaves no part to write.');
  const total = out.reduce((n, f) => n + f.pages, 0);
  return {
    files: out,
    text: `Split ${doc.__name} (${count} page(s)) into ${out.length} part(s) of up to ${size} page(s). ${total} page(s) written.\n${cut ? 'Parts containing no selected page were skipped.' : 'Every page was written exactly once — nothing was dropped.'}`,
    detail: `${count} pages → ${out.length} part(s)`
  };
}

async function opNumbers(PDFLib, docs, params) {
  const doc = docs[0];
  const start = Math.max(1, Number(params.start) || 1);
  const regular = await font(PDFLib, doc);
  doc.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const label = String(start + i);
    const w = regular.widthOfTextAtSize(label, 10);
    page.drawText(label, {
      x: Math.max(4, (width - w) / 2), y: 18, size: 10, font: regular, color: PDFLib.rgb(0.25, 0.25, 0.25)
    });
  });
  return { files: [{ name: `megaplan-numbered-${stamp()}.pdf`, bytes: await doc.save() }], text: `Numbered ${doc.getPageCount()} page(s) from ${start} at the bottom centre.`, detail: `numbered ${doc.getPageCount()} pages` };
}

async function opWatermark(PDFLib, docs, params) {
  const doc = docs[0];
  const text = String(params.watermark || '').trim().slice(0, 40) || 'MegaPLAN';
  const opacity = Math.min(1, Math.max(0.05, Number(params.opacity) || 0.25));
  const regular = await font(PDFLib, doc);
  const size = 46;
  const width = regular.widthOfTextAtSize(text, size) || size * text.length;
  doc.getPages().forEach(page => {
    const { width: pw, height: ph } = page.getSize();
    const scale = Math.min(1, (pw * 0.8) / Math.max(1, width));
    page.drawText(text, {
      x: (pw - width * scale) / 2,
      y: ph / 2 - (size * scale) / 2,
      size: size * scale,
      font: regular,
      color: PDFLib.rgb(0.45, 0.45, 0.45),
      opacity,
      rotate: PDFLib.degrees(35)
    });
  });
  return { files: [{ name: `megaplan-watermarked-${stamp()}.pdf`, bytes: await doc.save() }], text: `Stamped “${text}” across all ${doc.getPageCount()} page(s) at ${Math.round(opacity * 100)}% opacity.`, detail: `watermarked ${doc.getPageCount()} pages` };
}

async function opCompress(PDFLib, docs, params) {
  const doc = docs[0];
  const before = doc.getPageCount();
  const saved = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'].map(k => {
    try { return doc[k === 'Title' ? 'setTitle' : k === 'Author' ? 'setAuthor' : k === 'Subject' ? 'setSubject' : k === 'Keywords' ? 'setKeywords' : k === 'Creator' ? 'setCreator' : 'setProducer'](''); } catch { return false; }
  });
  const bytes = await doc.save({ useObjectStreams: true });
  const after = await loadDoc(PDFLib, bytes);
  return {
    files: [{ name: `megaplan-compressed-${stamp()}.pdf`, bytes }],
    text: `Rewrote ${doc.__name} with object streams and cleared ${saved.filter(Boolean).length} metadata field(s). ${after.getPageCount()} of ${before} page(s) kept — nothing was dropped.\nScanned pages do not shrink much this way; for a scan, the PDF studio's image-recompression mode is the real lever.`,
    detail: `${Math.round(bytes.length / 1024)} KB, ${after.getPageCount()} pages kept`
  };
}

async function opCrop(PDFLib, docs, params) {
  const doc = docs[0];
  const nums = String(params.crop || '36,36,36,36').split(/[,\sx]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0);
  if (nums.length < 4) throw new Error('Give four margins in points, for example “36,36,36,36”.');
  const [l, t, r, b] = nums;
  doc.getPages().forEach(page => {
    const { width, height } = page.getSize();
    const nw = Math.max(18, width - l - r);
    const nh = Math.max(18, height - t - b);
    page.setCropBox(l, b, nw, nh);
  });
  return { files: [{ name: `megaplan-cropped-${stamp()}.pdf`, bytes: await doc.save() }], text: `Cropped ${doc.getPageCount()} page(s) by ${nums.join(', ')} pt. Content is kept — only the visible area is trimmed.`, detail: `cropped ${doc.getPageCount()} pages` };
}

async function opNup(PDFLib, docs, params, perSheet = 4) {
  const doc = docs[0];
  const count = doc.getPageCount();
  const first = doc.getPage(0).getSize();
  const cols = perSheet >= 6 ? 3 : 2;
  const rows = Math.ceil(perSheet / cols);
  const out = await PDFLib.PDFDocument.create();
  const scale = Math.min((first.width * 0.95) / cols, (first.height * 0.95) / rows);
  const cellW = (first.width * 0.95) / cols;
  const cellH = (first.height * 0.95) / rows;
  const sheetW = cellW * cols;
  const sheetH = cellH * rows;
  const embedded = [];
  for (let i = 0; i < count; i++) embedded.push(await doc.embedPage(doc.getPage(i)));
  let sheets = 0;
  for (let start = 0; start < count; start += perSheet) {
    const sheet = out.addPage([sheetW, sheetH]);
    for (let k = 0; k < perSheet && start + k < count; k++) {
      const src = embedded[start + k];
      // An embedded page exposes `width`/`height`; the copied page wrapper exposes getters.
      const sw = src.width ?? src.getWidth?.();
      const sh = src.height ?? src.getHeight?.();
      const s = Math.min(scale, sw / cols, sh / rows);
      const col = k % cols;
      const row = Math.floor(k / cols);
      const w = sw * s;
      const h = sh * s;
      sheet.drawPage(src, { x: col * cellW + (cellW - w) / 2, y: sheetH - (row + 1) * cellH + (cellH - h) / 2, width: w, height: h });
    }
    sheets++;
  }
  return { files: [{ name: `megaplan-${perSheet}-up-${stamp()}.pdf`, bytes: await out.save() }], text: `Arranged ${count} page(s) ${perSheet}-up on ${sheets} sheet(s) of ${Math.round(sheetW)}×${Math.round(sheetH)} pt.`, detail: `${count} pages → ${sheets} sheets, ${perSheet}-up` };
}

async function opOverlay(PDFLib, docs, params) {
  const [base, over] = docs;
  const matchPages = String(params.mode || 'match') === 'each' ? base.getPageIndices() : over.getPageIndices().slice(0, base.getPageCount());
  const out = await PDFLib.PDFDocument.create();
  const basePages = await out.copyPages(base, base.getPageIndices());
  basePages.forEach((p, i) => {
    const j = i < matchPages.length ? matchPages[i] : matchPages[matchPages.length - 1];
    if (j != null) {
      try {
        const stamped = base.copyPages(over, [j]);
        out.addPage(p);
        p.pushOperators(stamped[0].node.content);
      } catch { out.addPage(p); }
    } else out.addPage(p);
  });
  return { files: [{ name: `megaplan-overlaid-${stamp()}.pdf`, bytes: await out.save() }], text: `Overlaid ${over.__name} onto ${base.__name} (${out.getPageCount()} page(s)).`, detail: `overlaid ${over.__name} onto ${base.__name}` };
}

/**
 * Reads the text layer of every attached PDF.
 *
 * A scanned page has no text layer at all, which is why `ocr` exists: when a
 * document turns out to be a scan, the pages are rendered and read in the
 * browser, so a scanned contract can still be searched and cited. Nothing is
 * uploaded, and OCR is only attempted when it is needed.
 */
async function opText(PDFLib, docs, params, deps) {
  const chunks = [];
  const pages = [];
  let total = 0;
  const blank = [];
  const src = await deps.loadPdfJs();
  for (const doc of docs) {
    const pdf = await src.getDocument({ data: doc.__bytes }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items.map(it => it.str || '').join(' ').replace(/\s+/g, ' ').trim();
      total += line.length;
      if (line) {
        pages.push({ n: i, of: pdf.numPages, name: doc.__name, body: line });
        chunks.push(`\n\n--- ${doc.__name} page ${i} of ${pdf.numPages} ---\n${line}`);
      } else blank.push({ doc, n: i, of: pdf.numPages, page });
      if (i >= Number(params.maxPages || 2000)) break;
    }
    doc.__pdf = pdf;
  }
  let ocrPages = [];
  if (blank.length && (params.ocr || deps.recognize)) {
    ocrPages = await readScannedPages(blank, deps, params).catch(e => {
      deps.onOcrError?.(e);
      return [];
    });
    for (const p of ocrPages) {
      if (!p.body) continue;
      pages.push(p);
      chunks.push(`\n\n--- ${p.name} page ${p.n} of ${p.of} (read by OCR) ---\n${p.body}`);
    }
    pages.sort((a, b) => (a.name === b.name ? a.n - b.n : a.name.localeCompare(b.name)));
  }
  const text = chunks.join('').trim();
  if (!text) {
    return {
      files: [], text: '', pages, scannedOnly: true,
      detail: blank.length
        ? `no text layer on ${blank.length} page(s) — this looks like a scan, and OCR was not run`
        : 'no text layer found'
    };
  }
  const notes = [];
  if (ocrPages.length) notes.push(`${ocrPages.length} scanned page(s) were read in your browser.`);
  if (blank.length > ocrPages.length) notes.push(`${blank.length - ocrPages.length} page(s) still have no readable text.`);
  return {
    files: [], text, pages,
    ocrPages: ocrPages.length,
    detail: `${total.toLocaleString('en-IN')} characters of text${notes.length ? ' · ' + notes.join(' · ') : ''}`
  };
}

/** pdf.js renders a page onto a canvas. Injectable so the path can be tested. */
async function defaultRenderPage(page, scale, deps) {
  const viewport = page.getViewport({ scale });
  const w = Math.ceil(viewport.width), h = Math.ceil(viewport.height);
  const canvas = deps.createCanvas
    ? deps.createCanvas(w, h)
    : Object.assign(deps.document.createElement('canvas'), { width: w, height: h });
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}

/** Renders scanned pages to bitmaps and reads them with the in-page OCR. */
async function readScannedPages(blank, deps, params) {
  const out = [];
  const limit = Number(params.ocrMaxPages || 20);
  const work = blank.slice(0, limit);
  const render = deps.renderPage || defaultRenderPage;
  for (const b of work) {
    deps.onOcrPage?.(out.length, work.length, b.n);
    const scale = Number(params.ocrScale || 1.6);
    const bitmap = await render(b.page, scale, deps);
    const text = await deps.recognize(bitmap);
    out.push({
      n: b.n, of: b.of, name: b.doc.__name,
      body: String(text || '').replace(/\s+/g, ' ').trim(),
      ocr: true
    });
    b.page.cleanup?.();
  }
  return out;
}

async function opForms(PDFLib, docs) {
  const doc = docs[0];
  const form = doc.getForm();
  const fields = form.getFields();
  if (!fields.length) return { files: [], text: `${doc.__name} has no fillable form fields — it is a flat document.`, detail: 'no form fields' };
  const lines = fields.map((f, i) => {
    let v = '';
    try { v = f instanceof PDFLib.PDFField ? '' : ''; } catch { v = ''; }
    try { if (typeof f.getText === 'function') v = f.getText(); } catch { /* checkbox or dropdown */ }
    try { if (typeof f.getChecked === 'function') v = f.getChecked() ? '[checked]' : '[unchecked]'; } catch { /* not a checkbox */ }
    try { if (typeof f.getSelected === 'function') v = JSON.stringify(f.getSelected()); } catch { /* not a dropdown */ }
    return `${i + 1}. ${f.getName()} — ${f.getType()}${v ? `: ${String(v).slice(0, 60)}` : ''}`;
  });
  return { files: [], text: `${fields.length} fillable field(s) in ${doc.__name}:\n${lines.join('\n')}\n\nThe PDF studio can fill them for you — open the tool from this answer.`, detail: `${fields.length} form fields` };
}

async function opImages(PDFLib, files) {
  const images = files.filter(f => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name || ''));
  if (!images.length) throw new Error('Attach at least one image to build a PDF.');
  const out = await PDFLib.PDFDocument.create();
  const embedded = [];
  for (const f of images) {
    const bytes = await readBytes(f);
    const type = String(f.type || '').toLowerCase();
    let img;
    if (type === 'image/png') img = await out.embedPng(bytes);
    else if (type === 'image/webp') { /* pdf-lib has no webp encoder */ continue; }
    else img = await out.embedJpg(bytes);
    embedded.push(img);
  }
  if (!embedded.length) throw new Error('None of those images could be embedded (WEBP and HEIC need conversion to PNG or JPEG first).');
  embedded.forEach(img => {
    const page = out.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  });
  return { files: [{ name: `megaplan-from-images-${stamp()}.pdf`, bytes: await out.save() }], text: `Placed ${embedded.length} image(s) on ${embedded.length} page(s) at full size.`, detail: `${embedded.length} images → PDF` };
}

/**
 * The 1000-page ask: a question in, quoted answers with page numbers out.
 *
 * No model is involved. The pages are ranked with BM25 over the text layer, the
 * answer is the sentences from the top pages that carry the query terms, and
 * every sentence names the page it was taken from. A question the document does
 * not answer produces a "not in this document" reply, never a guess.
 */
async function opResearch(PDFLib, docs, params, deps) {
  const doc = docs[0];
  const count = doc.getPageCount();
  const question = String(params.prompt || '').trim();
  if (!question) {
    return { files: [], text: `“${doc.__name}” has ${count} page(s). Ask a question and AI Mode will find the pages that answer it and quote them with page numbers.`, detail: 'no question asked' };
  }
  const extracted = await opText(PDFLib, docs, { maxPages: count, ocr: params.ocr !== false }, deps).catch(() => null);
  const pages = extracted?.pages || [];
  if (!pages.length) {
    return {
      files: [], text: '', needsOcr: true,
      text_note: 'no readable text',
      detail: extracted?.scannedOnly ? 'this looks like a scan and OCR could not read it' : 'no text layer'
    };
  }

  // The table of contents is the document's own opinion about its structure.
  let ranges = [];
  const outline = await readOutline(deps, doc);
  if (outline.length) ranges = sectionRanges(outline, count);
  const labelled = ranges.length ? labelPages(pages, ranges) : pages;

  const index = buildIndex(labelled);
  const boost = sectionBoostFactory(ranges, question);
  const ranked = rank(index, question, { limit: Number(params.limit || 12), boost });
  if (!ranked.length) {
    const tried = queryTerms(question).map(t => `“${t.term}”`).slice(0, 5).join(', ');
    return {
      files: [], text: `“${doc.__name}” has ${count} page(s) and ${pages.length} with readable text, but none of them mention ${tried || 'anything in the question'}.\n\nNothing was guessed: if it is not in the document, it is not in the answer. Try fewer or broader words, or upload the pages you mean.`,
      detail: 'no match', notFound: true
    };
  }

  const answer = answerFrom(question, ranked, { name: doc.__name });
  const cite = citations(ranked);
  const sections = [...new Set(ranked.map(r => r.section).filter(Boolean))].slice(0, 4);
  const summary = [
    answer,
    '',
    `Searched ${pages.length} readable page(s) of ${count} across ${index.vocab} distinct words.`,
    sections.length ? `The hits fall in: ${sections.join('; ')}.` : '',
    cite.text + '.',
    `Everything above was read in your browser — nothing was uploaded and nothing was written by a model.`
  ].filter(Boolean).join('\n');

  const wantPdf = params.pages !== false;
  const files = [];
  if (wantPdf) {
    // copyPages takes 0-based indices; the reader's page numbers are 1-based.
    const wanted = [...new Set(ranked.map(r => r.n))].sort((a, b) => a - b).map(n => n - 1);
    files.push({ name: `megaplan-answers-${baseName(doc.__name)}-${stamp()}.pdf`, bytes: await extractInto(PDFLib, doc, wanted) });
  }
  return { files, text: summary, detail: `${ranked.length} page(s) cited`, ranked: ranked.map(r => r.n), outline: outline.slice(0, 30) };
}

/** The PDF's own bookmarks, with destinations resolved to page numbers. */
async function readOutline(deps, doc) {
  const pdf = doc.__pdf;
  if (!pdf?.getOutline) return [];
  try {
    const outline = await pdf.getOutline();
    if (!outline?.length) return [];
    const dests = await pdf.getDestinations();
    const resolve = item => {
      const dest = item.dest;
      let ref = dest;
      if (typeof dest === 'string') ref = dests[dest];
      if (!ref) return null;
      const index = Array.isArray(ref) ? ref[0] : ref;
      const num = typeof index === 'number' ? index : null;
      return num == null ? null : num + 1;      // pdf.js gives 0-based page indexes
    };
    return outlineSections(outline, doc.getPageCount(), { resolve });
  } catch {
    return [];                                     // a broken outline is not a reason to fail
  }
}

async function opSections(PDFLib, docs, params, deps) {
  const doc = docs[0];
  const count = doc.getPageCount();
  const extracted = await opText(PDFLib, docs, { maxPages: count }, deps).catch(() => null);
  const text = extracted?.text || '';
  if (!text) {
    return {
      files: [], text: '',
      needsOcr: true,
      detail: 'no text layer — section search needs OCR first'
    };
  }
  // Score each page against the user's own words. This is the "which pages
  // matter" half of a 1000-page ask: no model required, no upload, and nothing
  // leaves the browser. Page numbers come from the extractor itself, so a page
  // can never be attributed to the wrong place in the document.
  const pages = extracted.pages || [];
  const terms = String(params.prompt || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 3 && !STOP.has(w));
  if (!terms.length) {
    return { files: [], text: `“${doc.__name}” has ${count} page(s) and a text layer. Add a few keywords (a topic, a drug name, a chapter title) and AI Mode will rank the pages for you.`, detail: `${count} pages, no keywords given` };
  }
  const scored = pages.map(p => {
    const body = p.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const hits = body.split(t).length - 1;
      if (hits) score += Math.min(hits, 8) * (t.length > 6 ? 1.4 : 1);
    }
    return { ...p, score };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const best = scored.slice(0, 12);
  if (!best.length) {
    return { files: [], text: `None of the ${pages.length} readable page(s) in “${doc.__name}” mention ${terms.slice(0, 5).map(t => `“${t}”`).join(', ')}. Upload only the relevant pages, or run OCR on this file first.`, detail: 'no keyword hits' };
  }
  const ranks = best.map((p, i) => `${i + 1}. page ${p.n} (score ${p.score}) — ${p.body.replace(/\s+/g, ' ').slice(0, 120)}…`);
  // The extractor reports 1-based page numbers (that is what a reader sees);
  // copyPages takes 0-based indices. Getting this wrong returns the page next
  // to the one that matched, so the conversion is deliberate and commented.
  const wanted = best.map(p => p.n - 1);
  return {
    files: [{ name: `megaplan-relevant-${baseName(doc.__name)}-${stamp()}.pdf`, bytes: await extractInto(PDFLib, doc, wanted) }],
    text: `Searched ${pages.length} readable page(s) of “${doc.__name}” (${count} total) for ${terms.slice(0, 5).map(t => `“${t}”`).join(', ')}.\n\n${ranks.join('\n')}\n\nThe matching pages are saved as one PDF. Everything above was read in your browser — nothing was uploaded.`,
    detail: `${best.length} relevant page(s) of ${count}`
  };
}

const STOP = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'what', 'when', 'where', 'which', 'your', 'their', 'about', 'into', 'make', 'made', 'please', 'would', 'could', 'should', 'them', 'then', 'than', 'also', 'more', 'most', 'some', 'such', 'only', 'other', 'over', 'using', 'used', 'file', 'files', 'pdf', 'page', 'pages', 'document']);

async function extractInto(PDFLib, doc, list) {
  const out = await PDFLib.PDFDocument.create();
  const copied = await out.copyPages(doc, list);
  copied.forEach(p => out.addPage(p));
  return out.save();
}

function resolveList(params, pageCount) {
  if (Array.isArray(params.pages) && params.pages.length) return params.pages.filter(n => n >= 0 && n < pageCount);
  const fromPrompt = pageListFromPrompt(params.prompt, pageCount);
  if (fromPrompt) return fromPrompt;
  const list = parsePageList(params.range, pageCount);
  return list;
}

function formatList(list) {
  const nums = list.map(n => n + 1);
  if (nums.length <= 8) return nums.join(', ');
  return `${nums.slice(0, 6).join(', ')} … ${nums[nums.length - 1]}`;
}

const OPS = {
  count: opCount, metadata: opMetadata, merge: opMerge, extract: opExtract, delete: opDelete, split: opSplit,
  reorder: opReorder, rotate: opRotate, numbers: opNumbers, watermark: opWatermark, compress: opCompress,
  crop: opCrop, nup: (P, d, p) => opNup(P, d, p, 4), nup2: (P, d, p) => opNup(P, d, p, 2),
  overlay: opOverlay, text: opText, forms: opForms, images: opImages, sections: opSections, research: opResearch
};

export const PDF_OP_TITLES = {
  count: 'Count the pages', metadata: 'Read PDF metadata', merge: 'Merge PDFs', extract: 'Extract pages',
  delete: 'Delete pages', reorder: 'Reorder pages', rotate: 'Rotate pages', numbers: 'Add page numbers',
  watermark: 'Add a watermark', compress: 'Compress the PDF', crop: 'Crop PDF margins',
  nup: 'Arrange pages 4-up', nup2: 'Arrange pages 2-up', overlay: 'Overlay one PDF onto another',
  text: 'Extract the text', forms: 'List the form fields', images: 'Build a PDF from images',
  sections: 'Find the relevant pages'
};

/**
 * Run one PDF operation.
 * @param {{op:string, files:File[], params?:object}} job
 * @param {{loadPdfLib?:Function, loadPdfJs?:Function}} [deps]  library loaders (injectable so
 *        the operation can be tested offline against real PDF bytes)
 * @returns {Promise<{files:{name:string,bytes:Uint8Array}[], text:string, detail:string, needsOcr?:boolean}>}
 */
export async function runPdfOp(job, deps = {}) {
  const loaders = { loadPdfLib, loadPdfJs, ...deps };
  const op = OPS[job?.op];
  if (!op) throw new Error(`AI Mode cannot run “${job?.op}” on its own — the PDF studio does that one.`);
  const params = { prompt: '', ...(job.params || {}) };
  const all = job.files || [];
  if (op !== opImages && !all.length) throw new Error('Attach a PDF first.');
  const PDFLib = await loaders.loadPdfLib();
  if (op === opImages) return opImages(PDFLib, all, params);
  const pdfFiles = all.filter(isPdf);
  const docs = [];
  for (const f of pdfFiles) {
    const bytes = await readBytes(f);
    const doc = await loadDoc(PDFLib, bytes);
    doc.__name = f.name;
    doc.__bytes = bytes;
    docs.push(doc);
  }
  if (!docs.length) throw new Error('None of the attached files is a PDF.');
  return op(PDFLib, docs, params, loaders);
}
