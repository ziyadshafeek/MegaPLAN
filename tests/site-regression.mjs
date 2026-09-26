import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import router from '../api/index.js';

const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /setInterval\(|api\/auto-master\?action=run|serviceWorker\.register/);
assert.doesNotMatch(fs.readFileSync(new URL('../public/sw-map-scraper.js', import.meta.url), 'utf8'), /addEventListener\('fetch'|scrapeNextCell/);

function call(method, url, body = {}) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, setHeader() {}, end(text) { resolve({ status: this.statusCode, data: text ? JSON.parse(text) : null }); } };
    Promise.resolve(router({ method, url, body, headers: {} }, res)).catch(reject);
  });
}
const previousVercel = process.env.VERCEL;
try {
  process.env.VERCEL = '1';
  for (const name of ['map-directory', 'product-directory', 'music-directory']) {
    const response = await call('POST', `/api/${name}`, { products: [], tracks: [], places: [] });
    assert.equal(response.status, 405, `${name} must be read-only on Vercel`);
    assert.match(response.data.error, name === 'music-directory' ? /disabled pending authorized access/i : /scheduled jobs/i);
  }
  for (const name of ['map-auto', 'auto-master']) {
    assert.equal((await call('GET', `/api/${name}?action=run`)).status, 405, `${name} GET cannot launch work`);
    assert.equal((await call('POST', `/api/${name}?action=run`)).status, 405, `${name} must not write on Vercel`);
  }
} finally {
  previousVercel === undefined ? delete process.env.VERCEL : process.env.VERCEL = previousVercel;
}
const previousIngest = process.env.DATA_INGEST_TOKEN;
try {
  delete process.env.DATA_INGEST_TOKEN;
  assert.equal((await call('POST', '/api/map-directory')).status, 503, 'local writes need an operator token');
  process.env.DATA_INGEST_TOKEN = 'test-only';
  assert.equal((await call('POST', '/api/music-directory')).status, 405, 'unlicensed music ingest is disabled even with local token');
} finally {
  previousIngest === undefined ? delete process.env.DATA_INGEST_TOKEN : process.env.DATA_INGEST_TOKEN = previousIngest;
}

const dom = new JSDOM('<div id="app"></div>', { url: 'https://mega-plan.test/agent/' });
const { window } = dom;
for (const key of ['document', 'navigator', 'localStorage', 'sessionStorage', 'history', 'location']) Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
globalThis.window = window;
const tools = Array.from({ length: 585 }, (_, i) => ({ slug: `fixture-${i}`, title: `Fixture tool ${i}`, category: 'Text', status: i === 584 ? 'beta' : 'live', description: 'Fixture' }));
globalThis.fetch = async path => {
  if (String(path).startsWith('/data/tools.json')) return new Response(JSON.stringify(tools), { status: 200 });
  if (String(path).startsWith('/data/agent-pages.json')) return new Response('[]', { status: 200 });
  if (String(path).startsWith('/api/agent-health')) return new Response(JSON.stringify({ aiConfigured: false, actionsConfigured: false }), { status: 200 });
  throw Error(`Unexpected network call on a page visit: ${path}`);
};
await import('../public/app.js');
await new Promise(resolve => setTimeout(resolve, 35));
assert.ok(window.document.querySelector('.android [data-agent="wiki-agent"]'), 'mobile direct agent URL must show agent');
assert.ok(window.document.querySelector('.android #composer'), 'mobile agent composer should mount');
assert.ok(!window.document.body.textContent.includes('Opening MegaPLAN'), 'site must finish booting');
const { byok, saveByok } = await import('../public/js/kit.js');
window.localStorage.setItem('mp-byok-key', 'legacy-test-value');
assert.equal(byok().key, 'legacy-test-value');
assert.equal(window.localStorage.getItem('mp-byok-key'), null, 'old persistent key must be removed');
saveByok({ key: 'session-test-value' });
assert.equal(byok().key, 'session-test-value');
assert.equal(window.localStorage.getItem('mp-byok-key'), null, 'Self Agent key cannot persist in localStorage');

window.localStorage.setItem('mp-wiki-pages', JSON.stringify([{ slug: 'saved-local-page', title: 'Saved local page' }]));
window.history.pushState({}, '', '/wiki/');
window.dispatchEvent(new window.PopStateEvent('popstate'));
assert.ok(window.document.querySelector('.android a[href="/agent/view.html?slug=saved-local-page"]'), 'mobile My Wiki must link to saved pages');

window.history.pushState({}, '', '/');
window.dispatchEvent(new window.PopStateEvent('popstate'));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
const search = window.document.querySelector('#pal-q');
assert.ok(search, 'search palette opens');
search.value = 'Fixture tool 584';
search.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.match(window.document.querySelector('#pal-results').textContent, /Fixture tool 584/, 'palette searches all 585 tools');
dom.window.close();
console.log('site regression ok: read-only deployed ingestion, no visitor auto jobs, mobile agent/wiki, all-tool search');
