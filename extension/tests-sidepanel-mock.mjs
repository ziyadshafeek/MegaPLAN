import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ids=['refresh','ytTitle','ytUrl','openNlm','openStudio','transcript','copyTranscript','transcriptOut','collectLinks','pdfFile','parts','split','pdfStatus','ocrFile','ocrRun','ocrStatus'];
const els=new Map(ids.map(id=>[id,{id,textContent:'',disabled:false,value:id==='parts'?'20':'',files:[],onclick:null}]));
const tabs=[
 {dataset:{tab:'youtube'},classList:{toggle(){}},onclick:null},
 {dataset:{tab:'pdf'},classList:{toggle(){}},onclick:null},
 {dataset:{tab:'ocr'},classList:{toggle(){}},onclick:null}
];
const chromeCalls=[];
const sandbox={
 console, URL, setTimeout,
 navigator:{clipboard:{writeText:async t=>{sandbox.clip=t}}},
 FormData:globalThis.FormData,
 Blob:globalThis.Blob,
 fetch:async()=>({ok:true,blob:async()=>new Blob(['zip']),json:async()=>({ok:true,text:'OCR OK'})}),
 document:{getElementById:id=>els.get(id)||{id,textContent:'',disabled:false,value:'',files:[],onclick:null},querySelectorAll:sel=>sel==='.tab'?tabs:[]},
 chrome:{tabs:{query:async()=>[{id:42,url:'https://www.youtube.com/watch?v=abc123',title:'Example - YouTube'}],sendMessage:async(_id,msg)=>{if(msg.type==='GET_CONTEXT')return {ok:true,isYouTube:true,url:'https://www.youtube.com/watch?v=abc123',title:'Example',videoId:'abc123'};if(msg.type==='GET_TRANSCRIPT')return {ok:true,lines:['00:01\\tHello world']};if(msg.type==='COLLECT_LINKS')return {ok:true,links:['https://www.youtube.com/watch?v=a','https://www.youtube.com/watch?v=b']};},create:async({url})=>chromeCalls.push({url})}},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('/mnt/data/free-toolforge-build/extension/sidepanel.js','utf8'),sandbox);
await new Promise(r=>setTimeout(r,20));
assert.equal(typeof els.get('openNlm').onclick,'function');
await els.get('openNlm').onclick();
assert.equal(chromeCalls[0].url,'https://notebooklm.google.com/');
assert.match(sandbox.clip,/youtube\.com\/watch/);
await els.get('openStudio').onclick();
assert.equal(chromeCalls[1].url,'https://aistudio.google.com/');
await els.get('transcript').onclick();
assert.equal(els.get('copyTranscript').disabled,false);
await els.get('copyTranscript').onclick();
assert.match(sandbox.clip,/Hello world/);
await els.get('collectLinks').onclick();
assert.match(els.get('ytTitle').textContent,/2 YouTube links/);
console.log('Sidepanel wiring mock test OK');
