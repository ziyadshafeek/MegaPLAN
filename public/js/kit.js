/** Shared UI + helpers for MegaPLAN tool engines. Customer copy never names models. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}

export function downloadText(text, name, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), name);
}

export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

export function byok() {
  return {
    url: localStorage.getItem('mp-byok-url') || '',
    model: localStorage.getItem('mp-byok-model') || '',
    key: localStorage.getItem('mp-byok-key') || ''
  };
}

export function saveByok({ url, model, key }) {
  if (url != null) localStorage.setItem('mp-byok-url', url.trim());
  if (model != null) localStorage.setItem('mp-byok-model', model.trim());
  if (key != null) localStorage.setItem('mp-byok-key', key.trim());
}

export async function askAssistant(task, text, extra = '') {
  const b = byok();
  if (b.url && b.model && b.key) {
    const r = await fetch(b.url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.key },
      body: JSON.stringify({
        model: b.model,
        messages: [
          { role: 'system', content: 'You are the MegaPLAN writing assistant. Never name the underlying model. Do not invent facts.' },
          { role: 'user', content: `${task}\n${extra ? extra + '\n' : ''}${text}` }
        ],
        temperature: 0.3,
        max_tokens: 2500
      })
    });
    const j = await r.json();
    if (!r.ok) throw Error('Self Agent request failed.');
    return String(j.choices?.[0]?.message?.content || '').trim();
  }
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, text, extra })
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || 'Writing assistant is unavailable.');
  return String(j.text || '').trim();
}

export async function inspect(action, payload) {
  const r = await fetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || 'Lookup failed.');
  return j;
}

let _pdfLib, _pdfjs, _jszip;
export async function loadPdfLib() {
  if (!_pdfLib) _pdfLib = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  return _pdfLib;
}
export async function loadPdfJs() {
  if (!_pdfjs) {
    _pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    _pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  }
  return _pdfjs;
}
export async function loadJSZip() {
  if (!_jszip) _jszip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  return _jszip;
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
}

export function randomString(n, alphabet) {
  const arr = new Uint32Array(n);
  crypto.getRandomValues(arr);
  let o = '';
  for (const x of arr) o += alphabet[x % alphabet.length];
  return o;
}

export function hexBytes(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha(text, alg = 'SHA-256') {
  const buf = await crypto.subtle.digest(alg, new TextEncoder().encode(text));
  return hexBytes(buf);
}

export function utf8ToBase64(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function base64ToUtf8(s) {
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  return lines.filter((l, i) => l.length || i === 0).map(line => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = !q;
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  });
}

export function toCsv(rows) {
  return rows.map(r => r.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

export function md5(str) {
  function cmn(q, a, b, x, s, t) { a = a + q + x + t; return ((a << s) | (a >>> (32 - s))) + b | 0; }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
  function rhex(n) {
    let s = '';
    for (let j = 0; j <= 3; j++) s += ('0' + ((n >>> (j * 8)) & 255).toString(16)).slice(-2);
    return s;
  }
  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
  const x = [];
  let k, a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  const s = unescape(encodeURIComponent(str));
  const len = s.length;
  for (k = 0; k < len; k++) x[k >> 2] |= (s.charCodeAt(k) & 255) << ((k % 4) * 8);
  x[len >> 2] |= 0x80 << ((len % 4) * 8);
  x[(((len + 8) >> 6) << 4) + 14] = len * 8;
  for (k = 0; k < x.length; k += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[k], 7, -680876936); d = ff(d, a, b, c, x[k + 1], 12, -389564586); c = ff(c, d, a, b, x[k + 2], 17, 606105819); b = ff(b, c, d, a, x[k + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[k + 4], 7, -176418897); d = ff(d, a, b, c, x[k + 5], 12, 1200080426); c = ff(c, d, a, b, x[k + 6], 17, -1473231341); b = ff(b, c, d, a, x[k + 7], 22, -45705983);
    a = ff(a, b, c, d, x[k + 8], 7, 1770035416); d = ff(d, a, b, c, x[k + 9], 12, -1958414417); c = ff(c, d, a, b, x[k + 10], 17, -42063); b = ff(b, c, d, a, x[k + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[k + 12], 7, 1804603682); d = ff(d, a, b, c, x[k + 13], 12, -40341101); c = ff(c, d, a, b, x[k + 14], 17, -1502002290); b = ff(b, c, d, a, x[k + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[k + 1], 5, -165796510); d = gg(d, a, b, c, x[k + 6], 9, -1069501632); c = gg(c, d, a, b, x[k + 11], 14, 643717713); b = gg(b, c, d, a, x[k], 20, -373897302);
    a = gg(a, b, c, d, x[k + 5], 5, -701558691); d = gg(d, a, b, c, x[k + 10], 9, 38016083); c = gg(c, d, a, b, x[k + 15], 14, -660478335); b = gg(b, c, d, a, x[k + 4], 20, -405537848);
    a = gg(a, b, c, d, x[k + 9], 5, 568446438); d = gg(d, a, b, c, x[k + 14], 9, -1019803690); c = gg(c, d, a, b, x[k + 3], 14, -187363961); b = gg(b, c, d, a, x[k + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[k + 13], 5, -1444681467); d = gg(d, a, b, c, x[k + 2], 9, -51403784); c = gg(c, d, a, b, x[k + 7], 14, 1735328473); b = gg(b, c, d, a, x[k + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[k + 5], 4, -378558); d = hh(d, a, b, c, x[k + 8], 11, -2022574463); c = hh(c, d, a, b, x[k + 11], 16, 1839030562); b = hh(b, c, d, a, x[k + 14], 23, -35309556);
    a = hh(a, b, c, d, x[k + 1], 4, -1530992060); d = hh(d, a, b, c, x[k + 4], 11, 1272893353); c = hh(c, d, a, b, x[k + 7], 16, -155497632); b = hh(b, c, d, a, x[k + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[k + 13], 4, 681279174); d = hh(d, a, b, c, x[k], 11, -358537222); c = hh(c, d, a, b, x[k + 3], 16, -722521979); b = hh(b, c, d, a, x[k + 6], 23, 76029189);
    a = hh(a, b, c, d, x[k + 9], 4, -640364487); d = hh(d, a, b, c, x[k + 12], 11, -421815835); c = hh(c, d, a, b, x[k + 15], 16, 530742520); b = hh(b, c, d, a, x[k + 2], 23, -995338651);
    a = ii(a, b, c, d, x[k], 6, -198630844); d = ii(d, a, b, c, x[k + 7], 10, 1126891415); c = ii(c, d, a, b, x[k + 14], 15, -1416354905); b = ii(b, c, d, a, x[k + 5], 21, -57434055);
    a = ii(a, b, c, d, x[k + 12], 6, 1700485571); d = ii(d, a, b, c, x[k + 3], 10, -1894986606); c = ii(c, d, a, b, x[k + 10], 15, -1051523); b = ii(b, c, d, a, x[k + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[k + 8], 6, 1873313359); d = ii(d, a, b, c, x[k + 15], 10, -30611744); c = ii(c, d, a, b, x[k + 6], 15, -1560198380); b = ii(b, c, d, a, x[k + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[k + 4], 6, -145523070); d = ii(d, a, b, c, x[k + 11], 10, -1120210379); c = ii(c, d, a, b, x[k + 2], 15, 718787259); b = ii(b, c, d, a, x[k + 9], 21, -343485551);
    a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
  }
  return rhex(a) + rhex(b) + rhex(c) + rhex(d);
}

export function safeEval(expr, vars) {
  if (!/^[0-9a-zA-Z_+\-*/().\s]+$/.test(expr)) throw Error('Unsupported expression.');
  const keys = Object.keys(vars);
  for (const k of keys) if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) throw Error('Bad input name.');
  const fn = new Function(...keys, `"use strict"; return (${expr});`);
  const v = fn(...keys.map(k => Number(vars[k])));
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('Result is not a finite number.');
  return v;
}

