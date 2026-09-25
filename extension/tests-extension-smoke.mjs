import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ext = new URL('.', import.meta.url).pathname;
const manifest = JSON.parse(fs.readFileSync(ext + 'manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.side_panel.default_path,'sidepanel.html');

const html=fs.readFileSync(ext+'sidepanel.html','utf8');
for(const id of ['openNlm','openStudio','transcript','copyTranscript','collectLinks','pdfFile','parts','split','ocrFile','ocrRun']) assert(html.includes('id="'+id+'"'),id);

let listener;
const sandbox={
  console, URL, location:{href:'https://www.youtube.com/watch?v=abc123',hostname:'www.youtube.com'},
  document:{querySelectorAll:()=>[],querySelector:()=>null,title:'Example Video - YouTube'},
  chrome:{runtime:{onMessage:{addListener:f=>listener=f}}}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ext+'youtube-content.js','utf8'),sandbox);
assert.equal(typeof listener,'function');
let response;
await listener({type:'GET_CONTEXT'},null,r=>{response=r});
assert.equal(response.ok,true); assert.equal(response.videoId,'abc123'); assert.equal(response.title,'Example Video');
await listener({type:'COLLECT_LINKS'},null,r=>{response=r});
assert.equal(response.links.length,0);
await listener({type:'GET_TRANSCRIPT'},null,r=>{response=r});
assert.equal(response.ok,false); assert.match(response.error,/transcript/i);
console.log('Extension smoke OK');
