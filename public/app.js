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
  'Merge PDFs','Split PDF','Compress PDF','Repair PDF','Redact PDF','Rotate PDF','Reorder PDF Pages','Extract PDF Pages','Delete PDF Pages',
  'PDF Metadata Viewer','Extract PDF Images','Remove PDF Metadata','Add PDF Watermark','Add PDF Page Numbers','Overlay PDFs','Compare PDFs','Crop PDF','Resize PDF Pages',
  'OCR PDF','PDF to Images','PDF to Text','PDF to Markdown','PDF to HTML','Fill PDF','Annotate PDF','Sign PDF','PDF Form Field Viewer','Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF','Text to PDF','Markdown to PDF',
  'Pages per Sheet','Two Pages per Sheet','Booklet PDF Maker','PDF Page Counter','PDF Page Extractor','PDF Batch Rename','Invoice PDF Maker'
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
  const pdfTools = new Set([
    'Merge PDFs','Split PDF','Compress PDF','Repair PDF','Redact PDF','Rotate PDF','Reorder PDF Pages',
    'Extract PDF Pages','Delete PDF Pages','PDF Metadata Viewer','Extract PDF Images','Remove PDF Metadata','Add PDF Watermark','OCR PDF',
    'Add PDF Page Numbers','Overlay PDFs','Compare PDFs','Crop PDF','Resize PDF Pages','PDF to Images',
    'PDF to Text','PDF to Markdown','PDF to HTML','Fill PDF','Annotate PDF','Images to PDF','JPG to PDF',
    'PNG to PDF','WEBP to PDF','Text to PDF','Pages per Sheet','Two Pages per Sheet','PDF Page Counter',
    'PDF Page Extractor','Sign PDF','PDF Form Field Viewer','Booklet PDF Maker','PDF Batch Rename','Invoice PDF Maker','Markdown to PDF'
  ]);
  if(!pdfTools.has(t.title)){
    m.innerHTML=`<div class="panel"><p>This PDF tool is catalogued for a later specialized engine.</p></div>`;
    return;
  }

  const noFile=['Text to PDF','Markdown to PDF','Invoice PDF Maker'].includes(t.title);
  const isMulti=['Merge PDFs','Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF','Overlay PDFs','Compare PDFs','PDF Batch Rename'].includes(t.title);
  const accept = t.title==='JPG to PDF' ? 'image/jpeg' : t.title==='PNG to PDF' ? 'image/png' : t.title==='WEBP to PDF' ? 'image/webp' : t.title==='Images to PDF' ? 'image/*' : 'application/pdf';
  const inputLabel = t.title==='Redact PDF' ? 'Choose a PDF to redact' : t.title==='Overlay PDFs' ? 'Choose base PDF + overlay PDF (in that order)' : t.title==='Compare PDFs' ? 'Choose two PDFs to compare' : t.title==='PDF Batch Rename' ? 'Choose PDFs to rename' : 'Choose PDF file(s)';
  m.innerHTML=`<section class="panel">
    ${noFile?'':`<div class="dropzone" id="drop">${inputLabel}<input id="file" type="file" accept="${accept}" ${isMulti?'multiple':''} class="hidden"></div>`}
    <div id="pdf-extra" class="field-stack" style="margin-top:12px"></div>
    <div class="button-row"><button class="btn primary" id="run">${t.title==='PDF to Images'?'Render pages':t.title==='PDF to Text'||t.title==='PDF to Markdown'||t.title==='PDF to HTML'?'Extract text':'Run PDF tool'}</button></div>
    <div id="tool-out" class="out" style="margin-top:12px"></div>
    <p class="muted">Browser-first processing. Your file stays on this device for these local engines. PDF.js is loaded only for rendering/text extraction.</p>
  </section>`;
  const extra=document.getElementById('pdf-extra');
  const out=document.getElementById('tool-out');
  const setupExtra=()=>{
    const commonRange='<input id="range" placeholder="Pages, e.g. 1-3,5,8-10"><small class="muted">Page numbers are 1-based. Blank means all pages.</small>';
    if(t.title==='Split PDF') extra.innerHTML='<label>Pages per part <input id="pages" type="number" min="1" value="10"></label><input id="prefix" value="split" placeholder="Output filename prefix">';
    else if(['Extract PDF Pages','Delete PDF Pages','PDF Page Extractor'].includes(t.title)) extra.innerHTML=commonRange;
    else if(t.title==='Rotate PDF') extra.innerHTML=`${commonRange}<label>Degrees <select id="degrees"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></label>`;
    else if(t.title==='Reorder PDF Pages') extra.innerHTML='<input id="order" placeholder="New order, e.g. 3,1,2,4"><small class="muted">Every page exactly once.</small>';
    else if(t.title==='PDF Metadata Viewer') extra.innerHTML='<small class="muted">Reads standard document metadata plus page count and encryption flag.</small>';
    else if(t.title==='Remove PDF Metadata') extra.innerHTML='<label><input id="blankMeta" type="checkbox" checked> Remove title, author, subject, keywords, creator and producer</label>';
    else if(t.title==='Compress PDF') extra.innerHTML='<label><input id="stripMeta" type="checkbox" checked> Strip document metadata</label><small class="muted">Uses object streams and reserialization. Existing embedded images are not recompressed.</small>';
    else if(t.title==='Add PDF Watermark') extra.innerHTML='<input id="watermark" placeholder="Watermark text" value="FreeToolForge"><input id="wmOpacity" type="number" min="0.05" max="1" step="0.05" value="0.25" placeholder="Opacity"><select id="wmPos"><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="diagonal">Diagonal</option></select>';
    else if(t.title==='Add PDF Page Numbers') extra.innerHTML='<select id="numPos"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-center">Top center</option></select><input id="numStart" type="number" value="1" min="1" placeholder="Start number">';
    else if(t.title==='Overlay PDFs') extra.innerHTML='<select id="overlayMode"><option value="each">Overlay same overlay page on every base page</option><option value="match">Match overlay page number</option></select><small class="muted">The overlay is drawn on top of the base page.</small>';
    else if(t.title==='Compare PDFs') extra.innerHTML='<small class="muted">Upload exactly two PDFs. Comparison reports page counts, metadata differences, and extracted text differences page-by-page.</small>';
    else if(t.title==='Crop PDF') extra.innerHTML='<input id="crop" placeholder="Margins in points: left,top,right,bottom e.g. 36,36,36,36" value="36,36,36,36"><small class="muted">Margins are measured inward from each page edge.</small>';
    else if(t.title==='Resize PDF Pages') extra.innerHTML='<select id="size"><option value="A4">A4 (595×842 pt)</option><option value="Letter">Letter (612×792 pt)</option><option value="A5">A5 (420×595 pt)</option><option value="fit">Fit content to its current page size</option></select><select id="resizeMode"><option value="contain">Contain</option><option value="stretch">Stretch</option></select>';
    else if(['Pages per Sheet','Two Pages per Sheet'].includes(t.title)) extra.innerHTML='<select id="sheet"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A3">A3</option></select><select id="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>';
    else if(t.title==='Fill PDF') extra.innerHTML='<small class="muted">The tool lists fillable fields after loading. Use the generated controls to enter values, tick checkboxes, or choose dropdown items.</small><div id="form-fields"></div>';
    else if(t.title==='Annotate PDF') extra.innerHTML='<input id="noteText" placeholder="Annotation text" value="Reviewed"><input id="notePage" type="number" min="1" value="1" placeholder="Page"><input id="noteX" type="number" value="50" placeholder="X"><input id="noteY" type="number" value="50" placeholder="Y">';
    else if(t.title==='Sign PDF') extra.innerHTML='<input id="sigText" placeholder="Signature name" value="Your Name"><input id="sigPage" type="number" min="1" value="1" placeholder="Page"><input id="sigX" type="number" value="50" placeholder="X"><input id="sigY" type="number" value="70" placeholder="Y"><input id="sigSize" type="number" min="8" value="20" placeholder="Size">';
    else if(t.title==='PDF Form Field Viewer') extra.innerHTML='<div id="form-fields"></div>';
    else if(t.title==='Booklet PDF Maker') extra.innerHTML='<select id="bookletSize"><option value="A4">A4 landscape</option><option value="Letter">Letter landscape</option></select><small class="muted">Creates printer-friendly 2-up booklet imposition. Blank pages are inserted as needed to make a multiple of four.</small>';
    else if(t.title==='PDF Batch Rename') extra.innerHTML='<input id="renamePattern" value="document-{n}" placeholder="Pattern e.g. chapter-{n}"><small class="muted">Files are returned in a ZIP. {n} becomes the 1-based file number.</small>';
    else if(t.title==='Invoice PDF Maker') extra.innerHTML='<input id="invTitle" value="Invoice" placeholder="Invoice title"><input id="invTo" placeholder="Bill to"><textarea id="invItems" class="input-area" style="min-height:140px" placeholder="One item per line: Description | Quantity | Rate"></textarea>';
    else if(t.title==='Text to PDF') extra.innerHTML='<textarea id="textpdf" class="input-area" placeholder="Text to place on the PDF…"></textarea><select id="textSize"><option value="11">11 pt</option><option value="12" selected>12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option></select>';
    else if(['PDF to Text','PDF to Markdown','PDF to HTML'].includes(t.title)) extra.innerHTML='<label><input id="onePerPage" type="checkbox" checked> Add page headings</label>';
    else if(t.title==='Redact PDF') extra.innerHTML='<div id="redactHelp" class="muted">Secure mode: pages are rendered to images and rebuilt as a new image-only PDF, so original searchable text is not retained. Enter rectangles as <b>page:x,y,w,h</b> percentages (0–100), separated by semicolons. Example: <code>1:10,20,30,10;1:60,20,20,10</code>.</div><textarea id="redactions" class="input-area" placeholder="page:x,y,width,height; page:x,y,width,height"></textarea>';
  };
  setupExtra();

  let files=[];
  const drop=document.getElementById('drop'), input=document.getElementById('file');
  if(drop&&input){drop.onclick=()=>input.click();input.onchange=e=>{files=[...e.target.files];out.textContent=files.length?files.map(f=>`${f.name} — ${Math.round(f.size/1024)} KB`).join('\n'):'No file selected.'; if(['Fill PDF','PDF Form Field Viewer'].includes(t.title)&&files[0]) loadFormFields(files[0]);};}

  const loadPdfLib=()=>import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const loadPdfJs=async()=>{
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    return pdfjs;
  };
  const parseRange=(s,n)=>{if(!s?.trim())return Array.from({length:n},(_,i)=>i);const arr=[];for(const tok of s.split(',')){const q=tok.trim();if(!q)continue;if(q.includes('-')){let[a,b]=q.split('-').map(Number);if(!Number.isInteger(a)||!Number.isInteger(b))throw Error('Invalid range');if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)arr.push(i-1)}else{const v=Number(q);if(!Number.isInteger(v))throw Error('Invalid page');arr.push(v-1)}}const uniq=[...new Set(arr)];if(uniq.some(i=>i<0||i>=n))throw Error(`Page must be between 1 and ${n}`);return uniq;};
  const download=(bytes,name,type='application/pdf')=>downloadBlob(new Blob([bytes],{type}),name);
  const savePdf=async doc=>doc.save({useObjectStreams:true,addDefaultPage:false});
  const loadOne=async()=>{if(!files.length)throw Error('Choose a PDF first.');return await PDFDocument.load(await files[0].arrayBuffer(),{ignoreEncryption:true});};
  const createFromIndices=async(src,indices,PDFDocument)=>{const doc=await PDFDocument.create();const pages=await doc.copyPages(src,indices);pages.forEach(p=>doc.addPage(p));return doc;};
  const fitText=(font,text,maxWidth,size)=>{let cur='';const words=text.split(/\s+/);const lines=[];for(const w of words){const cand=cur?cur+' '+w:w;if(font.widthOfTextAtSize(cand,size)<=maxWidth)cur=cand;else{if(cur)lines.push(cur);cur=w}}if(cur)lines.push(cur);return lines};
  const imageFilesToPdf=async(PDFDocument,StandardFonts,files)=>{const doc=await PDFDocument.create();for(const f of files){const b=await f.arrayBuffer();let img;if(f.type==='image/jpeg'||/\.jpe?g$/i.test(f.name))img=await doc.embedJpg(b);else if(f.type==='image/png'||/\.png$/i.test(f.name))img=await doc.embedPng(b);else{const bmp=await createImageBitmap(f);const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));img=await doc.embedPng(await blob.arrayBuffer());bmp.close();}const margin=24;const page=doc.addPage([Math.max(1,img.width+margin*2),Math.max(1,img.height+margin*2)]);page.drawImage(img,{x:margin,y:margin,width:img.width,height:img.height});}return doc;};

  async function loadFormFields(file){
    try{const {PDFDocument}=await loadPdfLib();const doc=await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:true});const form=doc.getForm();const fields=form.getFields();const mount=document.getElementById('form-fields');if(!fields.length){mount.innerHTML='<p class="muted">No AcroForm fields detected.</p>';return}mount.innerHTML=fields.map((f,i)=>{const name=esc(f.getName());const typ=f.constructor?.name||'Field';return `<label style="display:block;margin-top:8px"><span>${name}</span><input data-fi="${i}" data-kind="${esc(typ)}" placeholder="${esc(typ)}"></label>`}).join('');mount.dataset.count=fields.length;mount._fields=fields;
    }catch(e){document.getElementById('form-fields').innerHTML='<p class="muted">Unable to inspect form fields: '+esc(e.message)+'</p>';}}

  document.getElementById('run').onclick=async()=>{
    try{
      out.textContent='Loading PDF engine…';
      const {PDFDocument,StandardFonts,rgb,grayscale,degrees,PageSizes}=await loadPdfLib();
      if(t.title==='Text to PDF'){
        const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const size=Number(document.getElementById('textSize').value)||12;const txt=document.getElementById('textpdf').value||'';const pageW=595.28,pageH=841.89,margin=45;let page=doc.addPage([pageW,pageH]),y=pageH-margin;for(const para of txt.split(/\r?\n/)){const lines=fitText(font,para||' ',pageW-margin*2,size);for(const line of lines){if(y<size+margin){page=doc.addPage([pageW,pageH]);y=pageH-margin}page.drawText(line,{x:margin,y,size,font,color:rgb(0,0,0)});y-=size+5}y-=5}download(await savePdf(doc),'freetoolforge-text.pdf');out.textContent='Created PDF.';return;
      }
      if(['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)){
        if(!files.length)throw Error('Choose at least one image.');const doc=await imageFilesToPdf(PDFDocument,StandardFonts,files);download(await savePdf(doc),'freetoolforge-images.pdf');out.textContent=`Converted ${files.length} image${files.length===1?'':'s'} to PDF.`;return;
      }
      if(!files.length)throw Error('Choose at least one PDF.');
      if(t.title==='Merge PDFs'){
        const outDoc=await PDFDocument.create();for(const f of files){const src=await PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});const cp=await outDoc.copyPages(src,src.getPageIndices());cp.forEach(p=>outDoc.addPage(p))}download(await savePdf(outDoc),'freetoolforge-merged.pdf');out.textContent=`Merged ${files.length} PDFs.`;return;
      }
      if(['Pages per Sheet','Two Pages per Sheet'].includes(t.title)){
        if(files.length!==1)throw Error('Choose one PDF.');const src=await loadOne();const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const sheetOpt=document.getElementById('sheet').value;const orient=document.getElementById('orientation').value;const dims={A4:[595,842],Letter:[612,792],A3:[842,1191]};let [sw,sh]=dims[sheetOpt];if(orient==='landscape')[sw,sh]=[sh,sw];const slots=t.title==='Two Pages per Sheet'?2:4;const cols=slots===2?1:2,rows=slots===2?2:2;const doc=await PDFDocument.create();for(let start=0;start<src.getPageCount();start+=slots){const page=doc.addPage([sw,sh]);for(let slot=0;slot<slots && start+slot<task.numPages;slot++){const r=Math.floor(slot/cols),c=slot%cols;const rp=await task.getPage(start+slot+1);const vp=rp.getViewport({scale:1});const sx=sw/cols/vp.width,sy=sh/rows/vp.height,scale=Math.min(sx,sy)*0.95;const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width*scale);canvas.height=Math.ceil(vp.height*scale);await rp.render({canvasContext:canvas.getContext('2d'),viewport:rp.getViewport({scale})}).promise;const png=await new Promise(res=>canvas.toBlob(res,'image/png'));const img=await doc.embedPng(await png.arrayBuffer());const cellW=sw/cols,cellH=sh/rows;const dw=img.width,dh=img.height;page.drawImage(img,{x:c*cellW+(cellW-dw)/2,y:sh-(r+1)*cellH+(cellH-dh)/2,width:dw,height:dh});canvas.width=1;canvas.height=1;await rp.cleanup?.()}}download(await savePdf(doc),'freetoolforge-n-up.pdf');out.textContent=`Created ${Math.ceil(src.getPageCount()/slots)} output sheets.`;return;
      }
      const src=await loadOne(), n=src.getPageCount();
      if(t.title==='PDF Page Counter'){out.textContent=`Pages: ${n}\nFile: ${files[0].name}\nSize: ${Math.round(files[0].size/1024)} KB`;return;}
      if(t.title==='Compress PDF'){
        if(document.getElementById('stripMeta').checked){src.setTitle('');src.setAuthor('');src.setSubject('');src.setKeywords([]);src.setCreator('');src.setProducer('')}
        const b=await src.save({useObjectStreams:true,addDefaultPage:false});download(b,'freetoolforge-compressed.pdf');const ratio=((1-b.byteLength/files[0].size)*100).toFixed(1);out.textContent=`Reserialized PDF.\nBefore: ${Math.round(files[0].size/1024)} KB\nAfter: ${Math.round(b.byteLength/1024)} KB\nSize change: ${ratio}% ${ratio>=0?'smaller':'larger'}\nNote: embedded images are not recompressed.`;return;
      }
      if(t.title==='Repair PDF'){
        const b=await src.save({useObjectStreams:true,addDefaultPage:false});download(b,'freetoolforge-repaired.pdf');out.textContent=`PDF parsed and successfully reserialized. Pages: ${n}. This repairs parseable structural issues; a severely damaged PDF may still be unreadable.`;return;
      }
      if(t.title==='PDF Metadata Viewer'){
        const rows=[['Title',src.getTitle()],['Author',src.getAuthor()],['Subject',src.getSubject()],['Keywords',(src.getKeywords()||[]).join(', ')],['Creator',src.getCreator()],['Producer',src.getProducer()],['Creation date',src.getCreationDate()?.toISOString()||''],['Modification date',src.getModificationDate()?.toISOString()||''],['Pages',n],['Encrypted',String(src.isEncrypted)]];out.textContent=rows.map(([k,v])=>`${k}: ${v??''}`).join('\n');return;
      }
      if(t.title==='Remove PDF Metadata'){
        src.setTitle('');src.setAuthor('');src.setSubject('');src.setKeywords([]);src.setCreator('');src.setProducer('');download(await savePdf(src),'freetoolforge-metadata-removed.pdf');out.textContent='Standard document metadata removed.';return;
      }
      if(t.title==='Split PDF'){
        const chunk=Math.max(1,Number(document.getElementById('pages').value)||10);const parts=[];for(let start=0;start<n;start+=chunk){const end=Math.min(n,start+chunk);const d=await createFromIndices(src,Array.from({length:end-start},(_,i)=>start+i),PDFDocument);const b=await savePdf(d);parts.push({name:`${document.getElementById('prefix').value||'split'}-${String(parts.length+1).padStart(2,'0')}.pdf`,b})}if(parts.length===1)download(parts[0].b,parts[0].name);else{const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();parts.forEach(p=>zip.file(p.name,p.b));zip.file('MANIFEST.json',JSON.stringify({source:files[0].name,pages:n,parts:parts.length},null,2));download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),`${files[0].name.replace(/\.pdf$/i,'')}-split.zip`,'application/zip')}out.textContent=`Created ${parts.length} part${parts.length===1?'':'s'}; every source page is included exactly once.`;return;
      }
      const indices=parseRange(document.getElementById('range')?.value||'',n);
      if(['Extract PDF Pages','PDF Page Extractor'].includes(t.title)){const d=await createFromIndices(src,indices,PDFDocument);download(await savePdf(d),'freetoolforge-extracted.pdf');out.textContent=`Extracted ${indices.length} page${indices.length===1?'':'s'}.`;return;}
      if(t.title==='Delete PDF Pages'){const del=new Set(indices);const keep=Array.from({length:n},(_,i)=>i).filter(i=>!del.has(i));if(!keep.length)throw Error('Cannot delete every page.');const d=await createFromIndices(src,keep,PDFDocument);download(await savePdf(d),'freetoolforge-pages-deleted.pdf');out.textContent=`Deleted ${indices.length} page${indices.length===1?'':'s'}; ${keep.length} remain.`;return;}
      if(t.title==='Reorder PDF Pages'){const order=(document.getElementById('order').value||'').split(',').map(Number);if(order.length!==n||new Set(order).size!==n||order.some(v=>!Number.isInteger(v)||v<1||v>n))throw Error(`Enter every page exactly once (1-${n}).`);const d=await createFromIndices(src,order.map(v=>v-1),PDFDocument);download(await savePdf(d),'freetoolforge-reordered.pdf');out.textContent='Reordered PDF pages.';return;}
      if(t.title==='Rotate PDF'){const deg=Number(document.getElementById('degrees').value)||90;indices.forEach(i=>{const p=src.getPage(i);p.setRotation(degrees(((p.getRotation().angle||0)+deg)%360))});download(await savePdf(src),'freetoolforge-rotated.pdf');out.textContent=`Rotated ${indices.length} page${indices.length===1?'':'s'} by ${deg}°.`;return;}
      if(t.title==='Add PDF Page Numbers'){
        const font=await src.embedFont(StandardFonts.Helvetica);const pos=document.getElementById('numPos').value;const startNum=Number(document.getElementById('numStart').value)||1;src.getPages().forEach((p,i)=>{const {width,height}=p.getSize();const text=String(startNum+i),size=10,tw=font.widthOfTextAtSize(text,size);let x=(width-tw)/2,y=18;if(pos==='bottom-right')x=width-28-tw;if(pos==='bottom-left')x=28;if(pos==='top-center')y=height-28;p.drawText(text,{x,y,size,font,color:rgb(0,0,0)})});download(await savePdf(src),'freetoolforge-page-numbers.pdf');out.textContent=`Added page numbers to ${n} pages.`;return;
      }
      if(t.title==='Add PDF Watermark'){
        const font=await src.embedFont(StandardFonts.HelveticaBold);const wm=document.getElementById('watermark').value||'FreeToolForge';const opacity=Math.max(.05,Math.min(1,Number(document.getElementById('wmOpacity').value)||.25));const pos=document.getElementById('wmPos').value;src.getPages().forEach(p=>{const {width,height}=p.getSize();const size=Math.max(18,Math.min(60,width/10));const tw=font.widthOfTextAtSize(wm,size);let x=(width-tw)/2,y=height/2;let rot=0;if(pos==='top'){y=height-48;x=(width-tw)/2}else if(pos==='bottom'){y=30;x=(width-tw)/2}else if(pos==='diagonal'){rot=-35;y=height/2;x=(width-tw)/2}p.drawText(wm,{x,y,size,font,color:grayscale(.45),opacity,rotate:degrees(rot)})});download(await savePdf(src),'freetoolforge-watermarked.pdf');out.textContent='Watermark added.';return;
      }
      if(t.title==='Overlay PDFs'){
        if(files.length!==2)throw Error('Choose exactly two PDFs: base first, overlay second.');const base=src, overlay=await PDFDocument.load(await files[1].arrayBuffer(),{ignoreEncryption:true});const mode=document.getElementById('overlayMode').value;const pages=base.getPages();for(let i=0;i<pages.length;i++){const oi=mode==='match'?Math.min(i,overlay.getPageCount()-1):0;const [embedded]=await base.embedPdf(await files[1].arrayBuffer(),[oi]);const p=pages[i];const {width,height}=p.getSize();if(!behind)p.drawPage(embedded,{x:0,y:0,width,height,opacity:1});else{const tmp=await PDFDocument.create();const [ep]=await tmp.embedPdf(await files[0].arrayBuffer(),[i]);const np=tmp.addPage([width,height]);np.drawPage(embedded,{x:0,y:0,width,height});np.drawPage(ep,{x:0,y:0,width,height});} }download(await savePdf(base),'freetoolforge-overlay.pdf');out.textContent='Overlay applied.';return;
      }
      if(t.title==='Crop PDF'){
        const nums=(document.getElementById('crop').value||'0,0,0,0').split(',').map(Number);if(nums.length!==4||nums.some(x=>!Number.isFinite(x)||x<0))throw Error('Enter four non-negative margins: left,top,right,bottom.');src.getPages().forEach(p=>{const {width,height}=p.getSize();const [l,top,r,b]=nums;if(l+r>=width||top+b>=height)throw Error('Crop margins are too large for at least one page.');p.setCropBox(l,b,width-l-r,height-top-b)});download(await savePdf(src),'freetoolforge-cropped.pdf');out.textContent='Crop box updated on all pages.';return;
      }
      if(t.title==='Resize PDF Pages'){
        const presets={A4:[595.28,841.89],Letter:[612,792],A5:[419.53,595.28]};const choice=document.getElementById('size').value;const mode=document.getElementById('resizeMode').value;const target=choice==='fit'?null:presets[choice];if(!target){out.textContent='No-op fit mode: the existing page size is preserved.';return}const resized=await PDFDocument.create();for(const p of src.getPages()){const {width,height}=p.getSize();const ep=await resized.embedPage(p);const np=resized.addPage(target);const sx=target[0]/width,sy=target[1]/height;const sx2=mode==='stretch'?sx:Math.min(sx,sy),sy2=mode==='stretch'?sy:sx2;np.drawPage(ep,{x:(target[0]-width*sx2)/2,y:(target[1]-height*sy2)/2,width:width*sx2,height:height*sy2})}download(await savePdf(resized),'freetoolforge-resized.pdf');out.textContent=`Resized ${n} pages to ${choice}.`;return;
      }
      if(t.title==='PDF to Images'){
        const pdfjs=await loadPdfJs(),task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();for(let i=1;i<=task.numPages;i++){const page=await task.getPage(i);const vp=page.getViewport({scale:1.5});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));zip.file(`page-${String(i).padStart(String(task.numPages).length,'0')}.png`,await blob.arrayBuffer());canvas.width=1;canvas.height=1;await page.cleanup?.()}download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),`${files[0].name.replace(/\.pdf$/i,'')}-images.zip`,'application/zip');out.textContent=`Rendered ${task.numPages} page${task.numPages===1?'':'s'} to PNG images.`;return;
      }
      if(['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)){
        const pdfjs=await loadPdfJs();const extract=async f=>{const task=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];for(let i=1;i<=task.numPages;i++){const page=await task.getPage(i);const tc=await page.getTextContent();const text=tc.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim();pages.push(text);await page.cleanup?.()}return pages};
        if(t.title==='Compare PDFs'){if(files.length!==2)throw Error('Choose exactly two PDFs.');const [a,b]=await Promise.all(files.map(extract));const lines=[];const max=Math.max(a.length,b.length);for(let i=0;i<max;i++){if((a[i]||'')!==(b[i]||'')){lines.push(`Page ${i+1}: DIFFERENT`);lines.push(`A: ${a[i]||'[missing]'}`);lines.push(`B: ${b[i]||'[missing]'}`)}}out.textContent=`PDF A pages: ${a.length}\nPDF B pages: ${b.length}\nDifferent pages: ${lines.filter(x=>x.endsWith('DIFFERENT')).length}\n\n${lines.slice(0,80).join('\n')||'No extracted-text differences found.'}`;return;}
        const pages=await extract(files[0]);if(t.title==='PDF to Text')download(new TextEncoder().encode(pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`--- Page ${i+1} ---\n`:''}${x}`).join('\n\n')),'freetoolforge-text.txt','text/plain');else if(t.title==='PDF to Markdown')download(new TextEncoder().encode(pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`## Page ${i+1}\n\n`:''}${x}`).join('\n\n')),'freetoolforge.md','text/markdown');else{const html=`<!doctype html><html><body>${pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`<h2>Page ${i+1}</h2>`:''}<p>${esc(x)}</p>`).join('')}</body></html>`;download(new TextEncoder().encode(html),'freetoolforge.html','text/html')}out.textContent=`Extracted ${pages.length} pages.`;return;
      }
      if(t.title==='Fill PDF'){
        const form=src.getForm();const fields=form.getFields();if(!fields.length)throw Error('No AcroForm fields were found.');const controls=[...document.querySelectorAll('#form-fields [data-fi]')];controls.forEach(c=>{const f=fields[Number(c.dataset.fi)];const name=f.getName();const kind=f.constructor?.name||'';const val=c.value;if(kind.includes('TextField')&&val)f.setText(val);else if(kind.includes('CheckBox'))f.check();else if(kind.includes('Dropdown')&&val)f.select(val);});download(await savePdf(src),'freetoolforge-filled.pdf');out.textContent=`Updated ${fields.length} form fields.`;return;
      }
      if(t.title==='Annotate PDF'){
        const font=await src.embedFont(StandardFonts.Helvetica);const p=src.getPage(Math.max(0,Math.min(n-1,(Number(document.getElementById('notePage').value)||1)-1)));const x=Number(document.getElementById('noteX').value)||50,y=Number(document.getElementById('noteY').value)||50;p.drawRectangle({x:x-6,y:y-4,width:190,height:28,color:rgb(1,.95,.6),borderColor:rgb(.6,.55,.2),borderWidth:1});p.drawText(document.getElementById('noteText').value||'Reviewed',{x,y,size:11,font,color:rgb(0,0,0)});download(await savePdf(src),'freetoolforge-annotated.pdf');out.textContent='Added a visible text annotation box.';return;
      }
      if(t.title==='Sign PDF'){
        const font=await src.embedFont(StandardFonts.HelveticaOblique);const i=Math.max(0,Math.min(n-1,(Number(document.getElementById('sigPage').value)||1)-1));const p=src.getPage(i);const x=Number(document.getElementById('sigX').value)||50,y=Number(document.getElementById('sigY').value)||70,size=Math.max(8,Number(document.getElementById('sigSize').value)||20);const sig=document.getElementById('sigText').value||'Your Name';p.drawText(sig,{x,y,size,font,color:rgb(0,0,0)});p.drawLine({start:{x,y:y-4},end:{x:x+Math.max(100,font.widthOfTextAtSize(sig,size)+10),y:y-4},thickness:1,color:rgb(0,0,0)});download(await savePdf(src),'freetoolforge-signed.pdf');out.textContent='Added a visible typed-signature stamp. This is not a cryptographic digital signature.';return;
      }
      if(t.title==='PDF Form Field Viewer'){
        const form=src.getForm();const fields=form.getFields();if(!fields.length){out.textContent='No AcroForm fields found.';return}out.textContent=fields.map((f,i)=>`${i+1}. ${f.getName()} — ${f.constructor?.name||'Field'}`).join('\n');return;
      }
      if(t.title==='Booklet PDF Maker'){
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const dims={A4:[842,595],Letter:[792,612]};const [sw,sh]=dims[document.getElementById('bookletSize').value];const total=Math.ceil(task.numPages/4)*4;const order=[];for(let base=0;base<total/4;base++){const a=base*2,b=total-1-base*2;order.push(b,a,a+1,b-1)}const doc=await PDFDocument.create();
        const drawPlaced=async(sp,pageNum,col)=>{if(pageNum>=task.numPages)return;const rp=await task.getPage(pageNum+1);const vp=rp.getViewport({scale:1.25});const cellW=sw/2;const sc=Math.min((cellW-20)/vp.width,(sh-20)/vp.height);const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width*sc);canvas.height=Math.ceil(vp.height*sc);await rp.render({canvasContext:canvas.getContext('2d'),viewport:rp.getViewport({scale:sc})}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const img=await doc.embedPng(await blob.arrayBuffer());sp.drawImage(img,{x:col*cellW+(cellW-img.width)/2,y:(sh-img.height)/2,width:img.width,height:img.height});canvas.width=1;canvas.height=1;await rp.cleanup?.()};
        for(let sidx=0;sidx<order.length;sidx+=4){const front=doc.addPage([sw,sh]);await drawPlaced(front,order[sidx],0);await drawPlaced(front,order[sidx+1],1);const back=doc.addPage([sw,sh]);await drawPlaced(back,order[sidx+2],0);await drawPlaced(back,order[sidx+3],1)}
        download(await savePdf(doc),'freetoolforge-booklet.pdf');out.textContent=`Created ${doc.getPageCount()} booklet side(s). Output is rasterized for reliable 2-up imposition.`;return;
      }
      if(t.title==='Markdown to PDF'){
        const md=document.getElementById('textpdf')?.value||'';if(!md.trim())throw Error('Enter Markdown text first.');const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);const size=12,margin=45;let p=doc.addPage([595,842]),y=797;const nextPage=()=>{p=doc.addPage([595,842]);y=797};for(const raw of md.split(/\r?\n/)){const line=raw.trim();if(/^#{1,3}\s+/.test(line)){const level=line.match(/^#+/)[0].length;const text=line.replace(/^#+\s+/,'');const fs=level===1?20:level===2?16:14;if(y<margin+fs)nextPage();p.drawText(text,{x:margin,y,size:fs,font:bold,color:rgb(0,0,0)});y-=fs+8;continue}const clean=line.replace(/^[-*]\s+/,'• ').replace(/`([^`]+)`/g,'$1');for(const l of fitText(font,clean||' ',595-margin*2,size)){if(y<size+margin)nextPage();p.drawText(l,{x:margin,y,size,font,color:rgb(0,0,0)});y-=size+5}y-=4}download(await savePdf(doc),'freetoolforge-markdown.pdf');out.textContent='Created a basic Markdown-to-PDF document with headings and bullet lists.';return;
      }
      if(t.title==='PDF Batch Rename'){
        if(files.length<1)throw Error('Choose one or more PDFs.');const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();const pattern=document.getElementById('renamePattern').value||'document-{n}';files.forEach((f,i)=>{const base=pattern.replaceAll('{n}',String(i+1));zip.file(base.toLowerCase().endsWith('.pdf')?base:base+'.pdf',f);});download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'freetoolforge-renamed-pdfs.zip','application/zip');out.textContent=`Prepared ${files.length} renamed PDFs in a ZIP.`;return;
      }
      if(t.title==='Invoice PDF Maker'){
        const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);const p=doc.addPage([595,842]);let y=790;const title=document.getElementById('invTitle').value||'Invoice';p.drawText(title,{x:45,y,size:22,font:bold});y-=35;p.drawText(`Bill to: ${document.getElementById('invTo').value||'Customer'}`,{x:45,y,size:11,font});y-=28;let total=0;p.drawText('Description', {x:45,y,size:10,font:bold});p.drawText('Qty',{x:355,y,size:10,font:bold});p.drawText('Rate',{x:405,y,size:10,font:bold});p.drawText('Amount',{x:480,y,size:10,font:bold});y-=18;for(const row of (document.getElementById('invItems').value||'').split(/\r?\n/)){if(!row.trim())continue;const [desc,qtyS,rateS]=row.split('|').map(x=>x.trim());const qty=Number(qtyS)||0,rate=Number(rateS)||0,amount=qty*rate;total+=amount;p.drawText(desc||'Item',{x:45,y,size:10,font,maxWidth:285});p.drawText(String(qty),{x:355,y,size:10,font});p.drawText(rate.toFixed(2),{x:405,y,size:10,font});p.drawText(amount.toFixed(2),{x:480,y,size:10,font});y-=19;if(y<80){p.drawText('Additional items omitted: use a longer invoice template for large invoices.',{x:45,y,size:9,font});break}}p.drawLine({start:{x:400,y:y-5},end:{x:550,y:y-5},thickness:1,color:rgb(0,0,0)});y-=24;p.drawText(`Total: ${total.toFixed(2)}`,{x:410,y,size:13,font:bold});download(await savePdf(doc),'freetoolforge-invoice.pdf');out.textContent=`Created invoice. Total: ${total.toFixed(2)}`;return;
      }
      if(t.title==='OCR PDF'){
        const OCR_SERVICE='https://freetoolforge-ocr-ziyadshafeeks-projects.vercel.app/api/ocr';
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const outDoc=await PDFDocument.create();const font=await outDoc.embedFont(StandardFonts.Helvetica);
        const texts=[];
        for(let i=1;i<=task.numPages;i++){
          out.textContent=`OCR page ${i} of ${task.numPages}…`;
          const page=await task.getPage(i);const vp=page.getViewport({scale:1.6});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
          const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const fd=new FormData();fd.append('file',blob,`page-${i}.png`);fd.append('language','eng');
          const rr=await fetch(OCR_SERVICE,{method:'POST',body:fd});if(!rr.ok)throw Error(`OCR service returned HTTP ${rr.status}`);const j=await rr.json();const text=String(j.text||'').trim();texts.push(text);const img=await outDoc.embedPng(await blob.arrayBuffer());const np=outDoc.addPage([vp.width/1.6,vp.height/1.6]);np.drawImage(img,{x:0,y:0,width:np.getWidth(),height:np.getHeight()});
          // Add a tiny white text layer so the result is searchable/selectable without obscuring the rendered page.
          const lines=fitText(font,text.replace(/\s+/g,' '),np.getWidth()-8,1);let ty=3;for(const line of lines.slice(0,800)){np.drawText(line,{x:3,y:ty,size:1,font,color:grayscale(1)});ty+=1.15;if(ty>np.getHeight()-1)break}
          canvas.width=1;canvas.height=1;await page.cleanup?.();
        }
        download(await savePdf(outDoc),'freetoolforge-ocr.pdf');out.textContent=`OCR complete for ${task.numPages} pages. A searchable text layer was added; text positioning is approximate because the OCR route returns text without word bounding boxes.`;return;
      }
      if(t.title==='Redact PDF'){
        const specs=(document.getElementById('redactions').value||'').split(';').map(x=>x.trim()).filter(Boolean).map(token=>{const [pg,rest]=token.split(':');const a=(rest||'').split(',').map(Number);if(!Number.isInteger(Number(pg))||a.length!==4||a.some(v=>!Number.isFinite(v)||v<0||v>100))throw Error('Invalid redaction; use page:x,y,width,height with percentages 0–100.');return{page:Number(pg)-1,x:a[0],y:a[1],w:a[2],h:a[3]}});if(!specs.length)throw Error('Add at least one redaction rectangle.');const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const newDoc=await PDFDocument.create();for(let i=0;i<task.numPages;i++){const page=await task.getPage(i+1);const vp=page.getViewport({scale:1.5});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';for(const s of specs.filter(s=>s.page===i)){ctx.fillRect(canvas.width*s.x/100,canvas.height*(100-s.y-s.h)/100,canvas.width*s.w/100,canvas.height*s.h/100)}const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));const img=await newDoc.embedJpg(await blob.arrayBuffer());const np=newDoc.addPage([vp.width/1.5,vp.height/1.5]);np.drawImage(img,{x:0,y:0,width:np.getWidth(),height:np.getHeight()});canvas.width=1;canvas.height=1;await page.cleanup?.()}download(await savePdf(newDoc),'freetoolforge-redacted.pdf');out.textContent='Created an image-only redacted PDF. Original searchable/selectable text is not retained; verify the blackouts visually before sharing.';return;
      }
      out.textContent='This engine is not implemented yet.';
    }catch(e){out.textContent=`Error: ${e.message||e}`;}
  };
}

function wrapText(text,maxChars){const out=[];for(const para of text.split(/\r?\n/)){let line='';for(const w of para.split(/\s+/)){if(!w)continue;if((line+' '+w).trim().length>maxChars){out.push(line);line=w}else line=(line+' '+w).trim()}out.push(line)}return out}

setup();
loadRegistry().catch(err=>{document.getElementById('tool-grid').innerHTML=`<div class="panel"><b>Tool registry failed to load.</b><p>${esc(err.message)}</p></div>`});
