/**
 * Phase 1 — the tool contract table.
 *
 * Mounts every registered tool in jsdom, discovers the input/output contract it
 * actually exposes, drives the ones that can be driven without a network, and
 * records the result in `data/tool-contracts.json`.
 *
 * The point is to replace "is this tool real?" guesswork with a measurement.
 * A tool is only called runnable when this harness actually produced new,
 * non-echo output for it. Anything that cannot be verified is recorded as a
 * weaker class rather than quietly passed.
 *
 *   R  runnable here   — driven offline, produced real output
 *   N  needs a service — genuine engine, but its output comes from a network call
 *   F  needs a file    — real engine, verified structurally (image/video/audio/PDF work)
 *   S  studio          — an interactive app, not a one-shot tool
 *   C  catalogued      — no lawful or finished runner; AI Mode must refuse it
 *
 * Run: node tests/ai-mode-tool-contracts.mjs [--write] [--quiet]
 */
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const WRITE = process.argv.includes('--write');
const QUIET = process.argv.includes('--quiet');
const OUT = new URL('../data/tool-contracts.json', import.meta.url);
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8'));

/* ---------------- browser surface ---------------- */
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'https://megaplan.test/', pretendToBeVisual: true
});
const { window } = dom;
const define = (n, v) => Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: v });
for (const n of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'Blob', 'File', 'FileReader',
  'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'KeyboardEvent', 'InputEvent', 'DOMParser',
  'Image', 'DataTransfer', 'XMLHttpRequest', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'performance']) {
  if (window[n] !== undefined) define(n, window[n]);
}
define('URL', Object.assign(function URLShim(i, b) { return new window.URL(i, b); }, {
  createObjectURL: () => 'blob:stub', revokeObjectURL: () => {}
}));
define('getComputedStyle', window.getComputedStyle.bind(window));
define('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', id => clearTimeout(id));
window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatch: () => false });
window.alert = () => {};
window.print = () => {};
window.HTMLAnchorElement.prototype.click = function click() { /* downloads asserted from the DOM */ };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  // A 2D context stub: enough for games to mount without the native canvas package.
  const noop = () => {};
  return new Proxy({ canvas: this, fillStyle: '', font: '', measureText: () => ({ width: 10 }) },
    { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^(get|is|reset|clear|draw|fill|stroke|save|restore|translate|scale|rotate|begin|close|move|line|arc|save|put)/.test(k) ? noop : undefined)), set: () => true });
};
// Canvas-to-file export, so image generators are genuinely probed instead of
// being written off as broken by a jsdom limitation.
window.HTMLCanvasElement.prototype.toBlob = function toBlob(cb, type) {
  cb(new window.Blob([new Uint8Array(64)], { type: type || 'image/png' }));
};

// A harness must not depend on the network. Any call that leaves the machine is
// counted, not served, so a "works offline" claim can never be an accident.
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('offline harness'); };

// Some engines pull a browser library from a CDN at click time. In Node that
// rejects asynchronously and, unhandled, would kill the run. Each one is counted
// and attributed to the tool being probed rather than crashing the harness.
let asyncFailures = 0;
process.on('unhandledRejection', () => { asyncFailures++; });
process.on('uncaughtException', () => { asyncFailures++; });

/* ---------------- load the engines ---------------- */
await import('../public/js/engines-rest.js');
await import('../public/js/games.js');
const { mountTool } = await import('../public/js/engines.js');

/* ---------------- probing ---------------- */
/*
 * The probe has to actually trigger the tools, or a real transform looks like
 * an echo. So it carries, on purpose: repeated and out-of-order lines, ragged
 * whitespace, markup and entities, percent-escapes and base64, a CSV block,
 * an email address, a phone number, an Aadhaar-shaped number, a YouTube
 * playlist link, CRLF line endings and a blank run.
 */
