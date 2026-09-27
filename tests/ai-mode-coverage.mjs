/**
 * Phase 6 — request coverage.
 *
 * The claim under test is the one that matters for a long-lived tool: an
 * arbitrary request either produces something that can actually run, or an
 * explanation that is specific enough to be useful. "Nothing to do" is the
 * one answer that is always wrong, and so is a plan whose only step is a tool
 * that cannot run.
 *
 * These are deliberately varied — verbs the planner has never seen, formats it
 * was not written for, half-finished sentences, and requests that name a
 * capability that does not exist. A coverage suite is only worth having if
 * some of these were failures when it was written.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import { planRequest, buildIndex } from '../public/js/planner.js';
import { canExecute, EXECUTOR_NAMES } from '../public/js/ai-executors.js';
import { IMPLEMENTED_EXECUTORS } from '../public/js/planner.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mp.test/' });
const { window } = dom;
for (const n of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser'])
  if (window[n] !== undefined) Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: window[n] });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const tools = JSON.parse(await fs.readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const index = buildIndex(tools);

const PDF = { name: 'contract.pdf', kind: 'pdf', size: 90000 };
const PDF2 = { name: 'annex.pdf', kind: 'pdf', size: 80000 };
const IMG = { name: 'label.png', kind: 'image', size: 40000 };
const IMG2 = { name: 'page2.png', kind: 'image', size: 41000 };
const TXT = { name: 'notes.txt', kind: 'text', size: 2000 };

/** [prompt, files] pairs. Grouped by what the user is asking for, not by tool. */
const CASES = [
  // ---- the file is there, and the job is plain
  ['merge these two pdfs', [PDF, PDF2]],
  ['split this pdf', [PDF]],
  ['delete pages 3 to 7 from this pdf', [PDF]],
  ['rotate every page of this pdf by 90 degrees', [PDF]],
  ['add page numbers to this pdf', [PDF]],
  ['compress this pdf to under 2 MB', [PDF]],
  ['extract the images from this pdf', [PDF]],
  ['watermark this pdf with "DRAFT"', [PDF]],
  ['make this pdf two-up', [PDF]],
  ['read this pdf and tell me what it says', [PDF]],
  ['how many pages does this pdf have', [PDF]],
  ['what is the title of this pdf', [PDF]],
  ['reorder this pdf so the annex comes first', [PDF, PDF2]],

  // ---- questions about a document
  ['what dose is recommended in this pdf', [PDF]],
  ['find the termination clause in this pdf', [PDF]],
  ['where does it mention the penalty', [PDF]],
  ['who is the escalation contact on nights', [PDF]],
  ['when does the agreement start', [PDF]],
  ['which page talks about insurance', [PDF]],
  ['does this pdf mention data retention', [PDF]],
  ['list every date in this document', [PDF]],

  // ---- jobs that only look like questions
  ['summarise this contract', [PDF]],
  ['split this pdf into single pages', [PDF]],
  ['remove page 12 of this pdf', [PDF]],
  ['compare these two contracts', [PDF, PDF2]],

  // ---- images
  ['read the text in this photo', [IMG]],
  ['what does this label say', [IMG]],
  ['make a slide deck from these images', [IMG, IMG2]],
  ['extract the table from this screenshot', [IMG]],
  ['ocr both of these whiteboard photos', [IMG, IMG2]],

  // ---- text and data files
  ['summarise these notes', [TXT]],
  ['turn these notes into questions', [TXT]],
  ['make flashcards from this file', [TXT]],

  // ---- research, no attachment
  ['research the history of metformin', []],
  ['what is a Kalman filter', []],
  ['find papers on intermittent fasting', []],
  ['who was Rosalind Franklin', []],
  ['what is the latest news on kerala', []],
  ['give me the headlines today', []],
  ['tell me about the Kerala backwaters', []],

  // ---- writing and study output
  ['write an essay on the history of tea', []],
  ['make study notes on photosynthesis', []],
  ['build a prompt pack for a job interview', []],
  ['explain quantum computing simply', []],

  // ---- places and routes
  ['nearest hospital', []],
  ['route from Kochi to Trivandrum', []],
  ['weather in Chennai', []],
  ['where is the Marine Drive', []],

  // ---- links
  ['summarise this https://en.wikipedia.org/wiki/Tea', []],
  ['read this youtube link https://www.youtube.com/watch?v=dQw4w9WgXcQ', []],

  // ---- documents to produce
  ['make a pdf about the water cycle', []],
  ['create a slide deck about climate change', []],

  // ---- deliberately awkward: unfinished, vague, or out of scope
  ['help', []],
  ['and then?', []],
  ['???', []],
  ['', []],
  ['   ', []],

  // ---- long, run-on, the way people actually type
  ['ok so I have this contract pdf and I need to know what the penalty clause says and also if you can pull the pages out into a separate pdf', [PDF]],
  ['hey can you like merge these two documents together for me please thanks', [PDF, PDF2]],
  ['I want to build a presentation from a photo of a whiteboard photo', [IMG]]
];

