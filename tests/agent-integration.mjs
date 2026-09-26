import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import router from '../api/index.js';
import { evaluateExpression, validateApiBlock } from '../public/agent/expression.js';
import { validate as validatePlan } from '../lib/api/agent-plan.js';
import publish from '../lib/api/agent-publish.js';
import dispatch from '../lib/api/agent-dispatch.js';

function call(handler, method, url, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(text) { resolve({ status: this.statusCode, data: text ? JSON.parse(text) : null }); }
    };
    Promise.resolve(handler({ method, url, body, headers }, res)).catch(reject);
  });
}

const index = await call(router, 'GET', '/api');
assert.equal(index.status, 200);
assert.equal(index.data.count, 28);
const source = fs.readFileSync(new URL('../api/index.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /import\(importPath\)/);
for (const route of index.data.routes) {
  const moduleName = { 'inception-labs': 'inception', kerala: 'kerala-ai' }[route] || route;
  assert.ok(source.includes(`import('../lib/api/${moduleName}.js')`), `untraceable route ${route}`);
  const mod = await import(`../lib/api/${moduleName}.js`);
  assert.equal(typeof mod.default, 'function', `invalid handler ${route}`);
}
assert.equal((await call(router, 'GET', '/api/agent-health')).status, 200);
assert.equal((await call(router, 'GET', '/api/agent-plan')).status, 405);
assert.equal((await call(router, 'GET', '/api/does-not-exist')).status, 404);

// Configured or not, anonymous requests cannot write to GitHub or queue paid builds.
const previous = Object.fromEntries(['GITHUB_TOKEN','GITHUB_ACTIONS_DISPATCH_TOKEN','GITHUB_OWNER','GITHUB_REPO','AGENT_WRITE_TOKEN'].map(k => [k, process.env[k]]));
try {
  Object.assign(process.env, { GITHUB_TOKEN: 'fake', GITHUB_ACTIONS_DISPATCH_TOKEN: 'fake', GITHUB_OWNER: 'test', GITHUB_REPO: 'test', AGENT_WRITE_TOKEN: 'private-test-only' });
  assert.equal((await call(publish, 'POST', '/api/agent-publish', {}, {})).status, 401);
  assert.equal((await call(dispatch, 'POST', '/api/agent-dispatch', { prompt: 'Build a private test page' }, {})).status, 401);
  assert.equal((await call(publish, 'POST', '/api/agent-publish', {}, { 'x-agent-write-token': 'wrong' })).status, 401);
} finally {
  for (const [key, val] of Object.entries(previous)) val === undefined ? delete process.env[key] : process.env[key] = val;
}

const api = { type: 'api', key: 'sum', inputs: [{ id: 'price' }, { id: 'tax' }], expression: 'price * (1 + tax / 100)' };
validateApiBlock(api);
assert.ok(Math.abs(evaluateExpression(api.expression, { price: 200, tax: 10 }) - 220) < 1e-9);
for (const expression of ['constructor.constructor()', 'fetch()', 'price ** 2', 'unknown+1', '1/0', 'price.price']) {
  assert.throws(() => evaluateExpression(expression, { price: 2 }), undefined, expression);
}
assert.throws(() => validateApiBlock({ ...api, inputs: [{ id: 'price' }, { id: 'price' }] }));
assert.throws(() => validateApiBlock({ ...api, inputs: [{ id: '__proto__' }] }));
const spec = { kind: 'api', slug: 'price-tax-calculator', title: 'Price tax calculator', summary: 'Calculate the total from a base price and a tax percentage.', blocks: [{ type: 'hero', title: 'Price tax calculator' }, api], tests: [{ action: 'calculator-smoke', key: 'sum' }] };
assert.equal(validatePlan(structuredClone(spec)).slug, spec.slug);
assert.throws(() => validatePlan({ ...spec, blocks: [spec.blocks[0], { ...api, expression: 'fetch()' }] }));

// Run the hosted prompt -> validated page path with a deterministic, non-network model response.
const originalFetch = globalThis.fetch, originalKey = process.env.NVIDIA_API_KEY;
try {
  process.env.NVIDIA_API_KEY = 'test-only';
  globalThis.fetch = async (_url, options) => {
    assert.ok(JSON.parse(options.body).messages[1].content.includes('tax calculator'));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(spec) } }] }), { status: 200 });
  };
  const planned = await call(router, 'POST', '/api/agent-plan', { prompt: 'Build a tax calculator page' });
  assert.equal(planned.status, 200);
  assert.equal(planned.data.spec.slug, spec.slug);
} finally {
  globalThis.fetch = originalFetch;
  originalKey === undefined ? delete process.env.NVIDIA_API_KEY : process.env.NVIDIA_API_KEY = originalKey;
}