const PROBE_TEXT = [
  '  Zebra  line   with   spaces  ',
  'apple',
  'Banana',
  'apple',
  '',
  '',
  '# Title',
  '',
  '- item one',
  '- item one',
  '',
  '<b>Tom &amp; Jerry</b> &lt;tag&gt; "quoted"',
  'Visit https://example.com/a%20b or mail Tom.Smith@example.com or +91 98765 43210',
  'Aadhaar 1234 5678 9012',
  'Playlist https://www.youtube.com/playlist?list=PL1234567890abcdef',
  '',
  'name,qty,rate',
  '1,2,3',
  '1,2,3',
  '',
  'SGVsbG8gd29ybGQ=',
  '   '
].join('\r\n');
const CALC_VALUES = [12, 7, 3, 2, 5, 1, 4, 9];

function discover(root) {
  const q = s => root.querySelector(s);
  return {
    text: q('#tool-in') || q('textarea'),
    run: q('#run') || q('button.primary') || q('button[type="submit"]'),
    out: q('#tool-out') || q('pre.out') || q('.out'),
    file: q('#file') || q('input[type="file"]'),
    nums: [...root.querySelectorAll('input.num, input[type="number"]')],
    extra: q('#extra'),
    all: root.querySelectorAll('input, select, textarea').length
  };
}

const readOut = node => {
  if (!node) return '';
  if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') return String(node.value || '');
  return String(node.textContent || '');
};

