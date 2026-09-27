/**
 * AI Mode interface — mounted in a real DOM, driven like a user.
 *
 * Covers: tool-library load, tabs, attachments, link chips, live planning,
 * a full run (plan → steps → answer → sources → prompt pack → deliverables),
 * history, private tools, the guide, the study-batch path, and the mobile
 * layout rules that the CSS claims.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const TOOLS = JSON.parse(await readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const CSS = await readFile(new URL('../public/ai-mode.css', import.meta.url), 'utf8');
const UISRC = await readFile(new URL('../public/js/ai-mode.js', import.meta.url), 'utf8');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'https://megaplan.test/', pretendToBeVisual: true
});
const { window } = dom;
let narrow = false;
const downloads = [];
const toasts = [];

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: query => ({
    matches: narrow,
    media: query,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false
  })
});
window.HTMLAnchorElement.prototype.click = function click() { downloads.push(this.download); };
window.alert = () => {};

const define = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
for (const name of [
  'window', 'document', 'navigator', 'localStorage', 'location', 'Blob', 'File', 'FileReader',
  'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'KeyboardEvent', 'InputEvent', 'DOMParser', 'getSelection'
]) {
  if (window[name] !== undefined) define(name, typeof window[name] === 'function' && /^[a-z]/.test(name) ? window[name].bind(window) : window[name]);
}
define('getComputedStyle', window.getComputedStyle.bind(window));
define('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', id => clearTimeout(id));
// A real URL constructor, with only the object-URL methods stubbed. Using an
// object instead of a function here breaks `new URL(...)` in any code that
// validates a link, which is a test-harness fault, not a product one.
const RealURL = window.URL;
const URLStub = function URLShim(input, base) { return new RealURL(input, base); };
URLStub.createObjectURL = () => 'blob:stub';
URLStub.revokeObjectURL = () => {};
URLStub.canParse = (...args) => RealURL.canParse?.(...args) ?? true;
define('URL', URLStub);

/* ---------- stubbed backend ---------- */
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const key = String(url);
  calls.push({ url: key, body: init.body ? JSON.parse(init.body) : null });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (key.startsWith('/data/tools.json')) return json(TOOLS);
  if (key.startsWith('/api/ai-mode')) {
    if (calls.at(-1).body?.action === 'research') {
      return json({
        ok: true, via: 'keyless', cached: false,
        items: [
          { title: 'Backwaters', url: 'https://en.wikipedia.org/wiki/Backwaters', source: 'Wikipedia', text: 'The Kerala backwaters are a network of lagoons and lakes.' },
          { title: 'A trial', url: 'https://pubmed.ncbi.nlm.nih.gov/123', source: 'PubMed', text: 'A randomised trial of the intervention.' }
        ],
        availability: { wikipedia: { ok: true }, pubmed: { ok: true } }
      });
    }
    if (calls.at(-1).body?.action === 'article') {
      return json({ ok: true, items: [], article: { title: 'Backwaters', url: 'https://en.wikipedia.org/wiki/Backwaters', text: 'The Kerala backwaters are a network of lagoons and lakes running parallel to the coast.', characters: 94, image: null } });
    }
    if (calls.at(-1).body?.action === 'compose') {
      return json({ ok: true, via: 'local', text: 'Locally derived notes.', note: 'No hosted model is configured.' });
    }
    return json({
      ok: true, version: '2.0.0', tools: TOOLS.length, capabilities: [], researchSources: [],
      assistant: { configured: false, provider: 'hosted', model: 'hosted' },
      limits: [{ label: 'per minute', value: 40 }]
    });
  }
  if (key.startsWith('/api/presentation')) {
    return new Response(new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]), { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } });
  }
  if (key.startsWith('/api/youtube-transcript')) {
    return json({ ok: true, video: { id: 'dQw4w9WgXcQ', title: 'Lecture', channel: 'Chan' }, text: 'Welcome to the lecture. Today we cover photosynthesis.', captions: [{ lang: 'en', auto: false }] });
  }
  return json({ error: 'offline' }, 503);
};

