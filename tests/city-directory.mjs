import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectCityDirectory, collectCityFromCells, queryFor } from '../lib/city-directory.mjs';

const shop = { type: 'node', id: 123, lat: 8.52, lon: 76.94, tags: { name: 'Example OSM shop', shop: 'books', 'addr:street': 'A Street' } };
const instrument = { type: 'way', id: 456, center: { lat: 8.53, lon: 76.93 }, tags: { name: 'Example instrument shop', shop: 'musical_instrument' } };
assert.match(queryFor('shops'), /\["shop"\]/);
assert.match(queryFor('music'), /music_venue/);
let calls = 0;
const snapshot = await collectCityDirectory(async url => {
  calls++;
  const query = new URL(url).searchParams.get('data');
  return { ok: true, json: async () => ({ elements: query.includes('music_venue') ? [instrument, instrument, shop] : [shop, instrument] }) };
});
assert.equal(calls, 2);
assert.equal(snapshot.shops.length, 2);
assert.equal(snapshot.music.length, 1, 'only music-tagged records appear, deduplicated');
assert.equal(snapshot.music[0].osmUrl, 'https://www.openstreetmap.org/way/456');
assert.equal(snapshot.shops[0].address, 'A Street');
assert.match(snapshot.license, /ODbL/);
const cellSnapshot = collectCityFromCells([{ scannedAt: '2026-09-26T10:00:00Z', places: [
  { id: 'node/123', lat: shop.lat, lng: shop.lon, tags: shop.tags },
  { id: 'way/456', lat: instrument.center.lat, lng: instrument.center.lon, tags: instrument.tags },
  { id: 'node/999', lat: 0, lng: 0, tags: { shop: 'music', name: 'Far away' } }
] }]);
assert.deepEqual(cellSnapshot.counts, { shops: 2, music: 1 }, 'local OSM cells are filtered by city radius and tag');
assert.match(cellSnapshot.source, /verified Overpass map cells/);
assert.equal(cellSnapshot.sourceScannedAt, '2026-09-26T10:00:00Z');
assert.throws(() => collectCityFromCells([{ scannedAt: '2026-09-26T10:00:00Z', places: [{ id: 'node/123', lat: shop.lat, lng: shop.lon, tags: shop.tags }] }]), /music-related/);
await assert.rejects(collectCityDirectory(async () => { throw Error('offline'); }, ['https://mirror.test/']), /all mirrors/);
const published = ['data', 'public/data'].map(prefix => JSON.parse(fs.readFileSync(new URL(`../${prefix}/city-directory/index.json`, import.meta.url))));
assert.deepEqual(published[0], published[1], 'repository and public snapshots must match');
const saved = published[0];
if (saved.indexedAt) {
  assert.ok(saved.shops.length > 0 && saved.music.length > 0, 'published records must have a verified source');
  assert.ok(saved.music.every(row => /^https:\/\/www\.openstreetmap\.org\//.test(row.osmUrl)));
} else {
  assert.deepEqual(saved.counts, { shops: 0, music: 0 }, 'an unpublished snapshot must not pretend to have records');
}
console.log('city directory ok: tagged OSM records, attribution, deduplication and fail-closed source');
