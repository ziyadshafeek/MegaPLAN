import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectCityDirectory, queryFor } from '../lib/city-directory.mjs';

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
await assert.rejects(collectCityDirectory(async () => { throw Error('offline'); }, ['https://mirror.test/']), /all mirrors/);
for (const prefix of ['data', 'public/data']) {
  const saved = JSON.parse(fs.readFileSync(new URL(`../${prefix}/city-directory/index.json`, import.meta.url)));
  assert.equal(saved.indexedAt, null, 'failed/fixture collection must not publish an invented city snapshot');
  assert.deepEqual(saved.counts, { shops: 0, music: 0 });
}
console.log('city directory ok: tagged OSM records, attribution, deduplication and fail-closed source');
