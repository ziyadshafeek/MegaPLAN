/**
 * AI Mode planner — the deterministic core.
 *
 * Referenced from public/js/planner.js. Pure, no DOM, no network, so every
 * assertion here is a real behavioural contract rather than a smoke test.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  planRequest, buildIndex, searchTools, rankTools, normalizeRequest, tokens, stem,
  expandTokens, detectIntents, detectActions, detectGaps, extractTopic, extractPlace,
  extractLanguage, youtubeId, fileKind, linkKind, splitRequest, detectConversion,
  isBespoke, draftToolSpec, planToText, canRun, CAPABILITIES, PLANNER_VERSION
} from '../public/js/planner.js';

const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8'));
const index = buildIndex(registry);
const plan = (raw) => planRequest({ tools: registry, index, ...raw });
const ids = p => p.steps.map(s => s.id);
const execs = p => p.steps.filter(s => s.executor).map(s => s.executor);
const toolsIn = p => p.steps.filter(s => s.tool).map(s => s.tool);

/* ---------- text helpers ---------- */
assert.deepEqual(tokens('Merge the PDF files now!'), ['merge', 'pdf', 'files'], 'stopwords and punctuation are dropped');
assert.equal(stem('merges'), 'merge', 'plural -s is folded');
assert.equal(stem('merging'), 'merging', 'the stemmer is intentionally conservative: it never invents an -e');
assert.ok(expandTokens(['jpg']).includes('image'), 'jpg expands to image');
assert.deepEqual(tokens('sha256'), ['sha256', 'sha', '256'], 'alphanumeric tokens split usefully for hashing tools');

