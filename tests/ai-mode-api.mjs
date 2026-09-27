/**
 * AI Mode server API — the orchestrator, the guide, PubMed and the PDF writer.
 *
 * Every handler is called directly with a fake req/res. Upstream research is
 * stubbed so the assertions are about contract, safety and honesty, not luck.
 */
import assert from 'node:assert/strict';
import handler from '../lib/api/ai-mode.js';
import pubmed from '../lib/api/pubmed.js';
import router from '../api/index.js';
import { GUIDE } from '../public/js/ai-guide.js';
import { IMPLEMENTED_EXECUTORS } from '../public/js/planner.js';

function call(h, { method = 'GET', url = '/api/ai-mode', body = undefined, ip = 'test' } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(payload) { resolve({ status: this.statusCode, headers: this.headers, data: payload, json: safeJson(payload) }); }
    };
    Promise.resolve(h({ method, url, body, headers: {}, socket: { remoteAddress: ip } }, res)).catch(reject);
  });
}
function safeJson(payload) {
  if (typeof payload !== 'string') return null;
  try { return JSON.parse(payload); } catch { return null; }
}

const realFetch = globalThis.fetch;
const routes = {};
globalThis.fetch = async url => {
  const key = String(url);
  for (const [pattern, responder] of Object.entries(routes)) {
    if (key.includes(pattern)) {
      const out = typeof responder === 'function' ? await responder(key) : responder;
      if (out instanceof Response) return out;
      if (out && out.__status && out.__status !== 200) return new Response('err', { status: out.__status });
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response('offline', { status: 503 });
};

/* ---------- manifest ---------- */
{
  const r = await call(handler);
  assert.equal(r.status, 200);
  const m = r.json;
  assert.equal(m.ok, true);
  assert.ok(m.tools >= 555, `the manifest reports the real registry size (${m.tools})`);
  assert.ok(m.capabilities.length >= 19);
  assert.ok(m.researchSources.some(s => s.id === 'pubmed'), 'PubMed is advertised as a research source');
  assert.ok(m.researchSources.some(s => s.id === 'wikipedia'));
  assert.equal(typeof m.assistant.configured, 'boolean');
  assert.doesNotMatch(r.data, /deepseek|nvidia|integrate\.api/i, 'no provider identity is ever exposed');
  assert.ok(m.limits.length >= 4, 'limits are published, not hidden');
}

/* ---------- guide ---------- */
{
  const r = await call(handler, { url: '/api/ai-mode?view=guide' });
  assert.equal(r.status, 200);
  assert.equal(r.json.guide.version, GUIDE.version, 'the API and the in-app guide are the same document');
  const text = JSON.stringify(r.json.guide);
  assert.ok(text.includes('NotebookLM'), 'the guide explains the external assistants');
  assert.ok(text.includes('AI Studio'));
  assert.doesNotMatch(text, /deepseek|nvidia|trocr|transformers/i);
}

/* ---------- plan ---------- */
{
  const r = await call(handler, { method: 'POST', body: { action: 'plan', prompt: 'Create a PPT about solar energy in Kerala', links: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'] } });
  assert.equal(r.status, 200);
  const p = r.json;
  assert.equal(p.version, 2);
  assert.ok(p.steps.length > 0);
  assert.ok(p.steps.every(s => !s.requires.includes(s.id)));
  for (const s of p.steps) if (s.executor) assert.ok(IMPLEMENTED_EXECUTORS.includes(s.executor), `${s.executor} must be implemented`);
  assert.ok(p.prompts.gemini && p.prompts.notebooklm && p.prompts.assistant);
}

/* ---------- research ---------- */
routes['en.wikipedia.org'] = (url) => (url.includes('list=search')
  ? { query: { search: [{ title: 'Backwaters', pageid: 42, snippet: 'Lagoons in Kerala' }] } }
  : { query: { pages: [{ pageid: 42, title: 'Backwaters', extract: 'Kerala has a network of lagoons.' }] } });
routes['api.crossref.org'] = { message: { items: [{ DOI: '10.4/bw', title: ['Backwater hydrology'], issued: { 'date-parts': [[2020]] } }] } };
routes['openlibrary.org'] = { docs: [{ title: 'Backwaters of Kerala', key: '/works/OL2W' }] };
{
  const r = await call(handler, { method: 'POST', body: { action: 'research', query: 'kerala backwaters', limit: 3 } });
  assert.equal(r.status, 200);
  assert.ok(r.json.items.length >= 2);
  assert.ok(r.json.availability.wikipedia.ok);
  const cached = await call(handler, { method: 'POST', body: { action: 'research', query: 'kerala backwaters', limit: 3 } });
  assert.equal(cached.json.cached, true, 'a repeated query is served from cache');
}

/* ---------- article ---------- */
{
  const r = await call(handler, { method: 'POST', body: { action: 'article', query: 'Kerala Backwaters' } });
  assert.equal(r.status, 200);
  assert.match(r.json.article.text, /lagoons/);
  assert.ok(r.json.article.url.startsWith('https://'));
}
{
  routes['en.wikipedia.org'] = (url) => (url.includes('list=search')
    ? { query: { search: [] } }
    : { query: { pages: [{ missing: true }] } });
  const r = await call(handler, { method: 'POST', body: { action: 'article', query: 'Zzqqx Not A Page' } });
  assert.equal(r.status, 404);
  assert.match(r.json.error, /No article found/);
}

/* ---------- compose: works with no hosted key ---------- */
{
  const previous = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    const r = await call(handler, { method: 'POST', body: {
      action: 'compose', task: 'notes',
      text: 'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the chloroplasts. The Calvin cycle fixes carbon dioxide into glucose.'
    } });
    assert.equal(r.status, 200, 'compose must not fail just because no key is configured');
    assert.equal(r.json.via, 'local');
    assert.ok(r.json.text.length > 100, 'a real on-device result is still produced');
    assert.match(r.json.note, /not configured/i);
  } finally {
    if (previous) process.env.NVIDIA_API_KEY = previous;
  }
}
{
  const r = await call(handler, { method: 'POST', body: { action: 'compose', task: 'summary', text: '' } });
  assert.equal(r.status, 400);
}

/* ---------- batches: the AI Studio / NotebookLM path ---------- */
{
  const r = await call(handler, { method: 'POST', body: {
    action: 'batches',
    paper: '1. Define photosynthesis.\n2. Compare respiration and photosynthesis.\n3. Explain the Calvin cycle.',
    textbook: 'Chapter 1: Cell structure\nChapter 2: Photosynthesis and respiration',
    mode: 'per'
  } });
  assert.equal(r.status, 200);
  assert.equal(r.json.detectedQuestions, 3);
  assert.equal(r.json.groups.length, 3);
  assert.ok(r.json.notebooklm, 'the NotebookLM instruction is returned');
  assert.ok(r.json.aiStudio, 'the AI Studio instruction is returned');
  assert.ok(r.json.groups.every(g => /never invent one/.test(g.prompt)));
}

/* ---------- private tool ---------- */
{
  const r = await call(handler, { method: 'POST', body: { action: 'private-tool', prompt: 'turn my lab notebook scans into a searchable log' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.private, true);
  assert.match(r.json.spec.slug, /^[a-z0-9-]+$/);
  assert.match(r.json.review, /stay on this device/i);
}

/* ---------- document: real PDF bytes over HTTP ---------- */
{
  const r = await call(handler, { method: 'POST', body: {
    action: 'document', format: 'pdf', title: 'Kerala Backwaters',
    sections: [{ heading: 'Overview', body: 'The backwaters are a network of lagoons.' }],
    sources: [{ title: 'Kerala Tourism', url: 'https://keralatourism.org/backwaters', source: 'Kerala Tourism' }]
  } });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /application\/pdf/);
  assert.match(r.headers['content-disposition'], /attachment; filename="megaplan-kerala-backwaters\.pdf"/);
  const buf = Buffer.from(r.data);
  assert.match(buf.subarray(0, 8).toString('latin1'), /^%PDF-1\./);
  assert.match(buf.toString('latin1').trimEnd(), /%%EOF$/);
}
{
  const r = await call(handler, { method: 'POST', body: { action: 'document', format: 'pdf', title: 'Empty', sections: [] } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /nothing to put/i);
}

/* ---------- errors ---------- */
{
  const r = await call(handler, { method: 'POST', body: { action: 'nope' } });
  assert.equal(r.status, 400);
  assert.ok(r.json.actions.includes('research'));
  assert.equal((await call(handler, { method: 'PUT' })).status, 405);
  const preflight = await new Promise(resolve => {
    const res = { statusCode: 0, setHeader() {}, end() { resolve({ status: res.statusCode }); } };
    handler({ method: 'OPTIONS', url: '/api/ai-mode', headers: {}, socket: {} }, res);
  });
  assert.equal(preflight.status, 204);
}

/* ---------- rate limit ---------- */
{
  let last;
  for (let i = 0; i < 60; i++) last = await call(handler, { method: 'POST', body: { action: 'health' }, ip: 'flood' });
  assert.equal(last.status, 429, 'a flood is throttled rather than served');
}

/* ---------- PubMed endpoint ---------- */
routes['eutils.ncbi.nlm.nih.gov'] = (url) => (url.includes('esearch')
  ? { esearchresult: { idlist: ['123'] } }
  : { result: { 123: { title: 'A trial', authors: [{ name: 'A Rao' }], fulljournalname: 'NEJM', pubdate: '2024', articleids: [{ idtype: 'doi', value: '10.1/t' }] } } });
{
  const r = await call(pubmed, { method: 'POST', body: { query: 'metformin cardiovascular', limit: 5 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.via, 'PubMed');
  assert.equal(r.json.items[0].pmid, '123');
  assert.match(r.json.items[0].url, /pubmed\.ncbi\.nlm\.nih\.gov\/123/);
  const get = await call(pubmed, { url: '/api/pubmed?q=metformin%20cardiovascular&limit=5' });
  assert.equal(get.status, 200);
  assert.equal(get.json.cached, true);
}
{
  routes['eutils.ncbi.nlm.nih.gov'] = { __status: 500 };
  routes['europepmc'] = { __status: 500 };
  const r = await call(pubmed, { method: 'POST', body: { query: 'anything', limit: 3 } });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /reachable right now/i);
  assert.match(r.json.note, /not an empty result set/i, 'an outage is never presented as "nothing found"');
}
{
  const r = await call(pubmed, { method: 'POST', body: { query: 'explicit porn' } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /filtered out/i);
  assert.equal((await call(pubmed, { method: 'POST', body: { query: 'a' } })).status, 400);
  assert.equal((await call(pubmed, { method: 'DELETE' })).status, 405);
}

/* ---------- router wiring ---------- */
{
  const list = await call(router, { url: '/api' });
  assert.equal(list.status, 200);
  assert.ok(list.json.routes.includes('ai-mode'));
  assert.ok(list.json.routes.includes('pubmed'));
  assert.ok(list.json.routes.includes('youtube-transcript'));
  assert.ok(list.json.routes.includes('youtube-playlist'));
  assert.equal(list.json.count, list.json.routes.length);
  // The real pathname is rewritten to the orchestrator, not swallowed by the router.
  const proxied = await call(router, { url: '/api/ai-mode' });
  assert.equal(proxied.status, 200);
  assert.equal(proxied.json.version, '2.0.0');
  assert.equal((await call(router, { url: '/api/not-a-thing' })).status, 404);
}

globalThis.fetch = realFetch;
console.log('AI Mode API ok: manifest, guide parity, plan parity, research, article, no-key compose, study batches, private tools, real PDF over HTTP, rate limiting, PubMed with Europe PMC fallback and outage honesty, router wiring');
