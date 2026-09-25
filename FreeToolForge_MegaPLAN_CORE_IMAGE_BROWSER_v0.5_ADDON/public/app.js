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
  'Word Counter', 'Character Counter', 'Sentence Counter', 'Paragraph Counter', 'Reading Time Calculator', 'Case Converter', 'Title Case', 'Uppercase Converter', 'Lowercase Converter', 'Whitespace Cleaner', 'Trim Lines', 'Remove Duplicate Lines', 'Sort Lines', 'Reverse Lines', 'Number Lines', 'Slug Generator', 'JSON Formatter', 'JSON Minifier', 'JSON Validator', 'Base64 Encoder', 'Base64 Decoder', 'URL Encoder', 'URL Decoder', 'UUID Generator', 'SHA-256 Hash', 'Text Statistics', 'Percentage Calculator', 'Discount Calculator', 'Tip Calculator', 'BMI Calculator', 'GST Calculator', 'Markup Calculator', 'Margin Calculator', 'Profit Calculator', 'Break Even Calculator', 'Merge PDFs', 'Split PDF', 'Rotate PDF', 'Reorder PDF Pages', 'Extract PDF Pages', 'Delete PDF Pages', 'Images to PDF', 'JPG to PDF', 'PNG to PDF', 'Text to PDF', 'Compress PDF', 'Repair PDF', 'OCR PDF', 'Redact PDF', 'Sign PDF', 'Fill PDF', 'Annotate PDF', 'Extract PDF Images', 'PDF Metadata Viewer', 'Remove PDF Metadata', 'Add PDF Watermark', 'Add PDF Page Numbers', 'Overlay PDFs', 'Compare PDFs', 'Crop PDF', 'Resize PDF Pages', 'PDF to Images', 'PDF to Text', 'PDF to Markdown', 'PDF to HTML', 'PDF to Word', 'PDF to Excel', 'PDF to PowerPoint', 'PDF to EPUB', 'PDF to RTF', 'WEBP to PDF', 'HEIC to PDF', 'Word to PDF', 'Excel to PDF', 'PowerPoint to PDF', 'Markdown to PDF', 'HTML to PDF', 'EPUB to PDF', 'PDF/A Helper', 'Booklet PDF Maker', 'Pages per Sheet', 'Two Pages per Sheet', 'PDF Page Counter', 'PDF Bookmark Helper', 'PDF Form Field Viewer', 'Invoice PDF Maker', 'PDF Batch Rename',   'PDF Page Extractor',
  'JSON to CSV','CSV to JSON','XML Formatter','XML Validator','JWT Decoder','Nano ID Generator','SHA-512 Hash','Regex Tester','Regex Generator Helper','Unix Timestamp Converter','Epoch Converter','URL Parser','User-Agent Parser','SQL Formatter','Color Hex Converter','RGB HSL Converter','CSS Minifier','JS Minifier','HTML Minifier','HTML Escape','HTML Unescape','Semver Calculator','Byte Converter','Random Hex Generator','Random String Generator','Package Name Checker','File Hash Checker','Text Diff','Markdown Cleaner','Morse Encoder','Morse Decoder','Leetspeak Converter','Text Repeater','Random Line Picker','Random Word Picker','Lorem Ipsum Generator','Palindrome Checker','Anagram Checker','Sales Tax Calculator','VAT Calculator','EMI Calculator','Inflation Calculator','ROI Calculator','ROAS Calculator','Salary Calculator','Hourly Rate Calculator','Age Calculator','Date Difference','Business Days Calculator','Time Difference','Time Zone Converter','Unit Converter','Length Converter','Weight Converter','Temperature Converter','Area Converter','Volume Converter','Speed Converter','Data Size Converter','BSA Calculator','Anion Gap Calculator','Corrected Calcium Calculator','Concentration Calculator','Molarity Calculator','Body Fat Calculator',
  'Image Compressor','Image Resizer','Image Cropper','Image Rotator','Image Flipper','JPG to PNG','PNG to JPG','WEBP to JPG','JPG to WEBP','PNG to WEBP','Image Dimensions','Color Picker','Palette Generator','Dominant Color Finder','Contrast Checker','Image Blur','Image Pixelate','Image Watermark','Image Border Maker','Image Padding Tool','Thumbnail Maker','Transparent PNG Maker','Image Average Color','DPI Calculator','Print Size Calculator','Image File Size Calculator','Round Image Maker',
])

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

function route(path=location.pathname){
  const m=String(path).match(/^\/tools\/([^/]+)$/);
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
  else if(t.category==='Developer' && live.has(t.title)) mountDeveloper(m,t);
  else if(['Text','Privacy & Security'].includes(t.category) && live.has(t.title)) mountText(m,t);
  else if(['Calculators','Health & Medical'].includes(t.category) && live.has(t.title)) mountCalc(m,t);
  else if(t.category==='Images' && live.has(t.title)) mountImage(m,t);
  else if(t.category==='Audio' && live.has(t.title)) mountAudio(m,t);
  else if(t.category==='OCR & AI' && live.has(t.title)) mountOCR(m,t);
  else m.innerHTML=`<div class="panel"><h3>${esc(t.title)}</h3><p>This tool is catalogued and queued for a specialized engine. It is not presented as live yet.</p><p class="muted">Processing target: ${esc(t.processing)}. The common tool shell, metadata and ad placements are already in place.</p></div>`;
}

