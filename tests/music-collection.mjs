import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOpenMusic, recording } from '../lib/open-music-collector.mjs';
import { phaseTasks } from '../lib/map-phase-grid.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megaplan-music-'));
try {
  const dir = path.join(root, 'data'), publicDir = path.join(root, 'public');
  fs.mkdirSync(dir); fs.mkdirSync(publicDir);
  const item = i => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `Song ${i}`, 'artist-credit': [{ artist: { name: 'Artist' } }] });
  assert.equal(recording(item(1)).name, 'Song 1');
  assert.equal(recording({ title: 'Bad' }), null);
  const urls = [];
  const fetchImpl = async u => {
    urls.push(u);
    const offset = Number(new URL(u).searchParams.get('offset'));
    return { ok: true, json: async () => ({ recordings: Array.from({ length: offset === 200 ? 2 : 100 }, (_, i) => item(offset + i + 1)) }) };
  };
  const first = await collectOpenMusic({ dir, publicDir, fetchImpl, searches: ['hindi', 'swahili'], pages: 2, delay: async () => {} });
  assert.equal(first.distinct, 200);
  assert.equal(first.cursor.offset, 200);
  const second = await collectOpenMusic({ dir, publicDir, fetchImpl, searches: ['hindi', 'swahili'], pages: 1, delay: async () => {} });
  assert.equal(second.distinct, 202);
  assert.equal(second.cursor.queryIndex, 1);
  assert.match(urls[2], /offset=200/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(publicDir, 'index.json'))).totalTracks, 202);
  await assert.rejects(collectOpenMusic({ dir, publicDir, fetchImpl: async () => { throw Error('network offline'); }, searches: ['hindi','swahili'], pages: 1 }), /state unchanged/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'cursor.json'))).offset, 0, 'failed page never advances cursor');
  const phase = { phase: 1, bbox: { latMin: 8.3, latMax: 8.7, lngMin: 76.7, lngMax: 77.2 }, grid: 0.01, radius: 600, estimatedCells: 50 };
  const retry = phaseTasks(phase, [], 4, 2, [0, 1, 3, 4]);
  assert.deepEqual(retry.map(t => t.index), [2, 5], 'failed map-cell gap must be retried before expansion');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Open metadata collection: paged cursor, 202 distinct records, fail-closed retry, OSM gap recovery OK');
