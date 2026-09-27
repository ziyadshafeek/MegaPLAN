/**
 * AI Mode executors + document generation.
 *
 * The executors are driven with a stubbed `fetch` and a minimal DOM, so this is
 * a real behavioural test of the runtime: gather → transform → output, honest
 * failure, real PDF bytes, real deck outline.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import zlib from 'node:zlib';
import JSZip from 'jszip';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://mega-plan.test/' });
for (const name of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'Blob', 'URL', 'File', 'FileReader', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'location', 'history']) {
  if (dom.window[name] !== undefined) {
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
}

const downloads = [];
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
// Downloads are asserted through the executor result, not by navigating jsdom.
dom.window.HTMLAnchorElement.prototype.click = function click() { downloads.push(this.download); };

/* Stub the browser surface the executors touch. */
const realFetch = globalThis.fetch;
const routes = {};
const calls = [];
globalThis.fetch = async (url, init) => {
  const key = String(url);
  calls.push({ url: key, init });
  for (const [pattern, responder] of Object.entries(routes)) {
    if (key.includes(pattern)) {
      const out = typeof responder === 'function' ? await responder(key, init) : responder;
      if (out instanceof Response) return out;
      if (out && out.__raw) return new Response(out.__raw, { status: out.status || 200 });
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ error: `no stub for ${key}` }), { status: 404 });
};
const json = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });

const { runStep, canExecute, buildBatchesLocally, batchToMarkdown, buildOutline } = await import('../public/js/ai-executors.js');
const { IMPLEMENTED_EXECUTORS } = await import('../public/js/planner.js');

/* ---------- the executor contract matches the planner ---------- */
for (const id of IMPLEMENTED_EXECUTORS) assert.equal(canExecute(id), true, `${id} is declared but not implemented`);
assert.equal(canExecute('does-not-exist'), false);

/* ---------- research gather ---------- */
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action === 'research') {
    return { groups: [
      { id: 'wikipedia', label: 'Wikipedia', ok: true, items: [{ id: 'w1', kind: 'encyclopedia', title: 'Backwaters', snippet: 'Lagoons in Kerala', url: 'https://en.wikipedia.org/?curid=1', source: 'Wikipedia' }] },
      { id: 'crossref', label: 'Crossref', ok: false, error: 'HTTP 429', items: [] }
    ], items: [{ id: 'w1', kind: 'encyclopedia', title: 'Backwaters', snippet: 'Lagoons in Kerala', url: 'https://en.wikipedia.org/?curid=1', source: 'Wikipedia' }], availability: {} };
  }
  if (body.action === 'article') {
    return { article: { id: 'a1', kind: 'encyclopedia-article', title: 'Backwaters', text: 'Kerala backwater text. '.repeat(200), characters: 4000, url: 'https://en.wikipedia.org/wiki/Backwaters', source: 'Wikipedia' }, items: [] };
  }
  if (body.action === 'compose') return { ok: true, via: 'local', text: 'LOCAL NOTES BODY' };
  return {};
};
routes['/api/ai-mode:document'] = null;
delete routes['/api/ai-mode:document'];

const researchStep = { id: 's1', executor: 'research', params: { query: 'kerala backwaters' } };
const researchResult = await runStep(researchStep, { results: {} });
assert.equal(researchResult.ok, true);
assert.match(researchResult.summary, /1 result\(s\)/);
assert.match(researchResult.summary, /unavailable: Crossref/, 'a dead source is named in the summary');

/* ---------- article gather ---------- */
const articleResult = await runStep({ id: 's2', executor: 'article', params: { query: 'Kerala Backwaters' } }, { results: { s1: researchResult } });
assert.equal(articleResult.ok, true);
assert.match(articleResult.summary, /4,000 characters/);
assert.ok(articleResult.text.includes('Kerala backwater text'));

/* ---------- article missing → honest failure ---------- */
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action === 'article') return { __raw: JSON.stringify({ error: 'No article found for that title.' }), status: 404 };
  return {};
};
const missing = await runStep({ id: 's2', executor: 'article', params: { query: 'zzzz' } }, { results: {} });
assert.equal(missing.ok, false);
assert.match(missing.summary, /No article found/);