function mountText(m,t){
  const hasTwoPane=['Text Diff'].includes(t.title);
  const placeholder={
    'Text Diff':'Paste text A and text B below; changed lines are shown as - removed / + added.',
    'Markdown Cleaner':'Paste Markdown to remove excess whitespace and noisy formatting.',
    'Morse Encoder':'Type letters/numbers to encode as Morse.',
    'Morse Decoder':'Paste Morse using spaces between letters and / between words.',
    'Leetspeak Converter':'Type text to convert to simple leetspeak.',
    'Text Repeater':'Type text to repeat.',
    'Random Line Picker':'Enter one item per line.',
    'Random Word Picker':'Enter words separated by whitespace.',
    'Lorem Ipsum Generator':'Enter a paragraph count or leave 3.',
    'Palindrome Checker':'Type a word or phrase.',
    'Anagram Checker':'Enter phrase A and phrase B.'
  }[t.title]||'Paste or type text…';
  if(t.title==='Text Diff'){
    m.innerHTML=`<div class="tool-layout"><section class="panel"><label>Text A<textarea id="tool-in-a" class="input-area" placeholder="Original text…"></textarea></label></section><section class="panel"><label>Text B<textarea id="tool-in-b" class="input-area" placeholder="Changed text…"></textarea></label></section></div><section class="panel" style="margin-top:12px"><div class="button-row"><button class="btn primary" id="run">Compare</button><button class="btn secondary" id="copy">Copy result</button></div><pre id="tool-out" class="out"></pre></section>`;
  } else {
    const extra = t.title==='Text Repeater' ? '<input id="repeat-count" type="number" min="1" max="10000" value="3" placeholder="Repeat count">' : t.title==='Lorem Ipsum Generator' ? '<input id="paragraph-count" type="number" min="1" max="50" value="3" placeholder="Paragraphs">' : '';
    m.innerHTML=`<div class="tool-layout"><section class="panel"><textarea id="tool-in" class="input-area" placeholder="${esc(placeholder)}"></textarea>${extra}<div class="button-row"><button class="btn primary" id="run">Run</button><button class="btn secondary" id="copy">Copy result</button></div></section><section class="panel"><pre id="tool-out" class="out"></pre></section></div>`;
  }
  const out=document.getElementById('tool-out');
  document.getElementById('copy').onclick=async()=>{await navigator.clipboard?.writeText(out.textContent||'');};
  document.getElementById('run').onclick=()=>{
    let o='';
    if(t.title==='Text Diff'){
      const a=document.getElementById('tool-in-a').value.split(/\r?\n/), b=document.getElementById('tool-in-b').value.split(/\r?\n/);
      const rows=[], max=Math.max(a.length,b.length); for(let i=0;i<max;i++){const av=a[i],bv=b[i]; if(av===bv) rows.push(`  ${av??''}`); else {if(av!==undefined) rows.push(`- ${av}`); if(bv!==undefined) rows.push(`+ ${bv}`)}} o=rows.join('\n');
    } else if(t.title==='Word Counter') o=`Words: ${tallyWords(document.getElementById('tool-in').value)}`;
    else if(t.title==='Character Counter') o=`Characters: ${document.getElementById('tool-in').value.length}`;
    else if(t.title==='Sentence Counter') o=`Sentences: ${(document.getElementById('tool-in').value.match(/[.!?]+(?=\s|$)/g)||[]).length}`;
    else if(t.title==='Paragraph Counter'){const s=document.getElementById('tool-in').value.trim();o=`Paragraphs: ${s?s.split(/\n\s*\n/).length:0}`;}
    else if(t.title==='Reading Time Calculator'){const s=document.getElementById('tool-in').value,w=tallyWords(s);o=`Words: ${w}\nEstimated reading time: ${Math.max(1,Math.ceil(w/200))} min (200 wpm)`;}
    else if(t.title==='Uppercase Converter') o=document.getElementById('tool-in').value.toUpperCase();
    else if(t.title==='Lowercase Converter') o=document.getElementById('tool-in').value.toLowerCase();
    else if(t.title==='Title Case'||t.title==='Case Converter') o=document.getElementById('tool-in').value.toLowerCase().replace(/\b[\p{L}\p{N}]+/gu,w=>w[0].toUpperCase()+w.slice(1));
    else if(t.title==='Whitespace Cleaner') o=document.getElementById('tool-in').value.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    else if(t.title==='Trim Lines') o=document.getElementById('tool-in').value.split(/\r?\n/).map(x=>x.trim()).join('\n');
    else if(t.title==='Remove Duplicate Lines') o=[...new Set(document.getElementById('tool-in').value.split(/\r?\n/))].join('\n');
    else if(t.title==='Sort Lines') o=document.getElementById('tool-in').value.split(/\r?\n/).sort((a,b)=>a.localeCompare(b)).join('\n');
    else if(t.title==='Reverse Lines') o=document.getElementById('tool-in').value.split(/\r?\n/).reverse().join('\n');
    else if(t.title==='Number Lines') o=document.getElementById('tool-in').value.split(/\r?\n/).map((x,i)=>`${i+1}. ${x}`).join('\n');
    else if(t.title==='Slug Generator') o=document.getElementById('tool-in').value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
    else if(t.title==='JSON Formatter'||t.title==='JSON Minifier') try{o=JSON.stringify(JSON.parse(document.getElementById('tool-in').value),null,t.title==='JSON Formatter'?2:0)}catch(e){o='Invalid JSON: '+e.message}
    else if(t.title==='JSON Validator') try{JSON.parse(document.getElementById('tool-in').value);o='Valid JSON'}catch(e){o='Invalid JSON: '+e.message}
    else if(t.title==='Base64 Encoder') o=utf8ToBase64(document.getElementById('tool-in').value);
    else if(t.title==='Base64 Decoder') try{o=base64ToUtf8(document.getElementById('tool-in').value)}catch(e){o='Invalid Base64'}
    else if(t.title==='URL Encoder') o=encodeURIComponent(document.getElementById('tool-in').value);
    else if(t.title==='URL Decoder') try{o=decodeURIComponent(document.getElementById('tool-in').value)}catch(e){o='Invalid URL encoding'}
    else if(t.title==='UUID Generator') o=crypto.randomUUID();
    else if(t.title==='SHA-256 Hash') crypto.subtle.digest('SHA-256',new TextEncoder().encode(document.getElementById('tool-in').value)).then(buf=>out.textContent=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''));
    else if(t.title==='Text Statistics'){const s=document.getElementById('tool-in').value,w=tallyWords(s);o=`Characters: ${s.length}\nWords: ${w}\nLines: ${s?s.split(/\r?\n/).length:0}\nParagraphs: ${s.trim()?s.trim().split(/\n\s*\n/).length:0}`;}
    else if(t.title==='Markdown Cleaner') o=document.getElementById('tool-in').value.replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/[*_`~]/g,'').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
    else if(t.title==='Morse Encoder') o=morseEncode(document.getElementById('tool-in').value);
    else if(t.title==='Morse Decoder') o=morseDecode(document.getElementById('tool-in').value);
    else if(t.title==='Leetspeak Converter') o=toLeet(document.getElementById('tool-in').value);
    else if(t.title==='Text Repeater'){const n=Math.min(10000,Math.max(1,Number(document.getElementById('repeat-count').value)||1));o=Array(n).fill(document.getElementById('tool-in').value).join('\n');}
    else if(t.title==='Random Line Picker'){const a=document.getElementById('tool-in').value.split(/\r?\n/).filter(Boolean);o=a.length?a[Math.floor(Math.random()*a.length)]:'No non-empty lines.';}
    else if(t.title==='Random Word Picker'){const a=document.getElementById('tool-in').value.trim().split(/\s+/).filter(Boolean);o=a.length?a[Math.floor(Math.random()*a.length)]:'No words.';}
    else if(t.title==='Lorem Ipsum Generator'){const n=Math.min(50,Math.max(1,Number(document.getElementById('paragraph-count').value)||3));const p='Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer non massa vel ipsum posuere feugiat. ';o=Array.from({length:n},()=>p.trim()).join('\n\n');}
    else if(t.title==='Palindrome Checker'){const s=document.getElementById('tool-in').value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');o=s===s.split('').reverse().join('')?'Palindrome':'Not a palindrome';}
    else if(t.title==='Anagram Checker'){const parts=document.getElementById('tool-in').value.split(/\n|\|/);if(parts.length<2)o='Enter two phrases separated by a new line or |';else{o=normalizeAlpha(parts[0])===normalizeAlpha(parts[1])?'Anagrams':'Not anagrams';}}
    out.textContent=o;
  };
}

function tallyWords(s){return s.trim()?s.trim().split(/\s+/u).length:0}
function normalizeAlpha(s){return [...s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'')].sort().join('')}
const MORSE={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.'};
const MORSE_REV=Object.fromEntries(Object.entries(MORSE).map(([k,v])=>[v,k]));
function morseEncode(s){return s.toUpperCase().split(/\s+/).filter(Boolean).map(w=>[...w].map(ch=>MORSE[ch]||'?').join(' ')).join(' / ')}
function morseDecode(s){return s.trim().split(/\s*\/\s*/).map(w=>w.trim().split(/\s+/).filter(Boolean).map(x=>MORSE_REV[x]||'?').join('')).join(' ')}
function toLeet(s){return s.replace(/[aAeEiIoOsStT]/g,c=>({a:'4',e:'3',i:'1',o:'0',s:'5',t:'7',A:'4',E:'3',I:'1',O:'0',S:'5',T:'7'}[c]))}

function mountDeveloper(m,t){
  const fileTools=['File Hash Checker'];
  const specialNoFile=['Unix Timestamp Converter','Epoch Converter','URL Parser','Color Hex Converter','RGB HSL Converter','Byte Converter','Random Hex Generator','Random String Generator','Package Name Checker','Nano ID Generator','SHA-256 Hash','SHA-512 Hash','Regex Tester','Regex Generator Helper','Cron Expression Helper','Semver Calculator'];
  let controls='';
  if(fileTools.includes(t.title)) controls='<div class="dropzone" id="drop">Choose a file<input id="file" type="file" class="hidden"></div>';
  else if(t.title==='JSON to CSV'||t.title==='CSV to JSON') controls='<textarea id="tool-in" class="input-area" placeholder="Paste data…"></textarea>';
  else if(t.title==='YAML Formatter') controls='<textarea id="tool-in" class="input-area" placeholder="key: value\nitems:\n  - one\n  - two"></textarea>';
  else if(t.title==='XML Formatter'||t.title==='XML Validator') controls='<textarea id="tool-in" class="input-area" placeholder="<root><item>value</item></root>"></textarea>';
  else if(t.title==='JWT Decoder') controls='<textarea id="tool-in" class="input-area" placeholder="Paste a JWT…"></textarea>';
  else if(t.title==='User-Agent Parser') controls='<input id="tool-in" class="text-input" placeholder="Mozilla/5.0 …">';
  else if(t.title==='URL Parser') controls='<input id="tool-in" class="text-input" placeholder="https://example.com/path?q=1">';
  else if(t.title==='Regex Tester') controls='<input id="pattern" class="text-input" placeholder="Regex pattern, e.g. \\d+"><input id="flags" class="text-input" placeholder="Flags, e.g. gi" value="g"><textarea id="tool-in" class="input-area" placeholder="Test text…"></textarea>';
  else if(t.title==='Regex Generator Helper') controls='<select id="regex-kind"><option value="email">Email</option><option value="url">URL</option><option value="phone">Phone</option><option value="integer">Integer</option><option value="date">ISO date</option></select>';
  else if(t.title==='SQL Formatter') controls='<textarea id="tool-in" class="input-area" placeholder="select a,b from users where id=1 order by a"></textarea>';
  else if(t.title==='Color Hex Converter') controls='<input id="tool-in" class="text-input" placeholder="#3366ff">';
  else if(t.title==='RGB HSL Converter') controls='<div class="tool-layout"><input id="r" type="number" min="0" max="255" placeholder="R"><input id="g" type="number" min="0" max="255" placeholder="G"><input id="b" type="number" min="0" max="255" placeholder="B"></div>';
  else if(t.title==='CSS Minifier'||t.title==='JS Minifier'||t.title==='HTML Minifier'||t.title==='HTML Escape'||t.title==='HTML Unescape'||t.title==='Markdown Preview'||t.title==='JSON Pointer Helper') controls='<textarea id="tool-in" class="input-area" placeholder="Paste code/text…"></textarea>';
  else if(t.title==='Semver Calculator') controls='<div class="tool-layout"><input id="v1" class="text-input" value="1.2.3" placeholder="Version A"><input id="v2" class="text-input" value="1.3.0" placeholder="Version B"></div>';
  else if(t.title==='Unix Timestamp Converter'||t.title==='Epoch Converter') controls='<input id="tool-in" type="number" class="text-input" placeholder="Unix timestamp or milliseconds">';
  else if(t.title==='Byte Converter') controls='<div class="tool-layout"><input id="n0" type="number" step="any" value="1"><select id="unit"><option>bytes</option><option>KB</option><option>MB</option><option>GB</option><option>TB</option></select></div>';
  else if(t.title==='Random String Generator') controls='<input id="length" type="number" min="1" max="10000" value="16"><input id="alphabet" class="text-input" value="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789">';
  else controls='<textarea id="tool-in" class="input-area" placeholder="Paste or type input…"></textarea>';
  m.innerHTML=`<section class="panel">${controls}<div class="button-row"><button class="btn primary" id="run">Run</button><button class="btn secondary" id="copy">Copy result</button></div><pre id="tool-out" class="out"></pre></section>`;
  const out=document.getElementById('tool-out');
  document.getElementById('copy').onclick=async()=>{await navigator.clipboard?.writeText(out.textContent||'');};
  const b64urlPart=x=>{const b=x.replace(/-/g,'+').replace(/_/g,'/');return decodeURIComponent(escape(atob(b.padEnd(Math.ceil(b.length/4)*4,'='))))};
  document.getElementById('run').onclick=async()=>{
    try{
      let o=''; const s=document.getElementById('tool-in')?.value||'';
      if(t.title==='JSON to CSV'){const rows=JSON.parse(s);const a=Array.isArray(rows)?rows:[rows];const cols=[...new Set(a.flatMap(x=>Object.keys(x||{})))];o=[cols.join(','),...a.map(x=>cols.map(c=>csvQuote(x?.[c])).join(','))].join('\n');}
      else if(t.title==='CSV to JSON'){const lines=s.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)o='[]';else{const cols=parseCsvLine(lines[0]), rows=lines.slice(1).map(l=>parseCsvLine(l));o=JSON.stringify(rows.map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]??'']))),null,2)}}
      else if(t.title==='YAML Formatter') o=s.replace(/\t/g,'  ').split(/\r?\n/).map(x=>x.replace(/\s+$/,'')).join('\n').trim();
      else if(t.title==='XML Formatter'||t.title==='XML Validator'){const doc=new DOMParser().parseFromString(s,'application/xml');const err=doc.querySelector('parsererror');if(err)o='Invalid XML: '+err.textContent;else if(t.title==='XML Validator')o='Valid XML';else o=formatXml(doc.documentElement);}
      else if(t.title==='JWT Decoder'){const [h,p]=s.split('.');if(!h||!p)throw Error('JWT needs three dot-separated parts.');o=JSON.stringify({header:JSON.parse(b64urlPart(h)),payload:JSON.parse(b64urlPart(p)),note:'Signature is not verified.'},null,2);}
      else if(t.title==='Nano ID Generator'){o=randomString(21,'_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');}
      else if(t.title==='SHA-512 Hash'||t.title==='SHA-256 Hash'){const alg=t.title==='SHA-512 Hash'?'SHA-512':'SHA-256';const buf=await crypto.subtle.digest(alg,new TextEncoder().encode(s));o=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
      else if(t.title==='MD5 Hash'){o='MD5 is not available in Web Crypto. Use a dedicated MD5 library/server if needed.';}
      else if(t.title==='Unix Timestamp Converter'||t.title==='Epoch Converter'){const n=Number(s);if(!Number.isFinite(n))throw Error('Enter a valid timestamp.');const ms=Math.abs(n)>1e11?n:n*1000;o=`ISO: ${new Date(ms).toISOString()}\nLocal: ${new Date(ms).toString()}\nMilliseconds: ${ms}\nSeconds: ${Math.floor(ms/1000)}`;}
      else if(t.title==='URL Parser'){const u=new URL(s);o=JSON.stringify({href:u.href,protocol:u.protocol,username:u.username,hostname:u.hostname,port:u.port,pathname:u.pathname,search:u.search,hash:u.hash},null,2);}
      else if(t.title==='User-Agent Parser'){const ua=s||navigator.userAgent;o=JSON.stringify({browser:/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Unknown',os:/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Unknown',mobile:/Mobile|Android|iPhone|iPad/.test(ua)},null,2);}
      else if(t.title==='Regex Tester'){const re=new RegExp(document.getElementById('pattern').value,document.getElementById('flags').value);const matches=[...s.matchAll(re)].map(x=>({match:x[0],index:x.index,groups:[...(x.groups?Object.entries(x.groups):[])]}));o=JSON.stringify({valid:true,matches},null,2);}
      else if(t.title==='Regex Generator Helper'){o={email:'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',url:'^https?:\\/\\/[^\\s]+$',phone:'^\\+?[0-9()\\s-]{7,20}$',integer:'^-?\\d+$',date:'^\\d{4}-\\d{2}-\\d{2}$'}[document.getElementById('regex-kind').value];}
      else if(t.title==='SQL Formatter') o=basicSqlFormat(s);
      else if(t.title==='Color Hex Converter'){const hex=s.trim().replace(/^#/,'');if(!/^[0-9a-f]{6}$/i.test(hex))throw Error('Use a 6-digit hex color.');const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4),16);o=`HEX: #${hex.toUpperCase()}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: ${rgbToHsl(r,g,b)}`;}
      else if(t.title==='RGB HSL Converter'){const r=clamp(Number(document.getElementById('r').value),0,255),g=clamp(Number(document.getElementById('g').value),0,255),b=clamp(Number(document.getElementById('b').value),0,255);const [h,ss,l]=rgbToHslParts(r,g,b);o=`RGB: rgb(${r}, ${g}, ${b})\nHEX: #${[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()}\nHSL: hsl(${h}, ${ss}%, ${l}%)`;}
      else if(t.title==='CSS Minifier')o=minifyCss(s);
      else if(t.title==='JS Minifier')o=minifyJs(s);
      else if(t.title==='HTML Minifier')o=minifyHtml(s);
      else if(t.title==='HTML Escape')o=esc(s);
      else if(t.title==='HTML Unescape'){const ta=document.createElement('textarea');ta.innerHTML=s;o=ta.value;}
      else if(t.title==='Semver Calculator'){const a=parseSemver(document.getElementById('v1').value),b=parseSemver(document.getElementById('v2').value);o=`A: ${a.join('.')}\nB: ${b.join('.')}\nComparison: ${cmpSemver(a,b)>0?'A > B':cmpSemver(a,b)<0?'A < B':'A = B'}`;}
      else if(t.title==='Byte Converter'){const v=Number(document.getElementById('n0').value), u=document.getElementById('unit').value, mult={bytes:1,KB:1024,MB:1024**2,GB:1024**3,TB:1024**4}[u];const bytes=v*mult;o=Object.entries({bytes:1,KB:1024,MB:1024**2,GB:1024**3,TB:1024**4}).map(([k,m])=>`${k}: ${bytes/m}`).join('\n');}
      else if(t.title==='Random Hex Generator'){o=crypto.getRandomValues(new Uint8Array(16));o=[...o].map(b=>b.toString(16).padStart(2,'0')).join('');}
      else if(t.title==='Random String Generator'){o=randomString(Math.min(10000,Math.max(1,Number(document.getElementById('length').value)||16)),document.getElementById('alphabet').value||'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');}
      else if(t.title==='Package Name Checker'){o=/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(s)?'Looks valid for a common npm-style package name.':'Does not match the common npm package-name pattern.';}
      else if(t.title==='File Hash Checker'){const f=document.getElementById('file').files[0];if(!f)o='Choose a file first.';else{const buf=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());o=`File: ${f.name}\nSHA-256: ${[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}`;}}
      else o=s;
      out.textContent=o;
    }catch(e){out.textContent='Error: '+e.message}
  };
  if(document.getElementById('drop')){let f;document.getElementById('file').onchange=()=>{document.getElementById('drop').dataset.file=document.getElementById('file').files[0]?.name||''}}
}
function csvQuote(v){const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(c==='"')q=!q;else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function formatXml(node,level=0){const pad='  '.repeat(level);if(!node.children.length)return `${pad}<${node.nodeName}>${node.textContent.trim()}</${node.nodeName}>`;return `${pad}<${node.nodeName}>\n${[...node.children].map(x=>formatXml(x,level+1)).join('\n')}\n${pad}</${node.nodeName}>`;}
function basicSqlFormat(s){return s.replace(/\s+/g,' ').replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|JOIN|ON|AND|OR|VALUES|SET)\b/gi,'\n$1').trim();}
function minifyCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}:;,>])\s*/g,'$1').replace(/;}/g,'}').trim();}
function minifyHtml(s){return s.replace(/<!--(?!\[if)[\s\S]*?-->/g,'').replace(/\s{2,}/g,' ').replace(/>\s+</g,'><').trim();}
function minifyJs(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\s)\/\/.*$/gm,'$1').replace(/[\t ]+/g,' ').replace(/\n+/g,'\n').trim();}
function parseSemver(s){const m=String(s).trim().replace(/^v/,'').split('.').map(x=>parseInt(x,10)||0);return [m[0]||0,m[1]||0,m[2]||0]}
function cmpSemver(a,b){for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0}
function randomString(n,alphabet){let o='';const arr=new Uint32Array(n);crypto.getRandomValues(arr);for(const x of arr)o+=alphabet[x%alphabet.length];return o}
function clamp(v,a,b){return Math.min(b,Math.max(a,Number.isFinite(v)?v:a))}
function rgbToHslParts(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0,s=0,l=(mx+mn)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(mx){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4}h=Math.round(60*h);if(h<0)h+=360}s=Math.round(s*100);l=Math.round(l*100);return [h,s,l]}
function rgbToHsl(r,g,b){const [h,s,l]=rgbToHslParts(r,g,b);return `hsl(${h}, ${s}%, ${l}%)`}

function wallTimeToUtc(value,timeZone){
  const [datePart,timePart]=value.split('T'),[y,mo,d]=datePart.split('-').map(Number),[hh,mm]=timePart.split(':').map(Number);
  const nominal=Date.UTC(y,mo-1,d,hh,mm,0);
  const offsetMinutes=tzOffsetMinutes(new Date(nominal),timeZone);
  let utc=new Date(nominal-offsetMinutes*60000);
  const corrected=tzOffsetMinutes(utc,timeZone);
  if(corrected!==offsetMinutes) utc=new Date(nominal-corrected*60000);
  return utc;
}
function tzOffsetMinutes(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'shortOffset',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);
  const z=parts.find(p=>p.type==='timeZoneName')?.value||'GMT'; const m=z.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/); if(!m)return 0;
  return (m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0));
}

