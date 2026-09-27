/**
 * MegaPLAN OCR engine.
 *
 * Nine registry tools were wired to the shared writing assistant, which means
 * they could not accept an image at all — the one thing an OCR tool must do.
 * This module gives them a real in-browser OCR pass (tesseract.js, the same
 * library the PDF studio and Agentic PDF Splitter already use) plus a
 * deterministic, testable parser for the structured outputs.
 *
 * Rules this file follows:
 *   - nothing leaves the device; the image is read in the browser;
 *   - a field is only reported when the text actually supports it — a missing
 *     value is `null`, never a guess;
 *   - the parsers are pure functions over text, so they are unit-testable
 *     without a browser, an OCR model or a network.
 *
 * Customer copy never names the library or a model.
 */

let tesseractPromise = null;

/** Load the recogniser once and reuse it; the download is a few megabytes. */
export function loadRecognizer() {
  if (!tesseractPromise) {
    tesseractPromise = import('https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm')
      .then(m => m.default)
      .catch(err => { tesseractPromise = null; throw new Error('The offline text reader could not be loaded. Check your connection and try again.'); });
  }
  return tesseractPromise;
}

/** Only for tests: drop the cached recogniser. */
export function resetRecognizer() { tesseractPromise = null; }

const money = n => (Number.isFinite(n) ? n.toFixed(2) : null);
const num = s => {
  if (s == null) return null;
  const m = String(s).replace(/[,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const clean = s => String(s || '').replace(/[ \t]{2,}/g, ' ').trim();
const first = (text, re, flags = 'im') => { const m = String(text).match(re); return m ? clean(m[1] ?? m[0]) : null; };

/* ------------------------------------------------------------------ *
 * Pure parsers — each takes recognised text and returns a structure.
 * Every field is evidence-based: null means "not found in the image".
 * ------------------------------------------------------------------ */

export function parseReceipt(text) {
  const t = String(text || '');
  const lines = t.split(/\r?\n/).map(clean).filter(Boolean);
  // "Subtotal: 540" would otherwise win, because the word "total" appears
  // earlier in the document than "Grand Total: 594".
  const total = num(first(t, /(?:grand\s+total|amount\s+due|total\s+due|(?<!sub)total)\s*[:\-]?\s*([$€£₹]?\s?[\d.,]+)/i));
  const tax = num(first(t, /(?:tax|vat|gst)\s*(?:[(\d][^\n]{0,18})?[:\-]?\s*([$€£₹]?\s?[\d.,]+)/i));
  const subtotal = num(first(t, /sub\s*-?\s*total\s*[:\-]?\s*([$€£₹]?\s?[\d.,]+)/i));
  const date = first(t, /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/);
  const time = first(t, /\b(\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?)\b/i);
  const pay = first(t, /(?:paid\s+by|card|visa|mastercard|amex|upi|cash)\s*[:\-]?\s*([\w\s*]{2,24})/i);
  // Line items look like "2 x Coffee 3.50 7.00", "Bread 2.50" or, when OCR has
  // flattened the columns, "Amoxicillin 500mg 10 12.50 125.00".
  const items = [];
  for (const line of lines) {
    // No word boundaries here: "CGST" and "SGST" must be caught as tax lines too.
    if (/(sub\s*-?\s*total|grand\s*total|total|tax|vat|gst|igst|change|amount\s*(?:due|paid)|net\s*amount|balance|cash|thank|paid)/i.test(line)) continue;
    // A column header ("Description  Qty  Rate  Amount") is not a product.
    if (/^(?:description|item|particulars?|product|sl\.?|s\.?no|qty|quantity|rate|price|unit|amount|total|invoice|order|hsn|taxable)\b/i.test(line)) continue;
    const m = line.match(/^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(.+?)\s*([$€£₹]?\s?[\d.,]+)$/);
    if (!m) continue;
    let qty = m[1] ? Number(m[1]) : null;
    let name = clean(m[2]);
    let amount = num(m[3]);
    if (amount == null) continue;
    // Peel the numeric tail. The outer match already took the line total, so
    // what is left can be "name qty rate" (invoice columns) or just "name qty".
    const two = name.match(/^(.*?)\s+([$€£₹]?\s?[\d.,]+)\s+([$€£₹]?\s?[\d.,]+)$/);
    const one = two ? null : name.match(/^(.*?)\s+([$€£₹]?\s?[\d.,]+)$/);
    if (two) {
      name = clean(two[1]);
      const q = num(two[2]);
      if (q != null) qty = q;
    } else if (one) {
      name = clean(one[1]);
      const q = num(one[2]);
      // Only read it as a quantity when dividing by it gives a sane unit price.
      if (q != null && q > 0 && Number((amount / q).toFixed(2)) > 0) qty = q;
    }
    // A "Label:" anywhere means this row is a field, not a product — "Date:
    // 2026-03-14  Time: 13:42" and "Bill To: City Hospital" both end in a
    // digit, so a trailing-number test alone would list them as purchases.
    if (/[A-Za-z]{2,}\s*:/.test(name) || /[A-Za-z]{2,}\s*:/.test(line)) continue;
    if (name.length < 2 || /^\d+$/.test(name)) continue;
    const q = qty == null ? 1 : qty;
    items.push({ name, qty: q, lineTotal: amount, unitPrice: q > 1 ? Number((amount / q).toFixed(2)) : amount });
  }
  return {
    merchant: first(t, /(?:^|\n)\s*([A-Z][A-Za-z&'.\- ]{3,40}(?:Store|Mart|Cafe|Café|Restaurant|Hotel|Shop|Market|Bakery|Hospital|Pharmacy|Ltd|Inc)?)\s*(?:\n|$)/)
      || lines[0] || null,
    date, time, paymentMethod: pay,
    items: items.slice(0, 40),
    subtotal, tax, total
  };
}

export function parseInvoice(text) {
  const t = String(text || '');
  const r = parseReceipt(t);
  const invoiceNo = first(t, /(?:invoice\s*(?:no\.?|number|#)|inv\s*#)\s*[:\-]?\s*([A-Z0-9\/\-]{3,24})/i);
  const billTo = first(t, /bill\s*to\s*[:\-]?\s*([^\n]{3,40})/i);
  const shipTo = first(t, /ship\s*to\s*[:\-]?\s*([^\n]{3,40})/i);
  // "PO Number: PO-7781", "Purchase order no. 7781", "P.O. 7781" — the label
  // word itself must never be captured as the value.
  const po = first(t, /(?:p\.?o\.?|purchase\s*order)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-]{1,23})/i)
    || first(t, /p\.?o\.?\s*[:\-]\s*([A-Z0-9][A-Z0-9\/\-]{1,23})/i);
  const dueDate = first(t, /(?:due\s*date|payment\s*due)\s*[:\-]?\s*([\d]{1,4}[\/.-][\d]{1,2}[\/.-][\d]{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i);
  const net = num(first(t, /(?:net\s*amount|amount\s*payable|sub\s*-?\s*total)\s*[:\-]?\s*([$€£₹]?\s?[\d.,]+)/i));
  return {
    invoiceNumber: invoiceNo,
    supplier: r.merchant,
    billTo, shipTo, purchaseOrder: po,
    invoiceDate: r.date, dueDate,
    currency: (String(t).match(/[$€£₹]/) || [null])[0],
    lineItems: r.items.map(i => ({ description: i.name, qty: i.qty, unitPrice: i.unitPrice, amount: i.lineTotal })),
    subtotal: r.subtotal, tax: r.tax, netAmount: net ?? r.total, total: r.total
  };
}

/** A markdown table from a recognised grid. Only cells that line up are kept. */
export function parseTable(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    // Tesseract renders grid lines as runs of dashes, pipes or spaces.
    const cells = line
      .replace(/^[|\s]+|[|\s]+$/g, '')
      .split(/\s{2,}|\s*\|\s*|\t+/)
      .map(clean)
      .filter(c => c && !/^[-=_:.]+$/.test(c));
    if (cells.length >= 2) rows.push(cells);
  }
  if (!rows.length) return null;
  const width = Math.max(...rows.map(r => r.length));
  const kept = rows.filter(r => r.length >= Math.max(2, width - 1));
  const header = kept[0];
  const body = kept.slice(1);
  const pad = r => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return {
    header,
    rows: body.map(pad),
    markdown: [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map(r => `| ${pad(r).join(' | ')} |`)
    ].join('\n')
  };
}

const FIELD_ALIASES = {
  name: ['name', 'full name', 'applicant name', 'candidate name', 'student name', 'employee name'],
  date: ['date', 'date of birth', 'dob', 'birth date'],
  address: ['address', 'residential address', 'address line 1', 'street'],
  city: ['city', 'town', 'district'],
  state: ['state', 'province', 'region'],
  country: ['country', 'nation'],
  pincode: ['pin', 'pincode', 'pin code', 'postal code', 'zip'],
  phone: ['phone', 'mobile', 'contact', 'contact number', 'telephone'],
  email: ['email', 'e-mail', 'mail'],
  idNumber: ['id', 'id number', 'aadhaar', 'aadhar', 'pan', 'passport no', 'licence no', 'license no', 'reference no', 'employee id', 'roll no'],
  institution: ['institution', 'organisation', 'organization', 'company', 'school', 'college', 'university'],
  designation: ['designation', 'role', 'position', 'title', 'occupation'],
  dateOfIssue: ['date of issue', 'issued on', 'issue date'],
  expiry: ['expiry', 'expiry date', 'valid till', 'valid up to'],
  guardian: ['guardian', 'parent', 'father', 'mother']
};

function maskId(value) {
  if (!value) return value;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length >= 4) return `•••••${digits.slice(-4)}`;
  return '••••';
}

/**
 * Field extraction for a form. A value is only reported when the text shows a
 * label and something that looks like a value, so a blank form yields blanks
 * rather than a wall of invented values.
 */
export function parseForm(text) {
  const t = String(text || '');
  const out = {};
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    let found = null;
    for (const alias of aliases) {
      // Spaces and tabs only, never a newline: otherwise "Name:" followed by an
      // empty line would swallow the next label as its value.
      const re = new RegExp(`(?:^|\\n)[ \\t]*${alias.replace(/\s+/g, '[ \\t]+')}[ \\t]*[:\\-][ \\t]*([^\\n]{1,60})`, 'i');
      const m = t.match(re);
      if (m && clean(m[1])) { found = clean(m[1]); break; }
    }
    if (found) out[key] = key === 'idNumber' ? maskId(found) : found;
  }
  const empties = Object.entries(FIELD_ALIASES)
    .filter(([k]) => !(k in out)).map(([k]) => k);
  return { fields: out, blankFields: empties, complete: empties.length === 0 };
}

const ID_PATTERNS = [
  { type: 'passport', re: /\bpassport\b/gi, label: 'Passport' },
  { type: 'aadhaar', re: /\baadhaar\b|\buidai\b/gi, label: 'Aadhaar card' },
  { type: 'pan', re: /\bpan\s*(?:card|no)\b|\bincome\s*tax\b/gi, label: 'PAN card' },
  { type: 'driving-licence', re: /\bdriving\s*licen[cs]e\b/gi, label: 'Driving licence' },
  { type: 'voter-id', re: /\bvoter\s*(?:id|identity)|\belectors?\s*photo\b/gi, label: 'Voter ID' },
  { type: 'national-id', re: /\bnational\s*(?:id|identity)\b/gi, label: 'National ID' },
  { type: 'medical-prescription', re: /\b(?:rx|prescription|tab\.?|tablet|capsule|dose|daily|bd|od|before\s+food|after\s+food)\b/gi, label: 'Medical prescription or medicine slip', weight: 2 },
  { type: 'bank-statement', re: /\b(?:account\s*(?:number|no)|iban|closing\s+balance|statement\s*period)\b/gi, label: 'Bank statement', weight: 2 },
  { type: 'utility-bill', re: /\b(?:electricity\s*bill|water\s*bill|gas\s*bill|bill\s*amount)\b/gi, label: 'Utility bill', weight: 2 },
  { type: 'invoice', re: /\b(?:tax\s*invoice|invoice\s*(?:no|number|#)|gstin|amount\s*due)\b/gi, label: 'Invoice', weight: 2 },
  { type: 'receipt', re: /\b(?:receipt|thank\s*you|cashier|paid\s*by)\b/gi, label: 'Receipt' },
  { type: 'resume', re: /\b(?:curriculum\s*vitae|work\s*experience|professional\s+summary)\b/gi, label: 'Résumé' },
  { type: 'report', re: /\b(?:abstract|methodology|references|bibliography)\b/gi, label: 'Report or paper' },
  { type: 'screenshot', re: /\b(?:notifications|battery|wifi)\b/gi, label: 'Phone screenshot' }
];

const FORM_LABEL = new RegExp(
  `(?:^|\\n)[ \\t]*(?:${Object.values(FIELD_ALIASES).flat().map(a => a.replace(/\s+/g, '[ \\t]+')).join('|')})[ \\t]*[:\\-]`, 'gi'
);

/** Classify a page. Returns every plausible match ranked, never a single guess. */
export function classifyDocument(text) {
  const t = String(text || '');
  if (t.replace(/\s/g, '').length < 12) {
    return { primary: null, confidence: 0, candidates: [], reason: 'Almost no text was recognised, so nothing can be classified honestly.' };
  }
  const scored = ID_PATTERNS.map(p => ({ ...p, score: (t.match(p.re) || []).length * (p.weight || 1) }))
    .filter(p => p.score > 0);
  // A form is the absence of a more specific type, so it only counts when the
  // page really is a grid of labels — not whenever a document says "Name:".
  const labels = (t.match(FORM_LABEL) || []).length;
  if (labels >= 3) scored.push({ type: 'form', label: 'Form', score: labels });
  if (!scored.length) {
    return { primary: null, confidence: 0, candidates: [], reason: 'The text does not match any known document type. Try a sharper photo, or the matching extraction tool.' };
  }
  scored.sort((a, b) => b.score - a.score);
  const total = scored.reduce((n, p) => n + p.score, 0);
  return {
    primary: scored[0].label,
    confidence: Number((scored[0].score / total).toFixed(2)),
    candidates: scored.slice(0, 4).map(p => ({ label: p.label, score: p.score })),
    reason: `Matched on ${scored[0].score} cue(s) in the recognised text. Check it against the photo before you rely on it.`
  };
}

/** Whole recognised document as JSON, with a per-page breakdown. */
export function documentToJson(pages) {
  const list = (pages || []).map((p, i) => ({
    page: i + 1,
    file: p.name || null,
    characters: (p.text || '').length,
    words: (p.text || '').split(/\s+/).filter(Boolean).length,
    classification: classifyDocument(p.text).primary,
    text: p.text || ''
  }));
  return {
    pages: list,
    totalCharacters: list.reduce((n, p) => n + p.characters, 0),
    form: list.length === 1 ? parseForm(list[0].text).fields : null,
    note: 'Extracted in your browser. Nothing was uploaded, and blank fields are left blank rather than guessed.'
  };
}

/* ------------------------------------------------------------------ *
 * Browser side: the shared shape of every OCR tool's page.
 * ------------------------------------------------------------------ */

/**
 * Recognise one or more images.
 * @param {File[]} files
 * @param {{lang?:string, onProgress?:(p:number, note:string)=>void}} [opts]
 * @returns {Promise<{pages:{name:string,text:string,confidence:number}[], meanConfidence:number}>}
 */
export async function recognizeImages(files, opts = {}) {
  const list = (files || []).filter(Boolean);
  if (!list.length) throw new Error('Choose at least one image.');
  const Tesseract = await loadRecognizer();
  const pages = [];
  for (let i = 0; i < list.length; i++) {
    opts.onProgress?.(Math.round(i / list.length * 100), `Reading image ${i + 1} of ${list.length}…`);
    const { data } = await Tesseract.recognize(list[i], opts.lang || 'eng');
    pages.push({
      name: list[i].name || `image-${i + 1}`,
      text: (data.text || '').trim(),
      confidence: typeof data.confidence === 'number' ? Math.round(data.confidence) : null
    });
  }
  const scored = pages.filter(p => p.confidence != null);
  return {
    pages,
    meanConfidence: scored.length ? Math.round(scored.reduce((n, p) => n + p.confidence, 0) / scored.length) : null
  };
}

/** Shared page markup: a file picker, a progress bar and an output pane. */
export function ocrForm({ accept = 'image/*', multiple = true, label = 'Choose image(s)', run = 'Read text', extra = '' } = {}) {
  return `
    <div class="field-row">
      <input id="file" type="file" accept="${accept}"${multiple ? ' multiple' : ''}>
      <span class="muted">${label}</span>
    </div>
    ${extra}
    <div class="button-row"><button class="btn primary" id="run">${run}</button></div>
    <pre id="tool-out" class="out" style="margin-top:12px"></pre>`;
}