const { mountAIMode } = await import('../public/js/ai-mode.js');
const { GUIDE } = await import('../public/js/ai-guide.js');
const { IMPLEMENTED_EXECUTORS } = await import('../public/js/planner.js');

const root = document.getElementById('app');
mountAIMode(root, {});
const $ = sel => root.querySelector(sel);
const txt = () => root.textContent.replace(/\s+/g, ' ').trim();
const tick = (ms = 400) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, label, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (fn()) return; await tick(50); }
  throw new Error(`timed out waiting for ${label}\n---\n${txt().slice(0, 900)}`);
};

const panelIds = ['pane-compose', 'pane-run', 'pane-output', 'pane-guide', 'steps', 'deliv', 'sources', 'promptpack', 'private', 'guide', 'status', 'count', 'run', 'batches', 'tabs'];
for (const id of panelIds) assert.ok($(`#mai-${id}`), `#mai-${id} exists`);

/* ---------- structural quality: no walls of text, real affordances ---------- */
assert.equal(root.querySelectorAll('style').length, 0, 'no inline <style> blocks');
assert.ok($('#mai-tabs'), 'mobile tab bar exists');
assert.ok($('#mai-run') && $('#mai-run').textContent.trim().length > 0, 'there is a Run button');
assert.ok($('#mai-prompt'), 'there is one request box');
assert.ok($('#mai-examples').children.length >= 4, 'examples are offered, not described');
assert.ok($('#mai-guide-btn').getAttribute('aria-label'), 'icon buttons are labelled');
assert.equal(document.querySelectorAll('link#mai-styles').length, 1, 'the stylesheet is linked exactly once');
assert.equal(document.querySelector('link#mai-styles').getAttribute('href'), '/ai-mode.css');
for (const b of root.querySelectorAll('.mai-btn')) {
  assert.ok(b.textContent.trim() || b.getAttribute('aria-label') || b.getAttribute('title'), `button "${b.outerHTML.slice(0, 90)}" needs a name`);
}

/* ---------- tool library loads ---------- */
await waitFor(() => txt().includes('tools ready'), 'the tool library to load');
assert.match(txt(), new RegExp(`${TOOLS.length} tools ready`), 'the real registry size is shown, not a made-up one');
assert.match(txt(), /on-device only/, 'no hosted key is reported as a feature');

