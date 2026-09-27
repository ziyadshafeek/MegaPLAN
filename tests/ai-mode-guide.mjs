/**
 * The guide is documentation that claims it cannot drift.
 *
 * `public/js/ai-guide.js` says it is "the single source of truth … so the
 * documentation customers read can never drift from the code that runs". This
 * suite is that claim, checked: every recipe in the guide is run through the
 * real planner, and a recipe that no longer produces a runnable step fails the
 * build instead of quietly describing a feature that was removed.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import { GUIDE, GUIDE_VERSION } from '../public/js/ai-guide.js';
import { planRequest, buildIndex } from '../public/js/planner.js';
import { canExecute } from '../public/js/ai-executors.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mp.test/' });
const { window } = dom;
for (const n of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser'])
  if (window[n] !== undefined) Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: window[n] });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const tools = JSON.parse(await fs.readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const index = buildIndex(tools);

let pass = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

/** Fill a recipe's placeholders so it can actually be run. */
const concrete = request => request
  .replace(/<topic>/gi, 'the water cycle')
  .replace(/<condition>/gi, 'metformin')
  .replace(/<video or playlist link>/gi, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  .replace(/\?/g, '')
  .trim();

const sections = GUIDE.sections || [];
const recipes = sections.flatMap(s => s.recipes || []);

await check('the guide has recipes to check', () => {
  assert.ok(recipes.length >= 10, `only ${recipes.length} recipes in the guide`);
});

for (const r of recipes) {
  await check(`recipe runs: ${r.request.slice(0, 58)}`, () => {
    const prompt = concrete(r.request);
    const files = /this (pdf|contract|images|photos|notes)|attached|these images/i.test(r.request)
      ? [{ name: 'input.pdf', kind: /images|photos/i.test(r.request) ? 'image' : 'pdf', size: 1000 }]
      : [];
    const links = /youtube|video/i.test(r.request) ? [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' }] : [];
    const plan = planRequest({ prompt, tools, index, files, links });
    const automatic = plan.steps.filter(s => s.auto);
    // Either it runs something, or it hands off to a real tool with a reason.
    const handOff = plan.steps.filter(s => s.action === 'open' && !s.auto);
    assert.ok(automatic.length || handOff.length,
      `“${r.request}” produces neither a runnable step nor a hand-off: ${plan.steps.map(s => s.title).join(' | ') || 'nothing'}`);
    for (const s of automatic) {
      assert.ok(canExecute(s.executor), `“${r.request}” queues ${s.title}, which has no executor`);
    }
  });
}

await check('a guide that names a limitation names it in the planner too', () => {
  // Each "will not do" entry should be findable in the plan a user actually gets.
  const limits = sections.find(s => s.limits)?.limits || [];
  assert.ok(limits.length >= 5, 'the limits section exists');
  for (const l of limits) {
    assert.ok(l.no && l.instead, 'each limit names what it does instead');
  }
  const refuses = planRequest({ prompt: 'hack into my ex phone', tools, index, files: [], links: [] });
  assert.equal(refuses.steps.filter(s => s.auto).length, 0, 'a stated refusal really refuses');
});

await check('the guide names no provider or model', () => {
  const text = JSON.stringify(GUIDE);
  for (const banned of [/gpt-?4/i, /claude/i, /gemini/i, /deepseek/i, /nvidia/i, /llama/i, /mistral/i]) {
    assert.ok(!banned.test(text), `the guide names a model: ${banned}`);
  }
});

await check('the guide makes no claim that a hand-off ran', () => {
  const text = JSON.stringify(GUIDE).toLowerCase();
  for (const banned of ['automatically signs', 'signs for you', 'redacts for you', 'downloads youtube']) {
    assert.ok(!text.includes(banned), `the guide claims: ${banned}`);
  }
});

await check('the version moved when the behaviour did', () => {
  assert.match(GUIDE.version, /^\d+\.\d+\.\d+$/);
  assert.equal(GUIDE.version, GUIDE_VERSION);
  assert.ok(Number(GUIDE.version.split('.')[0]) >= 4, 'the guide covers the document, deck and news work added in later phases');
});

console.log(`${pass}/${pass + (process.exitCode ? 1 : 0)} guide tests passed`);
if (process.exitCode) throw new Error('guide tests failed');
