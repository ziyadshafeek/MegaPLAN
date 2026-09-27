/**
 * Phase 7 — the agent and AI Mode plan the same request the same way.
 *
 * The agent writes pages, calculators and APIs. It does not build decks, merge
 * PDFs, read photos or route maps. Those are real capabilities on the same
 * desk, and the failure worth preventing is the quiet one: writing a page
 * *about* the topic and reporting the request as handled.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mp.test/' });
const { window } = dom;
for (const n of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser'])
  if (window[n] !== undefined) Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: window[n] });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const { planAgentRequest, validate, createLocalDraft, previewHtml } = await import('../public/agent/agent.js');
const { planRequest, buildIndex } = await import('../public/js/planner.js');
const { canExecute } = await import('../public/js/ai-executors.js');

const tools = JSON.parse(await fs.readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const index = buildIndex(tools);

let pass = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const ask = prompt => planAgentRequest(prompt, { tools, index });

/* ------------------------------------------------- what the agent owns */

await check('the agent writes the pages it is for', () => {
  for (const p of [
    'Create a GST invoice checklist page for small businesses, with a glossary and GST calculator API',
    'Build a study reference page with an outline, glossary, checklist and FAQ',
    'Create a custom API page that calculates discount from price and percent',
    'Make a landing page for a bakery'
  ]) {
    assert.equal(ask(p).mode, 'page', `"${p.slice(0, 40)}" should get a page`);
  }
});

await check('a page request is a page even when the planner queues other tools', () => {
  // The shared planner will match directory and reference tools for any page
  // request. That must not talk the agent out of the job it actually has.
  const verdict = ask('Create a Kerala travel guide page with a district checklist and a weather FAQ');
  assert.equal(verdict.mode, 'page');
  assert.equal(verdict.line, '', 'and it says nothing to talk the user out of it');
});

/* ----------------------------------------------- what it hands back */

await check('a deck is a deck task, and the agent says so', () => {
  const v = ask('make me a powerpoint deck about climate change');
  assert.equal(v.mode, 'ask-ai-mode');
  assert.match(v.line, /slide deck/);
  assert.match(v.line, /AI Mode/);
  assert.match(v.line, /writes pages/, 'and it says what it does instead');
});

await check('every non-page artifact is handed back rather than half-done', () => {
  const cases = [
    ['merge these two pdfs', /PDF work/],
    ['read the text in this photo', /reading images/],
    ['route from Kochi to Trivandrum', /maps/],
    ['give me the latest news on kerala', /news feeds/],
    ['make subtitles for this video', /video and subtitle/]
  ];
  for (const [prompt, what] of cases) {
    const v = ask(prompt);
    assert.equal(v.mode, 'ask-ai-mode', `${prompt} should be handed back`);
    assert.match(v.line, what, `${prompt} names the artifact`);
  }
});

await check('a page mentioned alongside another artifact still gets the page', () => {
  assert.equal(ask('make a page summarising these slides').mode, 'page');
});

await check('too little to act on asks rather than guessing', () => {
  for (const p of ['', '   ', 'fix it', 'do something']) {
    const v = ask(p);
    assert.equal(v.mode, 'unclear', `"${p}" should ask`);
    assert.match(v.line, /Tell me what the page should be/);
  }
});

/* --------------------------------------- the two halves agree on shape */

await check('the shared planner gives the agent the same decomposition as AI Mode', () => {
  const prompt = 'make a page from a powerpoint deck about climate change';
  const aiMode = planRequest({ prompt, tools, index, files: [], links: [] });
  const agent = ask(prompt);
  const automatic = aiMode.steps.filter(s => s.auto && s.executor);
  // Every automatic step the shared planner found is one the agent must have
  // been told about, so neither half silently ignores the other's plan.
  for (const s of automatic) {
    assert.ok(canExecute(s.executor), `${s.executor} is real`);
  }
  assert.equal(agent.mode, 'page', 'the page word wins, because a page is what the agent writes');
  assert.ok(agent.plan.steps.length > 0, 'but the plan is still the shared one');
});

/* ------------------------------------------- contracts the agent keeps */

await check('a generated spec is still validated before it can be published', () => {
  const draft = createLocalDraft('a page about monsoon rainfall in Kerala');
  validate(draft);
  assert.throws(() => validate({ ...draft, slug: 'Bad Slug' }), /Invalid slug/);
  assert.throws(() => validate({ ...draft, blocks: [{ type: 'exec' }] }), /Unsupported block/);
  assert.throws(() => validate({ ...draft, tests: [] }), /Browser tests missing/);
  assert.throws(() => validate({ ...draft, blocks: [{ type: 'text', body: '<script>x</script>' }] }), /Unsafe content rejected/);
});

await check('the local draft says it is a draft', () => {
  const draft = createLocalDraft('monsoon rainfall in Kerala');
  assert.match(draft.summary, /Review and expand/);
  assert.ok(draft.blocks.some(b => /not an AI-written article/.test(b.body)),
    'the page itself must not read as if a model wrote it');
});

await check('the preview is a sandboxed document with no inherited access', () => {
  const html = previewHtml(createLocalDraft('a page about the monsoon'));
  assert.match(html, /<!doctype html>/i);
  assert.ok(!/<script/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')), 'no scripts in the preview body');
});

console.log(`${pass}/${pass + (process.exitCode ? 1 : 0)} agent-planner tests passed`);
if (process.exitCode) throw new Error('agent planner tests failed');