/* ---------- notes transform runs on-device with no assistant ---------- */
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action === 'compose') return { ok: true, via: 'local', text: 'LOCAL NOTES BODY' };
  return {};
};
const notes = await runStep({ id: 's3', executor: 'outline', title: 'Build notes', params: { style: 'notes' } }, {
  results: { s1: researchResult, s2: articleResult }
});
assert.equal(notes.ok, true);
assert.match(notes.summary, /Structured notes/);
assert.ok(notes.text.length > 200);

const emptyNotes = await runStep({ id: 's3', executor: 'outline', params: {} }, { results: {} });
assert.equal(emptyNotes.ok, false, 'notes with no source say so instead of inventing');

const combine = await runStep({ id: 's4', executor: 'combine', params: {} }, { results: { s1: researchResult } });
assert.equal(combine.ok, true);
assert.match(combine.summary, /Merged/);

/* ---------- prompt pack ---------- */
const prompts = await runStep({ id: 's5', executor: 'prompts', params: { target: 'notebooklm', mode: 'per' } }, {
  results: { s1: researchResult },
  plan: { request: { prompt: 'notes per question', files: [], links: [] }, steps: [{ id: 's5', title: 'notes' }] }
});
assert.equal(prompts.ok, true);
assert.match(prompts.text, /only the sources/i);

/* ---------- assistant step degrades to local ---------- */
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action === 'compose') return { ok: true, via: 'local', assistant: false, text: 'LOCAL NOTES BODY', note: 'no hosted assistant' };
  return {};
};
const assistant = await runStep({ id: 's6', executor: 'assistant', params: { task: 'notes' } }, { results: { s1: researchResult } });
assert.equal(assistant.ok, true);
assert.match(assistant.summary, /On-device result/);
assert.equal(assistant.via, 'local');

/* ---------- file read ---------- */
const textFile = new dom.window.File(['line one\nline two\nline three'], 'notes.txt', { type: 'text/plain' });
const fileRead = await runStep({ id: 's7', executor: 'file-read', params: { fileIndex: 0 } }, { files: [textFile], results: {} });
assert.equal(fileRead.ok, true);
assert.match(fileRead.text, /line three/);
const missingFile = await runStep({ id: 's7', executor: 'file-read', params: { fileIndex: 9 } }, { files: [textFile], results: {} });
assert.equal(missingFile.ok, false);

/* ---------- map chain ---------- */
routes['nominatim.openstreetmap.org'] = () => json([{ display_name: 'Fort Kochi, Kerala', lat: '9.9658', lon: '76.2422', type: 'town' }]);
routes['overpass-api.de'] = { elements: [{ lat: 9.96, lon: 76.24, tags: { amenity: 'cafe', name: 'A Cafe', 'addr:street': 'Beach Road' } }] };
routes['api.open-meteo.com'] = { current: { temperature_2m: 31, apparent_temperature: 33, relative_humidity_2m: 80, wind_speed_10m: 12 }, daily: { temperature_2m_max: [33, 32], temperature_2m_min: [26, 26] } };
routes['router.project-osrm.org'] = { routes: [{ distance: 24300, duration: 1860 }] };
const place = await runStep({ id: 'm1', executor: 'map-place', params: { query: 'Fort Kochi' } }, { results: {} });
assert.equal(place.ok, true);
const nearby = await runStep({ id: 'm2', executor: 'map-nearby', params: { poi: 'cafe', radius: 2000, origin: 'm1' } }, { results: { m1: place } });
assert.equal(nearby.ok, true);
assert.match(nearby.summary, /1 cafe within 2 km/);
const weather = await runStep({ id: 'm3', executor: 'map-weather', params: { query: 'Fort Kochi', origin: ['m1'] } }, { results: { m1: place } });
assert.equal(weather.ok, true);
assert.match(weather.summary, /31°C/);
const route = await runStep({ id: 'm4', executor: 'map-route', params: { from: 'Fort Kochi', to: 'Kochi', origin: [] } }, { results: {} });
assert.equal(route.ok, true);
assert.match(route.summary, /24\.3 km/);
const noPlace = await runStep({ id: 'm1', executor: 'map-place', params: {} }, { results: {} });
assert.equal(noPlace.ok, false, 'an empty place query fails honestly');