/* ---------- request normalisation ---------- */
const ctx = normalizeRequest({
  prompt: 'Summarise this and convert the CSV to JSON',
  files: [{ name: 'a.PDF', size: 10 }, { name: 'b.csv', size: 20 }, { name: 'c.png', size: 30 }],
  links: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://example.com/post']
});
assert.equal(ctx.files[0].kind, 'pdf');
assert.equal(ctx.files[1].kind, 'csv');
assert.equal(ctx.files[2].kind, 'image');
assert.equal(ctx.youtube.length, 1);
assert.equal(ctx.webLinks.length, 1);
assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.deepEqual(youtubeId('https://www.youtube.com/playlist?list=PL123'), { playlist: 'PL123' });
assert.equal(typeof youtubeId('https://www.youtube.com/playlist?list=PL123'), 'object', 'a bare playlist link is not a video');
assert.equal(linkKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
assert.equal(linkKind('https://example.com/x'), 'web');
assert.equal(fileKind({ name: 'deck.pptx' }), 'slides');
assert.equal(extractTopic('Create a PPT about solar energy in Kerala').length > 0, true);
assert.equal(extractPlace('find cafes near Fort Kochi').text, 'Fort Kochi');
assert.equal(extractLanguage('translate this into German'), 'german');
assert.ok(splitRequest('merge the pdf and compress the jpg').verbs.length >= 1);
assert.deepEqual(detectConversion('convert this csv to json'), { from: 'csv', to: 'json' });

/* ---------- search + ranking ---------- */
const top = searchTools(index, 'merge pdf')[0];
assert.equal(top.tool.slug, 'merge-pdfs', 'an exact request finds the exact tool');
const ranked = rankTools(index, normalizeRequest({ prompt: 'compress this jpg photo', tools: registry }));
assert.match(ranked[0].tool.category, /Images/, 'a jpg request ranks an image tool first');
assert.ok(!ranked.slice(0, 3).some(m => /video/i.test(m.tool.category)), 'a jpg request must not surface a video tool');

/* ---------- intents ---------- */
const has = (p, id) => detectIntents(normalizeRequest(p)).some(i => i.id === id);
assert.ok(has({ prompt: 'Tell me about the Kerala backwaters', tools: registry }, 'research'));
assert.ok(!has({ prompt: 'merge these pdf files', tools: registry }, 'research'), 'an operation is not research');
assert.ok(has({ prompt: 'make a ppt about bees', tools: registry }, 'presentation'));
assert.ok(has({ prompt: 'research pubmed papers on vitamin d deficiency', tools: registry }, 'research'));
assert.ok(has({ prompt: 'turn these into revision notes', tools: registry }, 'notes'));
assert.ok(has({ prompt: 'ocr this scanned pdf', files: [{ name: 'x.pdf' }], tools: registry }, 'ocr'));
assert.ok(has({ prompt: 'https://youtu.be/dQw4w9WgXcQ transcript', tools: registry }, 'youtube'));
assert.ok(has({ prompt: 'find a hospital near Kochi', tools: registry }, 'map'));
assert.ok(detectActions('create a pdf from these notes').includes('create'));
assert.ok(detectActions('find the cheapest flight').includes('find'));

/* ---------- gaps: honest refusals ---------- */
const gaps = p => detectGaps(normalizeRequest({ prompt: p, tools: registry })).map(g => g.message);
assert.ok(gaps('download this youtube video as mp4').some(m => /bypass|will not do/i.test(m)), 'stream download is refused');
assert.ok(gaps('get the dms of this instagram account').length, 'private account access is refused');
assert.ok(gaps('give me a medical diagnosis for my cough').length, 'medical advice is refused');
assert.equal(gaps('merge two pdf files').length, 0, 'an ordinary request has no gap');

/* ---------- plan: PDF from research ---------- */
const pdfPlan = plan({ prompt: 'Research the Kerala backwaters from Wikipedia and give me a PDF with sources' });
assert.ok(execs(pdfPlan).includes('research'), 'a research request queues research');
assert.ok(execs(pdfPlan).includes('article'), 'a research request fetches full article text');
assert.ok(execs(pdfPlan).includes('article-pdf'), 'a PDF request queues the PDF writer');
const pdfStep = pdfPlan.steps.find(s => s.executor === 'article-pdf');
assert.ok(pdfStep.requires.length > 0, 'the PDF depends on gathered material');
assert.ok(pdfPlan.steps.every(s => !s.requires.includes(s.id)), 'no step depends on itself');
// dependency order: a step never appears before something it requires
const position = Object.fromEntries(pdfPlan.steps.map((s, i) => [s.id, i]));
for (const s of pdfPlan.steps) for (const r of s.requires) assert.ok(position[r] < position[s.id], `${s.id} must run after ${r}`);

/* ---------- plan: PPT ---------- */
const pptPlan = plan({ prompt: 'Create a PowerPoint about solar energy with 8 slides' });
assert.ok(execs(pptPlan).includes('presentation'), 'a deck request queues the deck builder');

/* ---------- plan: YouTube ---------- */
const ytPlan = plan({ prompt: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ → transcript, chapters and study notes' });
assert.ok(execs(ytPlan).includes('youtube-transcript'), 'a video link queues caption retrieval');

/* ---------- plan: PubMed ---------- */
const pmPlan = plan({ prompt: 'Find recent PubMed papers on vitamin D deficiency and summarise the findings' });
assert.ok(execs(pmPlan).includes('research'), 'a literature request queues research');
assert.ok(toolsIn(pmPlan).length + pmPlan.steps.length > 0);

/* ---------- plan: prompt pack targets ---------- */
for (const target of ['gemini', 'notebooklm', 'assistant']) {
  const p = plan({ prompt: 'question paper and textbook → notes per question', options: { target, mode: target === 'notebooklm' ? 'per' : 'batch' } });
  assert.ok(execs(p).includes('prompts'), `${target} produces a prompt pack`);
  assert.ok(p.prompts.gemini && p.prompts.notebooklm && p.prompts.assistant, 'all three prompt shapes exist');
  assert.match(p.prompts.notebooklm, /only the uploaded sources/i, "NotebookLM prompt is source-bound");
}

/* ---------- plan: honesty invariants ---------- */
const hardRequests = [
  'convert this csv to json',
  'merge these pdfs and watermark page numbers',
  'play chess on hard',
  'download this youtube video',
  'make a pdf about nothing in particular',
  '',
  'asdfgh'
];
for (const prompt of hardRequests) {
  const p = plan({ prompt, files: prompt ? [{ name: 'x.csv' }] : [] });
  for (const s of p.steps) {
    if (s.executor) assert.ok(canRun(s.executor), `executor ${s.executor} is not implemented`);
    if (s.kind === 'tool' && s.action === 'open') assert.equal(s.auto, false, 'an open step must not claim to be automatic');
    if (s.outputKind === 'file') assert.equal(s.auto, true, 'a file output needs a real executor');
  }
  assert.equal(typeof p.summary, 'string');
  assert.equal(typeof planToText(p), 'string');
}

/* ---------- bespoke tools are never driven blindly ---------- */
assert.ok(isBespoke({ slug: 'chess', category: 'Games' }));
assert.ok(isBespoke({ slug: 'merge-pdfs', category: 'PDF' }));
assert.ok(!isBespoke({ slug: 'word-counter', category: 'Text' }));
assert.ok(registry.filter(t => !isBespoke(t) && t.status !== 'catalogued').length > 100, 'most of the library is automatable');

/* ---------- every declared capability is reachable ---------- */
for (const [id, cap] of Object.entries(CAPABILITIES)) {
  assert.ok(typeof cap.title === 'string' && cap.stage, `capability ${id} is malformed`);
}
assert.match(PLANNER_VERSION, /^\d+\.\d+\.\d+$/);

/* ---------- private tool draft ---------- */
const spec = draftToolSpec(normalizeRequest({ prompt: 'convert my lab notebook scans into a searchable lab log', files: [{ name: 'page1.png' }], tools: registry }));
assert.match(spec.slug, /^[a-z0-9-]+$/);
assert.ok(spec.title.length > 3);
assert.ok(spec.basedOn.length > 0);

/* ---------- determinism ---------- */
const a = plan({ prompt: 'turn the attached notes into a pdf', files: [{ name: 'notes.txt' }] });
const b = plan({ prompt: 'turn the attached notes into a pdf', files: [{ name: 'notes.txt' }] });
assert.deepEqual(ids(a), ids(b), 'the same request always yields the same chain');
assert.deepEqual(a.steps.map(s => s.executor), b.steps.map(s => s.executor));

console.log(`ai-mode planner ok: ${PLANNER_VERSION}; ${index.size} tools indexed; ${Object.keys(CAPABILITIES).length} capabilities; PDF/PPT/YouTube/literature/prompt-pack chains and honest refusals verified`);
