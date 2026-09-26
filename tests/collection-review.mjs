import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measure, review } from '../scripts/collection-review.mjs';
import { scanCellWithMirrors } from '../scripts/kerala-expansion-runner.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collection-review-'));
const oldFetch = globalThis.fetch;
try {
  for (const prefix of ['data', 'public/data']) {
    const dir = path.join(root, prefix, 'map-directory');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({cells: [0,1],lastScannedAt:'2026-09-26T00:00:00Z'}));
    for (const i of [0,1]) fs.writeFileSync(path.join(dir, `cell_${i}.json`), JSON.stringify({places:[{id:'node/1'}]}));
  }
  assert.equal(measure('map', root).distinctRecords, 1);
  assert.equal(measure('map', root).occurrences, 2);
  const report = review('map', root, () => ({status:0}));
  assert.equal(report.distinctDelta, 0);
  assert.equal(report.deployed, false);
  assert.throws(() => review('map', root, () => ({status:1})), /no review artifact/);
  assert.ok(!fs.existsSync(path.join(root,'.collection-review')));
  let calls = 0; const waits = [];
  globalThis.fetch = async () => { calls++; return calls === 1 ? {ok:false,status:429} : {ok:true,json:async () => ({elements:[{type:'node',id:123,lat:0,lon:1,tags:{name:'Fixture'}}]})}; };
  const cell = await scanCellWithMirrors(1, 0.01, 600, {lat:0,lng:1}, 0, async ms => waits.push(ms));
  assert.equal(cell.places[0].id,'node/123');
  assert.equal(cell.places[0].lat,0);
  assert.deepEqual(waits,[30000,5000]);
  globalThis.fetch = async () => ({ok:true,json:async () => ({remark:'runtime error: timeout',elements:[]})});
  await assert.rejects(scanCellWithMirrors(1,0.01,600,{lat:1,lng:1},0,async()=>{}), /All mirrors failed/);
} finally { globalThis.fetch = oldFetch; fs.rmSync(root,{recursive:true,force:true}); }
console.log('Review fixtures: distinct IDs, zero delta, upstream failure prevents artifacts, OSM retry and incomplete response rejection OK');