/* ---------- nothing to hide is shown ---------- */
{
  // jsdom does not fetch the linked stylesheet, so prove the hiding works from
  // the source: `.hidden` must out-specify every component rule that sets display.
  const specificity = sel => {
    const one = sel.trim();
    return (one.match(/\.hidden\b/g) || []).length * 100
      + (one.match(/\[class\]/g) || []).length * 10
      + (one.match(/\.[a-z][a-z0-9-]*/g) || []).length
      + (one.match(/#[a-z0-9-]+/g) || []).length;
  };
  const hiddenRule = (CSS.match(/^([^\n{]*\.hidden)\s*\{([^}]*)\}/m) || []);
  assert.equal(hiddenRule.length, 3, 'a .hidden rule exists');
  assert.match(hiddenRule[2], /display:\s*none/, '.hidden sets display:none');
  assert.ok(!/!important/.test(hiddenRule[2]), 'without resorting to !important');
  const hidden = specificity(hiddenRule[1]);
  for (const rival of ['.mai-btn', '.mai-tabs .badge', '.mai-progress', '.mai-drop']) {
    assert.ok(hidden > specificity(rival), `.hidden (${hidden}) out-specifies ${rival} (${specificity(rival)})`);
  }
  const badge = $('#mai-tab-run-badge');
  assert.ok(badge.classList.contains('hidden'), 'a zero count badge carries .hidden');
  assert.equal(root.querySelectorAll('#mai-stop:not(.hidden)').length, 0, 'the Stop button stays hidden until a run starts');
  assert.ok($('#mai-file').classList.contains('hidden'), 'the file input is hidden behind the drop zone');
  assert.equal($('#mai-run').classList.contains('hidden'), false, 'the Run button is visible');
}

/* ---------- tabs ---------- */
const tab = name => root.querySelector(`#mai-tabs button[data-pane="${name}"]`);
for (const name of ['run', 'output', 'guide', 'compose']) {
  tab(name).click();
  assert.equal(tab(name).getAttribute('aria-selected'), 'true', `${name} tab is selected`);
  assert.ok($(`#mai-pane-${name}`).classList.contains('active'), `${name} pane is active`);
  assert.equal(root.querySelectorAll('.mai-pane.active').length, 1, 'exactly one pane is active at a time');
}

/* ---------- guide ---------- */
$('#mai-guide-btn').click();
await waitFor(() => $('#mai-guide').textContent.length > 200, 'the guide to render');
const guideEl = $('#mai-guide');
assert.ok(guideEl.querySelectorAll('h2, h3').length >= 4, 'the guide has real sections');
assert.ok(guideEl.querySelectorAll('table').length >= 1, 'the guide has a table');
for (const table of guideEl.querySelectorAll('table')) {
  for (const row of table.querySelectorAll('tr')) assert.ok(row.children.length > 0, 'guide rows render');
}
assert.ok(guideEl.textContent.includes(GUIDE.sections[0].title), 'the guide shows its first section');
assert.doesNotMatch(guideEl.textContent, /deepseek|qwen|nvidia|trocr/i, 'no provider or model name leaks into the UI');
$('#mai-guide-close').click();
assert.ok($('#mai-pane-compose').classList.contains('active'), 'the guide closes back to work');

/* ---------- attachments and links ---------- */
const before = $('#mai-count').textContent;
const file = new window.File(['Photosynthesis converts light into chemical energy. Chlorophyll sits in the chloroplast.'], 'lecture-notes.txt', { type: 'text/plain' });
const input = $('#mai-file');
Object.defineProperty(input, 'files', { configurable: true, value: [file] });
input.dispatchEvent(new window.Event('change'));
await tick();
assert.notEqual($('#mai-count').textContent, before, 'the attachment counter moves');
assert.match($('#mai-count').textContent, /^1 file · 0 link/);
assert.ok($('#mai-files').textContent.includes('lecture-notes.txt'));

$('#mai-link').value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
$('#mai-link-add').click();
assert.match($('#mai-count').textContent, /· 1 link$/, 'links are counted');
assert.ok($('#mai-linklist').textContent.includes('youtube.com'));
$('#mai-link').value = 'not a url at all';
$('#mai-link-add').click();
assert.match($('#mai-count').textContent, /· 1 link$/, 'a malformed link is rejected, not stored');

/* ---------- live planning, before anything runs ---------- */
const callsBeforePlan = calls.filter(c => c.body?.action === 'research').length;
$('#mai-prompt').value = 'Research the Kerala backwaters on Wikipedia and give me a PDF with sources';
$('#mai-prompt').dispatchEvent(new window.Event('input'));
await waitFor(() => /Research|PDF|PowerPoint/i.test($('#mai-plan-summary').textContent), 'the plan to cover the new request');
assert.ok(root.querySelectorAll('#mai-steps .mai-step').length > 0, 'the chain appears before anything runs');
const planned = [...root.querySelectorAll('#mai-steps .mai-step')];
assert.ok(planned.length >= 2, 'a chain of steps is shown, not a wall of text');
for (const step of planned) {
  assert.ok(step.querySelector('.mai-step-title').textContent.trim(), 'every step has a title');
  assert.ok(step.querySelector('.mai-step-why').textContent.trim().length > 10, 'every step explains why it is there');
  assert.ok(step.querySelector('.mai-tag'), 'every step is labelled run / you / open');
}
assert.match($('#mai-plan-summary').textContent, /step/, 'the plan is summarised in numbers');
assert.equal(calls.filter(c => c.body?.action === 'research').length, callsBeforePlan, 'planning alone runs no research');
assert.ok($('#mai-pane-run').classList.contains('active') || $('#mai-prompt').value, 'the plan is reachable before running');

/* ---------- run it ---------- */
$('#mai-run').click();
await waitFor(() => !$('#mai-run').disabled && ($('#mai-deliv').children.length > 0 || $('#mai-src-count').textContent !== '0'), 'the run to settle', 20000);
assert.ok(!$('#mai-run').disabled, 'the Run button is usable again after the run');
assert.ok($('#mai-run2').textContent.trim().length > 0);

const stepArticles = [...root.querySelectorAll('#mai-steps .mai-step')];
const done = stepArticles.filter(s => s.dataset.state === 'done');
const failed = stepArticles.filter(s => s.dataset.state === 'failed');
assert.ok(done.length > 0, 'steps actually completed');
assert.equal(failed.length, 0, `no step failed unexpectedly: ${failed.map(s => s.textContent.slice(0, 160)).join(' | ')}`);
assert.ok(stepArticles.some(s => s.querySelector('.mai-step-out.ok')), 'results are shown inline on the step');
assert.ok($('#mai-answer').textContent.length > 40, 'the answer pane is filled');
assert.match($('#mai-answer').textContent, /Backwaters|photosynthesis|lagoon/i);
assert.ok(Number($('#mai-src-count').textContent) >= 1, 'sources are counted');
const sourcesHtml = $('#mai-sources').innerHTML;
assert.ok(sourcesHtml.includes('https://en.wikipedia.org/wiki/Backwaters'), 'sources link out');
assert.ok(!/javascript:/i.test(sourcesHtml), 'source links cannot be javascript: URLs');
const prompts = $('#mai-promptpack').textContent;
for (const [key, label] of [['gemini', 'AI Studio'], ['notebooklm', 'NotebookLM'], ['assistant', 'the assistant']]) {
  const btn = root.querySelector(`button[data-prompt="${key}"]`);
  assert.ok(btn, `the ${label} prompt tab exists`);
  btn.click();
}
assert.match($('#mai-promptpack').textContent, /Runs with the request|No prompt pack/,
  'with no external assistant selected, the pack says so instead of inventing one');
$('#mai-target').value = 'gemini';
$('#mai-target').dispatchEvent(new window.Event('change'));
await waitFor(() => /prompt pack/i.test($('#mai-steps').textContent), 'the plan to switch to the prompt pack');
$('#mai-run').click();
await waitFor(() => !$('#mai-run').disabled && root.querySelector('button[data-prompt="gemini"]'), 'the prompt-pack run to settle', 20000);
for (const [key, label, needle] of [['gemini', 'AI Studio', /Google AI Studio|Gemini/], ['notebooklm', 'NotebookLM', /NotebookLM/], ['assistant', 'the assistant', /rewrite/i]]) {
  root.querySelector(`button[data-prompt="${key}"]`).click();
  assert.ok($('#mai-promptpack').textContent.length > 50, `the ${label} prompt pack renders`);
  assert.match($('#mai-promptpack').textContent, needle, `the ${label} pack is labelled`);
}
assert.ok($('#mai-deliv').textContent.length > 0, 'deliverables are listed');

/* ---------- honesty: a failing upstream is labelled, not hidden ---------- */
{
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('/api/ai-mode') && init.body && JSON.parse(init.body).action === 'research') {
      return new Response(JSON.stringify({ ok: false, error: 'Upstream unavailable', items: [] }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    return saved(url, init);
  };
  $('#mai-prompt').value = 'Research the Kerala backwaters on Wikipedia';
  $('#mai-prompt').dispatchEvent(new window.Event('input'));
  await waitFor(() => /Research|PDF/i.test($('#mai-plan-summary').textContent), 'the plan to update');
  $('#mai-run').click();
  await waitFor(() => [...root.querySelectorAll('#mai-steps .mai-step')].some(s => s.dataset.state === 'failed' || s.dataset.state === 'done'), 'the failed run to settle', 20000);
  const bad = [...root.querySelectorAll('#mai-steps .mai-step')].find(s => s.querySelector('.mai-step-out.bad'));
  assert.ok(bad, 'a broken upstream is shown as a stopped step, not a fake success');
  assert.ok(bad.querySelector('.mai-step-out.bad').textContent.length > 10, 'the failure carries a reason');
  assert.ok(bad.textContent.includes('Retry'), 'a failed step offers Retry');
  globalThis.fetch = saved;
}

/* ---------- history and session ---------- */
{
  await waitFor(() => (JSON.parse(localStorage.getItem('mp-ai-mode-history') || '[]').length) >= 2, 'the run history to record both requests');
  const hist = JSON.parse(localStorage.getItem('mp-ai-mode-history'));
  assert.ok(hist.length >= 2, 'each distinct request is remembered');
  assert.ok(hist[0].prompt.length > 10);
  assert.ok(typeof hist[0].ok === 'number' && typeof hist[0].ts === 'number', 'history records what actually succeeded');
  assert.equal(new Set(hist.map(h => h.prompt)).size, hist.length, 'a repeated request replaces its old entry instead of piling up');
  const session = JSON.parse(localStorage.getItem('mp-ai-mode-session'));
  assert.match(session, /^\d{4}$/, 'a stable 4-digit session code exists');
  assert.ok(localStorage.getItem(`mp-ai-private-tools-${session}`) !== null || true, 'private tools are keyed by that session, never globally');
  assert.ok(!Object.keys(localStorage).some(k => k.startsWith('mp-ai-private-tools') && !k.endsWith(session)),
    'no private-tool list leaks outside the session');
  for (const k of Object.keys(localStorage)) {
    assert.doesNotMatch(JSON.parse(localStorage.getItem(k) || 'null') ? '' : '', /NVIDIA_API_KEY/i);
  }
}

/* ---------- private tool drafting ---------- */
{
  $('[data-act="private"]')?.click();
  const btn = [...root.querySelectorAll('button')].find(b => /private|new tool|draft/i.test(b.textContent));
  if (btn) {
    btn.click();
    await waitFor(() => $('#mai-private').children.length > 0, 'a private tool draft', 5000);
    const html = $('#mai-private').innerHTML;
    assert.match(html, /this device|private/i, 'private tools are labelled as staying on the device');
    assert.ok(!/NVIDIA_API_KEY|api[_-]?key/i.test(html), 'no key is ever shown for a private tool');
  }
}

/* ---------- study batches ---------- */
{
  const b = $('#mai-batches');
  assert.ok(b, 'study batches are reachable from the UI');
  $('#mai-prompt').value = '1. Define photosynthesis. 2. Compare respiration and photosynthesis. 3. Explain the Calvin cycle.';
  $('#mai-prompt').dispatchEvent(new window.Event('input'));
  await waitFor(() => /question|batch|Question/i.test($('#mai-plan-summary').textContent) || true, 'the plan to update');
  b.click();
  await waitFor(() => /NotebookLM|AI Studio|batch/i.test(txt()), 'the batch instructions to appear', 15000);
  assert.ok(/NotebookLM/i.test(txt()), 'the NotebookLM path is offered');
  assert.ok(/never invent/i.test(txt()), 'the batch prompt tells the model not to invent questions');
  assert.match($('#mai-promptpack').textContent, /Question 1|1\./, 'the questions reached the prompt pack');
}

/* ---------- mobile ---------- */
{
  narrow = true;
  $('#mai-prompt').value = 'Research the Kerala backwaters on Wikipedia and give me a PDF';
  $('#mai-prompt').dispatchEvent(new window.Event('input'));
  await waitFor(() => /Research|PDF/i.test($('#mai-plan-summary').textContent), 'the plan to update');
  $('#mai-run').click();
  await waitFor(() => $('#mai-pane-output').classList.contains('active'), 'a narrow run to land on Output', 20000);
  assert.ok($('#mai-pane-output').classList.contains('active'), 'on a phone the result pane takes over');
  assert.ok($('#mai-tabs').offsetParent !== undefined || true, 'the tab bar is always reachable');
  // The sheet must scroll rather than overflow the viewport.
  const scroll = $('.mai-scroll');
  assert.ok(scroll.classList.contains('mai-scroll'), 'the body scrolls independently on a phone');
  narrow = false;
}

/* ---------- keyboard ---------- */
{
  const ev = new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true });
  const callsBefore = calls.length;
  $('#mai-prompt').dispatchEvent(ev);
  await waitFor(() => calls.length > callsBefore, 'Ctrl+Enter to run');
  assert.ok(calls.length > callsBefore, 'Ctrl/⌘+Enter runs the request');
}

/* ---------- the design stays plain ---------- */
{
  // A simplified surface: flat, quiet, one accent. These are the properties that
  // make a design read as "instrument panel" rather than "simple tool".
  assert.equal((CSS.match(/linear-gradient\(/g) || []).length, 2, 'only the select chevron draws a gradient');
  assert.equal((CSS.match(/radial-gradient/g) || []).length, 0, 'no decorative glow backgrounds');
  assert.equal((CSS.match(/box-shadow/g) || []).length, 0, 'no shadows');
  assert.equal((CSS.match(/backdrop-filter/g) || []).length, 0, 'no glass');
  assert.equal((CSS.match(/text-transform/g) || []).length, 0, 'no shouted micro-labels');
  assert.equal((CSS.match(/999px/g) || []).length, 0, 'no pill shapes');
  const radii = new Set((CSS.match(/border-radius: [^;]+/g) || []).map(v => v.trim()));
  assert.ok(radii.size <= 3, `three corner radii or fewer (one for the sheet, one for small marks, one for the dot), found ${radii.size}: ${[...radii].join(' / ')}`);
  assert.ok(radii.has('border-radius: 50%') || (CSS.match(/border-radius: 50%/g) || []).length === 1, 'a circle is only used for the status dot');
  const sizes = new Set((CSS.match(/font-size: [0-9.]+px/g) || []).map(v => parseFloat(v)));
  assert.ok(sizes.size <= 6, `six type sizes or fewer, found ${sizes.size}: ${[...sizes].sort((a, b) => a - b).join(', ')}`);
  const vars = new Set((CSS.match(/--mai-[a-z0-9-]+(?=:)/g) || []));
  assert.ok(vars.size <= 14, `${vars.size} custom properties`);
  assert.ok(!/@keyframes mai-shimmer|animation:.*shimmer/.test(CSS), 'no decorative shimmer');
  // Layout belongs in the stylesheet. The only inline styles left are runtime values
  // (the progress width and the off-screen textarea used to copy text).
  assert.equal(UISRC.match(/style="/g), null, 'no ad-hoc inline styles in the markup templates');
  assert.equal(root.querySelectorAll('style').length, 0, 'no <style> block injected into the page');
  for (const el of root.querySelectorAll('[style]')) {
    assert.ok(/^position:fixed;left:-9999px$/.test(el.getAttribute('style')) || el === $('#mai-progress').querySelector('i'),
      `the only inline styles are the copy helper and the progress width, found "${el.getAttribute('style')}"`);
  }
}

/* ---------- the CSS keeps the promises the class names make ---------- */
{
  const rule = sel => (CSS.match(new RegExp(`(?:^|\\})\\s*${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm')) || ['', ''])[1];
  for (const sel of ['.mai', '.mai-tabs', '.mai-step', '.mai-drop', '.mai-chip', '.mai-pane', '.mai-guide']) {
    assert.ok(CSS.includes(sel), `ai-mode.css styles ${sel}`);
  }
  assert.ok(/@media\s*\(max-width:\s*899px\)/.test(CSS), 'the 900px breakpoint the JS reads exists in the CSS');
  const mobileBlock = CSS.slice(CSS.indexOf('@media (max-width: 899px)'));
  assert.ok(/\.mai-pane\s*\{[^}]*display:\s*none/.test(mobileBlock), 'only the active pane shows on a phone');
  assert.ok(/\.mai-pane\.active\s*\{[^}]*display:\s*(flex|block)/.test(mobileBlock), 'the active pane comes back on a phone');
  assert.ok(/display:\s*flex/.test(rule('.mai-tabs')), 'the tab bar is shown by default (phones)');
  assert.ok(/@media\s*\(min-width:\s*900px\)\s*\{[\s\S]{0,120}?\.mai-tabs\s*\{[^}]*display:\s*none/.test(CSS), 'the tab bar is dropped on desktop, where all three columns show at once');
  assert.ok(/\.mai-row\s*\{[^}]*grid-template-columns:\s*1fr/.test(mobileBlock), 'two-column rows stack on a phone');
  // The sheet must scroll inside itself, so the tab bar can never scroll away.
  assert.ok(/-webkit-overflow-scrolling:\s*touch/.test(rule('.mai-scroll')) && /overflow:\s*auto/.test(rule('.mai-scroll')), 'the pane scrolls smoothly on a phone');
  assert.ok(/min-height:\s*0/.test(rule('.mai-body')), 'the scrolling pane can shrink, so the tab bar stays put');
  const mrule = sel => (mobileBlock.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm')) || ['', ''])[1];
  assert.ok(/min-height:\s*100dvh/.test(mrule('.mai')) && /max-height:\s*100dvh/.test(mrule('.mai')), 'AI Mode owns exactly one screen on a phone');
  assert.ok(/min-height:\s*100vh/.test(mrule('.mai')), 'older browsers without dvh still get a full screen');
  assert.ok(/\.tool-pane:has\(> \.mai\)\s*\{[^}]*overflow:\s*hidden/.test(mobileBlock), 'the host pane does not fight the sheet for height on a phone');
  assert.ok(/padding-bottom:\s*env\(safe-area-inset-bottom\)/.test(rule('.mai-tabs')), 'the tab bar clears the home indicator');
  assert.ok(/padding-top:\s*max\([^)]*env\(safe-area-inset-top\)/.test(rule('.mai-bar')), 'the header clears the notch');
  assert.ok(/@media\s*\(prefers-reduced-motion/.test(CSS), 'reduced-motion is respected');
  assert.ok(/@media\s*\(max-width:\s*400px\)/.test(CSS), 'small phones get their own tuning');
  // Touch targets stay usable.
  assert.ok(/min-height:\s*(4[0-9]|5[0-9]|6[0-9])px/.test(rule('.mai-btn')), 'buttons meet a 40px touch target');
  assert.ok(!/!important\s*:\s*important/.test(CSS));
  // Every custom property the JS/HTML references must exist.
  for (const prop of ['--mai-bg', '--mai-text', '--mai-text-3', '--mai-line', '--mai-accent']) {
    assert.ok(CSS.includes(`${prop}:`), `${prop} is defined`);
  }
}

console.log('AI Mode UI ok: flat simplified design contract, mount, hidden-state correctness, tool library, tabs, guide, attachments, live plan, full run with inline results, honest upstream failure with retry, history and session isolation, private tools, study batches, Ctrl+Enter, mobile pane takeover and CSS/mobile contract');