/**
 * What each group of requests must produce. A plan that runs the right thing
 * passes; so does one that refuses specifically. What must never pass is a plan
 * that runs something irrelevant and reports success.
 *
 *   'runs'    — at least one of these executors is queued and automatic
 *   'refuses' — nothing is queued to run, and the plan says why in words
 */
const EXPECT = [
  [/^(merge these two|split this pdf|delete pages|rotate every|add page numbers|compress this|extract the images|watermark this|make this pdf two-up|reorder this)/, { runs: ['pdf-ops'] }],
  [/^(read this pdf and|what dose|find the termination|where does it|who is the escalation|when does the|which page|list every date)/, { runs: ['pdf-answer'] }],
  [/^(make a slide deck|create a presentation|I want to build a presentation)/, { runs: ['presentation'] }],
  [/^(read the text in this photo|ocr both)/, { runs: ['image-read'] }],
  [/^(research the history|what is a Kalman|find papers|who was Rosalind|explain quantum)/, { runs: ['research'] }],
  [/^(what is the latest news|give me the headlines)/, { runs: ['research'] }],
  [/^summarise this https/, { runs: ['web-read'] }],
  [/^read this youtube link/, { runs: ['youtube-transcript'] }],
  [/^(route from|weather in|where is the Marine|nearest hospital)/, { runs: ['map-place'] }],

  // A question about a document must not be answered from the open web.
  [/^(does this pdf|compare these two contracts)/, { not: ['research'] }],
  // A news request must not queue a district directory.
  [/^give me the latest news on kerala/, { not: ['toolbus'] }],
  // A deck request must not also open the deck studio.
  [/^(make a slide deck|create a presentation)/, { not: ['presentation-creator'] }],

  // Refusals: nothing runs, and the reason is in the plan.
  [/^(hack|steal someone|spy on|track my ex)/, { refuses: /not something this desk will do/i }],
  [/^(order me|book me a|buy me a pizza)/, { refuses: /not a delivery app|file desk/i }],
  [/^(win the lottery|beat the lottery|guarantee)/, { refuses: /lottery|odds/i }],
  [/^diagnose my chest pain/, { refuses: /diagnos|prescription|legal advice/i }],
  [/^(download|rip) this youtube video/, { refuses: null, allows: ['youtube-transcript', 'youtube-playlist-lister', 'youtube-thumbnail-downloader'] }],

  // A request with nothing in it says so and names what the desk does.
  [/^(help|and then\?|\?\?\?|\s*)$/, { refuses: null, detail: /desk|attach|subject|file/i }]
];

/** The text a person would read on the plan: every why, detail and note. */
const planWords = plan => [
  plan.summary, ...(plan.notes || []), ...(plan.gaps || []).map(g => g.message),
  ...plan.steps.map(s => `${s.title} ${s.detail || ''} ${s.why || ''}`)
].filter(Boolean).join(' | ');

/**
 * A plan is acceptable when it does something, or when it says why it cannot.
 * The two failure modes that are never acceptable: a silent no-op, and a plan
 * whose steps are all things that cannot run.
 */