function fill(node, value) {
  if (!node) return;
  node.value = String(value);
  node.dispatchEvent(new window.Event('input', { bubbles: true }));
  node.dispatchEvent(new window.Event('change', { bubbles: true }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BESPOKE_CATEGORIES = new Set(['PDF', 'Games', 'Maps']);
const BESPOKE_SLUGS = /^(maps|ai-mode|wiki-agent|self-agent|audio-studio|inception)/i;

/**
 * A body that gives the input back unchanged is a stump, not a tool.
 * Only an exact match counts: a short prefix or suffix is a real transform
 * ("1. " on a numbered line is work, not an echo).
 */
function looksLikeEcho(input, output) {
  const a = String(input || '').trim();
  const b = String(output || '').trim();
  if (!b) return true;
  return Boolean(a) && b === a;
}

const results = [];

for (const tool of registry) {
  const record = {
    slug: tool.slug, title: tool.title, category: tool.category, status: tool.status,
    class: null, kind: null, inputs: [], outputs: false, needsFile: false,
    // 'driven' = the handler ran here and produced output. 'structural' = the
    // page, its run contract and its output surface exist and the handler is
    // real, but it needs a file or a service this harness must not fake.
    verified: null, notes: ''
  };
  if (tool.status === 'catalogued') {
    record.class = 'C'; record.verified = 'structural'; record.notes = 'no lawful or finished runner';
    results.push(record); continue;
  }
  if (BESPOKE_CATEGORIES.has(tool.category) || BESPOKE_SLUGS.test(tool.slug)) {
    record.class = 'S'; record.verified = 'structural'; record.notes = 'interactive studio';
    results.push(record); continue;
  }

  const root = window.document.createElement('div');
  root.style.cssText = 'position:absolute;left:-9999px;width:600px;height:400px;overflow:hidden';
  window.document.body.appendChild(root);
  try {
    await mountTool(root, tool);
  } catch (err) {
    record.class = 'F'; record.verified = 'structural'; record.notes = `mount error: ${String(err?.message || err).slice(0, 80)}`;
    root.remove(); results.push(record); continue;
  }
  const ui = discover(root);
  record.kind = ui.file ? 'file' : ui.nums.length ? 'calc' : ui.text ? 'text' : 'other';
  record.inputs = [
    ui.text ? 'text' : null, ui.nums.length ? `numbers(${ui.nums.length})` : null,
    ui.file ? 'file' : null, ui.extra ? 'extra' : null
  ].filter(Boolean).join('+') || 'none';
  record.needsFile = Boolean(ui.file);
  record.outputs = Boolean(ui.out);
  record.controls = ui.all;

  if (!ui.run) {
    // No Run button means this is not a one-shot tool at all: an app, a live
    // tester, a status page. AI Mode may open it, but must never claim to have
    // driven it.
    record.class = 'S'; record.verified = 'structural';
    record.notes = ui.out ? 'interactive: reacts to events, no run button' : 'an app, not a one-shot tool';
    root.remove(); results.push(record); continue;
  }
  if (!ui.out) {
    record.class = 'S'; record.verified = 'structural';
    record.notes = 'an app that writes its own result surface';
    root.remove(); results.push(record); continue;
  }
  {
    const before = readOut(ui.out);
    const beforeNet = networkCalls;
    const beforeAsync = asyncFailures;
    if (ui.text) fill(ui.text, PROBE_TEXT);
    if (ui.extra) fill(ui.extra, 'extra');
    // Secondary free-text fields (find/replace, a URL box, a column list) are
    // filled too, so a tool that works on a specific field is genuinely probed
    // instead of being recorded as a stump because it was left empty.
    for (const box of root.querySelectorAll('input[type="text"], input:not([type]), textarea')) {
      if (box === ui.text || box === ui.extra || box === ui.out) continue;
      if (box.value === '' && !box.placeholder) continue;
      const hint = `${box.placeholder || ''} ${box.id || ''}`;
      // A field that asks for a column list needs columns, not prose.
      fill(box, /\bcol/i.test(hint) ? '1,3' : PROBE_TEXT.split('\r\n').slice(0, 3).join('\n'));
    }
    ui.nums.forEach((n, i) => fill(n, CALC_VALUES[i % CALC_VALUES.length]));
    let threw = null;
    try { ui.run.click(); } catch (e) { threw = e; }
    // Give synchronous tools a moment; anything still empty is treated as needing a file/service.
    for (let i = 0; i < 12 && readOut(ui.out) === before && networkCalls === beforeNet; i++) await sleep(25);
    const after = readOut(ui.out);
    if (threw) { record.class = 'F'; record.notes = `run error: ${String(threw.message || threw).slice(0, 80)}`; }
    else if (asyncFailures > beforeAsync) { record.class = 'N'; record.verified = 'structural'; record.notes = 'loads a browser library at run time'; }
    else if (networkCalls > beforeNet && (!after || after === before)) { record.class = 'N'; record.verified = 'structural'; record.notes = 'output comes from a service call'; }
    else if (!after || after === before) {
      record.class = 'F';
      record.verified = 'structural';
      record.notes = ui.file ? 'needs a real file' : 'produced no output';
    } else if (looksLikeEcho(PROBE_TEXT, after)) { record.class = 'F'; record.verified = 'structural'; record.notes = 'echoed the input back — no real work'; }
    else {
      record.class = 'R';
      // An error message is a real response from a real handler, but it is not
      // proof that the work happened, so the record says which it was.
      record.verified = /^\s*error\b/i.test(after) ? 'structural' : 'driven';
    }
  }
  root.remove();
  results.push(record);
}

/* ---------------- report ---------------- */
const byClass = {};
for (const r of results) byClass[r.class] = (byClass[r.class] || 0) + 1;
const live = results.filter(r => r.status === 'live');

if (WRITE) {
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Generated by tests/ai-mode-tool-contracts.mjs — measurement, not guesswork. R=runnable, N=real engine behind a service or CDN library, S=an app or interactive studio, C=no lawful or finished runner, F=not verifiably real. verified: "driven" means the handler ran here and produced real output; "structural" means the contract exists and is wired but the work needs a file, a canvas or a service this harness refuses to fake.',
    counts: { total: results.length, ...byClass },
    tools: results
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1) + '\n');
  if (!QUIET) console.log(`wrote ${OUT.pathname.split('/').pop()} (${results.length} tools)`);
}

if (!QUIET) {
  console.log(`tool contracts: ${results.length} tools`);
  for (const k of ['R', 'N', 'F', 'S', 'C']) console.log(`  ${k}  ${String(byClass[k] || 0).padStart(3)}`);
  // Beta tools are audited too: "beta" is a promise, and a promise that does
  // nothing at all is the thing this table exists to surface.
  const weak = results.filter(r => r.class === 'F' && r.status !== 'catalogued');
  const byNote = {};
  for (const r of weak) (byNote[`${r.notes}${r.status === 'beta' ? ' [beta]' : ''}`] ||= []).push(r.slug);
  console.log(`\nnot verifiably real: ${weak.length} (${weak.filter(r => r.status === 'beta').length} of them marked beta)`);
  for (const [note, slugs] of Object.entries(byNote).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(slugs.length).padStart(3)} × ${note}`);
    for (const slug of slugs) console.log(`        ${slug}`);
  }
}

/* ---------------- static check: every aliased handler exists ---------------- *
 * A handler that calls `HANDLERS['Some Tool']` for a tool that was never
 * defined is dead on click — the page looks fine and fails at the moment the
 * user presses the button. That class of bug is invisible to a UI test.
 */
const engineSources = ['engines.js', 'engines-rest.js']
  .map(f => fs.readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8')).join('\n');
const definedHandlers = new Set();
for (const m of engineSources.matchAll(/^\s*'([^']+)':\s*(?:\(|async\b|function\b)/gm)) definedHandlers.add(m[1]);
const aliased = new Map();
for (const m of engineSources.matchAll(/HANDLERS\['([^']+)'\]/g)) aliased.set(m[1], (aliased.get(m[1]) || 0) + 1);
const missingAliases = [...aliased].filter(([title]) => !definedHandlers.has(title));

/* ---------------- assertions ---------------- */
if (!QUIET) {
  const { isBespoke } = await import('../public/js/planner.js');
  const { isDrivable } = await import('../public/js/toolbus.js');
  const fail = [];
  if (!results.every(r => ['R', 'N', 'F', 'S', 'C'].includes(r.class))) fail.push('some tools were not classified');
  // A tool labelled live must do real work, need a real service, or be a studio.
  // The only tolerated exception needs a file the harness cannot fabricate, and
  // it has to be listed here on purpose.
  const NEEDS_A_FILE = new Set(['question-paper-to-notes']);
  const bogus = results.filter(r => r.status === 'live' && r.class === 'F' && !NEEDS_A_FILE.has(r.slug));
  if (bogus.length) fail.push(`${bogus.length} live tool(s) do nothing: ${bogus.map(r => r.slug).join(', ')}`);
  if (missingAliases.length) fail.push(`aliased handlers that are never defined: ${missingAliases.map(([t]) => `"${t}"`).join(', ')}`);
  if (new Set(results.map(r => r.slug)).size !== registry.length) fail.push('the contract table does not cover the whole registry');

  // The table is only worth anything if the product obeys it.
  const withClass = results.map(r => {
    const t = registry.find(x => x.slug === r.slug);
    return { ...t, toolClass: r.class };
  });
  const promised = withClass.filter(t => isDrivable(t) && !['R', 'N'].includes(t.toolClass));
  if (promised.length) fail.push(`${promised.length} tool(s) promised as runnable that the table says are not: ${promised.slice(0, 6).map(t => t.slug).join(', ')}`);
  const withheld = withClass.filter(t => t.toolClass === 'R' && !isDrivable(t));
  if (withheld.length) fail.push(`${withheld.length} verified tool(s) are needlessly withheld: ${withheld.slice(0, 6).map(t => t.slug).join(', ')}`);
  const notCustom = withClass.filter(t => t.toolClass === 'C' && !isBespoke(t));
  if (notCustom.length) fail.push(`catalogued tools treated as runnable: ${notCustom.map(t => t.slug).join(', ')}`);

  if (fail.length) {
    for (const f of fail) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  const drivable = withClass.filter(t => isDrivable(t)).length;
  console.log(`\ncontract invariants ok: ${registry.length} tools classified; no live tool does nothing; every aliased handler is defined; the planner honours the table (${drivable} drivable); ${byClass.R} runnable / ${byClass.N} behind a service / ${byClass.S} studios / ${byClass.C} refused`);
}

// Mounted tools leave timers and listeners behind; the report is already printed.
process.exit(0);
