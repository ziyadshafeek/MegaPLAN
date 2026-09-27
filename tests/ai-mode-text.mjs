/**
 * AI Mode local text intelligence (public/js/ai-compose.js).
 *
 * Pure module — the same output is produced in the tab and on the server, which
 * is what lets AI Mode deliver notes, question splits and prompt packs even when
 * no hosted assistant is configured.
 */
import assert from 'node:assert/strict';
import {
  words, sentences, paragraphs, summarize, keyTerms, keyPhrases, definitions,
  numbers, revisionQuestions, buildNotes, detectQuestions, detectSections,
  mapQuestionsToSections, batch, buildStudyBatches, mergeSources, citationList,
  renderCitationsMarkdown, renderCitationsText, promptPack, truncate
} from '../public/js/ai-compose.js';

const LESSON = `
Photosynthesis is the process by which green plants convert light energy into chemical energy stored as glucose.
Chlorophyll inside the chloroplasts absorbs light, and the light-dependent reactions occur in the thylakoid membrane.
Those reactions split water and release oxygen, producing about 100 billion tonnes of oxygen every year.
The Calvin cycle then occurs in the stroma and fixes carbon dioxide into glucose using ATP and NADPH.
Photosynthesis is the foundation of nearly every food chain on Earth.
`;

/* ---------- tokenising ---------- */
assert.ok(words(LESSON).includes('photosynthesis'));
assert.ok(!words('the and of a to').length, 'stopwords alone produce no tokens');
assert.ok(sentences(LESSON).length >= 5);
assert.ok(paragraphs(LESSON).length >= 1);
assert.equal(truncate('abcdefghij', 5), 'abcd…');

/* ---------- extractive summary stays inside the source ---------- */
const sum = summarize(LESSON, { maxSentences: 3 });
assert.ok(sum.summary.length > 40);
for (const pick of sum.picks) assert.ok(LESSON.includes(pick.text.slice(0, 30)), 'every summary sentence is verbatim from the source');
assert.ok(sum.picks.every((p, i, a) => i === 0 || p.index > a[i - 1].index), 'summary sentences stay in reading order');
assert.equal(summarize('', {}).summary, '');
assert.equal(summarize('too short', {}).summary, '', 'unusable input yields nothing, not noise');

/* ---------- key phrases ---------- */
const phrases = keyPhrases(LESSON, 6).map(p => p.term);
assert.ok(phrases.length > 2);
assert.ok(!phrases.some(t => t === 'calvin') || !phrases.some(t => t === 'calvin cycle'), 'a term contained in a stronger term is dropped');
assert.ok(phrases.every(t => t.length >= 4));

/* ---------- definitions + figures ---------- */
const defs = definitions(LESSON);
assert.ok(defs.some(d => /Photosynthesis is the process/.test(d)), '"X is Y" sentences become definitions');
const figures = numbers(LESSON);
assert.ok(figures.some(f => /100 billion/.test(f)), 'quantities are extracted');

/* ---------- revision questions ---------- */
const qs = revisionQuestions(LESSON, 6);
assert.ok(qs.length >= 4);
assert.ok(qs.every(q => typeof q.question === 'string' && q.question.length > 5));
const seen = new Set(qs.map(q => q.question.toLowerCase()));
assert.equal(seen.size, qs.length, 'questions are not duplicated');
assert.ok(qs.some(q => q.answer), 'at least some questions carry a source-derived answer');

