/**
 * Phase 4 — the composed chain: images → OCR → facts → a real .pptx.
 *
 * The recogniser is injected, so these tests run offline against the exact text
 * a prescription scan produces. Nothing here asserts on a language model, and
 * nothing asserts that a blank cell was filled in: a cell the text never stated
 * has to stay blank, because a filled-in dose is the failure that hurts.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import { planRequest, buildIndex } from '../public/js/planner.js';
import { extractMedicines, medicinesToText, describeMedicines } from '../public/js/med-table.js';
import { planDeck, makePresentation } from '../lib/presentation-deck.js';

let pass = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const tools = JSON.parse(await fs.readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const index = buildIndex(tools);

/** The two halves of a prescription, as a scanner with poor luck would return them. */
const RX_PAGE_1 = `Dr. Ramesh  12/08/2026
Rx
Tab. Metformin 500 mg   1 tab twice daily after meals  x 30 days
Tab. Azithromycin 250 mg  1 tab OD for 5 days
Advice: complete the antibiotic course`;

const RX_PAGE_2 = `Cap. Vitamin D3 60,000 IU once weekly for 8 weeks
Tab. Cefuroxime 250 mg  2 caps every 8 hours for 10 days
Syp. Paracetamol 650 mg  PRN for fever`;

/* ---------------------------------------------------------------- reading */

await check('the five fields come off a realistic prescription', () => {
  const t = extractMedicines(`${RX_PAGE_1}\n${RX_PAGE_2}`);
  const rows = t.rows;
  assert.equal(rows.length, 5, `expected 5 medicine lines, got ${rows.length}: ${JSON.stringify(rows)}`);
  const met = rows.find(r => /metformin/i.test(r.drug));
  assert.deepEqual(met, { drug: 'Metformin', strength: '500 mg', dose: '1 tab', frequency: 'Twice daily', duration: '30 days' });
  assert.equal(rows.find(r => /azithromycin/i.test(r.drug)).duration, '5 days');
  assert.equal(rows.find(r => /vitamin/i.test(r.drug)).strength, '60,000 IU');
  assert.equal(rows.find(r => /vitamin/i.test(r.drug)).dose, '', 'a line with no dose must not acquire one');
  assert.equal(rows.find(r => /cefuroxime/i.test(r.drug)).frequency, 'Every 8 hours');
  assert.equal(rows.find(r => /cefuroxime/i.test(r.drug)).dose, '2 capsules');
  assert.equal(rows.find(r => /paracetamol/i.test(r.drug)).frequency, 'As needed');
});

await check('prose is not mistaken for a prescription', () => {
  const t = extractMedicines('The patient reports mild fever since Tuesday. Advise rest and plenty of fluids. Review in one week.');
  assert.equal(t.rows.length, 0, 'a clinic note is not a drug list: ' + JSON.stringify(t.rows));
  assert.match(describeMedicines(t), /No medicine lines/);
});

await check('a strength on its own line joins the drug above it', () => {
  const t = extractMedicines('Tab. Amoxicillin 500 mg\n1 tab TDS for 7 days');
  assert.equal(t.rows.length, 1, JSON.stringify(t.rows));
  assert.equal(t.rows[0].dose, '1 tab');
  assert.equal(t.rows[0].frequency, 'Thrice daily');
  assert.equal(t.rows[0].duration, '7 days');
});

await check('a known drug with no stated dose is listed but not filled in', () => {
  const t = extractMedicines('ORS\nTake rest and drink water');
  assert.equal(t.rows.length, 1, JSON.stringify(t.rows));
  assert.equal(t.rows[0].drug, 'ORS');
  assert.equal(t.rows[0].dose, '');
  assert.equal(t.incomplete, 1, 'and the table says so');
});

await check('the text form shows a dash where the text said nothing', () => {
  const block = medicinesToText(extractMedicines('Vitamin D3 60,000 IU once weekly'));
  assert.match(block, /Vitamin D3 \| 60,000 IU \| — \| Once weekly \| —/);
});

/* --------------------------------------------------------------- the plan */

const images = [
  { name: 'rx-1.png', kind: 'image', index: 0, file: { name: 'rx-1.png' } },
  { name: 'rx-2.png', kind: 'image', index: 1, file: { name: 'rx-2.png' } }
];

const planFor = prompt => planRequest({ prompt, tools, index, files: images });