function audit(prompt, files) {
  const plan = planRequest({ prompt, tools, index, files, links: [] });
  const steps = plan.steps || [];
  const problems = [];
  if (!steps.length) {
    problems.push('no steps at all');
    return { plan, problems };
  }
  const runnable = steps.filter(s => s.auto && canExecute(s.executor));
  const honestHandOff = steps.filter(s => s.action === 'open' && !s.auto);
  const refusals = plan.refusals || [];
  const gaps = (plan.gaps || []).map(g => typeof g === 'string' ? g : g?.text || g?.why || '');
  const explained = honestHandOff.length || refusals.length || gaps.length ||
    steps.some(s => /cannot|no |not |open the|connect|try |unavailable|need |ask|add an? /i.test(`${s.why || ''} ${s.detail || ''} ${s.notes || ''}`));
  if (!runnable.length && !explained) problems.push('nothing runnable and nothing said about it');
  // A step must never claim to have done something it cannot do.
  for (const s of steps) {
    if (s.action === 'run' && !canExecute(s.executor)) problems.push(`claims to run ${s.executor} (${s.title})`);
    if (s.auto && !canExecute(s.executor)) problems.push(`queued as automatic but cannot run: ${s.title}`);
  }
  // Every dependency must exist and must come earlier in the plan.
  const seen = new Set();
  for (const s of steps) {
    for (const r of s.requires || []) {
      if (!steps.some(x => x.id === r)) problems.push(`${s.title} requires a step that is not in the plan (${r})`);
      else if (!seen.has(r)) problems.push(`${s.title} requires ${r}, which comes later`);
    }
    seen.add(s.id);
  }
  return { plan, problems, runnable, explained };
}

// The planner keeps its own list of executors so it can stay pure. It drifts.
// Every executor that exists must be in that list, or a step is planned as
// "not runnable" and quietly sits in the plan doing nothing.
const drifted = EXECUTOR_NAMES.filter(n => !IMPLEMENTED_EXECUTORS.includes(n));
const phantom = IMPLEMENTED_EXECUTORS.filter(n => !EXECUTOR_NAMES.includes(n));
assert.deepEqual(drifted, [], `executors the planner does not know about: ${drifted.join(', ')}`);
assert.deepEqual(phantom, [], `executors the planner claims that do not exist: ${phantom.join(', ')}`);

let bad = 0;
const rows = [];
for (const [prompt, files] of CASES) {
  const { plan, problems, runnable, explained } = audit(prompt, files);
  for (const [re, want] of EXPECT) {
    if (!re.test(prompt)) continue;
    if (want.runs) {
      for (const ex of want.runs) {
        if (!runnable.some(s => s.executor === ex)) problems.push(`expected ${ex} to run; got ${runnable.map(s => s.executor).join('→') || 'nothing'}`);
      }
    }
    if (want.not) {
      for (const ex of want.not) {
        if (runnable.some(s => s.executor === ex)) problems.push(`should not run ${ex}: ${runnable.map(s => s.executor).join('→')}`);
      }
    }
    if (want.refuses !== undefined && runnable.length) {
      problems.push(`should refuse, but runs ${runnable.map(s => s.executor).join('→')}`);
    }
    if (want.refuses && !want.refuses.test(planWords(plan))) {
      problems.push(`refusal is not explained in words: ${planWords(plan).slice(0, 120)}`);
    }
    if (want.allows) {
      const offered = plan.steps.map(s => s.toolTitle || s.title).join(' | ');
      if (!want.allows.some(t => offered.includes(t))) problems.push(`no lawful alternative offered: ${offered}`);
    }
    if (want.detail && !want.detail.test(planWords(plan))) problems.push(`no explanation in words: ${planWords(plan).slice(0, 120)}`);
  }
  const label = prompt.length > 62 ? prompt.slice(0, 59) + '…' : prompt;
  if (problems.length) {
    bad++;
    console.log(`  FAIL  ${JSON.stringify(label)}`);
    for (const p of problems) console.log(`          ${p}`);
  } else {
    const what = runnable.length
      ? `runs ${runnable.map(s => s.executor).join(' → ')}`
      : `explained: ${(plan.refusals?.length || 0) + (plan.gaps?.length || 0) || 1} note(s)`;
    rows.push(`  ok    ${label.padEnd(64)} ${what}`);
  }
}
console.log(rows.join('\n'));

console.log(`\n${CASES.length - bad}/${CASES.length} requests produce a runnable step or a specific honest explanation`);
if (bad) {
  console.error(`\n${bad} request(s) produced neither. Each one is a real gap.`);
  process.exitCode = 1;
  throw new Error('request coverage is incomplete');
}
