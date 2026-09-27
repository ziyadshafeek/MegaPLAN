/**
 * MegaPLAN business documents — the engine behind the 24 business tools.
 *
 * All 24 used to share one template: a single page, a `Description | Qty |
 * Rate` textarea, no tax, no numbering, no dates, and a hard cut at the bottom
 * of page one that **silently dropped every remaining line**. An invoice with
 * more items than fit was quietly wrong, and nothing on screen said so.
 *
 * This module is the part that must be right, so it is pure and tested:
 *   - parsing what a person actually pastes (CSV, pipes, tabs, "2 x Coffee 30")
 *   - real arithmetic: discount, tax, round-off, totals that add up
 *   - amount in words, because Indian invoices need it
 *   - a numbering series that continues instead of restarting
 *   - a schema per document type, so a quotation is not an invoice
 *
 * The PDF that renders it lives in `engines.js`; it paginates properly and
 * always shows the figures it used.
 */

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

const NUM = /^-?[\d,]*\.?\d+\s*%?$/;

function toNumber(value) {
  if (value == null) return null;
  const t = String(value).replace(/[₹$€£\s]/g, '').replace(/%$/, '').trim();
  if (!t || !NUM.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Split one pasted line into cells.
 *
 * The delimiter is chosen for the whole line rather than per character: mixing
 * rules means "1,000" gets torn in half, and a quoted field loses its commas.
 * A line with a pipe or a tab uses that; otherwise a comma splits. Quoted
 * fields are honoured either way.
 */
export function splitCells(line) {
  const src = String(line || '');
  const delim = /[|\t]/.test(src) ? (src.includes('|') ? '|' : '\t') : ',';
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') { if (quoted && src[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; continue; }
    if (!quoted && ch === delim) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

/** Does this cell look like it was meant to hold a number? */
const looksNumeric = v => {
  const t = String(v ?? '').replace(/[₹$€£\s]/g, '').trim();
  return t.length > 0 && /\d/.test(t) && /^[-+]?[\d.,()/x×%\- ]*$/.test(t);
};

/**
 * Parse pasted rows into items.
 *
 * Accepted shapes, in order of how often people actually paste them:
 *   "Chair | 4 | 250"            description, qty, rate
 *   "Chair,4,250"                the same with commas
 *   "Chair\t4\t250"              the same with tabs
 *   "4 x Chair | 250"            qty first, rate second, no rate column
 *   "Chair | 1000"               amount only
 *   "Chair"                      a note line, rate 0
 *
 * A line that cannot be understood becomes a note rather than a zero-valued
 * product, so a typo never turns into a free item.
 *
 * @returns {{items:Array, notes:Array, skipped:Array}}
 */
export function parseItems(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  const notes = [];
  const skipped = [];

  const firstLine = lines.find(l => l.trim());
  const firstCells = firstLine ? splitCells(firstLine) : [];
  const HEADINGS = /^(description|item|particulars?|product|product\s*name|name|qty|quantity|rate|price|unit\s*price|amount|total|unit|hsn|tax|discount|value)$/i;
  const header = firstCells.length > 1 && firstCells.some(c => HEADINGS.test(c.trim()))
    ? firstCells.map(c => c.trim().toLowerCase())
    : null;
  const col = name => header ? header.findIndex(h => new RegExp(`^(?:${name})$`, 'i').test(h)) : -1;
  const C = {
    desc: col('description|item|particular|product|name'),
    qty: col('qty|quantity'),
    rate: col('rate|price|unit\\s*price'),
    amount: col('amount|total|value')
  };
  const named = header && (C.desc >= 0 || C.qty >= 0 || C.rate >= 0 || C.amount >= 0);

  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (i === 0 && header) continue;
    if (/^[-=_#\s|,]+$/.test(line)) continue;
    if (/^(?:sub\s*-?total|grand\s*total|total|discount|tax|vat|gst|cgst|sgst|igst|round\s*off|amount\s*in\s*words|balance\s*due)\b\s*[:\-]?/i.test(line)) continue;

    const cells = splitCells(line);
    // Everything after the first cell is a value column.
    const valueCells = named ? [] : cells.slice(1);
    let description = named ? (cells[C.desc] ?? cells[0] ?? '') : (cells[0] ?? '');

    // "4 x Chair", "3 x Filter Coffee" — the quantity often leads the name.
    let leadQty = null;
    const lead = String(description).match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(.+)$/i);
    if (lead) { leadQty = toNumber(lead[1]); description = lead[2]; }

    let qty, rate, amount;
    if (named) {
      qty = toNumber(cells[C.qty]);
      rate = toNumber(cells[C.rate]);
      amount = toNumber(cells[C.amount]);
    } else {
      const nums = valueCells.filter(c => String(c).trim() !== '');
      const values = nums.map(toNumber);
      // A value column that holds something unreadable is a bad paste, not a
      // free line item. Say so instead of quietly billing zero.
      if (nums.some((c, k) => values[k] == null)) {
        skipped.push({ line, reason: 'a number could not be read' });
        continue;
      }
      // Three numbers are quantity, rate and amount; two are quantity and
      // rate; one is a rate when the row already states the quantity
      // ("3 x Widget | 500" reads as 3 at 500) and an amount otherwise.
      if (values.length >= 3) { [qty, rate, amount] = values; }
      else if (values.length === 2) { [qty, rate] = values; }
      else if (values.length === 1) { if (leadQty == null) amount = values[0]; else rate = values[0]; }
    }
    if (leadQty != null) qty = leadQty;

    description = String(description).replace(/^["']|["']$/g, '').trim();
    // A single-cell line may still carry a trailing amount: "3 x Coffee 150".
    if (!named && valueCells.length === 0) {
      const tail = description.match(/^(.*?)\s+([\d.,]+)$/);
      if (tail && /\d/.test(tail[2])) {
        description = tail[1].trim();
        amount = toNumber(tail[2]);
      }
    }
    if (!description) { skipped.push({ line, reason: 'no description' }); continue; }
    if (!named && valueCells.length === 0 && amount == null) { notes.push(description); continue; }

    if (amount == null && rate != null) amount = qty == null ? rate : qty * rate;
    if (qty == null && rate != null && amount != null && rate !== 0) qty = Number((amount / rate).toFixed(4));
    if (qty == null) qty = 1;
    if (rate == null) rate = amount != null ? Number((amount / qty).toFixed(2)) : 0;
    if (amount == null) amount = Number((qty * rate).toFixed(2));

    if (![qty, rate, amount].every(Number.isFinite)) { skipped.push({ line, reason: 'a number could not be read' }); continue; }
    // No numbers at all in the row: it is a note, not a product.
    if (!named && valueCells.length === 0 && amount == null) { notes.push(description); continue; }
    items.push({ description, qty, rate: round2(rate), amount: round2(amount) });
  }
  return { items, notes, skipped };
}

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ *
 * Arithmetic
 * ------------------------------------------------------------------ */

/**
 * Totals that actually add up, with a round-off line so a document whose
 * figures were rounded is honest about the difference.
 */
export function computeTotals(items, opts = {}) {
  const { discountPercent = 0, taxPercent = 0, taxLabel = 'Tax', shipping = 0, roundOff = true } = opts;
  const list = items || [];
  const subtotal = round2(list.reduce((n, i) => n + (Number(i.amount) || 0), 0));
  const discount = round2(subtotal * (Number(discountPercent) || 0) / 100);
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * (Number(taxPercent) || 0) / 100);
  const withShipping = round2(taxable + tax + (Number(shipping) || 0));
  const total = roundOff ? Math.round(withShipping) : withShipping;
  const roundOffAmount = round2(total - withShipping);
  return {
    subtotal, discount, taxable, tax,
    taxLabel: taxPercent ? `${taxLabel} (${Number(taxPercent)}%)` : '',
    taxPercent: Number(taxPercent) || 0,
    shipping: round2(Number(shipping) || 0),
    roundOff: roundOff ? roundOffAmount : 0,
    total
  };
}

/** Indian and international numbering: crores, lakhs, thousands. */
export function amountInWords(amount, currency = 'INR') {
  const abs = Math.abs(Number(amount) || 0);
  if (!Number.isFinite(abs)) return '';
  // Paise are the fractional part of the same number. Rounding the rupee part
  // first and then adding paise on top would overstate the total by a rupee.
  let rupees = currency === 'INR' ? Math.floor(abs) : Math.round(abs);
  let paise = currency === 'INR' ? Math.round((abs - rupees) * 100) : 0;
  if (paise === 100) { rupees += 1; paise = 0; }
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const under100 = x => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ' ' + ONES[x % 10] : ''}`);
  const under1000 = x => {
    if (x < 100) return under100(x);
    const h = Math.floor(x / 100), r = x % 100;
    return `${ONES[h]} Hundred${r ? ' ' + under100(r) : ''}`;
  };
  let out = '';
  if (currency === 'INR') {
    const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1000);
    const rest = rupees % 1000;
    if (crore) out += `${under1000(crore)} Crore `;
    if (lakh) out += `${under100(lakh)} Lakh `;
    if (thousand) out += `${under1000(thousand)} Thousand `;
    if (rest) out += `${under1000(rest)} `;
    if (!out) out = 'Zero ';
    out += paise ? `and ${under100(paise)} Paise` : '';
  } else {
    const thousand = Math.floor(rupees / 1000), rest = rupees % 1000;
    if (thousand) out += `${under1000(thousand)} Thousand `;
    if (rest) out += `${under1000(rest)} `;
    if (!out) out = 'Zero';
  }
  const symbol = { INR: 'Rupees', USD: 'US Dollars', EUR: 'Euros', GBP: 'Pounds' }[currency] || currency;
  return `${(Number(amount) || 0) < 0 ? 'Minus ' : ''}${symbol} ${out.trim()} Only`;
}

/**
 * Continue a numbering series. `existing` is the numbers already used; the
 * result is the next free one, so a re-run never produces a duplicate.
 */
export function nextNumber(series, existing = [], opts = {}) {
  const { prefix = 'INV', year = new Date().getFullYear(), pad = 4, suffix = '' } = opts;
  const stem = String(series || '').trim() || prefix;
  const pattern = new RegExp(`^${escapeRe(stem)}(?:-?${year})?-?(\\d+)$`, 'i');
  let max = 0;
  for (const e of existing) {
    const m = String(e || '').match(pattern);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${stem}-${year}-${String(max + 1).padStart(pad, '0')}${suffix}`;
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------------ *
 * Document schemas
 * ------------------------------------------------------------------ */

/**
 * What each business tool is actually for. The differences matter: a quotation
 * carries a validity date and no tax promise, a delivery challan carries only
 * goods, a payslip carries earnings and deductions rather than line items.
 */
export const DOC_SCHEMAS = {
  'Invoice Maker': { kind: 'tax-invoice', prefix: 'INV', fields: ['from', 'to', 'date', 'due'], items: true, tax: true, discount: true, words: true, terms: 'Payment due within the period stated above. Interest applies after the due date.' },
  'Proforma Invoice': { kind: 'proforma', prefix: 'PI', fields: ['from', 'to', 'date', 'valid'], items: true, tax: true, discount: true, words: true, terms: 'This is a proforma invoice, not a demand for payment.' },
  'Credit Note Maker': { kind: 'credit-note', prefix: 'CN', fields: ['from', 'to', 'date', 'against'], items: true, tax: true, discount: true, words: true, terms: 'Amount is credited to your account against the invoice named above.' },
  'Debit Note Maker': { kind: 'debit-note', prefix: 'DN', fields: ['from', 'to', 'date', 'against'], items: true, tax: true, discount: true, words: true, terms: 'Amount is debited to your account against the invoice named above.' },
  'Quotation Maker': { kind: 'quotation', prefix: 'QT', fields: ['from', 'to', 'date', 'valid'], items: true, tax: true, discount: true, words: true, terms: 'Prices hold until the validity date. This is an offer, not an invoice.' },
  'Purchase Order Maker': { kind: 'purchase-order', prefix: 'PO', fields: ['from', 'to', 'date', 'delivery'], items: true, tax: true, discount: true, words: false, terms: 'This order is placed with the supplier named above.' },
  'Receipt Maker': { kind: 'receipt', prefix: 'RC', fields: ['from', 'to', 'date'], items: true, tax: true, discount: true, words: true, terms: 'Received with thanks.' },
  'Delivery Challan': { kind: 'delivery-challan', prefix: 'DC', fields: ['from', 'to', 'date', 'vehicle'], items: true, tax: false, discount: false, words: false, terms: 'Goods delivered in good condition. Count on receipt.' },
  'Packing Slip': { kind: 'packing-slip', prefix: 'PS', fields: ['from', 'to', 'date'], items: true, tax: false, discount: false, words: false, terms: 'Contents of this parcel. No prices are shown.' },
  'Proposal Maker': { kind: 'proposal', prefix: 'PR', fields: ['from', 'to', 'date', 'valid'], items: true, tax: true, discount: true, words: false, terms: 'This proposal is valid until the date stated above.' },
  'Purchase Tracker': { kind: 'tracker', prefix: 'PT', fields: ['from', 'to', 'date'], items: true, tax: true, discount: true, words: false, terms: 'A running sheet of what has been ordered, from what is still pending.' },
  'Payslip Maker': { kind: 'payslip', prefix: 'PS', fields: ['from', 'to', 'date', 'period'], items: false, tax: false, discount: false, words: true, earnings: true, terms: 'This is a computer-generated statement and is not signed.' },
  'Timesheet Maker': { kind: 'timesheet', prefix: 'TS', fields: ['from', 'to', 'date', 'period'], items: false, tax: false, discount: false, hours: true, terms: 'Hours entered for the period named above.' },
  'Attendance Sheet': { kind: 'attendance', prefix: 'AT', fields: ['from', 'to', 'date', 'period'], items: false, tax: false, discount: false, attendance: true, terms: 'Attendance recorded for the period named above.' },
  'Expense Report': { kind: 'expense-report', prefix: 'ER', fields: ['from', 'to', 'date', 'period'], items: true, tax: true, discount: false, words: true, terms: 'Claimed expenses for reimbursement.' },
  'Petty Cash Sheet': { kind: 'petty-cash', prefix: 'PC', fields: ['from', 'to', 'date', 'period'], items: true, tax: false, discount: false, cash: true, terms: 'Petty cash book for the period named above.' },
  'Inventory Sheet': { kind: 'inventory', prefix: 'INV', fields: ['from', 'to', 'date'], items: true, tax: false, discount: false, words: false, stock: true, terms: 'Stock on hand. Quantities as counted.' },
  'Shipping Label Maker': { kind: 'shipping-label', prefix: 'SL', fields: ['from', 'to', 'date'], items: true, tax: false, discount: false, words: false, single: true, terms: '' },
  'Label Maker': { kind: 'label', prefix: 'LB', fields: ['from', 'to', 'date'], items: true, tax: false, discount: false, words: false, single: true, terms: '' },
  'SOP Maker': { kind: 'sop', prefix: 'SOP', fields: ['from', 'to', 'date', 'review'], items: false, tax: false, discount: false, prose: true, terms: '' },
  'Meeting Agenda Maker': { kind: 'agenda', prefix: 'AG', fields: ['from', 'to', 'date', 'venue'], items: false, tax: false, discount: false, list: true, terms: '' },
  'Meeting Minutes Maker': { kind: 'minutes', prefix: 'MN', fields: ['from', 'to', 'date', 'venue'], items: false, tax: false, discount: false, list: true, terms: '' },
  'Business Card Maker': { kind: 'business-card', prefix: 'BC', fields: ['from', 'to', 'date'], items: false, tax: false, discount: false, words: false, single: true, terms: '' },
  'Letterhead Maker': { kind: 'letterhead', prefix: '', fields: ['from', 'to', 'date'], items: false, tax: false, discount: false, words: false, prose: true, terms: '' }
};

export function schemaFor(title) {
  return DOC_SCHEMAS[title] || { kind: 'generic', prefix: 'DOC', fields: ['from', 'to', 'date'], items: true, tax: true, discount: true, words: true, terms: '' };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/**
 * Turn the form values into a finished document description. Pure: the same
 * input always gives the same document, and the output is plain data the
 * renderer can lay out.
 */
export function buildDocument(kind, input = {}) {
  const schema = typeof kind === 'string' && DOC_SCHEMAS[kind] ? DOC_SCHEMAS[kind] : kind;
  const {
    number = '', date = '', extra = '', from = '', to = '',
    discountPercent = 0, taxPercent = 0, taxLabel = 'Tax',
    hours = [], earnings = [], attendance = [], lines = [], existingNumbers = []
  } = input;

  const parsed = schema.items ? parseItems(input.body || '') : { items: [], notes: [], skipped: [] };
  const totals = computeTotals(parsed.items, { discountPercent, taxPercent, taxLabel, roundOff: schema.kind === 'tax-invoice' });
  const docNumber = number || (schema.prefix ? nextNumber(schema.prefix, existingNumbers, { prefix: schema.prefix }) : '');

  const doc = {
    kind: schema.kind,
    title: schema.kind.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    number: docNumber,
    date: date || null,
    from: from.trim() || null,
    to: to.trim() || null,
    extraField: String(extra || '').trim() || null,
    items: parsed.items,
    notes: parsed.notes,
    skipped: parsed.skipped,
    totals,
    words: schema.words ? amountInWords(totals.total) : null,
    terms: schema.terms || null,
    lines: Array.isArray(lines) ? lines.map(l => String(l).trim()).filter(Boolean) : []
  };

  if (schema.earnings) {
    const pay = parseItems(input.body || '');
    doc.earnings = pay.items;
    doc.earningsTotal = round2(pay.items.reduce((n, i) => n + i.amount, 0));
    doc.deductions = round2(Number(input.deductions) || 0);
    doc.netPay = round2(doc.earningsTotal - doc.deductions);
    doc.words = amountInWords(doc.netPay);
  }
  if (schema.hours) doc.hours = hours.map(h => ({ ...h, hours: Number(h.hours) || 0 }));
  if (schema.hours) doc.hoursTotal = round2(doc.hours.reduce((n, h) => n + h.hours, 0));
  if (schema.attendance) doc.attendance = attendance;
  if (schema.cash) {
    const cash = parseItems(input.body || '');
    doc.receipts = cash.items.filter(i => /in|received|cash\s*in/i.test(i.description));
    doc.payments = cash.items.filter(i => /out|paid|spent/i.test(i.description));
    doc.receiptsTotal = round2(doc.receipts.reduce((n, i) => n + i.amount, 0));
    doc.paymentsTotal = round2(doc.payments.reduce((n, i) => n + i.amount, 0));
    doc.balance = round2(doc.receiptsTotal - doc.paymentsTotal);
  }
  return doc;
}

/** The plain-text rendering used on screen and in the copy/download buttons. */
export function documentToText(doc) {
  const money = n => Number(n || 0).toFixed(2);
  const L = [];
  L.push(doc.title.toUpperCase());
  if (doc.number) L.push(`Number: ${doc.number}`);
  if (doc.date) L.push(`Date: ${doc.date}`);
  if (doc.from) L.push(`From: ${doc.from}`);
  if (doc.to) L.push(`To: ${doc.to}`);
  if (doc.extraField) L.push(`Reference: ${doc.extraField}`);
  L.push('');
  if (doc.items?.length) {
    L.push('Item'.padEnd(44) + 'Qty'.padStart(8) + 'Rate'.padStart(12) + 'Amount'.padStart(14));
    for (const i of doc.items) {
      L.push(String(i.description).slice(0, 44).padEnd(44) +
        String(i.qty).padStart(8) + money(i.rate).padStart(12) + money(i.amount).padStart(14));
    }
    L.push('');
    L.push('Subtotal'.padEnd(44) + money(doc.totals.subtotal).padStart(26));
    if (doc.totals.discount) L.push('Discount'.padEnd(44) + `- ${money(doc.totals.discount)}`.padStart(26));
    if (doc.totals.tax) L.push(doc.totals.taxLabel.padEnd(44) + money(doc.totals.tax).padStart(26));
    if (doc.totals.roundOff) L.push('Round off'.padEnd(44) + `${doc.totals.roundOff > 0 ? '+' : ''}${money(doc.totals.roundOff)}`.padStart(26));
    L.push('TOTAL'.padEnd(44) + money(doc.totals.total).padStart(26));
    if (doc.words) L.push('', `Amount in words: ${doc.words}`);
  }
  if (doc.earnings) {
    L.push('Earnings'.padEnd(50) + money(doc.earningsTotal).padStart(16));
    L.push('Deductions'.padEnd(50) + money(doc.deductions).padStart(16));
    L.push('NET PAY'.padEnd(50) + money(doc.netPay).padStart(16));
    if (doc.words) L.push(`In words: ${doc.words}`);
  }
  if (doc.hours?.length) {
    L.push('');
    for (const h of doc.hours) L.push(`${(h.name || h.task || '-').slice(0, 40).padEnd(40)}${String(h.hours).padStart(8)} h`);
    L.push('Total hours'.padEnd(40) + String(doc.hoursTotal).padStart(8));
  }
  if (doc.attendance?.length) {
    L.push('');
    L.push('Name'.padEnd(30) + 'Present'.padStart(10) + 'Absent'.padStart(10));
    for (const a of doc.attendance) L.push(String(a.name || '-').slice(0, 30).padEnd(30) + String(a.present ?? 0).padStart(10) + String(a.absent ?? 0).padStart(10));
  }
  if (doc.receipts || doc.payments) {
    L.push('');
    L.push('Receipts'.padEnd(44) + money(doc.receiptsTotal).padStart(26));
    L.push('Payments'.padEnd(44) + money(doc.paymentsTotal).padStart(26));
    L.push('Balance'.padEnd(44) + money(doc.balance).padStart(26));
  }
  if (doc.lines?.length) {
    L.push('');
    for (const l of doc.lines) L.push(`- ${l}`);
  }
  if (doc.notes?.length) {
    L.push('', 'Notes:');
    for (const n of doc.notes) L.push(`  ${n}`);
  }
  if (doc.skipped?.length) {
    L.push('', `Not billed (could not be read as a line item): ${doc.skipped.length}`);
    for (const s of doc.skipped) L.push(`  "${s.line}" — ${s.reason}`);
  }
  if (doc.terms) L.push('', doc.terms);
  return L.join('\n');
}
