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

/* ------------------------------------------------------------------ *
 * WinAnsi folding
 *
 * The base-14 PDF fonts only cover WinAnsi. pdf-lib throws outright on
 * anything else, which meant a Malayalam note, a Tamil sentence or an emoji
 * in a source title made the whole PDF request fail with a 500. Instead of
 * failing — or worse, silently transliterating text we cannot verify — we
 * fold: typographic characters become their ASCII twin, invisible or
 * bidirectional control characters are dropped, and any remaining run the
 * font cannot draw becomes `[?]`. The count is reported so the caller can
 * say so out loud instead of pretending the document is intact.
 * ------------------------------------------------------------------ */

const TYPOGRAPHIC = new Map(Object.entries({
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2013': '-', '\u2014': '-', '\u2015': '-', '\u2212': '-',
  '\u2026': '...', '\u00A0': ' ', '\u2007': ' ', '\u202F': ' ', '\u2009': ' ', '\u200A': ' ',
  '\u2022': '-', '\u00B7': '-', '\u2043': '-',
  '\u00AB': '<<', '\u00BB': '>>', '\u2039': '<', '\u203A': '>',
  '\u2010': '-', '\u2011': '-', '\u00AD': '',
  '\u00A9': '(c)', '\u00AE': '(r)', '\u2122': '(tm)',
  '\u00B0': ' deg', '\u2032': "'", '\u2033': '"',
  '\u00D7': 'x', '\u00F7': '/', '\u00B1': '+/-',
  '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2248': '~',
  '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u21D0': '<=',
  '\u0060': "'", '\u00A8': '"', '\u2019\u2018': "'"
}));

// C0/C1 controls, zero-width, bidi overrides and the BOM. Invisible, and a
// well-known way to make displayed text say something other than what it is.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;

// Credential-shaped strings never make it into a file a person will forward.
// Narrow on purpose: a known vendor prefix, or NAME=value where the name ends
// in a secret-ish word. See redactSecrets() in public/js/ai-compose.js.
const SECRET_PATTERNS = [
  /\b(?:sk|nvapi|rk|pk)-(?:live|test|prod|secret|admin)?[-_][A-Za-z0-9_-]{16,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Z][A-Z0-9_]{2,}(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*["']?[^\s"']{8,}/g
];

/** Replace credential-shaped substrings with a visible marker. */
export function redactSecrets(value) {
  let text = String(value ?? '');
  if (!text) return text;
  for (const re of SECRET_PATTERNS) {
    text = text.replace(re, m => {
      const named = m.match(/^([A-Z][A-Z0-9_]{2,}(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*)/);
      return named ? `${named[1]}[redacted]` : '[redacted]';
    });
  }
  return text;
}

/** True when WinAnsi can draw this code point. */
function winAnsiSafe(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x0a || c === 0x0d || c === 0x09) return true;
  if (c < 0x20 || c > 0xff) return false;
  if (c >= 0x80 && c <= 0x9f) return false;                       // C1 controls
  if ([0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(c)) return false;   // undefined in WinAnsi
  if (c === 0xa0 || c === 0xad) return false;
  return true;
}

/**
 * Fold text into what the base-14 fonts can actually draw.
 * Returns the safe text and how many runs had to be replaced.
 */
export function pdfSafe(value) {
  let text = redactSecrets(String(value ?? '')).replace(INVISIBLE, '');
  for (const [from, to] of TYPOGRAPHIC) {
    if (text.includes(from)) text = text.split(from).join(to);
  }
  let folded = 0;
  const out = [];
  let hole = false;
  for (const ch of text) {
    if (winAnsiSafe(ch)) { out.push(ch); hole = false; continue; }
    // One marker for a whole run, so a word in an unknown script reads as one
    // gap rather than a row of question marks.
    if (!hole) { out.push('[?]'); folded++; hole = true; }
  }
  return { text: out.join(''), folded };
}

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

  const fold = { count: 0 };
  const foldText = value => {
    const out = pdfSafe(value);
    fold.count += out.folded;
    return out.text;
  };
  const title = normalise(foldText(doc.title)) || 'MegaPLAN document';
  const subtitle = normalise(foldText(doc.subtitle));
  const author = normalise(foldText(doc.author)) || 'MegaPLAN AI Mode';
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
    for (const row of doc.meta.slice(0, 8)) writeLine(foldText(`- ${String(row).slice(0, 110)}`), { font: regular, size: 9.5, color: MUTED, gap: 2 });
  }
  writeLine('Check every cited source before reuse. This file is generated from the material you supplied or the open sources listed at the end.', { font: regular, size: 8.5, color: MUTED, gap: 2 });

  /* ---- body ---- */
  state.page = null;
  state.y = 0;
  ensure(999);

  const sections = Array.isArray(doc.sections) && doc.sections.length
    ? doc.sections.map(s => ({ heading: normalise(foldText(s.heading)), body: normalise(foldText(s.body)), bullets: Array.isArray(s.bullets) ? s.bullets.map(b => normalise(foldText(b))).filter(Boolean) : [] }))
    : [{ heading: '', body: normalise(foldText(doc.body)), bullets: [] }];
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
      const label = foldText([String(i + 1).padStart(2, '0'), String(s.title || s.url).slice(0, 120)].join('. '));
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

  // Say so on the page itself, and hand the count back to the caller.
  if (fold.count) {
    ensure(48);
    const note = `${fold.count} character run(s) outside the standard PDF fonts are shown as [?] here. The answer on screen and the prompt pack keep the original script.`;
    wrapText(note, regular, 9, contentWidth).forEach(line => writeLine(line, { font: regular, size: 9, color: MUTED, gap: 2 }));
  }

  /* ---- page furniture ---- */
  const footer = normalise(foldText(doc.footer)) || 'Generated with MegaPLAN AI Mode';
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
  pdf.setKeywords(['MegaPLAN', 'AI Mode', ...(Array.isArray(doc.keywords) ? doc.keywords.slice(0, 12).map(k => foldText(String(k))) : [])]);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);


  const bytes = await pdf.save({ useObjectStreams: false });
  bytes.folded = fold.count;
  return bytes;
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