export function mountShell(root, tool, inner) {
  root.innerHTML = `
    <div class="tool-pane">
      <div class="tool-kicker">${esc(tool.category)} · on this device unless noted</div>
      <h1>${esc(tool.title)}</h1>
      <p class="lede">${esc(tool.description || 'A MegaPLAN utility.')}</p>
      <div class="panel" id="tool-body">${inner}</div>
      <p class="muted" style="margin-top:12px">Files you pick stay in this browser unless you use a writing-assistant tool, which sends only the text you submit.</p>
    </div>`;
  return root.querySelector('#tool-body');
}

export function wireDrop(root, { onChange } = {}) {
  const drop = root.querySelector('#drop');
  const input = root.querySelector('#file');
  if (!drop || !input) return { getFiles: () => [] };
  const files = [];
  const chips = root.querySelector('#file-chips');
  const show = () => {
    drop.classList.toggle('has', files.length > 0);
    const label = drop.querySelector('.dz-label');
    if (label) label.textContent = files.length
      ? `${files.length} file${files.length === 1 ? '' : 's'} ready — drop more to replace`
      : drop.dataset.label || 'Choose file(s)';
    if (chips) {
      chips.innerHTML = files.map((f, i) =>
        `<span class="file-chip">${esc(f.name)} · ${Math.max(1, Math.round(f.size / 1024))} KB</span>`
      ).join('');
    }
    onChange?.(files.slice());
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('has'); });
  drop.addEventListener('dragleave', () => { if (!files.length) drop.classList.remove('has'); });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    files.splice(0, files.length, ...e.dataTransfer.files);
    show();
  });
  input.addEventListener('change', () => {
    files.splice(0, files.length, ...input.files);
    show();
  });
  return {
    getFiles: () => files.slice(),
    input,
    setFiles(next) { files.splice(0, files.length, ...next); show(); }
  };
}

