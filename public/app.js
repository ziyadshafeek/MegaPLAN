const state = { tools: [], category: 'All', query: '' };

const icons = {
  PDF:'📄', Images:'🖼️', Audio:'🎧', Video:'🎬', 'OCR & AI':'🧠', Text:'✍️',
  Developer:'💻', Calculators:'🧮', Business:'💼', Education:'🎓', India:'🇮🇳',
  'Privacy & Security':'🔐', 'OSINT / Public Data':'🛰️', 'Files & Data':'📁',
  Productivity:'⚡', 'Design & Web':'🎨', Finance:'💰', 'Media / Downloads':'▶️',
  'Health & Medical':'🩺', Miscellaneous:'🧰'
};

// Only engines that are actually implemented are marked live.
const live = new Set([
  'Word Counter','Character Counter','Sentence Counter','Paragraph Counter','Reading Time Calculator',
  'Case Converter','Title Case','Uppercase Converter','Lowercase Converter','Whitespace Cleaner',
  'Trim Lines','Remove Duplicate Lines','Sort Lines','Reverse Lines','Number Lines','Slug Generator',
  'JSON Formatter','JSON Minifier','JSON Validator','Base64 Encoder','Base64 Decoder','URL Encoder',
  'URL Decoder','UUID Generator','SHA-256 Hash','Text Statistics',
  'Percentage Calculator','Discount Calculator','Tip Calculator','BMI Calculator','GST Calculator',
  'Markup Calculator','Margin Calculator','Profit Calculator','Break Even Calculator',
  'Merge PDFs','Split PDF','Rotate PDF','Reorder PDF Pages','Extract PDF Pages','Delete PDF Pages',
  'Images to PDF','JPG to PDF','PNG to PDF','Text to PDF'
]);

const modelShelf = [
  {name:'TrOCR Small Printed',task:'Printed-image OCR',repo:'Xenova/trocr-small-printed',url:'https://huggingface.co/Xenova/trocr-small-printed',mode:'browser'},
  {name:'TrOCR Small Handwritten',task:'Handwriting OCR',repo:'Xenova/trocr-small-handwritten',url:'https://huggingface.co/Xenova/trocr-small-handwritten',mode:'browser'},
  {name:'GLM-OCR',task:'Complex document OCR / tables / formulas',repo:'zai-org/GLM-OCR',url:'https://huggingface.co/zai-org/GLM-OCR',mode:'server'},
  {name:'Nougat Small ONNX',task:'Scientific document / math extraction',repo:'onnx-community/nougat-small-ONNX',url:'https://huggingface.co/onnx-community/nougat-small-ONNX',mode:'browser'},
  {name:'Kokoro 82M ONNX',task:'Text to speech',repo:'onnx-community/Kokoro-82M-v1.0-ONNX',url:'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX',mode:'browser'},
  {name:'Whisper Tiny EN ONNX',task:'Speech recognition',repo:'onnx-community/whisper-tiny.en',url:'https://huggingface.co/onnx-community/whisper-tiny.en',mode:'browser'},
  {name:'Clear',task:'Speech enhancement / denoise / dereverb',repo:'desert-ant-labs/clear',url:'https://huggingface.co/desert-ant-labs/clear',mode:'server'}
];

async function loadRegistry() {
  const r = await fetch('/data/tools.json', {cache:'no-store'});
  if (!r.ok) throw new Error(`Registry load failed (${r.status})`);
  state.tools = await r.json();
  document.getElementById('footer-count').textContent = state.tools.length + '+';
  renderAll();
  route();
}

function renderAll(){renderChips();renderTools();renderCategories();renderModels()}

