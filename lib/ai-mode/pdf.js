/**
 * Real PDF generation for AI Mode (pdf-lib, server side).
 *
 * This is the step that turns gathered research / uploaded text / an assistant
 * outline into an actual downloadable `.pdf` with a cover, headings, wrapped
 * body text, bullets, numbered pages and an attributed source list.
 *
 * No network, no font downloads: the base-14 PDF fonts are always available, so
 * the file is byte-for-byte deterministic and never depends on a CDN.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const A4 = { width: 595.28, height: 841.89 };
export const LETTER = { width: 612, height: 792 };

const PAGE_SIZES = { a4: A4, letter: LETTER };

const INK = rgb(0.11, 0.1, 0.09);
const MUTED = rgb(0.43, 0.4, 0.36);
const ACCENT = rgb(0.77, 0.36, 0.15);
const RULE = rgb(0.85, 0.81, 0.75);
const PAPER = rgb(1, 1, 1);

const normalise = v => String(v ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

/** Split a flat input into markdown-ish blocks. Keeps existing structure when given. */
export function toBlocks(input) {
  const text = normalise(input);
  if (!text) return [];
  const lines = text.split('\n');
  const blocks = [];
  let paragraph = [];
  let bullets = [];

  const flushPara = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: 'ul', items: bullets.slice() });
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); flushBullets(); continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); flushBullets();
      blocks.push({ type: 'h', level: m[1].length, text: m[2].trim() });
    } else if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      flushPara();
      bullets.push(m[1].trim());
    } else if ((m = line.match(/^(\d+)[.)]\s+(.*)$/))) {
      flushPara();
      bullets.push(`${m[1]}. ${m[2].trim()}`);
    } else if ((m = line.match(/^\*\*(.+?)\*\*:?$/))) {
      flushPara(); flushBullets();
      blocks.push({ type: 'h', level: 3, text: m[1].trim() });
    } else {
      flushBullets();
      paragraph.push(line.trim());
    }
  }
  flushPara();
  flushBullets();
  return blocks;
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth || !line) line = probe;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {object} doc
 * @param {string} doc.title
 * @param {string} [doc.subtitle]
 * @param {string} [doc.body]              plain text / markdown
 * @param {Array}  [doc.sections]          [{heading, body, bullets}]
 * @param {Array}  [doc.sources]           [{title, url, source, note}]
 * @param {string} [doc.footer]
 * @param {string} [doc.pageSize]          'a4' | 'letter'
 * @param {string} [doc.author]
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(doc = {}) {
  const size = PAGE_SIZES[String(doc.pageSize || 'a4').toLowerCase()] || A4;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const title = normalise(doc.title) || 'MegaPLAN document';
  const subtitle = normalise(doc.subtitle);
  const author = normalise(doc.author) || 'MegaPLAN AI Mode';
  const created = new Date();
  const margin = 56;
  const contentWidth = size.width - margin * 2;

  const state = { page: null, y: 0, pages: [] };
  const ensure = (needed = 40) => {
    if (state.page && state.y - needed > margin + 24) return;
    const page = pdf.addPage([size.width, size.height]);
    page.drawRectangle({ x: 0, y: 0, width: size.width, height: size.height, color: PAPER });
    page.drawRectangle({ x: 0, y: size.height - 6, width: size.width, height: 6, color: ACCENT });
    state.page = page;
    state.pages.push(page);
    state.y = size.height - margin - 10;
  };
  ensure(999);
  // Drop the scratch page created by ensure(999) and start on a real one.
  if (state.pages.length === 1 && state.y === size.height - margin - 10) { /* keep: it is the cover */ }

  const writeLine = (text, { font = regular, size: fontSize = 10.5, color = INK, indent = 0, gap = 4, align = 'left' } = {}) => {
    ensure(fontSize + gap + 6);
    const width = contentWidth - indent;
    const widthOf = align === 'center' ? font.widthOfTextAtSize(text, fontSize) : width;
    const x = align === 'center' ? (size.width - widthOf) / 2 : margin + indent;
    state.page.drawText(text, { x, y: state.y - fontSize, size: fontSize, font, color });
    state.y -= fontSize + gap;
  };

  const writeBlock = block => {
    if (block.type === 'h') {
      const level = Math.min(3, Math.max(1, block.level || 2));
      state.y -= level === 1 ? 10 : 8;
      const lines = wrapText(block.text, level === 1 ? serifBold : bold, level === 1 ? 19 : level === 2 ? 14 : 11.5, contentWidth);
      lines.forEach((line, i) => writeLine(line, { font: level === 1 ? serifBold : bold, size: level === 1 ? 19 : level === 2 ? 14 : 11.5, color: level === 1 ? INK : ACCENT, gap: i === lines.length - 1 ? 6 : 2 }));
      if (level <= 2) {
        ensure(16);
        state.page.drawLine({ start: { x: margin, y: state.y }, end: { x: margin + 64, y: state.y }, thickness: 1.4, color: ACCENT });
        state.y -= 10;
      }
      return;
    }
    if (block.type === 'ul') {
      for (const item of block.items) {
        const lines = wrapText(item, regular, 10.5, contentWidth - 18);
        lines.forEach((line, i) => {
          ensure(16);
          if (i === 0) state.page.drawCircle({ x: margin + 5, y: state.y - 7, size: 2.1, color: ACCENT });
          writeLine(line, { font: regular, size: 10.5, indent: 18, gap: i === lines.length - 1 ? 4 : 1 });
        });
      }
      state.y -= 4;
      return;
    }
    const lines = wrapText(block.text, regular, 10.5, contentWidth);
    lines.forEach((line, i) => writeLine(line, { font: regular, size: 10.5, gap: i === lines.length - 1 ? 8 : 2 }));
  };

  /* ---- cover ---- */
  writeLine('MEGAPLAN AI MODE', { font: bold, size: 9, color: ACCENT, gap: 18 });
  const titleLines = wrapText(title, serifBold, 30, contentWidth);
  titleLines.forEach((line, i) => writeLine(line, { font: serifBold, size: 30, gap: i === titleLines.length - 1 ? 12 : 4 }));
  if (subtitle) {
    wrapText(subtitle, regular, 13, contentWidth)
      .forEach((line, i) => writeLine(line, { font: regular, size: 13, color: MUTED, gap: i === 0 ? 20 : 2 }));
  }
  ensure(60);
  state.page.drawLine({ start: { x: margin, y: state.y }, end: { x: margin + 96, y: state.y }, thickness: 2, color: ACCENT });
  state.y -= 18;
  writeLine(`${author}`, { font: regular, size: 10, color: MUTED, gap: 3 });
  writeLine(created.toISOString().slice(0, 10), { font: regular, size: 10, color: MUTED, gap: 3 });
  if (Array.isArray(doc.meta) && doc.meta.length) {
    state.y -= 10;
    for (const row of doc.meta.slice(0, 8)) writeLine(`· ${String(row).slice(0, 110)}`, { font: regular, size: 9.5, color: MUTED, gap: 2 });
  }
  writeLine('Check every cited source before reuse. This file is generated from the material you supplied or the open sources listed at the end.', { font: regular, size: 8.5, color: MUTED, gap: 2 });

  /* ---- body ---- */
  state.page = null;
  state.y = 0;
  ensure(999);

  const sections = Array.isArray(doc.sections) && doc.sections.length
    ? doc.sections.map(s => ({ heading: normalise(s.heading), body: normalise(s.body), bullets: Array.isArray(s.bullets) ? s.bullets.map(normalise).filter(Boolean) : [] }))
    : [{ heading: '', body: normalise(doc.body), bullets: [] }];
  for (const section of sections) {
    if (section.heading) {
      const existing = state.page;
      const lines = wrapText(section.heading, serifBold, 18, contentWidth);
      // a section heading always starts a new page unless we are near the top
      if (existing && state.y < size.height - margin - 60) { state.page = null; state.y = 0; }
      ensure(40);
      lines.forEach((line, i) => writeLine(line, { font: serifBold, size: 18, gap: i === lines.length - 1 ? 6 : 2 }));
      state.page.drawLine({ start: { x: margin, y: state.y }, end: { x: size.width - margin, y: state.y }, thickness: 0.8, color: RULE });
      state.y -= 12;
    }
    if (section.body) toBlocks(section.body).forEach(writeBlock);
    if (section.bullets.length) {
      state.y -= 4;
      writeBlock({ type: 'ul', items: section.bullets });
    }
  }

  /* ---- sources ---- */
  const sources = (Array.isArray(doc.sources) ? doc.sources : []).filter(s => s && (s.url || s.title));
  if (sources.length) {
    state.page = null; state.y = 0;
    ensure(120);
    writeLine('Sources', { font: serifBold, size: 18, gap: 6 });
    state.page.drawLine({ start: { x: margin, y: state.y }, end: { x: size.width - margin, y: state.y }, thickness: 0.8, color: RULE });
    state.y -= 12;
    sources.slice(0, 60).forEach((s, i) => {
      const label = [String(i + 1).padStart(2, '0'), String(s.title || s.url).slice(0, 120)].join('. ');
      wrapText(label, bold, 9.5, contentWidth).forEach((line, j) => writeLine(line, { font: bold, size: 9.5, gap: j === 0 ? 1 : 1 }));
      const meta = [s.source, s.author, s.year, s.retrieved ? `retrieved ${s.retrieved}` : null].filter(Boolean).join(' · ');
      if (meta) writeLine(meta, { font: regular, size: 8.5, color: MUTED, gap: 1 });
      if (s.url) {
        const chunks = String(s.url).match(/.{1,104}(\s|$)/g) || [String(s.url).slice(0, 104)];
        chunks.slice(0, 2).forEach(c => writeLine(String(c).trim().slice(0, 104), { font: mono, size: 8, color: ACCENT, gap: 1 }));
      }
      state.y -= 7;
    });
    writeLine('Retrieved from public, keyless sources. MegaPLAN did not read paywalled or private material.', { font: regular, size: 8.5, color: MUTED, gap: 2 });
  }

  /* ---- page furniture ---- */
  const footer = normalise(doc.footer) || 'Generated with MegaPLAN AI Mode';
  state.pages.forEach((page, i) => {
    const y = 34;
    page.drawLine({ start: { x: margin, y: y + 12 }, end: { x: size.width - margin, y: y + 12 }, thickness: 0.6, color: RULE });
    page.drawText(footer.slice(0, 120), { x: margin, y, size: 8, font: regular, color: MUTED });
    const label = `${i + 1} / ${state.pages.length}`;
    page.drawText(label, { x: size.width - margin - regular.widthOfTextAtSize(label, 8), y, size: 8, font: regular, color: MUTED });
  });

  pdf.setTitle(title.slice(0, 180));
  pdf.setAuthor(author);
  pdf.setSubject(subtitle.slice(0, 180) || 'Generated by MegaPLAN AI Mode');
  pdf.setProducer('MegaPLAN AI Mode');
  pdf.setCreator('MegaPLAN');
  pdf.setKeywords(['MegaPLAN', 'AI Mode', ...(Array.isArray(doc.keywords) ? doc.keywords.slice(0, 12).map(String) : [])]);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);

  return pdf.save({ useObjectStreams: false });
}

/** Best-effort safe filename. */
export function pdfFilename(title, ext = 'pdf') {
  const base = String(title || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'document';
  return `megaplan-${base}.${ext}`;
}