export function setOut(root, text) {
  const out = root.querySelector('#tool-out');
  if (out) out.textContent = text;
}

export function setProgress(root, pct, label) {
  const wrap = root.querySelector('#progress');
  const bar = root.querySelector('#progress-bar');
  const txt = root.querySelector('#progress-label');
  if (!wrap) return;
  wrap.classList.toggle('hidden', pct == null);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
  if (txt) txt.textContent = label || '';
}

export function textForm(extra = '') {
  return `
    <div class="work-grid">
      <div>
        <textarea id="tool-in" class="input-area" placeholder="Paste or type here…"></textarea>
        <div class="live-stats muted" id="live-stats">0 characters · 0 words</div>
      </div>
      <div>
        ${extra}
        <div class="button-row">
          <button class="btn primary" id="run">Run</button>
          <button class="btn secondary" id="copy">Copy result</button>
          <button class="btn ghost" id="download-out">Download</button>
        </div>
        <pre id="tool-out" class="out" style="margin-top:12px;min-height:180px"></pre>
      </div>
    </div>`;
}

export function wireLiveStats(root) {
  const ta = root.querySelector('#tool-in');
  const st = root.querySelector('#live-stats');
  if (!ta || !st) return;
  const tick = () => {
    const s = ta.value;
    const w = s.trim() ? s.trim().split(/\s+/u).length : 0;
    st.textContent = `${s.length} characters · ${w} words · ${s ? s.split(/\r?\n/).length : 0} lines`;
  };
  ta.addEventListener('input', tick); tick();
}

export function calcForm(fields) {
  return `
    <div class="field-row">
      ${fields.map((f, i) => `<label class="field-label">${esc(f)}<input class="num" id="n${i}" type="number" step="any" placeholder="${esc(f)}"></label>`).join('')}
    </div>
    <div class="button-row"><button class="btn primary" id="run">Calculate</button></div>
    <pre id="tool-out" class="out" style="margin-top:12px"></pre>
    <p class="muted">Educational calculator. Check important financial or clinical numbers against an authoritative source.</p>`;
}

export function fileForm({ accept = '*/*', multiple = false, extra = '', label = 'Choose file(s)', run = 'Run' } = {}) {
  return `
    <div class="dropzone" id="drop" data-label="${esc(label)}"><div class="dz-label">${esc(label)}</div>
      <div class="muted" style="margin-top:6px">Drop files here or click to browse. They stay on this device.</div>
      <input id="file" class="hidden" type="file" accept="${esc(accept)}" ${multiple ? 'multiple' : ''}>
    </div>
    <div id="file-chips" class="chip-row"></div>
    ${extra}
    <div id="progress" class="progress hidden"><div id="progress-bar"></div><span id="progress-label"></span></div>
    <div class="button-row"><button class="btn primary" id="run">${esc(run)}</button></div>
    <pre id="tool-out" class="out" style="margin-top:12px"></pre>`;
}

export function nums(root, n) {
  return Array.from({ length: n }, (_, i) => Number(root.querySelector('#n' + i)?.value));
}

export async function loadImageFile(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await img.decode();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

export async function canvasToFile(c, type = 'image/png', quality = 0.92, name = 'megaplan.png') {
  const blob = await new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('Encode failed')), type, quality));
  downloadBlob(blob, name);
  return blob;
}

export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.', ' ': '/'
};
export const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export const NATO = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel',
  I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa',
  Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu'
};