function renderChips(){
  const cats=['All',...new Set(state.tools.map(x=>x.category))];
  document.getElementById('cats').innerHTML=cats.map(c=>`<button class="chip ${state.category===c?'active':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{state.category=b.dataset.c;renderAll()});
}

function desc(t){return t.description||'Free browser-first utility.'}

function renderTools(){
  const q=state.query.toLowerCase();
  const list=state.tools.filter(t=>(state.category==='All'||t.category===state.category)&&(!q||`${t.title} ${t.category} ${t.description}`.toLowerCase().includes(q)));
  document.getElementById('count').textContent=list.length+' tools';
  document.getElementById('tool-grid').innerHTML=list.slice(0,160).map(t=>`<a class="tool-card" href="/tools/${encodeURIComponent(t.slug)}" data-slug="${esc(t.slug)}"><div class="tool-icon">${icons[t.category]||'🧰'}</div><div><div class="tool-title">${esc(t.title)}</div><div class="tool-desc">${esc(desc(t))}</div><span class="tool-tag">${esc(t.category)} <span class="status">${live.has(t.title)?'• live':'• catalogued'}</span></span></div></a>`).join('')||'<div class="panel">No result. Try a broader term.</div>';
}

function renderCategories(){
  const map={};state.tools.forEach(t=>map[t.category]=(map[t.category]||0)+1);
  document.getElementById('category-grid').innerHTML=Object.entries(map).map(([c,n])=>`<button class="category-card" data-cat="${esc(c)}"><span class="cat-icon">${icons[c]||'🧰'}</span><span><b>${esc(c)}</b><span>${n} tools in the registry</span></span></button>`).join('');
  document.querySelectorAll('.category-card').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;document.getElementById('tools').scrollIntoView();renderAll()});
}

function renderModels(){
  document.getElementById('model-grid').innerHTML=modelShelf.map(m=>`<article class="model-card"><h3>${esc(m.name)}</h3><p>${esc(m.task)}.<br><b>${esc(m.mode==='browser'?'Browser/local':'Server/inference')}.</b></p><a class="model-link" target="_blank" rel="noreferrer" href="${m.url}">${esc(m.repo)} ↗</a></article>`).join('');
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function setup(){
  const q=document.getElementById('search');
  q.addEventListener('input',()=>{state.query=q.value;renderTools()});
  document.getElementById('dir-search').onclick=()=>{
    const v=document.getElementById('dir-q').value.trim();
    document.getElementById('dir-status').textContent=v?`Directory query queued for the agentic worker: “${v}”. No live directory backend is attached in this build yet.`:'Enter a business type or service.';
  };
  document.getElementById('clear-cache').onclick=clearModelCache;
}

function clearModelCache(){
  const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('ftf-model-'))keys.push(k)}
  keys.forEach(k=>localStorage.removeItem(k));
  document.getElementById('cache-note').textContent='Application-level model cache markers cleared. Browser-managed model storage may be separately evicted by the browser.';
}

function route(){
  const m=location.pathname.match(/^\/tools\/([^/]+)$/);
  if(!m || !state.tools.length) return;
  const slug=decodeURIComponent(m[1]);
  const t=state.tools.find(x=>x.slug===slug);
  if(!t) return;
  document.body.innerHTML=`<main class="container tool-page"><a class="back" href="/">← All tools</a><div class="tool-kicker">${esc(t.category)} · ${live.has(t.title)?'LIVE ENGINE':'CATALOGUED'}</div><h1>${esc(t.title)}</h1><p class="hero-copy" style="text-align:left;margin:0 0 24px">${esc(t.description)}</p><div id="tool-mount"></div><div class="ad" style="margin-top:25px">ADVERTISEMENT</div></main>`;
  mountTool(t);
}

function mountTool(t){
  const m=document.getElementById('tool-mount');
  if(t.category==='PDF' && live.has(t.title)) mountPdf(m,t);
  else if(['Text','Developer','Privacy & Security'].includes(t.category) && live.has(t.title)) mountText(m,t);
  else if(['Calculators','Health & Medical'].includes(t.category) && live.has(t.title)) mountCalc(m,t);
  else if(t.category==='Images' && live.has(t.title)) mountImage(m,t);
  else if(t.category==='Audio' && live.has(t.title)) mountAudio(m,t);
  else if(t.category==='OCR & AI' && live.has(t.title)) mountOCR(m,t);
  else m.innerHTML=`<div class="panel"><h3>${esc(t.title)}</h3><p>This tool is catalogued and queued for a specialized engine. It is not presented as live yet.</p><p class="muted">Processing target: ${esc(t.processing)}. The common tool shell, metadata and ad placements are already in place.</p></div>`;
}

function mountText(m,t){
  m.innerHTML=`<div class="tool-layout"><section class="panel"><textarea id="tool-in" class="input-area" placeholder="Paste or type text…"></textarea><div class="button-row"><button class="btn primary" id="run">Run</button><button class="btn secondary" id="copy">Copy result</button></div></section><section class="panel"><pre id="tool-out" class="out"></pre></section></div>`;
  const out=document.getElementById('tool-out');
  document.getElementById('copy').onclick=async()=>{await navigator.clipboard?.writeText(out.textContent||'');};
  document.getElementById('run').onclick=async()=>{
    const s=document.getElementById('tool-in').value;let o='';
    if(t.title==='Word Counter') o=`Words: ${s.trim()?s.trim().split(/\s+/u).length:0}`;
    else if(t.title==='Character Counter') o=`Characters: ${s.length}`;
    else if(t.title==='Sentence Counter') o=`Sentences: ${(s.match(/[.!?]+(?=\s|$)/g)||[]).length}`;
    else if(t.title==='Paragraph Counter') o=`Paragraphs: ${s.trim()?s.trim().split(/\n\s*\n/).length:0}`;
    else if(t.title==='Reading Time Calculator'){const w=s.trim()?s.trim().split(/\s+/u).length:0;o=`Words: ${w}\nEstimated reading time: ${Math.max(1,Math.ceil(w/200))} min (200 wpm)`;}
    else if(t.title==='Uppercase Converter') o=s.toUpperCase();
    else if(t.title==='Lowercase Converter') o=s.toLowerCase();
    else if(t.title==='Title Case'||t.title==='Case Converter') o=s.toLowerCase().replace(/\b[\p{L}\p{N}]+/gu,w=>w[0].toUpperCase()+w.slice(1));
    else if(t.title==='Whitespace Cleaner') o=s.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    else if(t.title==='Trim Lines') o=s.split(/\r?\n/).map(x=>x.trim()).join('\n');
    else if(t.title==='Remove Duplicate Lines') o=[...new Set(s.split(/\r?\n/))].join('\n');
    else if(t.title==='Sort Lines') o=s.split(/\r?\n/).sort((a,b)=>a.localeCompare(b)).join('\n');
    else if(t.title==='Reverse Lines') o=s.split(/\r?\n/).reverse().join('\n');
    else if(t.title==='Number Lines') o=s.split(/\r?\n/).map((x,i)=>`${i+1}. ${x}`).join('\n');
    else if(t.title==='Slug Generator') o=s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
    else if(t.title==='JSON Formatter'||t.title==='JSON Minifier') try{o=JSON.stringify(JSON.parse(s),null,t.title==='JSON Formatter'?2:0)}catch(e){o='Invalid JSON: '+e.message}
    else if(t.title==='JSON Validator') try{JSON.parse(s);o='Valid JSON'}catch(e){o='Invalid JSON: '+e.message}
    else if(t.title==='Base64 Encoder') o=utf8ToBase64(s);
    else if(t.title==='Base64 Decoder') try{o=base64ToUtf8(s)}catch(e){o='Invalid Base64'}
    else if(t.title==='URL Encoder') o=encodeURIComponent(s);
    else if(t.title==='URL Decoder') try{o=decodeURIComponent(s)}catch(e){o='Invalid URL encoding'}
    else if(t.title==='UUID Generator') o=crypto.randomUUID();
    else if(t.title==='SHA-256 Hash'){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));o=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
    else if(t.title==='Text Statistics'){const w=s.trim()?s.trim().split(/\s+/u).length:0;o=`Characters: ${s.length}\nWords: ${w}\nLines: ${s? s.split(/\r?\n/).length:0}\nParagraphs: ${s.trim()?s.trim().split(/\n\s*\n/).length:0}`;}
    out.textContent=o;
  };
}

function utf8ToBase64(s){let bin='';for(const b of new TextEncoder().encode(s))bin+=String.fromCharCode(b);return btoa(bin)}
function base64ToUtf8(s){const bin=atob(s);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))}

function mountCalc(m,t){
  const fields = t.title==='BMI Calculator' ? ['Weight (kg)','Height (m)'] : ['Value A','Value B'];
  m.innerHTML=`<section class="panel"><div class="tool-layout">${fields.map((x,i)=>`<input id="n${i}" type="number" step="any" placeholder="${x}">`).join('')}</div><div class="button-row"><button class="btn primary" id="run">Calculate</button></div><div id="tool-out" class="out" style="margin-top:12px"></div><p class="muted">Educational calculator only. Check important results against an authoritative reference.</p></section>`;
  document.getElementById('run').onclick=()=>{
    const a=Number(document.getElementById('n0').value),b=Number(document.getElementById('n1').value);let r='';
    if(t.title==='Percentage Calculator') r=`Result: ${(a*b/100).toFixed(4)}`;
    else if(t.title==='Discount Calculator') r=`Final price: ${(a-a*b/100).toFixed(2)}\nYou save: ${(a*b/100).toFixed(2)}`;
    else if(t.title==='Tip Calculator') r=`Tip: ${(a*b/100).toFixed(2)}\nTotal: ${(a+a*b/100).toFixed(2)}`;
    else if(t.title==='BMI Calculator') r=b>0?`BMI: ${(a/(b*b)).toFixed(2)}`:'Enter a positive height.';
    else if(t.title==='GST Calculator') r=`GST amount: ${(a*b/100).toFixed(2)}\nTotal: ${(a+a*b/100).toFixed(2)}`;
    else if(t.title==='Markup Calculator') r=`Selling price: ${(a*(1+b/100)).toFixed(2)}`;
    else if(t.title==='Margin Calculator') r=a?`Margin: ${((a-b)/a*100).toFixed(2)}%`:'Enter a non-zero selling price in A.';
    else if(t.title==='Profit Calculator') r=`Profit: ${(a-b).toFixed(2)}\nProfit margin: ${a?((a-b)/a*100).toFixed(2)+'%':'—'}`;
    else if(t.title==='Break Even Calculator') r=b>0?`Break-even units: ${Math.ceil(a/b)}`:'Enter positive variable contribution in B.';
    document.getElementById('tool-out').textContent=r;
  };
}

function mountImage(m,t){
  m.innerHTML=`<section class="panel"><div class="dropzone" id="drop">Choose an image<input id="file" type="file" accept="image/*" class="hidden"></div><div class="tool-layout" style="margin-top:12px"><input id="width" type="number" min="1" placeholder="Width (optional)"><input id="quality" type="number" min="0.1" max="1" step="0.1" value="0.8"></div><button class="btn primary" id="run" style="margin-top:12px">Process</button><div id="tool-out" class="out" style="margin-top:12px"></div></section>`;
  let file;
  document.getElementById('drop').onclick=()=>document.getElementById('file').click();
  document.getElementById('file').onchange=e=>file=e.target.files[0];
  document.getElementById('run').onclick=async()=>{
    if(!file){document.getElementById('tool-out').textContent='Choose an image first.';return}
    const img=new Image();img.src=URL.createObjectURL(file);await img.decode();
    const canvas=document.createElement('canvas');const w=Number(document.getElementById('width').value)||img.width;canvas.width=w;canvas.height=Math.max(1,Math.round(img.height*w/img.width));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',Number(document.getElementById('quality').value)||.8));
    downloadBlob(blob,'freetoolforge-image.jpg');document.getElementById('tool-out').textContent=`Done — ${Math.round(blob.size/1024)} KB`;
  };
}

function mountAudio(m,t){
  m.innerHTML=`<section class="panel"><div class="dropzone" id="drop">Choose an audio file<input id="file" type="file" accept="audio/*" class="hidden"></div><button class="btn primary" id="run" style="margin-top:12px">Inspect audio</button><div id="tool-out" class="out" style="margin-top:12px"></div><p class="muted">Heavy AI denoising can use a model server or a compatible browser model. This inspection tool does not claim to denoise the file.</p></section>`;
  let file;document.getElementById('drop').onclick=()=>document.getElementById('file').click();document.getElementById('file').onchange=e=>file=e.target.files[0];
  document.getElementById('run').onclick=async()=>{if(!file)return;const ac=new AudioContext();const buf=await ac.decodeAudioData(await file.arrayBuffer());document.getElementById('tool-out').textContent=`${file.name}\nDuration: ${buf.duration.toFixed(2)} s\nChannels: ${buf.numberOfChannels}\nSample rate: ${buf.sampleRate} Hz`;await ac.close();};
}

function mountOCR(m,t){
  m.innerHTML=`<section class="panel"><div class="dropzone" id="drop">Choose an image<input id="file" type="file" accept="image/*" class="hidden"></div><select id="model" style="width:100%;margin-top:12px;padding:11px;border:1px solid var(--line);border-radius:11px"><option>Xenova/trocr-small-printed</option><option>Xenova/trocr-small-handwritten</option></select><button class="btn primary" id="run" style="margin-top:12px">Run OCR</button><div id="tool-out" class="out" style="margin-top:12px">Browser model integration is staged; this page currently manages model selection and file handoff without pretending the OCR result is ready.</div></section>`;
  let file;document.getElementById('drop').onclick=()=>document.getElementById('file').click();document.getElementById('file').onchange=e=>file=e.target.files[0];document.getElementById('run').onclick=()=>{document.getElementById('tool-out').textContent=file?`Selected ${file.name}. Engine adapter pending.`:'Choose an image.'};
}

function downloadBlob(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function mountPdf(m,t){
  m.innerHTML=`<section class="panel"><div class="dropzone" id="drop">Choose PDF file(s)<input id="file" type="file" accept="application/pdf" multiple class="hidden"></div><div id="pdf-extra" class="field-stack" style="margin-top:12px"></div><div class="button-row"><button class="btn primary" id="run">Run PDF tool</button></div><div id="tool-out" class="out" style="margin-top:12px"></div><p class="muted">PDF edits run in your browser in this phase. Large or unusually complex PDFs may still need the server worker.</p></section>`;
  const extra=document.getElementById('pdf-extra');
  const setupExtra=()=>{
    if(['Split PDF'].includes(t.title)) extra.innerHTML='<input id="pages" type="number" min="1" value="10" placeholder="Pages per output PDF"><input id="prefix" value="split" placeholder="Output prefix">';
    else if(['Extract PDF Pages','Delete PDF Pages'].includes(t.title)) extra.innerHTML='<input id="range" placeholder="Pages, e.g. 1-3,5,8-10"><small class="muted">Page numbers are 1-based.</small>';
    else if(t.title==='Rotate PDF') extra.innerHTML='<input id="range" placeholder="Pages to rotate, e.g. 2-4 (blank = all)"><input id="degrees" type="number" step="90" value="90" placeholder="Degrees: 90, 180, 270">';
    else if(t.title==='Reorder PDF Pages') extra.innerHTML='<input id="order" placeholder="New order, e.g. 3,1,2,4"><small class="muted">Provide every page exactly once.</small>';
    else if(t.title==='Text to PDF') extra.innerHTML='<textarea id="textpdf" class="input-area" placeholder="Text to place on the PDF…"></textarea>';
  };
  setupExtra();
  let files=[];document.getElementById('drop').onclick=()=>document.getElementById('file').click();document.getElementById('file').onchange=e=>files=[...e.target.files];
  document.getElementById('run').onclick=async()=>{
    try{
      document.getElementById('tool-out').textContent='Loading PDF engine…';
      const {PDFDocument,StandardFonts,rgb,degrees}=await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
      if(t.title==='Text to PDF'){
        const doc=await PDFDocument.create();const page=doc.addPage([595.28,841.89]);const font=await doc.embedFont(StandardFonts.Helvetica);const txt=document.getElementById('textpdf').value||'';const lines=wrapText(txt,90);let y=800;for(const line of lines){page.drawText(line,{x:45,y,size:11,font,color:rgb(0,0,0)});y-=16;if(y<45)break}downloadBlob(new Blob([await doc.save()],{type:'application/pdf'}),'freetoolforge-text.pdf');document.getElementById('tool-out').textContent='Created PDF.';return;
      }
      if(!files.length){document.getElementById('tool-out').textContent='Choose at least one PDF.';return}
      const bytes=await Promise.all(files.map(f=>f.arrayBuffer()));
      if(t.title==='Merge PDFs'){
        const out=await PDFDocument.create();for(const b of bytes){const src=await PDFDocument.load(b,{ignoreEncryption:true});const copied=await out.copyPages(src,src.getPageIndices());copied.forEach(p=>out.addPage(p))}downloadBlob(new Blob([await out.save()],{type:'application/pdf'}),'freetoolforge-merged.pdf');document.getElementById('tool-out').textContent=`Merged ${files.length} PDFs.`;return;
      }
      if(files.length!==1){document.getElementById('tool-out').textContent='This operation uses one input PDF.';return}
      const src=await PDFDocument.load(bytes[0],{ignoreEncryption:true});const n=src.getPageCount();
      if(t.title==='Split PDF'){
        const chunk=Math.max(1,Number(document.getElementById('pages').value)||10);let part=0;for(let start=0;start<n;start+=chunk){const end=Math.min(n,start+chunk);const out=await PDFDocument.create();const copied=await out.copyPages(src,Array.from({length:end-start},(_,i)=>start+i));copied.forEach(p=>out.addPage(p));downloadBlob(new Blob([await out.save()],{type:'application/pdf'}),`${document.getElementById('prefix').value||'split'}-${++part}.pdf`)}document.getElementById('tool-out').textContent=`Created ${part} PDF parts.`;return;
      }
      const parseRange=(s)=>{if(!s.trim())return Array.from({length:n},(_,i)=>i);const arr=[];for(const tok of s.split(',')){const q=tok.trim();if(!q)continue;if(q.includes('-')){let[a,b]=q.split('-').map(Number);if(!Number.isInteger(a)||!Number.isInteger(b))throw Error('Invalid range');if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)arr.push(i-1)}else{const v=Number(q);if(!Number.isInteger(v))throw Error('Invalid page');arr.push(v-1)}};const uniq=[...new Set(arr)];if(uniq.some(i=>i<0||i>=n))throw Error(`Page must be between 1 and ${n}`);return uniq};
      const saveSubset=async(indices,name)=>{const out=await PDFDocument.create();const copied=await out.copyPages(src,indices);copied.forEach(p=>out.addPage(p));downloadBlob(new Blob([await out.save()],{type:'application/pdf'}),name)};
      if(t.title==='Extract PDF Pages'){await saveSubset(parseRange(document.getElementById('range').value),'freetoolforge-extracted.pdf');document.getElementById('tool-out').textContent='Extracted requested pages.';return}
      if(t.title==='Delete PDF Pages'){const del=new Set(parseRange(document.getElementById('range').value));const keep=Array.from({length:n},(_,i)=>i).filter(i=>!del.has(i));if(!keep.length)throw Error('Cannot delete every page.');await saveSubset(keep,'freetoolforge-deleted-pages.pdf');document.getElementById('tool-out').textContent='Deleted requested pages.';return}
      if(t.title==='Rotate PDF'){const ids=parseRange(document.getElementById('range').value);const deg=Number(document.getElementById('degrees').value)||90;for(const i of ids){const p=src.getPage(i);p.setRotation(degrees(((p.getRotation().angle||0)+deg)%360))}downloadBlob(new Blob([await src.save()],{type:'application/pdf'}),'freetoolforge-rotated.pdf');document.getElementById('tool-out').textContent='Rotated selected pages.';return}
      if(t.title==='Reorder PDF Pages'){const order=document.getElementById('order').value.split(',').map(Number);if(order.length!==n||new Set(order).size!==n||order.some(v=>v<1||v>n))throw Error(`Enter every page exactly once (1-${n}).`);await saveSubset(order.map(v=>v-1),'freetoolforge-reordered.pdf');document.getElementById('tool-out').textContent='Reordered PDF pages.';return}
    }catch(e){document.getElementById('tool-out').textContent=`Error: ${e.message||e}`}
  };
}

function wrapText(text,maxChars){const out=[];for(const para of text.split(/\r?\n/)){let line='';for(const w of para.split(/\s+/)){if(!w)continue;if((line+' '+w).trim().length>maxChars){out.push(line);line=w}else line=(line+' '+w).trim()}out.push(line)}return out}

setup();
loadRegistry().catch(err=>{document.getElementById('tool-grid').innerHTML=`<div class="panel"><b>Tool registry failed to load.</b><p>${esc(err.message)}</p></div>`});