/* ---------- YouTube executor ---------- */
routes['/api/youtube-transcript'] = { ok: true, videoId: 'dQw4w9WgXcQ', title: 'Lecture 3', text: 'Today we discuss entropy.', count: 12, segments: [{ start: 0, duration: 2, text: 'Today we discuss entropy.' }], isAutoGenerated: true, language: 'en' };
const yt = await runStep({ id: 'y1', executor: 'youtube-transcript', params: { url: 'https://youtu.be/dQw4w9WgXcQ' } }, { results: {} });
assert.equal(yt.ok, true);
assert.match(yt.summary, /auto-generated/);
routes['/api/youtube-transcript'] = { error: 'No caption track' };
const ytFail = await runStep({ id: 'y1', executor: 'youtube-transcript', params: { url: 'https://youtu.be/x' } }, { results: {} });
assert.equal(ytFail.ok, false);

/* ---------- real PDF bytes ---------- */
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action === 'document') {
    return { __raw: null, __status: 0 };
  }
  return {};
};
// Serve a genuine PDF built by the server-side writer.
const { buildPdf } = await import('../lib/ai-mode/pdf.js');
const pdfBytes = await buildPdf({
  title: 'Kerala Backwaters',
  subtitle: 'A source-linked brief',
  sections: [
    { heading: 'Overview', body: 'The backwaters are a network of lagoons and lakes.\n\n- 900 km of waterways\n- Brackish to fresh water', bullets: ['A lagoon system parallel to the coast'] },
    { heading: 'Numbers', body: 'Coverage is about 900 kilometres.' }
  ],
  sources: [{ title: 'Kerala Tourism', url: 'https://keralatourism.org/backwaters', source: 'Kerala Tourism' }]
});
routes['/api/ai-mode'] = (url, init) => {
  const body = JSON.parse(init.body);
  if (body.action !== 'document') return {};
  return new Response(Buffer.from(pdfBytes), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
};
const pdfStep = await runStep({ id: 'p1', executor: 'article-pdf', params: { title: 'Kerala Backwaters' } }, {
  results: { s1: researchResult },
  plan: { request: { prompt: 'x' } }
});
assert.equal(pdfStep.ok, true, pdfStep.summary);
assert.match(pdfStep.summary, /megaplan-kerala-backwaters\.pdf/);
assert.ok(downloads.includes('megaplan-kerala-backwaters.pdf'), 'the PDF really reaches the browser as a download');
assert.ok(pdfStep.artifact.size > 1000);

const buf = Buffer.from(pdfBytes);
const pdfText = buf.toString('latin1');
assert.match(pdfText, /^%PDF-1\./);
assert.match(pdfText.trimEnd(), /%%EOF$/);
const pages = (pdfText.match(/\/Type \/Page[^s]/g) || []).length;
assert.ok(pages >= 3, `cover + sections + sources produced ${pages} pages`);
// The page content is hex-encoded; decode it and assert the real text is drawn.
const streams = [];
let i = 0;
while (true) {
  const a = buf.indexOf('stream', i, 'latin1');
  if (a < 0) break;
  let j = a + 6;
  while (buf[j] === 0x0d || buf[j] === 0x0a) j++;
  const b = buf.indexOf('endstream', j, 'latin1');
  if (b < 0) break;
  try { streams.push(zlib.inflateSync(buf.subarray(j, b)).toString('latin1')); } catch { /* not deflate */ }
  i = b + 9;
}
const content = streams.join('\n');
const drawn = [...content.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)]
  .map(m => Buffer.from(m[1], 'hex').toString('latin1'))
  .join(' | ');
for (const needle of ['Kerala Backwaters', 'Overview', 'Numbers', 'Kerala Tourism', 'keralatourism.org/backwaters']) {
  assert.ok(drawn.includes(needle), `"${needle}" must be drawn into the PDF`);
}

