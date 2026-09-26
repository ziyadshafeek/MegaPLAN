import assert from 'node:assert/strict';
import { fetchMusicPage } from '../lib/open-music-collector.mjs';
const url = 'https://musicbrainz.org/ws/2/recording?offset=200';
const failure = (status, header = null) => ({ok:false,status,headers:{get:()=>header}});
let urls = [], waits = [];
const result = await fetchMusicPage(url, {
  fetchImpl: async u => { urls.push(u); return urls.length < 3 ? failure(503) : {ok:true,json:async()=>({recordings:[]})}; },
  delay: async ms => waits.push(ms)
});
assert.deepEqual(result,{recordings:[]});
assert.deepEqual(urls,[url,url,url]);
assert.deepEqual(waits,[10000,20000]);
for (const [header, expected] of [['35',35000],['Sat, 26 Sep 2026 12:00:40 GMT',40000]]) {
  let calls=0; const delays=[];
  await fetchMusicPage(url,{clock:()=>Date.parse('2026-09-26T12:00:00Z'),delay:async ms=>delays.push(ms),fetchImpl:async()=> ++calls===1 ? failure(429,header) : {ok:true,json:async()=>({recordings:[]})}});
  assert.deepEqual(delays,[expected]);
}
for (const [status, header, expectedCalls] of [[503,null,3],[403,null,1],[503,'120',1]]) {
  let calls=0;
  await assert.rejects(fetchMusicPage(url,{delay:async()=>{},fetchImpl:async()=>{calls++;return failure(status,header);}}), /MusicBrainz HTTP/);
  assert.equal(calls,expectedCalls,'bounded retries; permanent errors and long pauses must stop');
}
console.log('MusicBrainz retry fixtures: same page, bounded 503 recovery/exhaustion, Retry-After seconds/date, permanent failure OK');