// Parse the actual srcdoc script, including the generated evaluator and test channel.
globalThis.document = { getElementById: () => null };
const { previewHtml, createLocalDraft, validate: validateClient } = await import('../public/agent/agent.js');
const localDraft = validateClient(createLocalDraft('Build a local study checklist for algebra'));
assert.equal(localDraft.blocks.length, 3);
assert.match(localDraft.blocks[0].subtitle, /no hosted writing/i);
assert.equal((await domPreviewLocal(localDraft)).ok, true);
const html = previewHtml(spec, 'test-nonce');

async function domPreviewLocal(page) {
  const { JSDOM } = await import('jsdom');
  let message;
  const dom = new JSDOM(previewHtml(page, 'local-nonce'), {
    runScripts: 'dangerously',
    beforeParse(win) {
      Object.defineProperty(win.HTMLElement.prototype, 'innerText', { get() { const copy = this.cloneNode(true); copy.querySelectorAll('script,style').forEach(node => node.remove()); return copy.textContent; } });
      win.addEventListener('message', event => { message = event.data; });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  dom.window.close();
  return message;
}
assert.ok(html.endsWith('</script>'), 'preview script must close in HTML');
assert.equal((html.match(/<\/script>/g) || []).length, 1);
new vm.Script(html.split('<script>')[1].split('</script>')[0]);
assert.ok(html.includes('parent.postMessage'));
assert.ok(!html.includes('new Function'));

// Multipart through the actual Node adapter must return a valid two-part ZIP.
const { PDFDocument } = await import('pdf-lib');
const { default: JSZip } = await import('jszip');
const { default: splitPdf } = await import('../lib/api/split-pdf.js');
const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
const form = new FormData();
form.append('file', new Blob([await pdf.save()], { type: 'application/pdf' }), 'sample.pdf');
form.append('parts', '2');
const webRequest = new Request('https://example.invalid/api/split-pdf', { method: 'POST', body: form });
const rawBody = Buffer.from(await webRequest.arrayBuffer());
const zipResponse = await new Promise((resolve, reject) => {
  const res = { statusCode: 200, setHeader() {}, end(bytes) { resolve({ status: this.statusCode, bytes }); } };
  splitPdf({ method: 'POST', headers: { 'content-type': webRequest.headers.get('content-type') }, rawBody }, res).catch(reject);
});
assert.equal(zipResponse.status, 200);
const zip = await JSZip.loadAsync(zipResponse.bytes);
assert.ok(zip.file('sample-part-01-of-02.pdf'));
assert.ok(zip.file('sample-part-02-of-02.pdf'));
const injected = previewHtml({ ...spec, tests: [{ action: 'assert-text', text: '</script><script>alert(1)</script>' }] }, 'nonce');
assert.equal((injected.match(/<script>/g) || []).length, 1, 'test text must not escape the iframe script');

// Execute the actual srcdoc DOM in jsdom; this is a deterministic DOM test,
// NOT a substitute for the Playwright Chromium E2E workflow.
const { JSDOM } = await import('jsdom');
async function domPreview(page) {
  let message;
  const dom = new JSDOM(previewHtml(page, 'test-nonce'), {
    runScripts: 'dangerously',
    beforeParse(win) {
      Object.defineProperty(win.HTMLElement.prototype, 'innerText', { get() { const copy = this.cloneNode(true); copy.querySelectorAll('script,style').forEach(node => node.remove()); return copy.textContent; } });
      win.addEventListener('message', event => { message = event.data; });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  const result = { message, output: dom.window.document.querySelector('.result')?.textContent };
  dom.window.close();
  return result;
}
const passing = await domPreview(spec);
assert.equal(passing.message?.ok, true);
assert.equal(passing.message?.nonce, 'test-nonce');
assert.equal(passing.output, '11');
const failing = await domPreview({ ...spec, tests: [{ action: 'assert-text', text: 'This text is absent' }] });
assert.equal(failing.message?.ok, false);

// Inventory audit: all registry titles must have a runner or a category-specific engine.
const { implementedTitles } = await import('../public/js/engines.js');
await import('../public/js/engines-rest.js');
const titles = new Set(implementedTitles());
const tools = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const unassigned = tools.filter(t => !titles.has(t.title) && !['PDF', 'OCR & AI'].includes(t.category));
assert.deepEqual(unassigned.map(t => t.slug), [], 'tools falling through to echo-only generic fallback');
console.log(`agent integration ok: ${index.data.count} traced routes, auth guards, preview syntax, expression safety; ${tools.length} tool titles assigned (not functional E2E)`);