/* ---------- real PPTX from a researched outline ---------- */
const { planDeck, makePresentation } = await import('../lib/presentation-deck.js');
const outline = buildOutline('Kerala Backwaters', researchResult.items, 'A short brief about the lagoons.');
assert.ok(outline.length >= 1, 'a research result produces a deck outline');
const allBullets = outline.flatMap(s => s.bullets);
assert.ok(allBullets.length >= 1);
assert.ok(allBullets.some(b => b.source && b.source.startsWith('https://')), 'sourced bullets keep their link');
const deckPlan = planDeck({ topic: 'Kerala Backwaters', outline, research: { articles: [], images: [] }, slideCount: 5 });
assert.equal(deckPlan.fromOutline, true);
assert.ok(deckPlan.references.length >= 1, 'the deck keeps the source links');
const pptx = await makePresentation(deckPlan);
const zip = await JSZip.loadAsync(pptx);
const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f));
assert.ok(slideFiles.length >= 3, `cover + body + sources produced ${slideFiles.length} slides`);
const allSlides = (await Promise.all(slideFiles.map(f => zip.file(f).async('string')))).join(' ');
assert.match(allSlides, /Lagoons in Kerala|Backwaters/);
assert.match(allSlides, /Sources &amp; image references/);

// An outline with no material must fail rather than produce an empty deck.
assert.throws(() => planDeck({ topic: 'Nothing', outline: [], research: { articles: [] } }), /No source text/);

/* ---------- study batches (AI Studio / NotebookLM) ---------- */
const batches = buildBatchesLocally({
  paper: '1. Define photosynthesis.\n2. Compare respiration and photosynthesis.\n3. Explain the Calvin cycle.',
  textbook: 'Chapter 1: Cell structure\nChapter 2: Photosynthesis',
  mode: 'per'
});
assert.equal(batches.totalQuestions, 3);
assert.equal(batches.groups.length, 3);
const md = batchToMarkdown(batches);
assert.match(md, /NotebookLM shape/);
assert.match(md, /never invent one/);
const batchShape = buildBatchesLocally({ paper: '1. A\n2. B\n3. C\n4. D\n5. E', textbook: 'Chapter 1', mode: 'batch', batchSize: 2 });
assert.match(batchToMarkdown(batchShape), /AI Studio shape/);

/* ---------- toolbus refuses bespoke tools rather than clicking blindly ---------- */
const toolResult = await runStep({ id: 'tb', executor: 'toolbus', tool: 'merge-pdfs', params: {} }, { tools: [{ slug: 'merge-pdfs', title: 'Merge PDFs', category: 'PDF' }], files: [], results: {} });
assert.equal(toolResult.ok, false, 'the PDF studio is never driven blindly');
assert.match(toolResult.summary, /Open the tool/);
const unknownTool = await runStep({ id: 'tb', executor: 'toolbus', tool: 'nope', params: {} }, { tools: [], results: {} });
assert.equal(unknownTool.ok, false);

/* ---------- private tool draft ---------- */
const draft = await runStep({ id: 'pt', executor: 'new-tool', params: {} }, { prompt: 'turn my lab notebook scans into a searchable log', files: [], tools: [] });
assert.equal(draft.ok, true);
assert.ok(draft.spec.slug.length > 2);
assert.equal(draft.private, true);

/* ---------- a throwing executor never breaks the chain ---------- */
const boom = await runStep({ id: 'x', executor: 'research', params: { query: 'kerala' } }, { results: {}, files: [] });
assert.equal(typeof boom.ok, 'boolean');

globalThis.fetch = realFetch;
dom.window.close();

console.log(`AI Mode execution ok: ${IMPLEMENTED_EXECUTORS.length} executors, research/article/notes/prompts/assistant/files/maps/YouTube/toolbus/private-tool, real ${/^%PDF/.test(pdfText) ? 'PDF' : '?'} with drawn text, real PPTX from a researched outline, study batching and honest failures verified`);