function mountCalc(m,t){
  const defs={
    'Percentage Calculator':{fields:[['a','Value'],['b','Percentage %']],run:(a,b)=>`Result: ${(a*b/100).toFixed(4)}`},
    'Discount Calculator':{fields:[['a','Original price'],['b','Discount %']],run:(a,b)=>`Final price: ${(a-a*b/100).toFixed(2)}\nYou save: ${(a*b/100).toFixed(2)}`},
    'Tip Calculator':{fields:[['a','Bill'],['b','Tip %']],run:(a,b)=>`Tip: ${(a*b/100).toFixed(2)}\nTotal: ${(a+a*b/100).toFixed(2)}`},
    'BMI Calculator':{fields:[['a','Weight (kg)'],['b','Height (m)']],run:(a,b)=>b>0?`BMI: ${(a/(b*b)).toFixed(2)}`:'Enter a positive height.'},
    'GST Calculator':{fields:[['a','Base amount'],['b','GST %']],run:(a,b)=>`GST amount: ${(a*b/100).toFixed(2)}\nTotal: ${(a+a*b/100).toFixed(2)}`},
    'Markup Calculator':{fields:[['a','Cost'],['b','Markup %']],run:(a,b)=>`Selling price: ${(a*(1+b/100)).toFixed(2)}`},
    'Margin Calculator':{fields:[['a','Selling price'],['b','Cost']],run:(a,b)=>a?`Margin: ${((a-b)/a*100).toFixed(2)}%`:'Enter a non-zero selling price.'},
    'Profit Calculator':{fields:[['a','Revenue'],['b','Cost']],run:(a,b)=>`Profit: ${(a-b).toFixed(2)}\nProfit margin: ${a?((a-b)/a*100).toFixed(2)+'%':'—'}`},
    'Break Even Calculator':{fields:[['a','Fixed costs'],['b','Contribution per unit']],run:(a,b)=>b>0?`Break-even units: ${Math.ceil(a/b)}`:'Enter positive contribution.'},
    'Sales Tax Calculator':{fields:[['a','Price'],['b','Tax %']],run:(a,b)=>`Tax: ${(a*b/100).toFixed(2)}\nTotal: ${(a+a*b/100).toFixed(2)}`},
    'VAT Calculator':{fields:[['a','Net price'],['b','VAT %']],run:(a,b)=>`VAT: ${(a*b/100).toFixed(2)}\nGross: ${(a+a*b/100).toFixed(2)}`},
    'EMI Calculator':{fields:[['a','Loan principal'],['b','Annual interest %'],['c','Tenure (months)']],run:(p,r,n)=>{const m=r/1200;const emi=m? p*m*Math.pow(1+m,n)/(Math.pow(1+m,n)-1):p/n;return `Monthly EMI: ${emi.toFixed(2)}\nTotal paid: ${(emi*n).toFixed(2)}\nTotal interest: ${(emi*n-p).toFixed(2)}`}},
    'Inflation Calculator':{fields:[['a','Amount'],['b','Inflation %'],['c','Years']],run:(a,r,y)=>`Future amount at ${r}%: ${(a*Math.pow(1+r/100,y)).toFixed(2)}`},
    'ROI Calculator':{fields:[['a','Initial investment'],['b','Final value']],run:(a,b)=>a?`ROI: ${((b-a)/a*100).toFixed(2)}%\nProfit/Loss: ${(b-a).toFixed(2)}`:'Enter a non-zero investment.'},
    'ROAS Calculator':{fields:[['a','Revenue'],['b','Ad spend']],run:(a,b)=>b?`ROAS: ${(a/b).toFixed(2)}×`:'Enter ad spend.'},
    'Salary Calculator':{fields:[['a','Annual gross'],['b','Annual deductions']],run:(a,b)=>`Annual take-home: ${(a-b).toFixed(2)}\nMonthly take-home: ${((a-b)/12).toFixed(2)}`},
    'Hourly Rate Calculator':{fields:[['a','Target annual income'],['b','Billable hours/week'],['c','Weeks/year']],run:(a,b,c)=>b>0&&c>0?`Required hourly rate: ${(a/(b*c)).toFixed(2)}`:'Enter positive billable hours and weeks.'},
    'BSA Calculator':{fields:[['a','Weight (kg)'],['b','Height (cm)']],run:(w,h)=>w>0&&h>0?`BSA (Mosteller): ${Math.sqrt(w*h/3600).toFixed(2)} m²`:'Enter positive height and weight.'},
    'Anion Gap Calculator':{fields:[['a','Na⁺ (mEq/L)'],['b','Cl⁻ (mEq/L)'],['c','HCO₃⁻ (mEq/L)']],run:(na,cl,hco)=>`Anion gap: ${(na-cl-hco).toFixed(1)} mEq/L`},
    'Corrected Calcium Calculator':{fields:[['a','Measured Ca (mg/dL)'],['b','Albumin (g/dL)']],run:(ca,alb)=>`Corrected calcium: ${(ca+0.8*(4-alb)).toFixed(2)} mg/dL`},
    'Concentration Calculator':{fields:[['a','Solute amount (g)'],['b','Solution volume (L)']],run:(a,b)=>b>0?`Mass concentration: ${(a/b).toFixed(4)} g/L`:'Enter positive volume.'},
    'Molarity Calculator':{fields:[['a','Mass (g)'],['b','Molar mass (g/mol)'],['c','Volume (L)']],run:(a,b,c)=>b>0&&c>0?`Molarity: ${(a/b/c).toFixed(4)} mol/L`:'Enter positive molar mass and volume.'},
    'Body Fat Calculator':{fields:[['a','BMI'],['b','Age (years)'],['c','Sex (1=male, 0=female)']],run:(bmi,age,sex)=>`Approx. body fat (BMI method): ${(1.2*bmi+0.23*age-10.8*sex-5.4).toFixed(1)}% (educational estimate)`},
  };
  const unitDefs={
    'Unit Converter':{base:'length',units:{m:1,cm:0.01,mm:0.001,in:0.0254,ft:0.3048,km:1000,mi:1609.344}},
    'Length Converter':{base:'length',units:{m:1,cm:0.01,mm:0.001,in:0.0254,ft:0.3048,yd:0.9144,km:1000,mi:1609.344}},
    'Weight Converter':{base:'kg',units:{kg:1,g:0.001,mg:1e-6,lb:0.45359237,oz:0.0283495231}},
    'Temperature Converter':{base:'temperature'},
    'Area Converter':{base:'area',units:{m2:1,cm2:0.0001,ft2:0.09290304,yd2:0.83612736,acre:4046.8564224,ha:10000}},
    'Volume Converter':{base:'volume',units:{L:1,mL:0.001,gal:3.785411784,qt:0.946352946,pint:0.473176473,cup:0.2365882365}},
    'Speed Converter':{base:'speed',units:{'m/s':1,'km/h':0.2777777778,mph:0.44704,knot:0.5144444444}},
    'Data Size Converter':{base:'bytes',units:{B:1,KB:1024,MB:1024**2,GB:1024**3,TB:1024**4}},
  };
  if(t.title==='Age Calculator'){
    m.innerHTML='<section class="panel"><label>Date of birth <input id="dob" type="date"></label><div class="button-row"><button class="btn primary" id="run">Calculate age</button></div><pre id="tool-out" class="out"></pre></section>';
    document.getElementById('run').onclick=()=>{const d=new Date(document.getElementById('dob').value+'T00:00:00');if(Number.isNaN(d.getTime()))return document.getElementById('tool-out').textContent='Choose a date.';const now=new Date();let y=now.getFullYear()-d.getFullYear(),mth=now.getMonth()-d.getMonth(),day=now.getDate()-d.getDate();if(day<0){mth--;day+=new Date(now.getFullYear(),now.getMonth(),0).getDate()}if(mth<0){y--;mth+=12}document.getElementById('tool-out').textContent=`Age: ${y} years, ${mth} months, ${day} days`;};return;
  }
  if(t.title==='Date Difference'||t.title==='Business Days Calculator'){
    m.innerHTML='<section class="panel"><div class="tool-layout"><label>Start <input id="start" type="date"></label><label>End <input id="end" type="date"></label></div><div class="button-row"><button class="btn primary" id="run">Calculate</button></div><pre id="tool-out" class="out"></pre></section>';
    document.getElementById('run').onclick=()=>{const a=new Date(document.getElementById('start').value+'T00:00:00'),b=new Date(document.getElementById('end').value+'T00:00:00');if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return document.getElementById('tool-out').textContent='Choose both dates.';const days=Math.round((b-a)/86400000);if(t.title==='Date Difference')document.getElementById('tool-out').textContent=`Difference: ${days} days`;else{let n=0,cur=new Date(a);const dir=days<0?-1:1;for(let i=0;i<=Math.abs(days);i++){const wd=cur.getDay();if(wd!==0&&wd!==6)n++;cur.setDate(cur.getDate()+dir);}document.getElementById('tool-out').textContent=`Business days (inclusive): ${Math.max(0,n)}`;}};return;
  }
  if(t.title==='Time Difference'){
    m.innerHTML='<section class="panel"><div class="tool-layout"><label>Start <input id="a" type="time" value="09:00"></label><label>End <input id="b" type="time" value="17:00"></label></div><div class="button-row"><button class="btn primary" id="run">Calculate</button></div><pre id="tool-out" class="out"></pre></section>';
    document.getElementById('run').onclick=()=>{const p=x=>{const [h,m]=x.split(':').map(Number);return h*60+m},a=p(document.getElementById('a').value),b=p(document.getElementById('b').value),d=(b-a+1440)%1440;document.getElementById('tool-out').textContent=`Difference: ${Math.floor(d/60)} h ${d%60} min`;};return;
  }
  if(t.title==='Time Zone Converter'){
    m.innerHTML='<section class="panel"><input id="time" type="datetime-local"><div class="tool-layout"><select id="from"><option>UTC</option><option>Asia/Kolkata</option><option>Europe/London</option><option>America/New_York</option><option>Asia/Dubai</option></select><select id="to"><option>Asia/Kolkata</option><option>UTC</option><option>Europe/London</option><option>America/New_York</option><option>Asia/Dubai</option></select></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out"></pre><p class="muted">The entered clock time is interpreted in the selected source time zone, including common daylight-saving transitions supported by the browser.</p></section>';
    document.getElementById('run').onclick=()=>{
      const v=document.getElementById('time').value,from=document.getElementById('from').value,to=document.getElementById('to').value;
      if(!v)return document.getElementById('tool-out').textContent='Choose a date/time.';
      try{
        const utc=wallTimeToUtc(v,from),formatted=new Intl.DateTimeFormat('en-GB',{timeZone:to,dateStyle:'full',timeStyle:'long'}).format(utc);
        document.getElementById('tool-out').textContent=`Source zone: ${from}\nTarget zone: ${to}\n${formatted}\nUTC: ${utc.toISOString()}`;
      }catch(e){document.getElementById('tool-out').textContent='Conversion error: '+e.message}
    };return;
  }

  if(unitDefs[t.title]){
    const u=unitDefs[t.title];
    if(t.title==='Temperature Converter'){
      m.innerHTML='<section class="panel"><div class="tool-layout"><input id="n" type="number" step="any" value="0"><select id="from"><option>C</option><option>F</option><option>K</option></select><select id="to"><option>F</option><option>C</option><option>K</option></select></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out"></pre></section>';
      document.getElementById('run').onclick=()=>{let v=Number(document.getElementById('n').value),f=document.getElementById('from').value,to=document.getElementById('to').value;if(f==='F')v=(v-32)*5/9;else if(f==='K')v=v-273.15;if(to==='F')v=v*9/5+32;else if(to==='K')v=v+273.15;document.getElementById('tool-out').textContent=`${v.toFixed(4)} °${to}`};return;
    }
    const opts=Object.keys(u.units);m.innerHTML=`<section class="panel"><div class="tool-layout"><input id="n" type="number" step="any" value="1"><select id="from">${opts.map(x=>`<option>${x}</option>`).join('')}</select><select id="to">${opts.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out"></pre></section>`;
    document.getElementById('run').onclick=()=>{const v=Number(document.getElementById('n').value),f=document.getElementById('from').value,to=document.getElementById('to').value,base=v*u.units[f],r=base/u.units[to];document.getElementById('tool-out').textContent=`${r} ${to}`};return;
  }
  const d=defs[t.title];
  if(!d){m.innerHTML='<section class="panel"><h3>Calculator adapter pending</h3></section>';return;}
  m.innerHTML=`<section class="panel"><div class="tool-layout">${d.fields.map(([id,label])=>`<input id="${id}" type="number" step="any" placeholder="${label}">`).join('')}</div><div class="button-row"><button class="btn primary" id="run">Calculate</button></div><pre id="tool-out" class="out"></pre><p class="muted">Educational calculator; verify important financial or clinical decisions against authoritative references.</p></section>`;
  document.getElementById('run').onclick=()=>{const vals=d.fields.map(([id])=>Number(document.getElementById(id).value));try{document.getElementById('tool-out').textContent=d.run(...vals)}catch(e){document.getElementById('tool-out').textContent='Error: '+e.message}};
}