await check('a deck from photos reads the photos first', () => {
  const p = planFor('make a slide deck from these images');
  const titles = p.steps.map(s => s.title);
  assert.ok(titles.some(t => /Read the text in 2 images/.test(t)), titles.join(' | '));
  const deck = p.steps.find(s => s.executor === 'presentation');
  assert.ok(deck, 'the deck step is queued: ' + titles.join(' | '));
  const read = p.steps.find(s => s.executor === 'image-read');
  assert.deepEqual(deck.requires, [read.id], 'the deck waits for the text, not for luck');
});

await check('a deck from photos does not also queue a photo strip', () => {
  const p = planFor('create a presentation from this prescription photo');
  const tool = p.steps.filter(s => s.tool).map(s => s.toolTitle);
  assert.ok(!tool.includes('Photo Strip Maker'), 'a photo strip is a different artifact: ' + tool.join(', '));
  assert.ok(!tool.some(t => /Presentation Creator/.test(t)), 'the deck is built here, so the studio is not also opened: ' + tool.join(', '));
});

await check('plain OCR of a photo reads it once, in the page', () => {
  const p = planFor('ocr these whiteboard photos');
  assert.equal(p.steps.filter(s => s.executor === 'image-read').length, 1, 'one reader, not two');
  assert.ok(!p.steps.some(s => s.tool && /OCR Image to Text/.test(s.toolTitle)),
    'the studio OCR tool is not queued as well: ' + p.steps.map(s => s.toolTitle).join(', '));
});

await check('an image the chain does not need is not read', () => {
  const p = planFor('make a poster from this image');
  assert.ok(!p.steps.some(s => s.executor === 'image-read'), 'a poster does not need the words in the photo');
});

/* -------------------------------------------------------------- the deck */

await check('the deck carries the table and the words, as a real .pptx', async () => {
  const read = { text: `${RX_PAGE_1}\n${RX_PAGE_2}`, medicines: extractMedicines(`${RX_PAGE_1}\n${RX_PAGE_2}`) };
  const plan = planDeck({
    topic: 'Medicines',
    outline: [
      { title: 'Medicines read from the text', table: { columns: read.medicines.columns, rows: read.medicines.rows.map(r => [r.drug, r.strength, r.dose, r.frequency, r.duration]) } },
      { title: 'What to watch', bullets: ['Complete the antibiotic course even if you feel better.', 'Metformin is best taken with meals.'] }
    ]
  });
  assert.equal(plan.slides.length, 2);
  assert.equal(plan.slides[0].table.rows.length, 5, 'all five medicine lines reach the deck');

  const pptx = await makePresentation(plan);
  assert.ok(pptx.length > 20000, `a real pptx, not an empty one (${pptx.length} bytes)`);
  const text = pptx.toString('latin1');
  assert.equal(text.slice(0, 2), 'PK', 'it is a zip container, which is what .pptx is');
  const xml = [...text.matchAll(/[\x20-\x7e]{6,}/g)].map(m => m[0]).join(' ');
  for (const want of ['Metformin', '60,000 IU', 'Every 8 hours', '2 capsules', 'Azithromycin']) {
    assert.ok(xml.includes(want), `${want} is in the deck file`);
  }
  assert.ok(xml.includes('Complete the antibiotic course'), 'the notes are in the deck too');
});

await check('a deck with no text at all is refused, not filled in', () => {
  assert.throws(
    () => planDeck({ topic: 'Empty', notes: '', outline: null, research: null }),
    err => /No source text available/.test(err.message),
    'an empty deck is worse than no deck'
  );
});

await check('a table slide is not silently dropped for having no bullets', () => {
  const plan = planDeck({ topic: 'T', outline: [{ title: 'Meds', table: { columns: ['Medicine'], rows: [['ORS']] } }] });
  assert.equal(plan.slides.length, 1);
  assert.equal(plan.slides[0].table.rows[0][0], 'ORS');
});

await check('more than nine medicine lines say so instead of vanishing', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [`Drug ${i}`, '500 mg', '1 tab', 'Once daily', '5 days']);
  const plan = planDeck({ topic: 'T', outline: [{ title: 'Meds', table: { columns: ['Medicine', 'Strength', 'Dose', 'How often', 'For how long'], rows } }] });
  assert.equal(plan.slides[0].table.rows.length, 12, 'the plan keeps all of them; the slide says what it left off');
});

console.log(`${pass}/${pass + (process.exitCode ? 1 : 0)} deck-chain tests passed`);
if (process.exitCode) throw new Error('deck chain tests failed');
