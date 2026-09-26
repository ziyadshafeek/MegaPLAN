import assert from 'node:assert/strict';
import { validateProductFeed } from '../scripts/import-authorized-products.mjs';
import openMusic from '../lib/api/open-music.js';
import sourceStatus from '../lib/api/source-status.js';
const feed = { authorization: 'operator-confirmed-licensed-feed', permissionEvidence: 'https://retailer.example/affiliate-approval', retailerDomain: 'flipkart.com', products: [{ id: 'P1', title: 'Phone', seller: 'Retailer', category: 'Mobiles', price: 1500, currency: 'INR', verifiedAt: new Date().toISOString(), productUrl: 'https://www.flipkart.com/example' }] };
assert.equal(validateProductFeed(feed)[0].source, 'flipkart.com');
assert.throws(() => validateProductFeed({ ...feed, authorization: 'scraped' }), /operator confirmation/);
assert.throws(() => validateProductFeed({ ...feed, products: [{ ...feed.products[0], productUrl: 'https://attacker.test/' }] }), /authorized retailer/);
assert.throws(() => validateProductFeed({ ...feed, products: [{ ...feed.products[0], price: -2 }] }), /Positive/);
const status = { statusCode: 200, setHeader() {}, end(text) { this.body = JSON.parse(text); } };
await sourceStatus({ method: 'GET' }, status);
assert.equal(status.body.sources.worldwideSongNames.audioStored, false);
assert.equal(status.body.sources.worldwideSongNames.spotifyCatalogue, false);
assert.equal(status.body.sources.localMap.complete, false);
assert.ok(status.body.sources.imageLinks.candidateLinks >= status.body.sources.imageLinks.publicReviewedLinks);
const old = globalThis.fetch;
try {
  globalThis.fetch = async url => {
    assert.match(url, /musicbrainz\.org\/ws\/2\/recording/);
    return new Response(JSON.stringify({ recordings: [{ id: '12345678-1234-1234-1234-123456789abc', title: 'Test song', 'artist-credit': [{ artist: { name: 'Test artist' } }] }] }), { status: 200 });
  };
  const res = { statusCode: 200, setHeader() {}, end(x) { this.body = JSON.parse(x); } };
  await openMusic({ method: 'GET', url: '/api/open-music?q=test', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.results[0].external_url, 'https://musicbrainz.org/recording/12345678-1234-1234-1234-123456789abc');
  assert.match(res.body.source, /not the Spotify catalogue/);
} finally { globalThis.fetch = old; }
console.log('Data sources: authorized retailer feed validation and worldwide open music search OK');
