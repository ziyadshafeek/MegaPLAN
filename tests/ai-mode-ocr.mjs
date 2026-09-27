/**
 * OCR engine — the structured extraction behind the nine OCR tools.
 *
 * The parsers are pure functions over recognised text, so they are tested
 * directly with realistic OCR output. The rule these tests enforce is the one
 * that matters: a field appears only when the text supports it, and a value
 * that is not there is `null` — never a plausible-looking invention.
 */
import assert from 'node:assert/strict';
import {
  parseReceipt, parseInvoice, parseTable, parseForm, classifyDocument, documentToJson
} from '../public/js/ocr-engine.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push([true, name]); }
  catch (err) { results.push([false, `${name}\n      ${err.message}`]); }
}

const RECEIPT = `BLUE BAZAAR CAFE
12 MG Road, Bengaluru
GSTIN 29ABCDE1234F1Z5
Date: 2026-03-14   Time: 13:42
Invoice No: INV-2291

2 x Masala Chai        60.00
1 x Paneer Butter Masala  240.00
3 x Filter Coffee       150.00
1 x Butter Croissant     90.00

Subtotal: 540.00
CGST (5%): 27.00
GST (5%): 27.00
Grand Total: 594.00
Paid by UPI
Thank you for visiting`;

test('receipt: merchant, date, items and totals come from the text', () => {
  const r = parseReceipt(RECEIPT);
  assert.match(r.merchant, /BLUE BAZAAR/i);
  assert.equal(r.date, '2026-03-14');
  assert.equal(r.time, '13:42');
  assert.equal(r.items.length, 4, 'four line items, none invented');
  const chai = r.items.find(i => /Chai/i.test(i.name));
  assert.equal(chai.qty, 2);
  assert.equal(chai.lineTotal, 60);
  assert.equal(chai.unitPrice, 30, 'unit price is derived from qty × total');
  assert.equal(r.subtotal, 540);
  assert.equal(r.total, 594);
});

test('receipt: summary lines are never mistaken for items', () => {
  const r = parseReceipt(RECEIPT);
  for (const item of r.items) {
    assert.doesNotMatch(item.name, /subtotal|grand total|tax|gst|change|cash|thank/i,
      `"${item.name}" is a total line, not a product`);
  }
});

test('receipt: an unreadable image yields nulls, not guesses', () => {
  const r = parseReceipt('l l I  \n  \n 1 1 ');
  assert.equal(r.date, null);
  assert.equal(r.total, null);
  assert.equal(r.items.length, 0);
});

const INVOICE = `TAX INVOICE
Invoice No: MP-2026-0042
Supplier: Kerala Meds Supplies Pvt Ltd
Bill To: City Hospital, Trivandrum
Ship To: City Hospital Ward 3
PO Number: PO-7781
Date: 01/04/2026
Due Date: 30/04/2026

Description              Qty   Rate     Amount
Amoxicillin 500mg        10    12.50    125.00
Paracetamol 650mg        20     4.25     85.00
Azithromycin 250mg        5    30.00    150.00

Net Amount: 360.00
GST 18%: 64.80
Total: 424.80`;

test('invoice: number, parties, dates and line items are extracted', () => {
  const i = parseInvoice(INVOICE);
  assert.equal(i.invoiceNumber, 'MP-2026-0042');
  assert.equal(i.purchaseOrder, 'PO-7781');
  assert.match(i.billTo, /City Hospital/i);
  assert.match(i.shipTo, /Ward 3/i);
  assert.equal(i.dueDate, '30/04/2026');
  assert.equal(i.lineItems.length, 3);
  assert.equal(i.netAmount, 360);
  assert.equal(i.total, 424.8);
  assert.equal(i.currency, null, 'no currency symbol in this invoice, so none is reported');
});

test('invoice: an invoice with no PO or due date reports null', () => {
  const i = parseInvoice('TAX INVOICE\nSupplier: ACME\nTotal: 10.00');
  assert.equal(i.purchaseOrder, null);
  assert.equal(i.dueDate, null);
  assert.equal(i.total, 10);
});