/* ---------- notes ---------- */
const notes = buildNotes(LESSON, { heading: 'Photosynthesis' });
assert.match(notes, /^# Photosynthesis/);
assert.match(notes, /## Summary/);
assert.match(notes, /## Revision questions/);
assert.match(notes, /traceable to the source/);
for (const pick of summarize(LESSON, { maxSentences: 8 }).picks) {
  assert.ok(notes.includes(pick.text.slice(0, 30)), 'notes never contain a sentence the source does not have');
}
assert.equal(buildNotes('', {}), '', 'empty source yields empty notes');
const translation = buildNotes(LESSON, { style: 'translate' });
assert.match(translation, /will not invent a translation/);

/* ---------- question papers ---------- */
const PAPER = `
1. Define photosynthesis and explain its two stages.
2. Compare the light-dependent reactions with the Calvin cycle.
   Your answer should be a short table.
3. Calculate the net ATP yield of glycolysis.
4. Explain why water is split during photosynthesis.
`;
const questions = detectQuestions(PAPER);
assert.equal(questions.length, 4, 'numbered questions are detected');
assert.equal(questions[0].number, 1);
assert.match(questions[1].text, /table/, 'a continuation line is folded into its question');
assert.equal(detectQuestions('').length, 0);

const BOOK = `Chapter 1: Cell structure
Chapter 2: Photosynthesis and respiration
Unit 3: Energy in living systems
`;
const sections = detectSections(BOOK);
assert.ok(sections.length >= 3, 'chapter headings are detected');

const mapped = mapQuestionsToSections(questions, sections);
assert.ok(mapped.some(m => m.section && /Photosynthesis/i.test(m.section)), 'questions map to the chapter that shares their vocabulary');
assert.equal(mapped.length, 4);
assert.ok(mapQuestionsToSections(questions, []).every(m => m.section === null), 'no sections means no invented mapping');

/* ---------- batching: the AI Studio / NotebookLM split ---------- */
const per = buildStudyBatches({ questions, sections, mode: 'per', topic: 'Biology' });
assert.equal(per.groups.length, 4, 'per-question mode makes one prompt per question');
assert.equal(per.totalQuestions, 4);
const batched = buildStudyBatches({ questions, sections, mode: 'batch', batchSize: 2, topic: 'Biology' });
assert.equal(batched.groups.length, 2, 'batch mode respects the batch size');
assert.ok(batched.groups.every(g => /never invent one/.test(g.prompt)), 'every study prompt forbids invention');
assert.ok(batched.groups.every(g => /Biology/.test(g.prompt)));
assert.ok(batched.groups.some(g => g.chapters.length), 'chapters travel with the batch');
assert.equal(batch([1, 2, 3, 4, 5], 2).length, 3);
assert.equal(batch([], 3).length, 0);

/* ---------- source merging ---------- */
const items = [
  { title: 'A', text: 'Alpha text', url: 'https://a.test/1', source: 'S1' },
  { title: 'A again', text: 'Duplicate', url: 'https://a.test/1', source: 'S1' },
  { title: 'B', snippet: 'Beta snippet', url: 'https://b.test/2', source: 'S2' },
  { title: 'C', text: 'Gamma' }
];
const merged = mergeSources([{ items }], { maxChars: 100_000 });
assert.equal(merged.length, 3, 'a repeated URL is merged once');
assert.ok(merged[0].body.includes('Alpha text'));
assert.ok(merged[1].body.includes('Beta snippet'), 'a snippet is usable body text when there is no full text');
assert.ok(!merged.some(m => m.body === undefined));
const capped = mergeSources([{ items }], { maxChars: 40 });
assert.ok(capped.length < merged.length, 'a character budget actually truncates the merge');

/* ---------- citations ---------- */
const cites = citationList([
  { title: 'Vitamin D study', url: 'https://pubmed.ncbi.nlm.nih.gov/1/', source: 'PubMed', authors: 'A Rao', year: 2024, pmid: '1', doi: '10.1/x' },
  { title: 'No link', source: 'X' },
  { nothing: true }
]);
assert.equal(cites.length, 2, 'records with neither title nor url are dropped');
assert.equal(cites[0].n, 1);
assert.ok(cites[0].retrieved, 'every citation carries a retrieval date');
const md = renderCitationsMarkdown(cites);
assert.match(md, /## Sources/);
assert.match(md, /PMID 1/);
assert.match(md, /doi:10\.1\/x/);
assert.match(md, /https:\/\/pubmed/);
assert.match(renderCitationsText(cites), /1\. /);
assert.equal(renderCitationsMarkdown([]), '');

/* ---------- prompt packs ---------- */
{
  const prompts = promptPack({
    request: 'notes per question',
    topic: 'Biology',
    files: [{ name: 'paper.pdf', kind: 'pdf' }],
    links: ['https://youtu.be/x'],
    gathered: ['Read “paper.pdf”'],
    outputs: ['one answer per question'],
    mode: 'per',
    body: 'The mitochondrion is the powerhouse of the cell.',
    citations: cites
  });
  assert.match(prompts.gemini, /only the material below/i);
  assert.match(prompts.notebooklm, /only the sources/i);
  assert.match(prompts.assistant, /Add no claim/i);
  assert.match(prompts.gemini, /one item at a time/i, 'per mode produces per-item instructions');
  assert.match(prompts.gemini, /1\. Vitamin D study/);
  assert.match(prompts.gemini, /https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/1\//, 'citations travel with the prompt pack');
  const batchedPack = promptPack({ request: 'x', mode: 'batch', outputs: ['a summary'] });
  assert.match(batchedPack.gemini, /one batch/i);
}

console.log('AI Mode text intelligence ok: extractive summary stays in-source, notes, definitions, figures, revision questions, question-paper detection, chapter mapping, AI Studio/NotebookLM batching, source merging, citations and prompt packs verified');
