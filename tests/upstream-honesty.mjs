import assert from 'node:assert/strict';
import inception from '../lib/api/inception.js';
import product from '../lib/api/product-scraper.js';
import music from '../lib/api/music-scraper.js';
import map from '../lib/api/map-scraper.js';
import mapV2 from '../lib/api/map-scraper-v2.js';

function call(handler, method, url, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(text) { try { resolve({ status: this.statusCode, body: JSON.parse(text) }); } catch (e) { reject(e); } }
    };
    Promise.resolve(handler({ method, url, body }, res)).catch(reject);
  });
}
const oldKey = process.env.INCEPTION_API_KEY;
const oldFetch = globalThis.fetch;
try {
  delete process.env.INCEPTION_API_KEY;
  assert.equal((await call(inception, 'POST', '/api/inception', { messages: [{ role: 'user', content: 'hi' }] })).status, 503);
  assert.equal((await call(inception, 'GET', '/api/inception?action=status')).body.configured, false);
  process.env.INCEPTION_API_KEY = 'test-key-only';
  let hit;
  globalThis.fetch = async (url, opts) => {
    hit = { url, opts };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Provider response' } }] }) };
  };
  const output = await call(inception, 'POST', '/api/inception', { model: 'mercury-2.5', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(output.body.content, 'Provider response');
  assert.equal(hit.url, 'https://api.inceptionlabs.ai/v1/chat/completions');
  assert.equal(hit.opts.headers.Authorization, 'Bearer test-key-only');
  assert.equal((await call(inception, 'POST', '/api/inception', { model: 'unofficial', messages: [{ role: 'user', content: 'hi' }] })).status, 400);
  globalThis.fetch = async () => { throw Error('Offline'); };
  assert.equal((await call(inception, 'POST', '/api/inception', { messages: [{ role: 'user', content: 'hi' }] })).status, 502, 'offline must not return fabricated AI');
  assert.equal((await call(product, 'GET', '/api/product-scraper?action=product&url=https://example.com')).status, 501, 'do not invent product details or fetch arbitrary URLs');
  const categories = (await call(product, 'GET', '/api/product-scraper?action=categories_list')).body;
  assert.ok(categories.flipkart.every(c => !('estimated' in c)), 'no random inventory counts');
  assert.equal((await call(product, 'GET', '/api/product-scraper?action=search&platform=amazon&term=phone')).status, 501);
  assert.equal((await call(music, 'GET', '/api/music-scraper?action=features')).status, 501, 'do not invent audio features');
  assert.equal((await call(music, 'GET', '/api/music-scraper?action=search&type=artist&q=Queen')).status, 501);
  assert.equal((await call(map, 'GET', '/api/map-scraper?index=0')).status, 503, 'map source outage must not publish seed places');
  assert.equal((await call(mapV2, 'GET', '/api/map-scraper-v2?index=0')).status, 503, 'full map source outage must not publish seed places');
} finally {
  globalThis.fetch = oldFetch;
  oldKey === undefined ? delete process.env.INCEPTION_API_KEY : process.env.INCEPTION_API_KEY = oldKey;
}
console.log('upstream honesty ok: official-only Inception, no fabricated offline/product/music responses');