test('table: a recognised grid becomes a real markdown table', () => {
  const t = parseTable(`Name        Qty   Price
Paneer       2      240.00
Coriander    1       12.50
Cumin       3       45.00`);
  assert.ok(t, 'a table was found');
  assert.equal(t.header.length, 3);
  assert.equal(t.rows.length, 3);
  assert.match(t.markdown, /\| Name \| Qty \| Price \|/);
  assert.match(t.markdown, /\| --- \| --- \| --- \|/);
  assert.match(t.markdown, /\| Paneer \| 2 \| 240\.00 \|/);
});

test('table: running prose is not reported as a table', () => {
  assert.equal(parseTable('This is a normal sentence about the weather today.'), null);
  assert.equal(parseTable(''), null);
});

test('table: grid rules drawn as dashes are not treated as rows', () => {
  const t = parseTable('Item    Cost\n----    ----\nMug     250');
  assert.equal(t.rows.length, 1, 'only the real data row survives');
});

const FORM = `APPLICATION FORM
Name: Anitha Ramesh
Date of Birth: 1994-02-11
Address: 14 Rose Villa, Pattom
City: Thiruvananthapuram
State: Kerala
Pincode: 695004
Phone: +91 9847012345
Email: anitha@example.com
Aadhaar: 4821 7390 5561
Institution: Regional Library`;

test('form: labelled fields are read, including the masked ID', () => {
  const f = parseForm(FORM);
  assert.equal(f.fields.name, 'Anitha Ramesh');
  assert.equal(f.fields.date, '1994-02-11');
  assert.equal(f.fields.city, 'Thiruvananthapuram');
  assert.equal(f.fields.pincode, '695004');
  assert.equal(f.fields.email, 'anitha@example.com');
  assert.equal(f.fields.institution, 'Regional Library');
  assert.match(f.fields.idNumber, /5561$/, 'the last four digits are kept');
  assert.doesNotMatch(f.fields.idNumber, /4821/, 'the rest of the ID is masked');
  assert.equal(f.complete, false);
  assert.ok(f.blankFields.includes('designation'), 'unlabelled fields are listed as blank');
});

test('form: a blank form returns no invented values', () => {
  const f = parseForm('APPLICATION FORM\nName:\nCity:');
  assert.deepEqual(f.fields, {}, 'empty values are not fields');
  assert.equal(f.complete, false);
  assert.ok(f.blankFields.length > 10);
});

test('classifier: a prescription is recognised as a prescription', () => {
  const rx = `Dr. R Menon MBBS
Rx
Tab. Metformin 500 mg  1-0-1  After food  30 days
Tab. Atorvastatin 10 mg  0-0-1  After food  30 days`;
  const c = classifyDocument(rx);
  assert.equal(c.primary, 'Medical prescription or medicine slip');
  assert.ok(c.confidence > 0.5);
});

test('classifier: a bank statement is not mistaken for a receipt', () => {
  const c = classifyDocument('HDFC Bank\nAccount Number 50100234567890\nStatement period 01/04 - 30/04\nClosing balance 12,340.55');
  assert.match(c.primary, /Bank statement/);
});

test('classifier: an almost empty page says so instead of guessing', () => {
  const c = classifyDocument('a');
  assert.equal(c.primary, null);
  assert.equal(c.confidence, 0);
  assert.match(c.reason, /no text|not match/i);
});

test('document to JSON: per-page counts and a single-page form', () => {
  const doc = documentToJson([
    { name: 'form.png', text: FORM },
    { name: 'receipt.png', text: RECEIPT }
  ]);
  assert.equal(doc.pages.length, 2);
  assert.ok(doc.totalCharacters > 100);
  assert.equal(doc.form, null, 'multi-page documents do not get a single form');
  assert.equal(doc.pages[0].characters, FORM.length);
  assert.match(doc.note, /browser/i);
});

test('nothing in the engine ever emits a fake value for an unreadable page', () => {
  for (const text of ['', '   ', '\n\n', '|||']) {
    const r = parseReceipt(text);
    assert.equal(r.total, null, 'no total is invented');
    assert.deepEqual(r.items, []);
    const f = parseForm(text);
    assert.deepEqual(f.fields, {});
    const c = classifyDocument(text);
    assert.equal(c.primary, null);
  }
});

const failed = results.filter(r => !r[0]);
for (const [okFlag, name] of results) console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} OCR extraction tests passed`);
process.exit(failed.length ? 1 : 0);