function mountImage(m,t){
  const title=t.title;
  const fileless=['Contrast Checker','Image File Size Calculator','DPI Calculator','Print Size Calculator'];
  const analysis=['Image Dimensions','Color Picker','Palette Generator','Dominant Color Finder','Contrast Checker','Image Average Color','Image File Size Calculator'];
  const qualityTools=['Image Compressor','JPG to PNG','PNG to JPG','WEBP to JPG','JPG to WEBP','PNG to WEBP','Thumbnail Maker','Image Resizer','Transparent PNG Maker'];
  let controls='';
  if(title==='Image File Size Calculator') controls='<input id="bytes" type="number" min="0" step="1" placeholder="File size in bytes">';
  else if(title==='DPI Calculator') controls='<div class="tool-layout"><input id="px" type="number" min="1" placeholder="Pixels"><input id="inch" type="number" min="0.01" step="0.01" value="1" placeholder="Inches"></div>';
  else if(title==='Print Size Calculator') controls='<div class="tool-layout"><input id="px" type="number" min="1" placeholder="Longest pixel dimension"><input id="dpi" type="number" min="1" step="1" value="300" placeholder="DPI"></div>';
  else if(title==='Image Cropper') controls='<div class="tool-layout"><input id="x" type="number" min="0" value="0" placeholder="X"><input id="y" type="number" min="0" value="0" placeholder="Y"><input id="cropw" type="number" min="1" placeholder="Width"><input id="croph" type="number" min="1" placeholder="Height"></div>';
  else if(title==='Image Rotator') controls='<select id="degrees"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select>';
  else if(title==='Image Flipper') controls='<select id="axis"><option value="h">Horizontal</option><option value="v">Vertical</option></select>';
  else if(title==='Image Blur') controls='<input id="radius" type="number" min="0" max="40" step="1" value="4" placeholder="Blur radius (px)">';
  else if(title==='Image Pixelate') controls='<input id="block" type="number" min="2" max="100" step="1" value="12" placeholder="Pixel block size">';
  else if(title==='Image Watermark') controls='<div class="tool-layout"><input id="watermark" class="text-input" value="FreeToolForge" placeholder="Watermark text"><input id="opacity" type="number" min="0.05" max="1" step="0.05" value="0.35" placeholder="Opacity"></div>';
  else if(title==='Image Border Maker') controls='<div class="tool-layout"><input id="border" type="number" min="0" max="500" value="20" placeholder="Border width"><input id="borderColor" class="text-input" type="color" value="#000000"></div>';
  else if(title==='Image Padding Tool') controls='<div class="tool-layout"><input id="padTop" type="number" min="0" value="20" placeholder="Top"><input id="padRight" type="number" min="0" value="20" placeholder="Right"><input id="padBottom" type="number" min="0" value="20" placeholder="Bottom"><input id="padLeft" type="number" min="0" value="20" placeholder="Left"><input id="padColor" class="text-input" type="color" value="#ffffff"></div>';
  else if(title==='Round Image Maker') controls='<input id="roundRadius" type="number" min="0" step="1" value="40" placeholder="Corner radius (px)">';
  else if(title==='Transparent PNG Maker') controls='<input id="threshold" type="number" min="0" max="255" value="8" placeholder="Near-white threshold (0–255)">';
  else if(qualityTools.includes(title)) controls=`<div class="tool-layout"><input id="width" type="number" min="1" placeholder="Width (optional)"><input id="quality" type="number" min="0.1" max="1" step="0.1" value="0.85" placeholder="JPEG/WebP quality"></div>`;
  else if(title==='Color Picker') controls='<div class="tool-layout"><input id="pxX" type="number" min="0" value="0" placeholder="X"><input id="pxY" type="number" min="0" value="0" placeholder="Y"></div>';
  else if(title==='Contrast Checker') controls='<div class="tool-layout"><input id="fg" class="text-input" value="#000000" placeholder="Foreground hex"><input id="bg" class="text-input" value="#ffffff" placeholder="Background hex"></div>';
  const needsFile=!fileless.includes(title);
  m.innerHTML=`<section class="panel">${needsFile?`<div class="dropzone" id="drop">Choose an image<input id="file" type="file" accept="image/*" class="hidden"></div>`:''}${controls}<button class="btn primary" id="run" style="margin-top:12px">${analysis.includes(title)?'Analyze':'Process'}</button><div id="tool-out" class="out" style="margin-top:12px"></div></section>`;
  let file;
  if(needsFile){document.getElementById('drop').onclick=()=>document.getElementById('file').click();document.getElementById('file').onchange=e=>file=e.target.files[0];}
  const hexRgb=(hex)=>{const h=String(hex||'').replace('#','').trim();if(!/^[0-9a-f]{6}$/i.test(h))throw Error('Use a 6-digit hex color.');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4),16)]};
  const rgbHex=(r,g,b)=>'#'+[r,g,b].map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join('').toUpperCase();
  const loadImg=async()=>{if(!file)throw Error('Choose an image first.');const img=new Image();const url=URL.createObjectURL(file);img.src=url;await img.decode();setTimeout(()=>URL.revokeObjectURL(url),1000);return img};
  const canvasFrom=img=>{const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;c.getContext('2d').drawImage(img,0,0);return c};
  const exportCanvas=async(c,ext='image/png',quality=0.9,name='freetoolforge-image.png')=>{const blob=await new Promise(r=>c.toBlob(r,ext,quality));if(!blob)throw Error('Browser could not encode this image format.');downloadBlob(blob,name);return blob};
  const average=data=>{let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];n++}return[r/n,g/n,b/n]};
  const luminance=rgb=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(rgb[0])+.7152*f(rgb[1])+.0722*f(rgb[2])};
  const contrast=(a,b)=>{const z=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(z[0]+.05)/(z[1]+.05)};
  document.getElementById('run').onclick=async()=>{const out=document.getElementById('tool-out');out.textContent='Working…';try{
    if(title==='DPI Calculator'){const px=Number(document.getElementById('px').value),inch=Number(document.getElementById('inch').value);if(px<=0||inch<=0)throw Error('Enter positive values.');out.textContent=`DPI: ${(px/inch).toFixed(2)}`;return;}
    if(title==='Print Size Calculator'){const px=Number(document.getElementById('px').value),dpi=Number(document.getElementById('dpi').value);if(px<=0||dpi<=0)throw Error('Enter positive values.');out.textContent=`Size: ${(px/dpi).toFixed(2)} inches (${(px/dpi*2.54).toFixed(2)} cm)`;return;}
    if(title==='Image File Size Calculator'){const bytes=Number(document.getElementById('bytes').value);if(!Number.isFinite(bytes)||bytes<0)throw Error('Enter a valid byte count.');out.textContent=`Bytes: ${bytes}\nKB: ${(bytes/1024).toFixed(2)}\nMB: ${(bytes/1048576).toFixed(2)}`;return;}
    if(title==='Contrast Checker'){const ratio=contrast(hexRgb(document.getElementById('fg').value),hexRgb(document.getElementById('bg').value));out.textContent=`Contrast ratio: ${ratio.toFixed(2)}:1\nWCAG AA normal text: ${ratio>=4.5?'Pass':'Fail'}\nWCAG AAA normal text: ${ratio>=7?'Pass':'Fail'}`;return;}
    const img=await loadImg(),c=canvasFrom(img);
    if(title==='Image Dimensions'){out.textContent=`Width: ${c.width}px\nHeight: ${c.height}px\nAspect ratio: ${(c.width/c.height).toFixed(4)}`;return;}
    if(title==='Image Average Color'||title==='Palette Generator'||title==='Dominant Color Finder'){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,a=average(d);if(title==='Image Average Color'){out.textContent=`Average RGB: rgb(${Math.round(a[0])}, ${Math.round(a[1])}, ${Math.round(a[2])})\nHEX: ${rgbHex(...a)}`;return;}const bins=new Map();for(let i=0;i<d.length;i+=16){const q=[d[i],d[i+1],d[i+2]].map(v=>Math.round(v/32)*32),k=q.join(',');bins.set(k,(bins.get(k)||0)+1)}const top=[...bins.entries()].sort((x,y)=>y[1]-x[1]).slice(0,5).map(([k])=>rgbHex(...k.split(',').map(Number)));out.textContent=title==='Dominant Color Finder'?`Dominant color: ${top[0]}`:`Palette:\n${top.join('\n')}`;return;}
    if(title==='Color Picker'){const x=Math.round(Number(document.getElementById('pxX').value)),y=Math.round(Number(document.getElementById('pxY').value));if(x<0||y<0||x>=c.width||y>=c.height)throw Error('Pixel coordinates are outside the image.');const p=c.getContext('2d').getImageData(x,y,1,1).data;out.textContent=`Pixel (${x}, ${y})\nRGB: rgb(${p[0]}, ${p[1]}, ${p[2]})\nHEX: ${rgbHex(p[0],p[1],p[2])}`;return;}
    if(title==='Image Compressor'||title==='Image Resizer'||title==='JPG to PNG'||title==='PNG to JPG'||title==='WEBP to JPG'||title==='JPG to WEBP'||title==='PNG to WEBP'||title==='Thumbnail Maker'||title==='Transparent PNG Maker'){
      let w=Number(document.getElementById('width')?.value)||c.width,h=Math.max(1,Math.round(c.height*w/c.width));if(title==='Thumbnail Maker')w=Math.min(w,320),h=Math.max(1,Math.round(c.height*w/c.width));
      const cc=document.createElement('canvas');cc.width=w;cc.height=h;const ctx=cc.getContext('2d');ctx.drawImage(c,0,0,w,h);let ext='image/png',name='freetoolforge-image.png',q=Number(document.getElementById('quality')?.value)||.85;
      if(title==='Image Compressor'||title==='Image Resizer'||title==='Thumbnail Maker'){ext='image/jpeg';name='freetoolforge-image.jpg';}
      if(title==='JPG to PNG'){ext='image/png';name='converted.png'}
      if(title==='PNG to JPG'||title==='WEBP to JPG'){ext='image/jpeg';name='converted.jpg'}
      if(title==='JPG to WEBP'||title==='PNG to WEBP'){ext='image/webp';name='converted.webp'}
      if(title==='Transparent PNG Maker'){const im=ctx.getImageData(0,0,cc.width,cc.height),thr=clamp(Number(document.getElementById('threshold').value)||8,0,255);for(let i=0;i<im.data.length;i+=4)if(im.data[i]>255-thr&&im.data[i+1]>255-thr&&im.data[i+2]>255-thr)im.data[i+3]=0;ctx.putImageData(im,0,0);ext='image/png';name='transparent.png'}
      const blob=await exportCanvas(cc,ext,q,name);out.textContent=`Done — ${Math.round(blob.size/1024)} KB\n${cc.width} × ${cc.height}px`;return;}
    if(title==='Image Cropper'){const x=clamp(Number(document.getElementById('x').value)||0,0,c.width-1),y=clamp(Number(document.getElementById('y').value)||0,0,c.height-1),w=Math.min(Number(document.getElementById('cropw').value)||c.width-x,c.width-x),h=Math.min(Number(document.getElementById('croph').value)||c.height-y,c.height-y);if(w<1||h<1)throw Error('Enter a positive crop size.');const cc=document.createElement('canvas');cc.width=w;cc.height=h;cc.getContext('2d').drawImage(c,x,y,w,h,0,0,w,h);const blob=await exportCanvas(cc,'image/png',1,'cropped.png');out.textContent=`Cropped — ${blob.size} bytes\n${w} × ${h}px`;return;}
    if(title==='Image Rotator'){const deg=Number(document.getElementById('degrees').value)||90,swap=deg%180!==0,cc=document.createElement('canvas');cc.width=swap?c.height:c.width;cc.height=swap?c.width:c.height;const ctx=cc.getContext('2d');ctx.translate(cc.width/2,cc.height/2);ctx.rotate(deg*Math.PI/180);ctx.drawImage(c,-c.width/2,-c.height/2);const blob=await exportCanvas(cc,'image/png',1,'rotated.png');out.textContent=`Rotated ${deg}° — ${blob.size} bytes`;return;}
    if(title==='Image Flipper'){const cc=document.createElement('canvas');cc.width=c.width;cc.height=c.height;const ctx=cc.getContext('2d');if(document.getElementById('axis').value==='h'){ctx.translate(c.width,0);ctx.scale(-1,1)}else{ctx.translate(0,c.height);ctx.scale(1,-1)}ctx.drawImage(c,0,0);const blob=await exportCanvas(cc,'image/png',1,'flipped.png');out.textContent=`Flipped — ${blob.size} bytes`;return;}
    if(title==='Image Blur'){const r=clamp(Number(document.getElementById('radius').value)||4,0,40),cc=document.createElement('canvas');cc.width=c.width;cc.height=c.height;const ctx=cc.getContext('2d');ctx.filter=`blur(${r}px)`;ctx.drawImage(c,0,0);ctx.filter='none';const blob=await exportCanvas(cc,'image/jpeg',.9,'blurred.jpg');out.textContent=`Blurred with ${r}px radius — ${blob.size} bytes`;return;}
    if(title==='Image Pixelate'){const bs=clamp(Number(document.getElementById('block').value)||12,2,100),small=document.createElement('canvas');small.width=Math.max(1,Math.ceil(c.width/bs));small.height=Math.max(1,Math.ceil(c.height/bs));small.getContext('2d').drawImage(c,0,0,small.width,small.height);const cc=document.createElement('canvas');cc.width=c.width;cc.height=c.height;const ctx=cc.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,cc.width,cc.height);const blob=await exportCanvas(cc,'image/png',1,'pixelated.png');out.textContent=`Pixelated — block ${bs}px`;return;}
    if(title==='Image Watermark'){const text=document.getElementById('watermark').value.trim()||'Watermark',op=clamp(Number(document.getElementById('opacity').value)||.35,.05,1),cc=document.createElement('canvas');cc.width=c.width;cc.height=c.height;const ctx=cc.getContext('2d');ctx.drawImage(c,0,0);ctx.globalAlpha=op;ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.font=`bold ${Math.max(16,Math.round(Math.min(c.width,c.height)/12))}px sans-serif`;ctx.textAlign='right';ctx.textBaseline='bottom';ctx.strokeText(text,c.width-20,c.height-20);ctx.fillText(text,c.width-20,c.height-20);const blob=await exportCanvas(cc,'image/png',1,'watermarked.png');out.textContent=`Watermark added — ${blob.size} bytes`;return;}
    if(title==='Image Border Maker'){const b=clamp(Number(document.getElementById('border').value)||20,0,500),color=document.getElementById('borderColor').value,cc=document.createElement('canvas');cc.width=c.width+2*b;cc.height=c.height+2*b;const ctx=cc.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,cc.width,cc.height);ctx.drawImage(c,b,b);const blob=await exportCanvas(cc,'image/png',1,'bordered.png');out.textContent=`Border added — ${cc.width} × ${cc.height}px`;return;}
    if(title==='Image Padding Tool'){const top=clamp(Number(document.getElementById('padTop').value)||0,0,1000),right=clamp(Number(document.getElementById('padRight').value)||0,0,1000),bottom=clamp(Number(document.getElementById('padBottom').value)||0,0,1000),left=clamp(Number(document.getElementById('padLeft').value)||0,0,1000),cc=document.createElement('canvas');cc.width=c.width+left+right;cc.height=c.height+top+bottom;const ctx=cc.getContext('2d');ctx.fillStyle=document.getElementById('padColor').value;ctx.fillRect(0,0,cc.width,cc.height);ctx.drawImage(c,left,top);const blob=await exportCanvas(cc,'image/png',1,'padded.png');out.textContent=`Padding added — ${cc.width} × ${cc.height}px`;return;}
    if(title==='Round Image Maker'){const r=clamp(Number(document.getElementById('roundRadius').value)||40,0,Math.min(c.width,c.height)/2),cc=document.createElement('canvas');cc.width=c.width;cc.height=c.height;const ctx=cc.getContext('2d');ctx.beginPath();ctx.moveTo(r,0);ctx.arcTo(cc.width,0,cc.width,cc.height,r);ctx.arcTo(cc.width,cc.height,0,cc.height,r);ctx.arcTo(0,cc.height,0,0,r);ctx.arcTo(0,0,cc.width,0,r);ctx.closePath();ctx.clip();ctx.drawImage(c,0,0);const blob=await exportCanvas(cc,'image/png',1,'rounded.png');out.textContent=`Rounded corners — radius ${r}px`;return;}
    out.textContent='This image engine is not implemented yet.';
  }catch(e){out.textContent='Error: '+(e.message||e)}};
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
    'PDF to Text','PDF to Markdown','PDF to HTML','PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF','Fill PDF','Annotate PDF','Images to PDF','JPG to PDF',
    'PNG to PDF','WEBP to PDF','HEIC to PDF','Text to PDF','Pages per Sheet','Two Pages per Sheet','PDF Page Counter',
    'PDF Page Extractor','Sign PDF','PDF Form Field Viewer','Booklet PDF Maker','HTML to PDF','PDF Batch Rename','Invoice PDF Maker','Markdown to PDF','Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF','PDF/A Helper','PDF Bookmark Helper'
  ]);
  if(!pdfTools.has(t.title)){
    m.innerHTML=`<div class="panel"><p>This PDF tool is catalogued for a later specialized engine.</p></div>`;
    return;
  }

  const noFile=['Text to PDF','Markdown to PDF','Invoice PDF Maker','HTML to PDF'].includes(t.title);
  const isMulti=['Merge PDFs','Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF','HEIC to PDF','Overlay PDFs','Compare PDFs','PDF Batch Rename','Sign PDF'].includes(t.title);
  const accept = t.title==='Sign PDF' ? 'application/pdf,image/png,image/jpeg,image/webp' : t.title==='JPG to PDF' ? 'image/jpeg' : t.title==='PNG to PDF' ? 'image/png' : t.title==='WEBP to PDF' ? 'image/webp' : t.title==='HEIC to PDF' ? '.heic,.heif,image/heic,image/heif' : t.title==='Images to PDF' ? 'image/*' : t.title==='Word to PDF' ? '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : t.title==='Excel to PDF' ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : t.title==='PowerPoint to PDF' ? '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation' : t.title==='EPUB to PDF' ? '.epub,application/epub+zip' : 'application/pdf';
  const inputLabel = t.title==='Sign PDF' ? 'Choose PDF first; optionally add a PNG/JPG/WebP signature image second' : t.title==='Redact PDF' ? 'Choose a PDF to redact' : t.title==='Overlay PDFs' ? 'Choose base PDF + overlay PDF (in that order)' : t.title==='Compare PDFs' ? 'Choose two PDFs to compare' : t.title==='PDF Batch Rename' ? 'Choose PDFs to rename' : t.title==='Word to PDF' ? 'Choose a DOCX file' : t.title==='Excel to PDF' ? 'Choose an XLSX file' : t.title==='PowerPoint to PDF' ? 'Choose a PPTX file' : t.title==='EPUB to PDF' ? 'Choose an EPUB file' : 'Choose PDF file(s)';
  m.innerHTML=`<section class="panel">
    ${noFile?'':`<div class="dropzone" id="drop">${inputLabel}<input id="file" type="file" accept="${accept}" ${isMulti?'multiple':''} class="hidden"></div>`}
    <div id="pdf-extra" class="field-stack" style="margin-top:12px"></div>
    <div class="button-row"><button class="btn primary" id="run">${t.title==='PDF to Images'?'Render pages':t.title==='PDF to Text'||t.title==='PDF to Markdown'||t.title==='PDF to HTML'?'Extract text':'Run PDF tool'}</button></div>
    <div id="tool-out" class="out" style="margin-top:12px"></div>
    <p class="muted">Browser-first processing. Files stay on this device for local PDF engines. PDF.js is used for rendering/text extraction; OCR PDF uses the configured server OCR endpoint.</p>
  </section>`;
  const extra=document.getElementById('pdf-extra');
  const out=document.getElementById('tool-out');
  const setupExtra=()=>{
    const commonRange='<input id="range" placeholder="Pages, e.g. 1-3,5,8-10"><small class="muted">Page numbers are 1-based. Blank means all pages.</small>';
    if(t.title==='Split PDF') extra.innerHTML='<label>Pages per part <input id="pages" type="number" min="1" value="10"></label><input id="prefix" value="split" placeholder="Output filename prefix">';
    else if(['Extract PDF Pages','Delete PDF Pages','PDF Page Extractor'].includes(t.title)) extra.innerHTML=commonRange;
    else if(t.title==='Rotate PDF') extra.innerHTML=`${commonRange}<label>Degrees <select id="degrees"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></label>`;
    else if(t.title==='Reorder PDF Pages') extra.innerHTML='<input id="order" placeholder="New order, e.g. 3,1,2,4"><small class="muted">Every page exactly once.</small>';
    else if(t.title==='PDF Metadata Viewer') extra.innerHTML='<small class="muted">Reads standard document metadata, page count, file size, page sizes and encryption flag.</small>';
    else if(t.title==='Remove PDF Metadata') extra.innerHTML='<label><input id="blankMeta" type="checkbox" checked> Remove title, author, subject, keywords, creator and producer</label>';
    else if(t.title==='Compress PDF') extra.innerHTML='<select id="compressionMode"><option value="structural">Safe structural rewrite</option><option value="raster">Image recompression (best for scanned PDFs)</option></select><label><input id="stripMeta" type="checkbox" checked> Strip document metadata</label><label>JPEG quality <input id="jpegQuality" type="number" min="0.35" max="0.95" step="0.05" value="0.72"></label><label>Render DPI <input id="compressDpi" type="number" min="72" max="180" step="6" value="110"></label><small class="muted">Structural mode preserves vector/text content but does not recompress embedded images. Raster mode can shrink scan-heavy PDFs, but turns pages into images.</small>';
    else if(t.title==='Add PDF Watermark') extra.innerHTML='<input id="watermark" placeholder="Watermark text" value="FreeToolForge"><input id="wmOpacity" type="number" min="0.05" max="1" step="0.05" value="0.25" placeholder="Opacity"><select id="wmPos"><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="diagonal">Diagonal</option></select>';
    else if(t.title==='Add PDF Page Numbers') extra.innerHTML='<select id="numPos"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-center">Top center</option></select><input id="numStart" type="number" value="1" min="1" placeholder="Start number">';
    else if(t.title==='Overlay PDFs') extra.innerHTML='<select id="overlayMode"><option value="each">Overlay same overlay page on every base page</option><option value="match">Match overlay page number</option></select><small class="muted">The overlay is drawn on top of the base page.</small>';
    else if(t.title==='Compare PDFs') extra.innerHTML='<small class="muted">Upload exactly two PDFs. Comparison reports page counts, metadata differences, and extracted text differences page-by-page.</small>';
    else if(t.title==='Crop PDF') extra.innerHTML='<input id="crop" placeholder="Margins in points: left,top,right,bottom e.g. 36,36,36,36" value="36,36,36,36"><small class="muted">Margins are measured inward from each page edge.</small>';
    else if(t.title==='Resize PDF Pages') extra.innerHTML='<select id="size"><option value="A4">A4 (595×842 pt)</option><option value="Letter">Letter (612×792 pt)</option><option value="A5">A5 (420×595 pt)</option><option value="fit">Fit content to its current page size</option></select><select id="resizeMode"><option value="contain">Contain</option><option value="stretch">Stretch</option></select>';
    else if(['Pages per Sheet','Two Pages per Sheet'].includes(t.title)) extra.innerHTML='<select id="sheet"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A3">A3</option></select><select id="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>';
    else if(t.title==='PDF to Images') extra.innerHTML='<select id="imageFormat"><option value="png">PNG</option><option value="jpeg">JPEG</option></select><input id="imageScale" type="number" min="0.5" max="3" step="0.25" value="1.5"><small class="muted">Scale 1.5 ≈ 108 DPI for PDF points.</small>';
    else if(t.title==='Fill PDF') extra.innerHTML='<small class="muted">The tool lists fillable fields after loading. Use the generated controls to enter values, tick checkboxes, or choose dropdown items.</small><div id="form-fields"></div>';
    else if(t.title==='Annotate PDF') extra.innerHTML='<input id="noteText" placeholder="Annotation text" value="Reviewed"><input id="notePage" type="number" min="1" value="1" placeholder="Page"><input id="noteX" type="number" value="50" placeholder="X"><input id="noteY" type="number" value="50" placeholder="Y">';
    else if(t.title==='Sign PDF') extra.innerHTML='<input id="sigText" placeholder="Typed signature (used when no image is supplied)" value="Your Name"><input id="sigPage" type="number" min="1" value="1" placeholder="Page"><input id="sigX" type="number" value="50" placeholder="X"><input id="sigY" type="number" value="70" placeholder="Y"><input id="sigSize" type="number" min="8" value="20" placeholder="Size"><small class="muted">With a second file selected, PNG/JPG/WebP is placed as the signature image. This is a visible signature stamp, not a cryptographic digital signature.</small>';
    else if(t.title==='PDF Form Field Viewer') extra.innerHTML='<div id="form-fields"></div>';
    else if(t.title==='Booklet PDF Maker') extra.innerHTML='<select id="bookletSize"><option value="A4">A4 landscape</option><option value="Letter">Letter landscape</option></select><small class="muted">Creates printer-friendly 2-up booklet imposition. Blank pages are inserted as needed to make a multiple of four.</small>';
    else if(t.title==='PDF Batch Rename') extra.innerHTML='<input id="renamePattern" value="document-{n}" placeholder="Pattern e.g. chapter-{n}"><small class="muted">Files are returned in a ZIP. {n} becomes the 1-based file number.</small>';
    else if(t.title==='Invoice PDF Maker') extra.innerHTML='<input id="invTitle" value="Invoice" placeholder="Invoice title"><input id="invTo" placeholder="Bill to"><textarea id="invItems" class="input-area" style="min-height:140px" placeholder="One item per line: Description | Quantity | Rate"></textarea>';
    else if(t.title==='Text to PDF') extra.innerHTML='<textarea id="textpdf" class="input-area" placeholder="Text to place on the PDF…"></textarea><select id="textSize"><option value="11">11 pt</option><option value="12" selected>12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option></select>';
    else if(t.title==='HTML to PDF') extra.innerHTML='<textarea id="htmlpdf" class="input-area" placeholder="Paste HTML here…"><h1>Example</h1><p>Hello from FreeToolForge.</p></textarea><small class="muted">Uses a browser HTML renderer; advanced CSS fidelity depends on the rendering engine.</small>';
    else if(t.title==='Word to PDF') extra.innerHTML='<small class="muted">DOCX text is extracted from WordprocessingML and laid out as plain text. Complex formatting, images, charts and tracked changes are not preserved.</small>';
    else if(t.title==='Excel to PDF') extra.innerHTML='<small class="muted">XLSX cell text from the first worksheet is laid out into a PDF. Complex formulas, charts and workbook formatting are not preserved.</small>';
    else if(t.title==='PowerPoint to PDF') extra.innerHTML='<small class="muted">PPTX slide text is extracted from slide XML and rendered as a simple text PDF. Original themes, images and animations are not preserved.</small>';
    else if(t.title==='EPUB to PDF') extra.innerHTML='<small class="muted">EPUB XHTML content is extracted and rendered as a simple text PDF. Complex CSS, fonts, media and interactive content are not preserved.</small>';
    else if(t.title==='PDF/A Helper') extra.innerHTML='<small class="muted">Runs a browser-side readiness checklist. This is not a standards-compliance certification and cannot prove full PDF/A conformance.</small>';
    else if(t.title==='PDF Bookmark Helper') extra.innerHTML='<textarea id="bookmarkTitles" class="input-area" placeholder="One bookmark title per line. Blank = Page 1, Page 2, …"></textarea><label><input id="replaceBookmarks" type="checkbox" checked> Replace the existing top-level outline with these bookmarks</label><small class="muted">Creates one top-level bookmark per page. Existing top-level outline entries are replaced when selected.</small>';
    else if(['PDF to Text','PDF to Markdown','PDF to HTML'].includes(t.title)) extra.innerHTML='<label><input id="onePerPage" type="checkbox" checked> Add page headings</label>';
    else if(t.title==='Redact PDF') extra.innerHTML='<div id="redactHelp" class="muted">Secure mode: pages are rendered to images and rebuilt as a new image-only PDF, so original searchable text is not retained. Enter rectangles as <b>page:x,y,w,h</b> percentages (0–100), separated by semicolons. Example: <code>1:10,20,30,10;1:60,20,20,10</code>.</div><textarea id="redactions" class="input-area" placeholder="page:x,y,width,height; page:x,y,width,height"></textarea>';
  };
  setupExtra();

  let files=[];
  const drop=document.getElementById('drop'), input=document.getElementById('file');
  if(drop&&input){drop.onclick=()=>input.click();input.onchange=e=>{files=[...e.target.files];out.textContent=files.length?files.map((f,i)=>`${i+1}. ${f.name} — ${Math.round(f.size/1024)} KB`).join('\n'):'No file selected.'; if(['Fill PDF','PDF Form Field Viewer'].includes(t.title)&&files[0]) loadFormFields(files[0]);};}

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
  const fitText=(font,text,maxWidth,size)=>{const lines=[];let cur='';for(const raw of String(text??'').split(/\s+/)){if(!raw)continue;let w=raw;while(w&&font.widthOfTextAtSize(w,size)>maxWidth){let take=1;while(take<w.length&&font.widthOfTextAtSize(w.slice(0,take+1),size)<=maxWidth)take++;if(cur){lines.push(cur);cur='';}lines.push(w.slice(0,take));w=w.slice(take);}if(!w)continue;const cand=cur?cur+' '+w:w;if(font.widthOfTextAtSize(cand,size)<=maxWidth)cur=cand;else{if(cur)lines.push(cur);cur=w;}}if(cur||!lines.length)lines.push(cur);return lines};
  const textPagesToPdf=async(PDFDocument,StandardFonts,pages,meta='FreeToolForge PDF conversion')=>{
    const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);doc.setTitle(meta);
    const pageW=595.28,pageH=841.89,margin=42,size=11;let page=doc.addPage([pageW,pageH]),y=pageH-margin;
    const newPage=()=>{page=doc.addPage([pageW,pageH]);y=pageH-margin};
    for(let pi=0;pi<pages.length;pi++){const label=pages[pi]?.label||`Page ${pi+1}`,body=String(pages[pi]?.text||'').replace(/\r/g,'');
      const headingLines=fitText(bold,label,pageW-margin*2,15);for(const line of headingLines){if(y<margin+20)newPage();page.drawText(line,{x:margin,y,size:15,font:bold,color:rgb(0,0,0)});y-=20;}
      const lines=body.split(/\n/);for(const raw of lines){const wrapped=fitText(font,raw||' ',pageW-margin*2,size);for(const line of wrapped){if(y<size+margin)newPage();page.drawText(line,{x:margin,y,size,font,color:rgb(0,0,0)});y-=size+4}y-=2;}
      y-=8;if(y<margin+30)newPage();
    }
    return doc;
  };
  const extractDocxText=async(file,JSZip)=>{const z=await JSZip.loadAsync(await file.arrayBuffer());const xml=await z.file('word/document.xml')?.async('text');if(!xml)throw Error('Invalid DOCX: word/document.xml not found.');const dom=new DOMParser().parseFromString(xml,'application/xml');if(dom.querySelector('parsererror'))throw Error('Could not parse DOCX XML.');const paras=[...dom.getElementsByTagName('w:p')].map(p=>[...p.getElementsByTagName('w:t')].map(n=>n.textContent||'').join('')).filter(x=>x.trim());return paras.join('\n')};
  const extractXlsxText=async(file,JSZip)=>{const z=await JSZip.loadAsync(await file.arrayBuffer());const shared=[];const ss=await z.file('xl/sharedStrings.xml')?.async('text');if(ss){const dom=new DOMParser().parseFromString(ss,'application/xml');for(const si of [...dom.getElementsByTagName('si')])shared.push([...si.getElementsByTagName('t')].map(n=>n.textContent||'').join(''));}const sheetName=Object.keys(z.files).filter(k=>/^xl\/worksheets\/sheet[^/]+\.xml$/.test(k)).sort()[0];if(!sheetName)throw Error('Invalid XLSX: worksheet XML not found.');const xml=await z.file(sheetName).async('text');const dom=new DOMParser().parseFromString(xml,'application/xml');if(dom.querySelector('parsererror'))throw Error('Could not parse worksheet XML.');const rows=[...dom.getElementsByTagName('row')];return rows.map(row=>[...row.getElementsByTagName('c')].map(c=>{const v=c.getElementsByTagName('v')[0]?.textContent||'';const t=c.getAttribute('t');if(t==='s')return shared[Number(v)]||'';if(t==='inlineStr')return [...c.getElementsByTagName('t')].map(n=>n.textContent||'').join('');return v}).join('\t')).filter(x=>x.trim()).join('\n')};
  const extractPptxText=async(file,JSZip)=>{const z=await JSZip.loadAsync(await file.arrayBuffer());const names=Object.keys(z.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));if(!names.length)throw Error('Invalid PPTX: no slides found.');const pages=[];for(const name of names){const dom=new DOMParser().parseFromString(await z.file(name).async('text'),'application/xml');if(dom.querySelector('parsererror'))throw Error('Could not parse '+name);pages.push([...dom.getElementsByTagName('a:t')].map(n=>n.textContent||'').join(' '));}return pages};
  const normalizeZipPath=(base,href)=>{const parts=(base+decodeURIComponent(href||'')).split('/');const out=[];for(const part of parts){if(!part||part==='.')continue;if(part==='..'){out.pop();continue}out.push(part)}return out.join('/')};
  const extractEpubText=async(file,JSZip)=>{const z=await JSZip.loadAsync(await file.arrayBuffer());const container=await z.file('META-INF/container.xml')?.async('text');if(!container)throw Error('Invalid EPUB: META-INF/container.xml not found.');const cdom=new DOMParser().parseFromString(container,'application/xml');const rootfile=cdom.querySelector('rootfile');const opfPath=rootfile?.getAttribute('full-path');if(!opfPath)throw Error('EPUB package path not found.');const opf=await z.file(opfPath)?.async('text');if(!opf)throw Error('EPUB package document not found.');const odom=new DOMParser().parseFromString(opf,'application/xml');const opfDir=opfPath.includes('/')?opfPath.slice(0,opfPath.lastIndexOf('/')+1):'';const manifest=new Map([...odom.getElementsByTagName('item')].map(i=>[i.getAttribute('id'),i.getAttribute('href')]));const spine=[...odom.getElementsByTagName('itemref')].map(i=>manifest.get(i.getAttribute('idref'))).filter(Boolean);const pages=[];for(const href of spine){const path=normalizeZipPath(opfDir,(href||'').replace(/^\//,''));const xml=await z.file(path)?.async('text');if(!xml)continue;const dom=new DOMParser().parseFromString(xml,'text/html');pages.push(dom.body?.textContent?.replace(/\s+/g,' ').trim()||'');}if(!pages.length)throw Error('No readable EPUB chapters were found.');return pages};
  const addSimplePageBookmarks=async(src,PDFName,titles=[])=>{const pages=src.getPages();if(!pages.length)return 0;const outlineRef=src.context.nextRef();const itemRefs=pages.map(()=>src.context.nextRef());const outline=src.context.obj({Type:'Outlines',First:itemRefs[0],Last:itemRefs[itemRefs.length-1],Count:pages.length});src.context.assign(outlineRef,outline);for(let i=0;i<pages.length;i++){const dict={Title:(titles[i]||`Page ${i+1}`),Dest:src.context.obj([pages[i].ref,PDFName.of('Fit')]),Parent:outlineRef};if(i>0)dict.Prev=itemRefs[i-1];if(i<pages.length-1)dict.Next=itemRefs[i+1];const item=src.context.obj(dict);src.context.assign(itemRefs[i],item);}src.catalog.set(PDFName.of('Outlines'),outlineRef);return pages.length};

  const getPdfTextLines=tc=>{const items=(tc.items||[]).filter(x=>typeof x.str==='string');const rows=[];for(const item of items){const y=Number(item.transform?.[5]||0),x=Number(item.transform?.[4]||0);let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row)}row.items.push(item)}rows.sort((a,b)=>b.y-a.y);return rows.map(r=>r.items.sort((a,b)=>Number(a.transform?.[4]||0)-Number(b.transform?.[4]||0)).map(x=>x.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean)};
  const loadPdfPageTask=async(file,pdfjs)=>pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const rasterizePdf=async(pdfjs,PDFDocument,file,{scale=1.5,jpegQuality=.78,onPage}={})=>{const task=await loadPdfPageTask(file,pdfjs);const doc=await PDFDocument.create();for(let i=1;i<=task.numPages;i++){onPage?.(i,task.numPages);const page=await task.getPage(i);const vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(vp.width));canvas.height=Math.max(1,Math.ceil(vp.height));await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Canvas export failed.')),'image/jpeg',jpegQuality));const outPage=doc.addPage([vp.width/scale,vp.height/scale]);const img=await doc.embedJpg(await blob.arrayBuffer());outPage.drawImage(img,{x:0,y:0,width:outPage.getWidth(),height:outPage.getHeight()});canvas.width=1;canvas.height=1;await page.cleanup?.()}await task.cleanup?.();return doc};
  const imageFilesToPdf=async(PDFDocument,StandardFonts,files)=>{const doc=await PDFDocument.create();for(const f of files){const b=await f.arrayBuffer();let img;if(f.type==='image/jpeg'||/\.jpe?g$/i.test(f.name))img=await doc.embedJpg(b);else if(f.type==='image/png'||/\.png$/i.test(f.name))img=await doc.embedPng(b);else{const bmp=await createImageBitmap(f);const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));img=await doc.embedPng(await blob.arrayBuffer());bmp.close();}const margin=24;const page=doc.addPage([Math.max(1,img.width+margin*2),Math.max(1,img.height+margin*2)]);page.drawImage(img,{x:margin,y:margin,width:img.width,height:img.height});}return doc;};

  async function loadFormFields(file){
    try{const {PDFDocument}=await loadPdfLib();const doc=await PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:true});const form=doc.getForm();const fields=form.getFields();const mount=document.getElementById('form-fields');if(!fields.length){mount.innerHTML='<p class="muted">No AcroForm fields detected.</p>';return}
      mount.innerHTML=fields.map((f,i)=>{const name=esc(f.getName());const typ=f.constructor?.name||'Field';
        if(typ.includes('CheckBox')) return `<label style="display:block;margin-top:8px"><input type="checkbox" data-fi="${i}" data-kind="${esc(typ)}" ${f.isChecked?.()?'checked':''}><span style="margin-left:6px">${name}</span></label>`;
        if(typ.includes('Dropdown')){const selected=(f.getSelected?.()||[])[0]||'';const opts=(f.getOptions?.()||[]).map(o=>`<option value="${esc(o)}" ${o===selected?'selected':''}>${esc(o)}</option>`).join('');return `<label style="display:block;margin-top:8px"><span>${name}</span><select data-fi="${i}" data-kind="${esc(typ)}"><option value="">— choose —</option>${opts}</select></label>`;}
        if(typ.includes('RadioGroup')){const selected=f.getSelected?.()||'';const opts=(f.getOptions?.()||[]).map(o=>`<option value="${esc(o)}" ${o===selected?'selected':''}>${esc(o)}</option>`).join('');return `<label style="display:block;margin-top:8px"><span>${name}</span><select data-fi="${i}" data-kind="${esc(typ)}"><option value="">— choose —</option>${opts}</select></label>`;}
        const value=f.getText?.()||'';return `<label style="display:block;margin-top:8px"><span>${name}</span><input data-fi="${i}" data-kind="${esc(typ)}" value="${esc(value)}" placeholder="${esc(typ)}"></label>`;}).join('');mount.dataset.count=fields.length;
    }catch(e){document.getElementById('form-fields').innerHTML='<p class="muted">Unable to inspect form fields: '+esc(e.message)+'</p>';}}

  document.getElementById('run').onclick=async()=>{
    try{
      out.textContent='Loading PDF engine…';
      const {PDFDocument,StandardFonts,rgb,grayscale,degrees,PageSizes}=await loadPdfLib();
      if(t.title==='Text to PDF'){
        const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const size=Number(document.getElementById('textSize').value)||12;const txt=document.getElementById('textpdf').value||'';const pageW=595.28,pageH=841.89,margin=45;let page=doc.addPage([pageW,pageH]),y=pageH-margin;for(const para of txt.split(/\r?\n/)){const lines=fitText(font,para||' ',pageW-margin*2,size);for(const line of lines){if(y<size+margin){page=doc.addPage([pageW,pageH]);y=pageH-margin}page.drawText(line,{x:margin,y,size,font,color:rgb(0,0,0)});y-=size+5}y-=5}download(await savePdf(doc),'freetoolforge-text.pdf');out.textContent='Created PDF.';return;
      }
      if(t.title==='HTML to PDF'){
        const html=document.getElementById('htmlpdf').value||'';const host=document.createElement('div');host.innerHTML=html;host.style.cssText='position:fixed;left:-100000px;top:0;width:780px;background:white;color:#000;padding:24px;font:16px/1.5 Arial,sans-serif';document.body.appendChild(host);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const script=await new Promise((resolve,reject)=>{if(window.html2pdf)return resolve(window.html2pdf);const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';sc.onload=()=>resolve(window.html2pdf);sc.onerror=()=>reject(Error('Could not load HTML-to-PDF renderer.'));document.head.appendChild(sc)});await script().set({margin:10,filename:'freetoolforge-html.pdf',image:{type:'jpeg',quality:.95},html2canvas:{scale:1.5,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(host).save();host.remove();out.textContent='Generated PDF from the supplied HTML.';return;
      }
      if(t.title==='HEIC to PDF'){
        const sc=await new Promise((resolve,reject)=>{if(window.heic2any)return resolve(window.heic2any);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';s.onload=()=>resolve(window.heic2any);s.onerror=()=>reject(Error('Could not load HEIC decoder.'));document.head.appendChild(s)});const converted=[];for(const f of files){const blob=await sc({blob:f,toType:'image/png',quality:.92});const arr=Array.isArray(blob)?blob:[blob];for(const b of arr)converted.push(new File([b],f.name+'.png',{type:'image/png'}))}const doc=await imageFilesToPdf(PDFDocument,StandardFonts,converted);download(await savePdf(doc),'freetoolforge-heic.pdf');out.textContent=`Converted ${files.length} HEIC/HEIF file${files.length===1?'':'s'} to PDF.`;return;
      }
      if(['Images to PDF','JPG to PDF','PNG to PDF','WEBP to PDF'].includes(t.title)){
        if(!files.length)throw Error('Choose at least one image.');const doc=await imageFilesToPdf(PDFDocument,StandardFonts,files);download(await savePdf(doc),'freetoolforge-images.pdf');out.textContent=`Converted ${files.length} image${files.length===1?'':'s'} to PDF.`;return;
      }
      if(['Word to PDF','Excel to PDF','PowerPoint to PDF','EPUB to PDF'].includes(t.title)){
        if(files.length!==1)throw Error('Choose exactly one source file.');
        const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
        let pages=[];
        if(t.title==='Word to PDF') pages=[{label:files[0].name,text:await extractDocxText(files[0],JSZip)}];
        if(t.title==='Excel to PDF') pages=[{label:'Sheet 1',text:await extractXlsxText(files[0],JSZip)}];
        if(t.title==='PowerPoint to PDF'){const pp=await extractPptxText(files[0],JSZip);pages=pp.map((x,i)=>({label:`Slide ${i+1}`,text:x}));}
        if(t.title==='EPUB to PDF'){const ep=await extractEpubText(files[0],JSZip);pages=ep.map((x,i)=>({label:`Chapter ${i+1}`,text:x}));}
        const doc=await textPagesToPdf(PDFDocument,StandardFonts,pages,`${t.title} — FreeToolForge`);download(await savePdf(doc),'freetoolforge-converted.pdf');out.textContent=`Created a text-oriented PDF from ${files[0].name}. Complex source formatting is not preserved.`;return;
      }
      if(!files.length)throw Error('Choose at least one PDF.');
      if(t.title==='Merge PDFs'){
        const outDoc=await PDFDocument.create();for(const f of files){const src=await PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});const cp=await outDoc.copyPages(src,src.getPageIndices());cp.forEach(p=>outDoc.addPage(p))}download(await savePdf(outDoc),'freetoolforge-merged.pdf');out.textContent=`Merged ${files.length} PDFs.`;return;
      }
      if(['Pages per Sheet','Two Pages per Sheet'].includes(t.title)){
        if(files.length!==1)throw Error('Choose one PDF.');const src=await loadOne();const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const sheetOpt=document.getElementById('sheet').value;const orient=document.getElementById('orientation').value;const dims={A4:[595,842],Letter:[612,792],A3:[842,1191]};let [sw,sh]=dims[sheetOpt];if(orient==='landscape')[sw,sh]=[sh,sw];const slots=t.title==='Two Pages per Sheet'?2:4;const cols=slots===2?1:2,rows=slots===2?2:2;const doc=await PDFDocument.create();for(let start=0;start<src.getPageCount();start+=slots){const page=doc.addPage([sw,sh]);for(let slot=0;slot<slots && start+slot<task.numPages;slot++){const r=Math.floor(slot/cols),c=slot%cols;const rp=await task.getPage(start+slot+1);const vp=rp.getViewport({scale:1});const sx=sw/cols/vp.width,sy=sh/rows/vp.height,scale=Math.min(sx,sy)*0.95;const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width*scale);canvas.height=Math.ceil(vp.height*scale);await rp.render({canvasContext:canvas.getContext('2d'),viewport:rp.getViewport({scale})}).promise;const png=await new Promise(res=>canvas.toBlob(res,'image/png'));const img=await doc.embedPng(await png.arrayBuffer());const cellW=sw/cols,cellH=sh/rows;const dw=img.width,dh=img.height;page.drawImage(img,{x:c*cellW+(cellW-dw)/2,y:sh-(r+1)*cellH+(cellH-dh)/2,width:dw,height:dh});canvas.width=1;canvas.height=1;await rp.cleanup?.()}}download(await savePdf(doc),'freetoolforge-n-up.pdf');out.textContent=`Created ${Math.ceil(src.getPageCount()/slots)} output sheets.`;return;
      }
      const sourceBytes=await files[0].arrayBuffer();const src=await PDFDocument.load(sourceBytes,{ignoreEncryption:true});const n=src.getPageCount();
      if(t.title==='PDF Page Counter'){out.textContent=`Pages: ${n}\nFile: ${files[0].name}\nSize: ${Math.round(files[0].size/1024)} KB`;return;}
      if(t.title==='Compress PDF'){
        const mode=document.getElementById('compressionMode').value;
        if(mode==='raster'){
          const pdfjs=await loadPdfJs();
          const quality=Math.max(.35,Math.min(.95,Number(document.getElementById('jpegQuality').value)||.72));
          const dpi=Math.max(72,Math.min(180,Number(document.getElementById('compressDpi').value)||110));
          const rebuilt=await rasterizePdf(pdfjs,PDFDocument,files[0],{scale:dpi/72,jpegQuality:quality,onPage:(i,total)=>out.textContent=`Recompressing page ${i} of ${total}…`});
          const b=await rebuilt.save({useObjectStreams:true,addDefaultPage:false});download(b,'freetoolforge-compressed.pdf');const ratio=((1-b.byteLength/files[0].size)*100).toFixed(1);out.textContent=`Raster compression complete.\nBefore: ${Math.round(files[0].size/1024)} KB\nAfter: ${Math.round(b.byteLength/1024)} KB\nSize change: ${ratio}% ${ratio>=0?'smaller':'larger'}\nNote: pages were rendered to JPEG images; selectable text/vector content is not retained.`;return;
        }
        if(document.getElementById('stripMeta').checked){src.setTitle('');src.setAuthor('');src.setSubject('');src.setKeywords([]);src.setCreator('');src.setProducer('')}
        const b=await src.save({useObjectStreams:true,addDefaultPage:false});download(b,'freetoolforge-compressed.pdf');const ratio=((1-b.byteLength/files[0].size)*100).toFixed(1);out.textContent=`Structural optimization complete.\nBefore: ${Math.round(files[0].size/1024)} KB\nAfter: ${Math.round(b.byteLength/1024)} KB\nSize change: ${ratio}% ${ratio>=0?'smaller':'larger'}\nEmbedded images are not recompressed in structural mode; the output may be larger for some PDFs.`;return;
      }
      if(t.title==='Repair PDF'){
        const b=await src.save({useObjectStreams:true,addDefaultPage:false});download(b,'freetoolforge-repaired.pdf');out.textContent=`PDF parsed and successfully reserialized. Pages: ${n}. This repairs parseable structural issues; a severely damaged PDF may still be unreadable.`;return;
      }
      if(t.title==='PDF Metadata Viewer'){
        const first=src.getPage(0),sz=first.getSize();const rows=[['File',files[0].name],['Size',`${Math.round(files[0].size/1024)} KB`],['Title',src.getTitle()],['Author',src.getAuthor()],['Subject',src.getSubject()],['Keywords',(src.getKeywords()||[]).join(', ')],['Creator',src.getCreator()],['Producer',src.getProducer()],['Creation date',src.getCreationDate()?.toISOString()||''],['Modification date',src.getModificationDate()?.toISOString()||''],['Pages',n],['First page size',`${sz.width.toFixed(2)} × ${sz.height.toFixed(2)} pt`],['Encrypted',String(src.isEncrypted)]];out.textContent=rows.map(([k,v])=>`${k}: ${v??''}`).join('\n');return;
      }
      if(t.title==='PDF/A Helper'){
        const pdfjs=await loadPdfJs();const raw=new Uint8Array(await files[0].arrayBuffer());const task=await pdfjs.getDocument({data:raw}).promise;const meta=await task.getMetadata();const permissions=await task.getPermissions();const attachments=await task.getAttachments();const js=await task.getJSActions();const lines=[
          `PDF/A readiness report`,
          `Pages: ${task.numPages}`,
          `Encrypted: ${src.isEncrypted}`,
          `Title: ${meta.info?.Title||src.getTitle()||'—'}`,
          `Producer: ${meta.info?.Producer||src.getProducer()||'—'}`,
          `Attachments: ${attachments?attachments.size:0}`,
          `JavaScript actions: ${js?js.size:0}`,
          `Permissions object present: ${permissions?'yes':'no'}`,
          `XMP metadata present: ${meta.metadata?'yes':'no'}`,
          '',
          `Not a PDF/A certification: full conformance requires a standards-aware validator for fonts, color spaces, transparency, metadata, embedded files and other PDF/A requirements.`
        ];out.textContent=lines.join('\n');await task.cleanup();return;
      }
      if(t.title==='PDF Bookmark Helper'){
        const {PDFName}=await loadPdfLib();const titles=(document.getElementById('bookmarkTitles').value||'').split(/\r?\n/).map(x=>x.trim());const pages=src.getPages();if(document.getElementById('replaceBookmarks').checked!==false){const count=await addSimplePageBookmarks(src,PDFName,titles);download(await savePdf(src),'freetoolforge-bookmarked.pdf');out.textContent=`Created ${count} top-level bookmarks, one per page. Existing outline entries are replaced.`;return;}else{out.textContent='Add/merge mode is intentionally disabled in this browser build because preserving arbitrary existing outline trees requires a lower-level merge implementation.';return;}
      }
      if(t.title==='Remove PDF Metadata'){
        if(document.getElementById('blankMeta').checked){src.setTitle('');src.setAuthor('');src.setSubject('');src.setKeywords([]);src.setCreator('');src.setProducer('')}
        download(await savePdf(src),'freetoolforge-metadata-removed.pdf');out.textContent=document.getElementById('blankMeta').checked?'Standard document metadata cleared.':'No metadata changes were requested; an unchanged/reserialized PDF was saved.';return;
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
        if(files.length!==2)throw Error('Choose exactly two PDFs: base first, overlay second.');const base=src, overlayBytes=await files[1].arrayBuffer(), overlay=await PDFDocument.load(overlayBytes,{ignoreEncryption:true});const mode=document.getElementById('overlayMode').value;const pages=base.getPages();const embeddedPages=await base.embedPdf(overlayBytes,Array.from({length:overlay.getPageCount()},(_,i)=>i));for(let i=0;i<pages.length;i++){const oi=mode==='match'?Math.min(i,embeddedPages.length-1):0;const embedded=embeddedPages[oi];const p=pages[i];const {width,height}=p.getSize();p.drawPage(embedded,{x:0,y:0,width,height,opacity:1}); }download(await savePdf(base),'freetoolforge-overlay.pdf');out.textContent='Overlay applied.';return;
      }
      if(t.title==='Crop PDF'){
        const nums=(document.getElementById('crop').value||'0,0,0,0').split(',').map(Number);if(nums.length!==4||nums.some(x=>!Number.isFinite(x)||x<0))throw Error('Enter four non-negative margins: left,top,right,bottom.');src.getPages().forEach(p=>{const {width,height}=p.getSize();const [l,top,r,b]=nums;if(l+r>=width||top+b>=height)throw Error('Crop margins are too large for at least one page.');p.setCropBox(l,b,width-l-r,height-top-b)});download(await savePdf(src),'freetoolforge-cropped.pdf');out.textContent='Crop box updated on all pages.';return;
      }
      if(t.title==='Resize PDF Pages'){
        const presets={A4:[595.28,841.89],Letter:[612,792],A5:[419.53,595.28]};const choice=document.getElementById('size').value;const mode=document.getElementById('resizeMode').value;const target=choice==='fit'?null:presets[choice];if(!target){out.textContent='No-op fit mode: the existing page size is preserved.';return}const resized=await PDFDocument.create();for(let i=0;i<n;i++){const p=src.getPage(i);const {width,height}=p.getSize();const [ep]=await resized.embedPdf(sourceBytes,[i]);const np=resized.addPage(target);const sx=target[0]/width,sy=target[1]/height;const sx2=mode==='stretch'?sx:Math.min(sx,sy),sy2=mode==='stretch'?sy:sx2;np.drawPage(ep,{x:(target[0]-width*sx2)/2,y:(target[1]-height*sy2)/2,width:width*sx2,height:height*sy2})}download(await savePdf(resized),'freetoolforge-resized.pdf');out.textContent=`Resized ${n} pages to ${choice}.`;return;
      }
      if(t.title==='Extract PDF Images'){
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();let extracted=0;const seen=new Set();
        const imageToBlob=async image=>{
          if(image?.bitmap){const c=document.createElement('canvas');c.width=image.bitmap.width||image.width;c.height=image.bitmap.height||image.height;c.getContext('2d').drawImage(image.bitmap,0,0);return await new Promise(r=>c.toBlob(r,'image/png'));}
          if(image?.src){const im=new Image();im.decoding='async';im.src=image.src;await im.decode();const c=document.createElement('canvas');c.width=image.width||im.naturalWidth;c.height=image.height||im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return await new Promise(r=>c.toBlob(r,'image/png'));}
          const w=Number(image?.width),h=Number(image?.height),data=image?.data;if(!w||!h||!data)return null;const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(data.length===w*h*4)ctx.putImageData(new ImageData(new Uint8ClampedArray(data),w,h),0,0);else if(data.length===w*h*3){const rgba=new Uint8ClampedArray(w*h*4);for(let i=0,j=0;i<data.length;i+=3,j+=4){rgba[j]=data[i];rgba[j+1]=data[i+1];rgba[j+2]=data[i+2];rgba[j+3]=255}ctx.putImageData(new ImageData(rgba,w,h),0,0);}else return null;return await new Promise(r=>c.toBlob(r,'image/png'));
        };
        for(let i=1;i<=task.numPages;i++){
          out.textContent=`Extracting images from page ${i} of ${task.numPages}…`;const page=await task.getPage(i);const renderVp=page.getViewport({scale:1});const renderCanvas=document.createElement('canvas');renderCanvas.width=Math.max(1,Math.ceil(renderVp.width));renderCanvas.height=Math.max(1,Math.ceil(renderVp.height));await page.render({canvasContext:renderCanvas.getContext('2d'),viewport:renderVp}).promise;const ops=await page.getOperatorList();
          for(let k=0;k<ops.fnArray.length;k++){
            const fn=ops.fnArray[k],isImg=fn===pdfjs.OPS.paintImageXObject||fn===pdfjs.OPS.paintJpegXObject||fn===pdfjs.OPS.paintImageXObjectRepeat;if(!isImg)continue;const name=ops.argsArray[k]?.[0],key=`${i}:${String(name)}`;if(!name||seen.has(key))continue;seen.add(key);let image=null;try{if(page.objs.has(name))image=page.objs.get(name);else if(page.commonObjs.has(name))image=page.commonObjs.get(name);}catch{}const blob=await imageToBlob(image);if(!blob)continue;const ext='png';const safe=String(name).replace(/[^a-zA-Z0-9_-]/g,'_');zip.file(`page-${String(i).padStart(3,'0')}-image-${String(++extracted).padStart(3,'0')}-${safe}.${ext}`,await blob.arrayBuffer());}
          await page.cleanup?.();renderCanvas.width=1;renderCanvas.height=1;
        }
        await task.cleanup?.();if(!extracted)throw Error('No extractable embedded images were found.');zip.file('MANIFEST.json',JSON.stringify({source:files[0].name,pages:task.numPages,images:extracted,note:'Images are recovered from PDF.js decoded image objects; unsupported image encodings may be skipped.'},null,2));download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),`${files[0].name.replace(/\.pdf$/i,'')}-images.zip`,'application/zip');out.textContent=`Extracted ${extracted} image object${extracted===1?'':'s'} into a ZIP.`;return;
      }
      if(t.title==='PDF to Images'){
        const pdfjs=await loadPdfJs(),task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();const format=document.getElementById('imageFormat')?.value||'png';const scale=Math.max(.5,Math.min(3,Number(document.getElementById('imageScale')?.value)||1.5));for(let i=1;i<=task.numPages;i++){out.textContent=`Rendering page ${i} of ${task.numPages}…`;const page=await task.getPage(i);const vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const mime=format==='jpeg'?'image/jpeg':'image/png';const blob=await new Promise(r=>canvas.toBlob(r,mime,format==='jpeg'?.9:undefined));zip.file(`page-${String(i).padStart(String(task.numPages).length,'0')}.${format==='jpeg'?'jpg':'png'}`,await blob.arrayBuffer());canvas.width=1;canvas.height=1;await page.cleanup?.()}await task.cleanup?.();download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),`${files[0].name.replace(/\.pdf$/i,'')}-images.zip`,'application/zip');out.textContent=`Rendered ${task.numPages} page${task.numPages===1?'':'s'} to ${format.toUpperCase()} images.`;return;
      }
      if(['PDF to Word','PDF to Excel','PDF to PowerPoint','PDF to EPUB','PDF to RTF'].includes(t.title)){
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const pages=[];for(let i=1;i<=task.numPages;i++){const page=await task.getPage(i);const tc=await page.getTextContent();pages.push(getPdfTextLines(tc).join('\n'));await page.cleanup?.()}await task.cleanup?.();
        const xmlEscape=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
        const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
        if(t.title==='PDF to RTF'){const rtf='{\\rtf1\\ansi\\deff0 '+pages.map((x,i)=>`\\b Page ${i+1}\\b0\\par ${x.replace(/[\\{}]/g,'\\$&').replace(/\n/g,'\\par ')}`).join('\\par ')+ '}';download(new TextEncoder().encode(rtf),'freetoolforge.rtf','application/rtf');out.textContent='Created an editable text-only RTF document.';return}
        if(t.title==='PDF to Word'){const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pages.map((x,i)=>`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Page ${i+1}</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">${xmlEscape(x)}</w:t></w:r></w:p>`).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'freetoolforge.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');out.textContent=`Created text-only DOCX from ${pages.length} PDF pages.`;return}
        if(t.title==='PDF to Excel'){const rows=pages.flatMap((x,i)=>[[`Page ${i+1}`],...(x?[[x]]:[])]);const sheetRows=rows.map((row,r)=>`<row r="${r+1}"><c r="A${r+1}" t="inlineStr"><is><t>${xmlEscape(row[0]||'')}</t></is></c></row>`).join('');const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');zip.file('xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PDF Text" sheetId="1" r:id="rId1"/></sheets></workbook>');zip.file('xl/worksheets/sheet1.xml',`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'freetoolforge.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');out.textContent='Created a text-oriented XLSX workbook from extracted PDF page text.';return}
        if(t.title==='PDF to EPUB'){const zip=new JSZip();zip.file('mimetype','application/epub+zip',{compression:'STORE'});zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');pages.forEach((x,i)=>zip.file(`OEBPS/page-${i+1}.xhtml`,`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${i+1}</title></head><body><h1>Page ${i+1}</h1><p>${xmlEscape(x)}</p></body></html>`));const manifest=pages.map((_,i)=>`<item id="p${i+1}" href="page-${i+1}.xhtml" media-type="application/xhtml+xml"/>`).join('');const spine=pages.map((_,i)=>`<itemref idref="p${i+1}"/>`).join('');zip.file('OEBPS/content.opf',`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">freetoolforge-${Date.now()}</dc:identifier><dc:title>${xmlEscape(files[0].name.replace(/\.pdf$/i,''))}</dc:title><dc:language>en</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'freetoolforge.epub','application/epub+zip');out.textContent=`Created EPUB with ${pages.length} page chapters.`;return}
        if(t.title==='PDF to PowerPoint'){const pptx=(await import('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm')).default;const deck=new pptx();deck.layout='LAYOUT_WIDE';for(let i=1;i<=task.numPages;i++){const page=await task.getPage(i);const vp=page.getViewport({scale:1.25});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const data=canvas.toDataURL('image/png');const slide=deck.addSlide();slide.addImage({data,x:0,y:0,w:13.333,h:7.5});slide.addNotes?.(`Source PDF page ${i}`);canvas.width=1;canvas.height=1;await page.cleanup?.()}const blob=await deck.write({outputType:'blob'});downloadBlob(blob,'freetoolforge.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation');out.textContent=`Created ${task.numPages}-slide PowerPoint using page images.`;return}
      }
      if(['PDF to Text','PDF to Markdown','PDF to HTML','Compare PDFs'].includes(t.title)){
        const pdfjs=await loadPdfJs();const extract=async f=>{const task=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];for(let i=1;i<=task.numPages;i++){const page=await task.getPage(i);const tc=await page.getTextContent();const text=getPdfTextLines(tc).join('\n');pages.push(text);await page.cleanup?.()}await task.cleanup?.();return pages};
        if(t.title==='Compare PDFs'){if(files.length!==2)throw Error('Choose exactly two PDFs.');const [a,b]=await Promise.all(files.map(extract));const lines=[];const max=Math.max(a.length,b.length);for(let i=0;i<max;i++){if((a[i]||'')!==(b[i]||'')){lines.push(`Page ${i+1}: DIFFERENT`);lines.push(`A: ${a[i]||'[missing]'}`);lines.push(`B: ${b[i]||'[missing]'}`)}}out.textContent=`PDF A pages: ${a.length}\nPDF B pages: ${b.length}\nDifferent pages: ${lines.filter(x=>x.endsWith('DIFFERENT')).length}\n\n${lines.slice(0,80).join('\n')||'No extracted-text differences found.'}`;return;}
        const pages=await extract(files[0]);if(t.title==='PDF to Text')download(new TextEncoder().encode(pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`--- Page ${i+1} ---\n`:''}${x}`).join('\n\n')),'freetoolforge-text.txt','text/plain');else if(t.title==='PDF to Markdown')download(new TextEncoder().encode(pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`## Page ${i+1}\n\n`:''}${x}`).join('\n\n')),'freetoolforge.md','text/markdown');else{const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.5;margin:32px}h2{margin-top:32px}div.page{white-space:pre-wrap;margin-bottom:24px}</style></head><body>${pages.map((x,i)=>`${document.getElementById('onePerPage').checked?`<h2>Page ${i+1}</h2>`:''}<div class="page">${esc(x)}</div>`).join('')}</body></html>`;download(new TextEncoder().encode(html),'freetoolforge.html','text/html')}out.textContent=`Extracted ${pages.length} pages.`;return;
      }
      if(t.title==='Fill PDF'){
        const form=src.getForm();const fields=form.getFields();if(!fields.length)throw Error('No AcroForm fields were found.');const controls=[...document.querySelectorAll('#form-fields [data-fi]')];controls.forEach(c=>{const f=fields[Number(c.dataset.fi)];const kind=f.constructor?.name||'';const val=c.value;if(kind.includes('TextField'))f.setText(val||'');else if(kind.includes('CheckBox')){if(c.checked)f.check();else f.uncheck?.()}else if(kind.includes('Dropdown')){if(val)f.select(val)}else if(kind.includes('RadioGroup')){if(val)f.select(val)}});src.getForm().updateFieldAppearances?.();download(await savePdf(src),'freetoolforge-filled.pdf');out.textContent=`Updated ${fields.length} form fields.`;return;
      }
      if(t.title==='Annotate PDF'){
        const font=await src.embedFont(StandardFonts.Helvetica);const p=src.getPage(Math.max(0,Math.min(n-1,(Number(document.getElementById('notePage').value)||1)-1)));const x=Number(document.getElementById('noteX').value)||50,y=Number(document.getElementById('noteY').value)||50;p.drawRectangle({x:x-6,y:y-4,width:190,height:28,color:rgb(1,.95,.6),borderColor:rgb(.6,.55,.2),borderWidth:1});p.drawText(document.getElementById('noteText').value||'Reviewed',{x,y,size:11,font,color:rgb(0,0,0)});download(await savePdf(src),'freetoolforge-annotated.pdf');out.textContent='Added a visible text annotation box.';return;
      }
      if(t.title==='Sign PDF'){
        const i=Math.max(0,Math.min(n-1,(Number(document.getElementById('sigPage').value)||1)-1));const p=src.getPage(i);const x=Number(document.getElementById('sigX').value)||50,y=Number(document.getElementById('sigY').value)||70,size=Math.max(8,Number(document.getElementById('sigSize').value)||20);
        if(files[1] && /^image\/(png|jpe?g|webp)$/i.test(files[1].type||'')){
          const ab=await files[1].arrayBuffer();let img;if(/png/i.test(files[1].type)||/\.png$/i.test(files[1].name))img=await src.embedPng(ab);else if(/jpe?g/i.test(files[1].type)||/\.jpe?g$/i.test(files[1].name))img=await src.embedJpg(ab);else{const bmp=await createImageBitmap(files[1]);const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));img=await src.embedPng(await blob.arrayBuffer());bmp.close();}const w=Math.min(220,img.width),h=w*(img.height/img.width);p.drawImage(img,{x,y,width:w,height:h});
        }else{const font=await src.embedFont(StandardFonts.HelveticaOblique);const sig=document.getElementById('sigText').value||'Your Name';p.drawText(sig,{x,y,size,font,color:rgb(0,0,0)});p.drawLine({start:{x,y:y-4},end:{x:x+Math.max(100,font.widthOfTextAtSize(sig,size)+10),y:y-4},thickness:1,color:rgb(0,0,0)});}
        download(await savePdf(src),'freetoolforge-signed.pdf');out.textContent='Added a visible signature stamp. This is not a cryptographic digital signature.';return;
      }
      if(t.title==='PDF Form Field Viewer'){
        const form=src.getForm();const fields=form.getFields();if(!fields.length){out.textContent='No AcroForm fields found.';return}out.textContent=fields.map((f,i)=>{const typ=f.constructor?.name||'Field';let value='';if(typ.includes('TextField'))value=f.getText?.()||'';else if(typ.includes('CheckBox'))value=f.isChecked?.()?'checked':'unchecked';else if(typ.includes('Dropdown'))value=(f.getSelected?.()||[]).join(', ');else if(typ.includes('RadioGroup'))value=f.getSelected?.()||'';const opts=f.getOptions?.();return `${i+1}. ${f.getName()} — ${typ}${opts?.length?`\n   Options: ${opts.join(', ')}`:''}${value!==''?`\n   Current: ${value}`:''}`}).join('\n');return;
      }
      if(t.title==='Booklet PDF Maker'){
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const dims={A4:[842,595],Letter:[792,612]};const [sw,sh]=dims[document.getElementById('bookletSize').value];const total=Math.ceil(task.numPages/4)*4;const order=[];for(let base=0;base<total/4;base++){const a=base*2,b=total-1-base*2;order.push(b,a,a+1,b-1)}const doc=await PDFDocument.create();
        const drawPlaced=async(sp,pageNum,col)=>{if(pageNum>=task.numPages)return;const rp=await task.getPage(pageNum+1);const vp=rp.getViewport({scale:1.25});const cellW=sw/2;const sc=Math.min((cellW-20)/vp.width,(sh-20)/vp.height);const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width*sc);canvas.height=Math.ceil(vp.height*sc);await rp.render({canvasContext:canvas.getContext('2d'),viewport:rp.getViewport({scale:sc})}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const img=await doc.embedPng(await blob.arrayBuffer());sp.drawImage(img,{x:col*cellW+(cellW-img.width)/2,y:(sh-img.height)/2,width:img.width,height:img.height});canvas.width=1;canvas.height=1;await rp.cleanup?.()};
        for(let sidx=0;sidx<order.length;sidx+=4){const front=doc.addPage([sw,sh]);await drawPlaced(front,order[sidx],0);await drawPlaced(front,order[sidx+1],1);const back=doc.addPage([sw,sh]);await drawPlaced(back,order[sidx+2],0);await drawPlaced(back,order[sidx+3],1)}
        download(await savePdf(doc),'freetoolforge-booklet.pdf');out.textContent=`Created ${doc.getPageCount()} booklet side(s). Output is rasterized for reliable 2-up imposition.`;return;
      }
      if(t.title==='Markdown to PDF'){
        const md=document.getElementById('textpdf')?.value||'';if(!md.trim())throw Error('Enter Markdown text first.');const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);const size=12,margin=45;let p=doc.addPage([595,842]),y=797;const nextPage=()=>{p=doc.addPage([595,842]);y=797};for(const raw of md.split(/\r?\n/)){const line=raw.trim();if(/^#{1,3}\s+/.test(line)){const level=line.match(/^#+/)[0].length;const text=line.replace(/^#+\s+/,'');const fs=level===1?20:level===2?16:14;if(y<margin+fs)nextPage();p.drawText(text,{x:margin,y,size:fs,font:bold,color:rgb(0,0,0)});y-=fs+8;continue}const clean=line.replace(/^[-*]\s+/,'- ').replace(/`([^`]+)`/g,'$1');for(const l of fitText(font,clean||' ',595-margin*2,size)){if(y<size+margin)nextPage();p.drawText(l,{x:margin,y,size,font,color:rgb(0,0,0)});y-=size+5}y-=4}download(await savePdf(doc),'freetoolforge-markdown.pdf');out.textContent='Created a basic Markdown-to-PDF document with headings and bullet lists.';return;
      }
      if(t.title==='PDF Batch Rename'){
        if(files.length<1)throw Error('Choose one or more PDFs.');const JSZip=(await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;const zip=new JSZip();const pattern=document.getElementById('renamePattern').value||'document-{n}';const used=new Set();files.forEach((f,i)=>{const rawStem=pattern.replaceAll('{n}',String(i+1)).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||`document-${i+1}`;const stem=rawStem;let base=stem.toLowerCase().endsWith('.pdf')?stem:stem+'.pdf';let k=2;while(used.has(base.toLowerCase())){base=stem.replace(/\.pdf$/i,'')+'-'+k+'.pdf';k++;}used.add(base.toLowerCase());zip.file(base,f);});download(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),'freetoolforge-renamed-pdfs.zip','application/zip');out.textContent=`Prepared ${files.length} renamed PDFs in a ZIP.`;return;
      }
      if(t.title==='Invoice PDF Maker'){
        const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);const p=doc.addPage([595,842]);let y=790;const title=document.getElementById('invTitle').value||'Invoice';p.drawText(title,{x:45,y,size:22,font:bold});y-=35;p.drawText(`Bill to: ${document.getElementById('invTo').value||'Customer'}`,{x:45,y,size:11,font});y-=28;let total=0;p.drawText('Description', {x:45,y,size:10,font:bold});p.drawText('Qty',{x:355,y,size:10,font:bold});p.drawText('Rate',{x:405,y,size:10,font:bold});p.drawText('Amount',{x:480,y,size:10,font:bold});y-=18;for(const row of (document.getElementById('invItems').value||'').split(/\r?\n/)){if(!row.trim())continue;const [desc,qtyS,rateS]=row.split('|').map(x=>x.trim());const qty=Number(qtyS)||0,rate=Number(rateS)||0,amount=qty*rate;total+=amount;p.drawText(desc||'Item',{x:45,y,size:10,font,maxWidth:285});p.drawText(String(qty),{x:355,y,size:10,font});p.drawText(rate.toFixed(2),{x:405,y,size:10,font});p.drawText(amount.toFixed(2),{x:480,y,size:10,font});y-=19;if(y<80){p.drawText('Additional items omitted: use a longer invoice template for large invoices.',{x:45,y,size:9,font});break}}p.drawLine({start:{x:400,y:y-5},end:{x:550,y:y-5},thickness:1,color:rgb(0,0,0)});y-=24;p.drawText(`Total: ${total.toFixed(2)}`,{x:410,y,size:13,font:bold});download(await savePdf(doc),'freetoolforge-invoice.pdf');out.textContent=`Created invoice. Total: ${total.toFixed(2)}`;return;
      }
      if(t.title==='OCR PDF'){
        const OCR_SERVICE='https://freetoolforge-ocr-ziyadshafeeks-projects.vercel.app/api/ocr';
        const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const outDoc=await PDFDocument.create();const font=await outDoc.embedFont(StandardFonts.Helvetica);
        for(let i=1;i<=task.numPages;i++){
          out.textContent=`OCR page ${i} of ${task.numPages}…`;
          const page=await task.getPage(i);const vp=page.getViewport({scale:1.6});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
          const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const fd=new FormData();fd.append('file',blob,`page-${i}.png`);fd.append('language','eng');
          const rr=await fetch(OCR_SERVICE,{method:'POST',body:fd});if(!rr.ok)throw Error(`OCR service returned HTTP ${rr.status}`);const j=await rr.json();const text=String(j.text||'').trim();const img=await outDoc.embedPng(await blob.arrayBuffer());const np=outDoc.addPage([vp.width/1.6,vp.height/1.6]);np.drawImage(img,{x:0,y:0,width:np.getWidth(),height:np.getHeight()});
          // Add a tiny white text layer so the result is searchable/selectable without obscuring the rendered page.
          const lines=fitText(font,text.replace(/\s+/g,' '),np.getWidth()-8,1);let ty=3;for(const line of lines.slice(0,800)){np.drawText(line,{x:3,y:ty,size:1,font,color:grayscale(1),opacity:0.001});ty+=1.15;if(ty>np.getHeight()-1)break}
          canvas.width=1;canvas.height=1;await page.cleanup?.();
        }
        download(await savePdf(outDoc),'freetoolforge-ocr.pdf');out.textContent=`OCR complete for ${task.numPages} pages. A searchable text layer was added; text positioning is approximate because the OCR route returns text without word bounding boxes.`;return;
      }
      if(t.title==='Redact PDF'){
        const specs=(document.getElementById('redactions').value||'').split(';').map(x=>x.trim()).filter(Boolean).map(token=>{const [pg,rest]=token.split(':');const a=(rest||'').split(',').map(Number);if(!Number.isInteger(Number(pg))||Number(pg)<1||a.length!==4||a.some(v=>!Number.isFinite(v)||v<0||v>100))throw Error('Invalid redaction; use page:x,y,width,height with percentages 0–100.');return{page:Number(pg)-1,x:a[0],y:a[1],w:a[2],h:a[3]}});if(!specs.length)throw Error('Add at least one redaction rectangle.');const pdfjs=await loadPdfJs();const task=await pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;const newDoc=await PDFDocument.create();for(let i=0;i<task.numPages;i++){const page=await task.getPage(i+1);const vp=page.getViewport({scale:1.5});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';for(const s of specs.filter(s=>s.page===i)){ctx.fillRect(canvas.width*s.x/100,canvas.height*(100-s.y-s.h)/100,canvas.width*s.w/100,canvas.height*s.h/100)}const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));const img=await newDoc.embedJpg(await blob.arrayBuffer());const np=newDoc.addPage([vp.width/1.5,vp.height/1.5]);np.drawImage(img,{x:0,y:0,width:np.getWidth(),height:np.getHeight()});canvas.width=1;canvas.height=1;await page.cleanup?.()}download(await savePdf(newDoc),'freetoolforge-redacted.pdf');out.textContent='Created an image-only redacted PDF. Original searchable/selectable text is not retained; verify the blackouts visually before sharing.';return;
      }
      out.textContent='This engine is not implemented yet.';
    }catch(e){out.textContent=`Error: ${e.message||e}`;}
  };
}
function wrapText(text,maxChars){const out=[];for(const para of text.split(/\r?\n/)){let line='';for(const w of para.split(/\s+/)){if(!w)continue;if((line+' '+w).trim().length>maxChars){out.push(line);line=w}else line=(line+' '+w).trim()}out.push(line)}return out}

setup();
loadRegistry().catch(err=>{document.getElementById('tool-grid').innerHTML=`<div class="panel"><b>Tool registry failed to load.</b><p>${esc(err.message)}</p></div>`});
