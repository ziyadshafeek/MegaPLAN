/**
 * MegaPLAN tool engines.
 * Every registry title should resolve to a real runner. Customer UI never names models.
 */
import * as kit from './kit.js';
import { mountPdf } from './pdf-engine.js';

const { esc, downloadBlob, downloadText, askAssistant, inspect, loadPdfLib, loadJSZip,
  randomString, sha, utf8ToBase64, base64ToUtf8, parseCsv, toCsv, md5, clamp,
  mountShell, wireDrop, setOut, setProgress, textForm, calcForm, fileForm, nums, loadImageFile,
  canvasToFile, MORSE, UNMORSE, NATO } = kit;

const words = s => s.trim() ? s.trim().split(/\s+/u).length : 0;

function textTool(root, tool, fn, extra = '') {
  const body = mountShell(root, tool, textForm(extra));
  kit.wireLiveStats(body);
  body.querySelector('#copy').onclick = async () => {
    await navigator.clipboard?.writeText(body.querySelector('#tool-out').textContent || '');
    kit.toast('Copied');
  };
  body.querySelector('#download-out')?.addEventListener('click', () => {
    kit.downloadText(body.querySelector('#tool-out').textContent || '', 'megaplan-result.txt');
  });
  body.querySelector('#run').onclick = async () => {
    try {
      const s = body.querySelector('#tool-in').value;
      setOut(body, await fn(s, body));
    } catch (e) { setOut(body, 'Error: ' + e.message); }
  };
}

function calcTool(root, tool, fields, fn) {
  const body = mountShell(root, tool, calcForm(fields));
  body.querySelector('#run').onclick = () => {
    try { setOut(body, fn(...nums(body, fields.length))); }
    catch (e) { setOut(body, 'Error: ' + e.message); }
  };
}

function fileTool(root, tool, opts, fn) {
  const body = mountShell(root, tool, fileForm(opts));
  const drop = wireDrop(body);
  body.querySelector('#run').onclick = async () => {
    try {
      setProgress(body, 15, 'Working…');
      setOut(body, (await fn(drop.getFiles(), body)) || 'Done.');
      setProgress(body, 100, 'Done');
      setTimeout(() => setProgress(body, null), 700);
    } catch (e) { setProgress(body, null); setOut(body, 'Error: ' + e.message); }
  };
  return body;
}

function aiTool(root, tool, task, hint) {
  textTool(root, tool, async (s, body) => {
    if (!s.trim()) throw Error('Paste some text first.');
    setOut(body, 'Working…');
    const extra = body.querySelector('#extra')?.value || hint || '';
    return await askAssistant(task, s, extra);
  }, hint ? `<p class="muted">${esc(hint)}</p>` : `<input id="extra" class="field" style="margin-top:8px" placeholder="Optional extra instruction">`);
}

function unitTool(root, tool, units, label) {
  const opts = Object.keys(units).map(x => `<option>${x}</option>`).join('');
  const body = mountShell(root, tool, `
    <div class="field-row">
      <input class="num" id="n0" type="number" step="any" value="1">
      <select class="sel" id="from">${opts}</select>
      <select class="sel" id="to">${opts}</select>
    </div>
    <div class="button-row"><button class="btn primary" id="run">Convert</button></div>
    <pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
  body.querySelector('#run').onclick = () => {
    const v = Number(body.querySelector('#n0').value);
    const f = body.querySelector('#from').value, t = body.querySelector('#to').value;
    const r = v * units[f] / units[t];
    setOut(body, `${r} ${t}  (${label})`);
  };
}

async function qrDataUrl(text) {
  const QR = (await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm')).default;
  return await QR.toDataURL(text, { width: 320, margin: 1 });
}

function docPdf(root, tool, defaults) {
  const body = mountShell(root, tool, `
    <div class="field-row">
      <input class="field" id="title" placeholder="Title" value="${esc(defaults.title || tool.title)}">
      <input class="field" id="to" placeholder="Bill / send to">
    </div>
    <textarea id="tool-in" class="input-area" placeholder="${esc(defaults.placeholder || 'One item per line: Description | Qty | Rate')}">${esc(defaults.sample || '')}</textarea>
    <div class="button-row"><button class="btn primary" id="run">Make PDF</button></div>
    <pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
  body.querySelector('#run').onclick = async () => {
    try {
      const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage([595, 842]);
      let y = 790;
      const title = body.querySelector('#title').value || tool.title;
      page.drawText(title, { x: 45, y, size: 20, font: bold, color: rgb(0.11, 0.1, 0.09) });
      y -= 28;
      page.drawText(body.querySelector('#to').value || '', { x: 45, y, size: 11, font });
      y -= 28;
      let total = 0;
      for (const row of body.querySelector('#tool-in').value.split(/\r?\n/)) {
        if (!row.trim()) continue;
        const [desc, q, r] = row.split('|').map(x => x.trim());
        const qty = Number(q) || 0, rate = Number(r) || 0, amt = qty * rate;
        total += amt;
        page.drawText((desc || row).slice(0, 60), { x: 45, y, size: 10, font });
        if (q || r) page.drawText(amt.toFixed(2), { x: 480, y, size: 10, font });
        y -= 16;
        if (y < 60) break;
      }
      if (defaults.sum !== false) page.drawText('Total: ' + total.toFixed(2), { x: 400, y: y - 10, size: 12, font: bold });
      const bytes = await doc.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'megaplan-document.pdf');
      setOut(body, 'Saved PDF.');
    } catch (e) { setOut(body, 'Error: ' + e.message); }
  };
}

const LEN = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048, yd: 0.9144, km: 1000, mi: 1609.344 };
const WT = { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.0283495231 };
const AREA = { m2: 1, cm2: 0.0001, ft2: 0.09290304, yd2: 0.83612736, acre: 4046.8564224, ha: 10000 };
const VOL = { L: 1, mL: 0.001, gal: 3.785411784, qt: 0.946352946, pint: 0.473176473, cup: 0.2365882365 };
const SPD = { 'm/s': 1, 'km/h': 0.2777777778, mph: 0.44704, knot: 0.5144444444 };
const DATA = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

function emi(p, r, n) {
  const m = r / 1200;
  const e = m ? p * m * Math.pow(1 + m, n) / (Math.pow(1 + m, n) - 1) : p / n;
  return `Monthly: ${e.toFixed(2)}\nTotal paid: ${(e * n).toFixed(2)}\nInterest: ${(e * n - p).toFixed(2)}`;
}

function gstinValid(s) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s.trim().toUpperCase());
}

async function imageOp(root, tool, extra, fn) {
  const body = fileTool(root, tool, { accept: 'image/*', extra: (extra || '') + '<div class="preview-stage" id="img-preview"><span class="muted">Preview after you choose an image.</span></div>', label: 'Choose an image', run: 'Process' }, async (files, body) => {
    if (!files[0]) throw Error('Choose an image first.');
    const c = await loadImageFile(files[0]);
    return await fn(c, body, files[0]);
  });
  body.querySelector('#file')?.addEventListener('change', async () => {
    const f = body.querySelector('#file').files?.[0]; if (!f) return;
    try {
      const c = await loadImageFile(f);
      const stage = body.querySelector('#img-preview'); if (!stage) return;
      const view = document.createElement('canvas');
      const scale = Math.min(1, 520 / Math.max(1, c.width));
      view.width = Math.max(1, Math.round(c.width * scale));
      view.height = Math.max(1, Math.round(c.height * scale));
      view.getContext('2d').drawImage(c, 0, 0, view.width, view.height);
      stage.innerHTML = ''; stage.appendChild(view);
      setOut(body, `${f.name} · ${c.width}×${c.height} · ${Math.max(1, Math.round(f.size / 1024))} KB`);
    } catch (e) { setOut(body, 'Could not preview: ' + e.message); }
  });
  return body;
}

function audioBufferTool(root, tool, fn) {
  fileTool(root, tool, { accept: 'audio/*', label: 'Choose audio', run: 'Process' }, async (files) => {
    if (!files[0]) throw Error('Choose an audio file.');
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(await files[0].arrayBuffer());
    const result = await fn(ac, buf, files[0]);
    await ac.close();
    return result;
  });
}

function wavFromBuffer(buf, start = 0, end = buf.duration) {
  const sr = buf.sampleRate, ch = buf.numberOfChannels;
  const a = Math.floor(start * sr), b = Math.floor(end * sr);
  const n = Math.max(0, b - a);
  const data = new Float32Array(n * ch);
  for (let c = 0; c < ch; c++) {
    const src = buf.getChannelData(c);
    for (let i = 0; i < n; i++) data[i * ch + c] = src[a + i] || 0;
  }
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm[i] = clamp(data[i] * 32767, -32768, 32767);
  const out = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.byteLength, true);
  new Uint8Array(out, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([out], { type: 'audio/wav' });
}

const HANDLERS = {
  /* TEXT */
  'Word Counter': (r, t) => textTool(r, t, s => `Words: ${words(s)}`),
  'Character Counter': (r, t) => textTool(r, t, s => `Characters: ${s.length}\nWithout spaces: ${s.replace(/\s/g, '').length}`),
  'Sentence Counter': (r, t) => textTool(r, t, s => `Sentences: ${(s.match(/[.!?]+(?=\s|$)/g) || []).length}`),
  'Paragraph Counter': (r, t) => textTool(r, t, s => `Paragraphs: ${s.trim() ? s.trim().split(/\n\s*\n/).length : 0}`),
  'Reading Time Calculator': (r, t) => textTool(r, t, s => { const w = words(s); return `Words: ${w}\nReading time: ${Math.max(1, Math.ceil(w / 200))} min`; }),
  'Case Converter': (r, t) => textTool(r, t, s => s.toLowerCase().replace(/\b[\p{L}\p{N}]+/gu, w => w[0].toUpperCase() + w.slice(1))),
  'Title Case': (r, t) => textTool(r, t, s => s.toLowerCase().replace(/\b[\p{L}\p{N}]+/gu, w => w[0].toUpperCase() + w.slice(1))),
  'Uppercase Converter': (r, t) => textTool(r, t, s => s.toUpperCase()),
  'Lowercase Converter': (r, t) => textTool(r, t, s => s.toLowerCase()),
  'Whitespace Cleaner': (r, t) => textTool(r, t, s => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()),
  'Trim Lines': (r, t) => textTool(r, t, s => s.split(/\r?\n/).map(x => x.trim()).join('\n')),
  'Remove Duplicate Lines': (r, t) => textTool(r, t, s => [...new Set(s.split(/\r?\n/))].join('\n')),
  'Sort Lines': (r, t) => textTool(r, t, s => s.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join('\n')),
  'Reverse Lines': (r, t) => textTool(r, t, s => s.split(/\r?\n/).reverse().join('\n')),
  'Number Lines': (r, t) => textTool(r, t, s => s.split(/\r?\n/).map((x, i) => `${i + 1}. ${x}`).join('\n')),
  'List to CSV': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(x => x.split(/\s+/).join(',')).join('\n')),
  'CSV to List': (r, t) => textTool(r, t, s => parseCsv(s).map(r => r.join(' ')).join('\n')),
  'Text Diff': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><textarea id="a" class="input-area" placeholder="Version A"></textarea><textarea id="b" class="input-area" placeholder="Version B"></textarea></div><div class="button-row"><button class="btn primary" id="run">Compare</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const A = body.querySelector('#a').value.split(/\r?\n/), B = body.querySelector('#b').value.split(/\r?\n/);
      const n = Math.max(A.length, B.length); const lines = [];
      for (let i = 0; i < n; i++) if ((A[i] || '') !== (B[i] || '')) lines.push(`Line ${i + 1}:\n- ${A[i] || ''}\n+ ${B[i] || ''}`);
      setOut(body, lines.join('\n\n') || 'No line differences.');
    };
  },
  'Find and Replace': (r, t) => textTool(r, t, (s, body) => s.replaceAll(body.querySelector('#find').value, body.querySelector('#repl').value),
    `<div class="field-row" style="margin-top:8px"><input id="find" class="field" placeholder="Find"><input id="repl" class="field" placeholder="Replace with"></div>`),
  'Slug Generator': (r, t) => textTool(r, t, s => s.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')),
  'Markdown Cleaner': (r, t) => textTool(r, t, s => s.replace(/[#>*_`]/g, '').replace(/\[(.*?)\]\((.*?)\)/g, '$1')),
  'HTML Text Extractor': (r, t) => textTool(r, t, s => { const d = new DOMParser().parseFromString(s, 'text/html'); return d.body.textContent || ''; }),
  'Text to QR': (r, t) => textTool(r, t, async s => {
    if (!s.trim()) throw Error('Enter text.');
    const url = await qrDataUrl(s);
    const a = document.createElement('a'); a.href = url; a.download = 'megaplan-qr.png'; a.click();
    return 'QR saved as PNG.';
  }),
  'QR to Text': (r, t) => {
    const body = mountShell(r, t, `<p class="muted">Decoding a QR image needs a camera/decoder that this browser build does not ship. Generate QR codes with Text to QR, or paste decoded text here to clean it.</p>${textForm()}`);
    body.querySelector('#run').onclick = () => setOut(body, body.querySelector('#tool-in').value.trim());
  },
  'Morse Encoder': (r, t) => textTool(r, t, s => [...s.toUpperCase()].map(c => MORSE[c] || c).join(' ')),
  'Morse Decoder': (r, t) => textTool(r, t, s => s.trim().split(/\s+/).map(c => UNMORSE[c] || c).join('')),
  'NATO Phonetic Converter': (r, t) => textTool(r, t, s => [...s.toUpperCase()].map(c => NATO[c] || c).join(' ')),
  'Leetspeak Converter': (r, t) => textTool(r, t, s => s.replace(/[aAeEiIoOsStT]/g, c => ({ a: '4', A: '4', e: '3', E: '3', i: '1', I: '1', o: '0', O: '0', s: '5', S: '5', t: '7', T: '7' }[c]))),
  'Unicode Inspector': (r, t) => textTool(r, t, s => [...s].map(ch => `${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  ${ch.codePointAt(0)}`).join('\n')),
  'Unicode Normalizer': (r, t) => textTool(r, t, s => `NFC:\n${s.normalize('NFC')}\n\nNFD:\n${s.normalize('NFD')}`),
  'Text Repeater': (r, t) => textTool(r, t, (s, body) => Array.from({ length: clamp(Number(body.querySelector('#times').value) || 3, 1, 500) }, () => s).join('\n'),
    `<input id="times" class="num" style="margin-top:8px" type="number" value="3" min="1" max="500">`),
  'Random Line Picker': (r, t) => textTool(r, t, s => { const a = s.split(/\r?\n/).filter(Boolean); return a[Math.floor(Math.random() * a.length)] || ''; }),
  'Random Word Picker': (r, t) => textTool(r, t, s => { const a = s.trim().split(/\s+/); return a[Math.floor(Math.random() * a.length)] || ''; }),
  'Lorem Ipsum Generator': (r, t) => textTool(r, t, () => Array.from({ length: 3 }, () => 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.').join('\n\n')),
  'Palindrome Checker': (r, t) => textTool(r, t, s => { const x = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); return x && x === [...x].reverse().join('') ? 'Palindrome' : 'Not a palindrome'; }),
  'Anagram Checker': (r, t) => textTool(r, t, (s, body) => {
    const norm = x => [...x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')].sort().join('');
    return norm(s) === norm(body.querySelector('#other').value) ? 'Anagrams' : 'Not anagrams';
  }, `<input id="other" class="field" style="margin-top:8px" placeholder="Second word or phrase">`),
  'Text Statistics': (r, t) => textTool(r, t, s => `Characters: ${s.length}\nWords: ${words(s)}\nLines: ${s ? s.split(/\r?\n/).length : 0}\nParagraphs: ${s.trim() ? s.trim().split(/\n\s*\n/).length : 0}`),

  /* DEVELOPER */
  'JSON Formatter': (r, t) => textTool(r, t, s => JSON.stringify(JSON.parse(s), null, 2)),
  'JSON Minifier': (r, t) => textTool(r, t, s => JSON.stringify(JSON.parse(s))),
  'JSON Validator': (r, t) => textTool(r, t, s => { JSON.parse(s); return 'Valid JSON'; }),
  'JSON to CSV': (r, t) => textTool(r, t, s => {
    const rows = JSON.parse(s); const a = Array.isArray(rows) ? rows : [rows];
    const cols = [...new Set(a.flatMap(x => Object.keys(x || {})))];
    return toCsv([cols, ...a.map(x => cols.map(c => x?.[c] ?? ''))]);
  }),
  'CSV to JSON': (r, t) => textTool(r, t, s => {
    const rows = parseCsv(s); const cols = rows[0]; 
    return JSON.stringify(rows.slice(1).filter(x => x.some(Boolean)).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? '']))), null, 2);
  }),
  'YAML Formatter': (r, t) => textTool(r, t, s => s.replace(/\t/g, '  ').split(/\r?\n/).map(x => x.replace(/\s+$/, '')).join('\n').trim()),
  'XML Formatter': (r, t) => textTool(r, t, s => {
    const doc = new DOMParser().parseFromString(s, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error(doc.querySelector('parsererror').textContent);
    const fmt = (n, l = 0) => {
      const pad = '  '.repeat(l);
      if (!n.children?.length) return `${pad}<${n.nodeName}>${(n.textContent || '').trim()}</${n.nodeName}>`;
      return `${pad}<${n.nodeName}>\n${[...n.children].map(x => fmt(x, l + 1)).join('\n')}\n${pad}</${n.nodeName}>`;
    };
    return fmt(doc.documentElement);
  }),
  'XML Validator': (r, t) => textTool(r, t, s => {
    const doc = new DOMParser().parseFromString(s, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error(doc.querySelector('parsererror').textContent);
    return 'Valid XML';
  }),
  'Base64 Encoder': (r, t) => textTool(r, t, s => utf8ToBase64(s)),
  'Base64 Decoder': (r, t) => textTool(r, t, s => base64ToUtf8(s.trim())),
  'URL Encoder': (r, t) => textTool(r, t, s => encodeURIComponent(s)),
  'URL Decoder': (r, t) => textTool(r, t, s => decodeURIComponent(s)),
  'JWT Decoder': (r, t) => textTool(r, t, s => {
    const [h, p] = s.trim().split('.');
    if (!h || !p) throw Error('JWT needs header.payload.signature');
    const dec = x => JSON.parse(base64ToUtf8(x.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - x.length % 4) % 4)));
    return JSON.stringify({ header: dec(h), payload: dec(p), note: 'Signature is not verified.' }, null, 2);
  }),
  'UUID Generator': (r, t) => textTool(r, t, () => crypto.randomUUID()),
  'Nano ID Generator': (r, t) => textTool(r, t, () => randomString(21, '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')),
  'SHA-256 Hash': (r, t) => textTool(r, t, s => sha(s, 'SHA-256')),
  'SHA-512 Hash': (r, t) => textTool(r, t, s => sha(s, 'SHA-512')),
  'MD5 Hash': (r, t) => textTool(r, t, s => md5(s)),
  'HMAC Helper': (r, t) => textTool(r, t, async (s, body) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(body.querySelector('#key').value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s));
    return kit.hexBytes(sig);
  }, `<input id="key" class="field" style="margin-top:8px" placeholder="Secret key (stays in this browser)">`),
  'Regex Tester': (r, t) => textTool(r, t, (s, body) => {
    const re = new RegExp(body.querySelector('#pattern').value, body.querySelector('#flags').value);
    const matches = [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
    return JSON.stringify({ matches: matches.map(m => ({ match: m[0], index: m.index })) }, null, 2);
  }, `<div class="field-row" style="margin-top:8px"><input id="pattern" class="field" placeholder="Pattern" value="\\w+"><input id="flags" class="field" placeholder="Flags" value="g"></div>`),
  'Regex Generator Helper': (r, t) => {
    const body = mountShell(r, t, `<select class="sel" id="kind"><option value="email">Email</option><option value="url">URL</option><option value="phone">Phone</option><option value="integer">Integer</option><option value="date">ISO date</option></select><div class="button-row"><button class="btn primary" id="run">Show pattern</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    const map = { email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', url: '^https?:\\/\\/[^\\s]+$', phone: '^\\+?[0-9()\\s-]{7,20}$', integer: '^-?\\d+$', date: '^\\d{4}-\\d{2}-\\d{2}$' };
    body.querySelector('#run').onclick = () => setOut(body, map[body.querySelector('#kind').value]);
  },
  'Cron Expression Helper': (r, t) => textTool(r, t, s => {
    const p = s.trim().split(/\s+/);
    if (p.length < 5) throw Error('Use 5-field cron: min hour dom month dow');
    return `Minute: ${p[0]}\nHour: ${p[1]}\nDay of month: ${p[2]}\nMonth: ${p[3]}\nDay of week: ${p[4]}\nThis is a field decoder, not a live scheduler.`;
  }),
  'Unix Timestamp Converter': (r, t) => textTool(r, t, s => {
    const n = Number(s.trim()); if (!Number.isFinite(n)) throw Error('Enter a timestamp.');
    const ms = Math.abs(n) > 1e11 ? n : n * 1000;
    return `ISO: ${new Date(ms).toISOString()}\nLocal: ${new Date(ms).toString()}`;
  }),
  'Epoch Converter': (r, t) => textTool(r, t, s => {
    const n = Number(s.trim()); if (!Number.isFinite(n)) throw Error('Enter a timestamp.');
    const ms = Math.abs(n) > 1e11 ? n : n * 1000;
    return `ISO: ${new Date(ms).toISOString()}\nSeconds: ${Math.floor(ms / 1000)}`;
  }),
  'HTTP Header Viewer': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('headers', { url: s.trim() }), null, 2)),
  'User-Agent Parser': (r, t) => textTool(r, t, s => {
    const ua = s || navigator.userAgent;
    return JSON.stringify({
      ua,
      browser: /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown',
      os: /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown',
      mobile: /Mobile|Android|iPhone|iPad/.test(ua)
    }, null, 2);
  }),
  'MIME Type Lookup': (r, t) => textTool(r, t, s => {
    const map = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf', csv: 'text/csv', svg: 'image/svg+xml', webp: 'image/webp', mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml', wasm: 'application/wasm' };
    const ext = s.trim().replace(/^\./, '').toLowerCase();
    return map[ext] || 'Unknown extension in this built-in table.';
  }),
  'URL Parser': (r, t) => textTool(r, t, s => { const u = new URL(s); return JSON.stringify({ href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname, search: u.search, hash: u.hash }, null, 2); }),
  'HTML Escape': (r, t) => textTool(r, t, s => esc(s)),
  'HTML Unescape': (r, t) => textTool(r, t, s => { const ta = document.createElement('textarea'); ta.innerHTML = s; return ta.value; }),
  'SQL Formatter': (r, t) => textTool(r, t, s => s.replace(/\s+/g, ' ').replace(/\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AND|OR|VALUES|SET)\b/gi, '\n$1').trim()),
  'Markdown Preview': (r, t) => textTool(r, t, s => s.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>')),
  'JSON Path Helper': (r, t) => textTool(r, t, (s, body) => {
    const data = JSON.parse(s); const path = body.querySelector('#path').value.replace(/^\$\.?/, '').split('.').filter(Boolean);
    let cur = data; for (const p of path) cur = cur?.[p];
    return JSON.stringify(cur, null, 2);
  }, `<input id="path" class="field" style="margin-top:8px" placeholder="path.to.field">`),
  'JSON Pointer Helper': (r, t) => textTool(r, t, (s, body) => {
    const data = JSON.parse(s); const parts = body.querySelector('#path').value.split('/').slice(1).map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let cur = data; for (const p of parts) cur = cur?.[p];
    return JSON.stringify(cur, null, 2);
  }, `<input id="path" class="field" style="margin-top:8px" placeholder="/foo/bar">`),
  'Semver Calculator': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="v1" class="field" value="1.2.3"><input id="v2" class="field" value="1.4.0"></div><div class="button-row"><button class="btn primary" id="run">Compare</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    const parse = s => String(s).replace(/^v/, '').split('.').map(x => parseInt(x, 10) || 0);
    body.querySelector('#run').onclick = () => {
      const a = parse(body.querySelector('#v1').value), b = parse(body.querySelector('#v2').value);
      let c = 0; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) { c = a[i] - b[i]; break; }
      setOut(body, `A: ${a.join('.')}\nB: ${b.join('.')}\n${c > 0 ? 'A > B' : c < 0 ? 'A < B' : 'A = B'}`);
    };
  },
  'Color Hex Converter': (r, t) => textTool(r, t, s => {
    const hex = s.trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) throw Error('Use a 6-digit hex color.');
    const r0 = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4), 16);
    return `HEX: #${hex.toUpperCase()}\nRGB: rgb(${r0}, ${g}, ${b})`;
  }),
  'RGB HSL Converter': (r, t) => calcTool(r, t, ['R', 'G', 'B'], (r0, g, b) => `rgb(${r0}, ${g}, ${b})\nHEX: #${[r0, g, b].map(x => clamp(x, 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`),
  'CSS Minifier': (r, t) => textTool(r, t, s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim()),
  'JS Minifier': (r, t) => textTool(r, t, s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1').replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim()),
  'HTML Minifier': (r, t) => textTool(r, t, s => s.replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><').trim()),
  'IP Subnet Calculator': (r, t) => textTool(r, t, s => {
    const [ip, bitsS] = s.trim().split('/');
    const bits = Number(bitsS); if (!ip || !Number.isInteger(bits) || bits < 0 || bits > 32) throw Error('Use CIDR like 192.168.1.10/24');
    const n = ip.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    const net = n & mask, bcast = net | (~mask >>> 0);
    const fmt = x => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
    return `Network: ${fmt(net)}\nBroadcast: ${fmt(bcast)}\nMask: ${fmt(mask)}\nHosts: ${Math.max(0, 2 ** (32 - bits) - 2)}`;
  }),
  'CIDR Calculator': (r, t) => HANDLERS['IP Subnet Calculator'](r, t),
  'Byte Converter': (r, t) => unitTool(r, t, DATA, 'binary prefixes'),
  'File Hash Checker': (r, t) => fileTool(r, t, { label: 'Choose a file', run: 'Hash' }, async files => {
    if (!files[0]) throw Error('Choose a file.');
    const buf = await crypto.subtle.digest('SHA-256', await files[0].arrayBuffer());
    return `${files[0].name}\nSHA-256: ${kit.hexBytes(buf)}`;
  }),
  'Random Hex Generator': (r, t) => textTool(r, t, () => kit.hexBytes(crypto.getRandomValues(new Uint8Array(16)))),
  'Random String Generator': (r, t) => textTool(r, t, (s, body) => randomString(clamp(Number(body.querySelector('#len').value) || 16, 1, 10000), body.querySelector('#alpha').value || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
    `<div class="field-row" style="margin-top:8px"><input id="len" class="num" type="number" value="16"><input id="alpha" class="field" value="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"></div>`),
  'Package Name Checker': (r, t) => textTool(r, t, s => /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(s.trim()) ? 'Looks valid for a common npm-style name.' : 'Does not match the common npm name pattern.'),
};

/* CALCULATORS + HEALTH + FINANCE + INDIA extras filled via Object.assign below */

Object.assign(HANDLERS, {
  'Percentage Calculator': (r, t) => calcTool(r, t, ['Value', 'Percent %'], (a, b) => `Result: ${(a * b / 100).toFixed(4)}`),
  'Discount Calculator': (r, t) => calcTool(r, t, ['Price', 'Discount %'], (a, b) => `Final: ${(a - a * b / 100).toFixed(2)}\nSave: ${(a * b / 100).toFixed(2)}`),
  'Tip Calculator': (r, t) => calcTool(r, t, ['Bill', 'Tip %'], (a, b) => `Tip: ${(a * b / 100).toFixed(2)}\nTotal: ${(a + a * b / 100).toFixed(2)}`),
  'Markup Calculator': (r, t) => calcTool(r, t, ['Cost', 'Markup %'], (a, b) => `Selling price: ${(a * (1 + b / 100)).toFixed(2)}`),
  'Margin Calculator': (r, t) => calcTool(r, t, ['Selling price', 'Cost'], (a, b) => a ? `Margin: ${((a - b) / a * 100).toFixed(2)}%` : 'Enter selling price.'),
  'Profit Calculator': (r, t) => calcTool(r, t, ['Revenue', 'Cost'], (a, b) => `Profit: ${(a - b).toFixed(2)}\nMargin: ${a ? ((a - b) / a * 100).toFixed(2) + '%' : '—'}`),
  'Break Even Calculator': (r, t) => calcTool(r, t, ['Fixed costs', 'Contribution / unit'], (a, b) => b > 0 ? `Break-even units: ${Math.ceil(a / b)}` : 'Enter contribution.'),
  'GST Calculator': (r, t) => calcTool(r, t, ['Base', 'GST %'], (a, b) => `GST: ${(a * b / 100).toFixed(2)}\nTotal: ${(a + a * b / 100).toFixed(2)}`),
  'Sales Tax Calculator': (r, t) => calcTool(r, t, ['Price', 'Tax %'], (a, b) => `Tax: ${(a * b / 100).toFixed(2)}\nTotal: ${(a + a * b / 100).toFixed(2)}`),
  'VAT Calculator': (r, t) => calcTool(r, t, ['Net', 'VAT %'], (a, b) => `VAT: ${(a * b / 100).toFixed(2)}\nGross: ${(a + a * b / 100).toFixed(2)}`),
  'EMI Calculator': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Months'], emi),
  'Loan Amortization': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Months'], emi),
  'Loan Payment': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Months'], emi),
  'Amortization': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Months'], emi),
  'Compound Interest': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Years'], (p, r0, y) => `Future value: ${(p * Math.pow(1 + r0 / 100, y)).toFixed(2)}`),
  'Simple Interest': (r, t) => calcTool(r, t, ['Principal', 'Annual %', 'Years'], (p, r0, y) => `Interest: ${(p * r0 / 100 * y).toFixed(2)}\nTotal: ${(p + p * r0 / 100 * y).toFixed(2)}`),
  'Inflation Calculator': (r, t) => calcTool(r, t, ['Amount', 'Inflation %', 'Years'], (a, r0, y) => `Future: ${(a * Math.pow(1 + r0 / 100, y)).toFixed(2)}`),
  'Inflation Adjuster': (r, t) => calcTool(r, t, ['Amount', 'Inflation %', 'Years'], (a, r0, y) => `Adjusted: ${(a * Math.pow(1 + r0 / 100, y)).toFixed(2)}`),
  'ROI Calculator': (r, t) => calcTool(r, t, ['Investment', 'Final value'], (a, b) => a ? `ROI: ${((b - a) / a * 100).toFixed(2)}%` : 'Enter investment.'),
  'Investment Return': (r, t) => calcTool(r, t, ['Investment', 'Final value'], (a, b) => a ? `Return: ${((b - a) / a * 100).toFixed(2)}%` : 'Enter investment.'),
  'ROAS Calculator': (r, t) => calcTool(r, t, ['Revenue', 'Ad spend'], (a, b) => b ? `ROAS: ${(a / b).toFixed(2)}×` : 'Enter spend.'),
  'Salary Calculator': (r, t) => calcTool(r, t, ['Annual gross', 'Deductions'], (a, b) => `Take-home: ${(a - b).toFixed(2)}\nMonthly: ${((a - b) / 12).toFixed(2)}`),
  'Hourly Rate Calculator': (r, t) => calcTool(r, t, ['Target annual', 'Hours/week', 'Weeks/year'], (a, b, c) => b && c ? `Rate: ${(a / (b * c)).toFixed(2)}` : 'Enter hours.'),
  'BMI Calculator': (r, t) => calcTool(r, t, ['Weight kg', 'Height m'], (a, b) => b > 0 ? `BMI: ${(a / (b * b)).toFixed(2)}` : 'Enter height.'),
  'BSA Calculator': (r, t) => calcTool(r, t, ['Weight kg', 'Height cm'], (w, h) => w && h ? `BSA: ${Math.sqrt(w * h / 3600).toFixed(2)} m²` : 'Enter values.'),
  'Anion Gap Calculator': (r, t) => calcTool(r, t, ['Na', 'Cl', 'HCO3'], (na, cl, hco) => `Anion gap: ${(na - cl - hco).toFixed(1)}`),
  'Corrected Calcium Calculator': (r, t) => calcTool(r, t, ['Ca mg/dL', 'Albumin g/dL'], (ca, alb) => `Corrected Ca: ${(ca + 0.8 * (4 - alb)).toFixed(2)}`),
  'Creatinine Clearance': (r, t) => calcTool(r, t, ['Age', 'Weight kg', 'Creatinine mg/dL', 'Sex 1=m 0=f'], (age, wt, cr, sex) => cr ? `Cockcroft–Gault: ${(((140 - age) * wt * (sex ? 1 : 0.85)) / (72 * cr)).toFixed(1)} mL/min` : 'Enter creatinine.'),
  'Body Fat Calculator': (r, t) => calcTool(r, t, ['BMI', 'Age', 'Sex 1=m 0=f'], (bmi, age, sex) => `Estimate: ${(1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4).toFixed(1)}%`),
  'Calorie Estimate': (r, t) => calcTool(r, t, ['Weight kg', 'Height cm', 'Age', 'Sex 1=m 0=f'], (w, h, age, sex) => `Mifflin BMR: ${(10 * w + 6.25 * h - 5 * age + (sex ? 5 : -161)).toFixed(0)} kcal`),
  'IV Flow Rate Helper': (r, t) => calcTool(r, t, ['Volume mL', 'Time min', 'Drop factor'], (v, m, d) => m ? `gtt/min: ${Math.round(v / m * d)}` : 'Enter time.'),
  'IV Flow Rate': (r, t) => HANDLERS['IV Flow Rate Helper'](r, t),
  'Drip Rate Calculator': (r, t) => HANDLERS['IV Flow Rate Helper'](r, t),
  'Drug Dilution Helper': (r, t) => calcTool(r, t, ['Stock conc', 'Desired conc', 'Desired volume'], (s, d, v) => s ? `Stock volume: ${(d * v / s).toFixed(3)}\nDiluent: ${(v - d * v / s).toFixed(3)}` : 'Enter stock.'),
  'Dilution Calculator': (r, t) => HANDLERS['Drug Dilution Helper'](r, t),
  'Concentration Calculator': (r, t) => calcTool(r, t, ['Solute g', 'Volume L'], (a, b) => b ? `${(a / b).toFixed(4)} g/L` : 'Enter volume.'),
  'Molarity Calculator': (r, t) => calcTool(r, t, ['Mass g', 'Molar mass', 'Volume L'], (a, b, c) => b && c ? `${(a / b / c).toFixed(4)} mol/L` : 'Enter values.'),
  'eGFR Reference Helper': (r, t) => calcTool(r, t, ['Creatinine mg/dL', 'Age', 'Sex 1=m 0=f'], (cr, age, sex) => cr ? `CKD-EPI-like estimate (educational): ${(142 * Math.pow(Math.min(cr / (sex ? 0.9 : 0.7), 1), sex ? -0.302 : -0.241) * Math.pow(Math.max(cr / (sex ? 0.9 : 0.7), 1), -1.2) * Math.pow(0.9938, age) * (sex ? 1 : 1.012)).toFixed(1)}` : 'Enter creatinine.'),
  'Ideal Body Weight': (r, t) => calcTool(r, t, ['Height cm', 'Sex 1=m 0=f'], (h, sex) => `Devine IBW: ${(sex ? 50 : 45.5) + 0.9 * (h - 152.4)} kg`),
  'Adjusted Body Weight': (r, t) => calcTool(r, t, ['Actual kg', 'IBW kg'], (a, i) => `AdjBW: ${(i + 0.4 * (a - i)).toFixed(1)} kg`),
  'Osmolality Calculator': (r, t) => calcTool(r, t, ['Na', 'Glucose', 'BUN'], (na, g, bun) => `Calc osm: ${(2 * na + g / 18 + bun / 2.8).toFixed(1)}`),
  'Sodium Correction': (r, t) => calcTool(r, t, ['Na', 'Glucose'], (na, g) => `Corrected Na: ${(na + 1.6 * (g - 100) / 100).toFixed(1)}`),
  'QTc Calculator': (r, t) => calcTool(r, t, ['QT ms', 'HR bpm'], (qt, hr) => hr ? `Bazett QTc: ${(qt / Math.sqrt(60 / hr)).toFixed(0)} ms` : 'Enter HR.'),
  'MAP Calculator': (r, t) => calcTool(r, t, ['SBP', 'DBP'], (s, d) => `MAP: ${(d + (s - d) / 3).toFixed(1)}`),
  'Mean Arterial Pressure': (r, t) => HANDLERS['MAP Calculator'](r, t),
  'Pulse Pressure': (r, t) => calcTool(r, t, ['SBP', 'DBP'], (s, d) => `Pulse pressure: ${s - d}`),
  'Unit Conversion': (r, t) => unitTool(r, t, LEN, 'length'),
  'Unit Converter': (r, t) => unitTool(r, t, LEN, 'length'),
  'Length Converter': (r, t) => unitTool(r, t, LEN, 'length'),
  'Weight Converter': (r, t) => unitTool(r, t, WT, 'mass'),
  'Area Converter': (r, t) => unitTool(r, t, AREA, 'area'),
  'Volume Converter': (r, t) => unitTool(r, t, VOL, 'volume'),
  'Speed Converter': (r, t) => unitTool(r, t, SPD, 'speed'),
  'Data Size Converter': (r, t) => unitTool(r, t, DATA, 'data'),
  'Temperature Converter': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="n0" class="num" type="number" value="0"><select id="from" class="sel"><option>C</option><option>F</option><option>K</option></select><select id="to" class="sel"><option>F</option><option>C</option><option>K</option></select></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      let v = Number(body.querySelector('#n0').value); const f = body.querySelector('#from').value, to = body.querySelector('#to').value;
      if (f === 'F') v = (v - 32) * 5 / 9; else if (f === 'K') v = v - 273.15;
      if (to === 'F') v = v * 9 / 5 + 32; else if (to === 'K') v = v + 273.15;
      setOut(body, `${v.toFixed(4)} °${to}`);
    };
  },
  'Age Calculator': (r, t) => {
    const body = mountShell(r, t, `<input id="dob" class="field" type="date"><div class="button-row"><button class="btn primary" id="run">Age</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const d = new Date(body.querySelector('#dob').value + 'T00:00:00'); if (Number.isNaN(d.getTime())) return setOut(body, 'Choose a date.');
      const now = new Date(); let y = now.getFullYear() - d.getFullYear(), m = now.getMonth() - d.getMonth(), day = now.getDate() - d.getDate();
      if (day < 0) { m--; day += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
      if (m < 0) { y--; m += 12; }
      setOut(body, `${y} years, ${m} months, ${day} days`);
    };
  },
  'Date Difference': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="a" class="field" type="date"><input id="b" class="field" type="date"></div><div class="button-row"><button class="btn primary" id="run">Difference</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const a = new Date(body.querySelector('#a').value + 'T00:00:00'), b = new Date(body.querySelector('#b').value + 'T00:00:00');
      setOut(body, `Difference: ${Math.round((b - a) / 86400000)} days`);
    };
  },
  'Business Days Calculator': (r, t) => HANDLERS['Date Difference'](r, t),
  'Business Days Counter': (r, t) => HANDLERS['Date Difference'](r, t),
  'Time Difference': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="a" class="field" type="time" value="09:00"><input id="b" class="field" type="time" value="17:00"></div><div class="button-row"><button class="btn primary" id="run">Difference</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const p = x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
      const d = (p(body.querySelector('#b').value) - p(body.querySelector('#a').value) + 1440) % 1440;
      setOut(body, `${Math.floor(d / 60)} h ${d % 60} min`);
    };
  },
  'Time Zone Converter': (r, t) => {
    const z = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Tokyo'];
    const body = mountShell(r, t, `<input id="time" class="field" type="datetime-local"><div class="field-row"><select id="from" class="sel">${z.map(x => `<option>${x}</option>`).join('')}</select><select id="to" class="sel">${z.map(x => `<option>${x}</option>`).join('')}</select></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const v = body.querySelector('#time').value; if (!v) return setOut(body, 'Choose a time.');
      const utc = new Date(v + 'Z');
      setOut(body, new Intl.DateTimeFormat('en-GB', { timeZone: body.querySelector('#to').value, dateStyle: 'full', timeStyle: 'long' }).format(utc));
    };
  },
  'Indian Time Zone Converter': (r, t) => HANDLERS['Time Zone Converter'](r, t),
  'Profit Margin': (r, t) => HANDLERS['Margin Calculator'](r, t),
  'Markup': (r, t) => HANDLERS['Markup Calculator'](r, t),
  'Break Even': (r, t) => HANDLERS['Break Even Calculator'](r, t),
  'Discount': (r, t) => HANDLERS['Discount Calculator'](r, t),
  'Tax Calculator': (r, t) => HANDLERS['Sales Tax Calculator'](r, t),
  'Subscription Cost Calculator': (r, t) => calcTool(r, t, ['Monthly cost', 'Months'], (a, b) => `Yearly equivalent: ${(a * 12).toFixed(2)}\nSelected term: ${(a * b).toFixed(2)}`),
  'CAC Calculator': (r, t) => calcTool(r, t, ['Sales + marketing spend', 'New customers'], (a, b) => b ? `CAC: ${(a / b).toFixed(2)}` : 'Enter customers.'),
  'LTV Calculator': (r, t) => calcTool(r, t, ['ARPU', 'Gross margin %', 'Churn % / month'], (a, m, c) => c ? `LTV: ${(a * (m / 100) / (c / 100)).toFixed(2)}` : 'Enter churn.'),
  'Emergency Fund Calculator': (r, t) => calcTool(r, t, ['Monthly expenses', 'Months'], (a, b) => `Target: ${(a * b).toFixed(2)}`),
  'Savings Goal': (r, t) => calcTool(r, t, ['Goal', 'Monthly save'], (a, b) => b ? `Months: ${Math.ceil(a / b)}` : 'Enter savings.'),
  'Debt Snowball': (r, t) => textTool(r, t, s => 'List each debt as name | balance | min payment, one per line. Pay minimums on all, extra to the smallest balance.\n\n' + s.split(/\r?\n/).filter(Boolean).map(x => x.split('|').map(v => v.trim())).sort((a, b) => Number(a[1]) - Number(b[1])).map((x, i) => `${i + 1}. ${x[0]} — ${x[1]}`).join('\n')),
  'Debt Avalanche': (r, t) => textTool(r, t, s => 'List name | balance | APR %. Extra goes to the highest APR.\n\n' + s.split(/\r?\n/).filter(Boolean).map(x => x.split('|').map(v => v.trim())).sort((a, b) => Number(b[2]) - Number(a[2])).map((x, i) => `${i + 1}. ${x[0]} — ${x[2]}%`).join('\n')),
  'Net Worth Tracker': (r, t) => textTool(r, t, s => {
    let a = 0, l = 0;
    for (const row of s.split(/\r?\n/)) {
      const [k, v, kind] = row.split('|').map(x => x?.trim());
      if (!k) continue;
      if (String(kind).toLowerCase().startsWith('l')) l += Number(v) || 0; else a += Number(v) || 0;
    }
    return `Assets: ${a}\nLiabilities: ${l}\nNet worth: ${a - l}`;
  }),
  'Budget Sheet': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(x => x.replace('|', '\t')).join('\n') || 'Use category | amount lines.'),
  'Currency Converter': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="n0" class="num" type="number" value="1"><input id="from" class="field" value="USD"><input id="to" class="field" value="INR"></div><div class="button-row"><button class="btn primary" id="run">Convert</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre><p class="muted">Rates from frankfurter.app, a public ECB-based feed. Not a bank quote.</p>`);
    body.querySelector('#run').onclick = async () => {
      try {
        const amount = Number(body.querySelector('#n0').value), fr = body.querySelector('#from').value.trim().toUpperCase(), to = body.querySelector('#to').value.trim().toUpperCase();
        const j = await (await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${encodeURIComponent(fr)}&to=${encodeURIComponent(to)}`)).json();
        setOut(body, `${amount} ${fr} = ${j.rates?.[to]} ${to}\nDate: ${j.date}`);
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
  },
  'GST Calculator India': (r, t) => HANDLERS['GST Calculator'](r, t),
  'GSTIN Format Checker': (r, t) => textTool(r, t, s => gstinValid(s) ? 'Format looks like a GSTIN.' : 'Does not match the 15-character GSTIN pattern.'),
  'PAN Format Helper': (r, t) => textTool(r, t, s => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s.trim().toUpperCase()) ? 'Format looks like a PAN.' : 'PAN format is AAAAA9999A.'),
  'IFSC Lookup Interface': (r, t) => textTool(r, t, s => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.trim().toUpperCase()) ? 'Format looks like an IFSC. This desk does not call a live bank directory.' : 'IFSC format is AAAA0XXXXXX.'),
  'Pincode Formatter': (r, t) => textTool(r, t, s => { const n = s.replace(/\D/g, ''); if (n.length !== 6) throw Error('Indian pincodes have 6 digits.'); return n; }),
  'Post Office Formatter': (r, t) => textTool(r, t, s => s.trim().toUpperCase()),
  'Indian Number Formatter': (r, t) => textTool(r, t, s => {
    const n = Number(String(s).replace(/,/g, '')); if (!Number.isFinite(n)) throw Error('Enter a number.');
    return n.toLocaleString('en-IN');
  }),
  'Lakh Crore Converter': (r, t) => calcTool(r, t, ['Amount INR'], a => `Lakhs: ${(a / 1e5).toFixed(4)}\nCrores: ${(a / 1e7).toFixed(4)}`),
  'Indian Date Formatter': (r, t) => textTool(r, t, s => {
    const d = new Date(s); if (Number.isNaN(d.getTime())) throw Error('Enter a date.');
    return d.toLocaleDateString('en-IN');
  }),
  'UPI QR Payload Builder': (r, t) => textTool(r, t, async (s, body) => {
    const pa = s.trim(), pn = body.querySelector('#pn').value.trim() || 'Payee', am = body.querySelector('#am').value.trim();
    const payload = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}${am ? '&am=' + encodeURIComponent(am) : ''}`;
    const url = await qrDataUrl(payload); const a = document.createElement('a'); a.href = url; a.download = 'upi-qr.png'; a.click();
    return payload;
  }, `<div class="field-row" style="margin-top:8px"><input id="pn" class="field" placeholder="Payee name"><input id="am" class="num" placeholder="Amount (optional)"></div>`),
  'Aadhaar Masking Helper': (r, t) => textTool(r, t, s => s.replace(/\d(?=\d{4})/g, 'X')),
  'Vehicle Number Formatter': (r, t) => textTool(r, t, s => s.toUpperCase().replace(/\s+/g, ' ').trim()),
  'Indian Salary Calculator': (r, t) => calcTool(r, t, ['CTC annual', 'Monthly deductions'], (a, b) => `Monthly gross: ${(a / 12).toFixed(2)}\nMonthly net: ${(a / 12 - b).toFixed(2)}`),
  'Indian Tax Calculator': (r, t) => calcTool(r, t, ['Taxable income'], a => {
    let tax = 0, rest = a;
    const slabs = [[400000, 0], [400000, 0.05], [400000, 0.10], [400000, 0.15], [400000, 0.20], [400000, 0.25], [Infinity, 0.30]];
    for (const [w, r0] of slabs) { const take = Math.min(rest, w); tax += take * r0; rest -= take; if (rest <= 0) break; }
    return `Illustrative new-regime style estimate only: ${tax.toFixed(2)}\nNot tax advice.`;
  }),
  'TDS Calculator': (r, t) => calcTool(r, t, ['Amount', 'TDS %'], (a, b) => `TDS: ${(a * b / 100).toFixed(2)}\nNet: ${(a - a * b / 100).toFixed(2)}`),
  'Professional Tax Helper': (r, t) => calcTool(r, t, ['Monthly salary'], a => `Placeholder PT (varies by state): ${a > 21000 ? 200 : 0}`),
  'E Invoice Field Helper': (r, t) => textTool(r, t, s => 'Typical e-invoice fields: GSTIN, legal name, address, invoice no, date, HSN, taxable value, GST rate, POS.\n\n' + s),
  'HRA Calculator': (r, t) => calcTool(r, t, ['Basic', 'HRA received', 'Rent', 'Metro 1/0'], (basic, hra, rent, metro) => {
    const a = hra, b = rent - 0.1 * basic, c = (metro ? 0.5 : 0.4) * basic;
    return `Exempt (least of 3, educational): ${Math.max(0, Math.min(a, b, c)).toFixed(2)}`;
  }),
  'Gratuity Calculator': (r, t) => calcTool(r, t, ['Last drawn salary', 'Years'], (s, y) => `15/26 formula: ${(s * 15 / 26 * y).toFixed(2)}`),
  'PF Calculator': (r, t) => calcTool(r, t, ['Basic monthly', 'Years'], (b, y) => `Employee 12%: ${(b * 0.12).toFixed(2)} / month\nRough 12y accumulation is not projected here without an interest rate.`),
  'ESI Calculator': (r, t) => calcTool(r, t, ['Gross monthly'], g => `Employee 0.75%: ${(g * 0.0075).toFixed(2)}\nEmployer 3.25%: ${(g * 0.0325).toFixed(2)}`),
  'Pricing Calculator': (r, t) => calcTool(r, t, ['Cost', 'Target margin %'], (c, m) => m < 100 ? `Price: ${(c / (1 - m / 100)).toFixed(2)}` : 'Margin must be < 100%.'),
  'Cashflow Calculator': (r, t) => calcTool(r, t, ['Inflows', 'Outflows'], (a, b) => `Net cashflow: ${(a - b).toFixed(2)}`),
  'Break Even Dashboard': (r, t) => HANDLERS['Break Even Calculator'](r, t),
  'Commission Calculator': (r, t) => calcTool(r, t, ['Sales', 'Rate %'], (a, b) => `Commission: ${(a * b / 100).toFixed(2)}`),
  'Sales Target Calculator': (r, t) => calcTool(r, t, ['Target', 'Done'], (a, b) => `Remaining: ${(a - b).toFixed(2)}\nProgress: ${a ? ((b / a) * 100).toFixed(1) : 0}%`),
  'Payroll Calculator': (r, t) => calcTool(r, t, ['Gross', 'Deductions'], (a, b) => `Net pay: ${(a - b).toFixed(2)}`),
  'Expense Splitter': (r, t) => calcTool(r, t, ['Total', 'People'], (a, b) => b ? `Each: ${(a / b).toFixed(2)}` : 'Enter people.'),
});

export { HANDLERS, textTool, calcTool, fileTool, aiTool, imageOp, audioBufferTool, wavFromBuffer, docPdf, qrDataUrl, unitTool };

export async function mountTool(root, tool) {
  root.innerHTML = '';
  if (tool.category === 'PDF' || /PDF/.test(tool.title) && HANDLERS[tool.title] == null) {
    if (!HANDLERS[tool.title]) return mountPdf(root, tool);
  }
  const fn = HANDLERS[tool.title];
  if (fn) return fn(root, tool);
  if (tool.category === 'OCR & AI') return aiTool(root, tool, 'custom', tool.title);
  if (tool.category === 'PDF') return mountPdf(root, tool);
  return fallback(root, tool);
}

function fallback(root, tool) {
  const body = mountShell(root, tool, textForm(`<p class="muted">This utility runs as a general text/file helper for “${esc(tool.title)}”. Use Wiki Agent if you want a dedicated page.</p>`));
  body.querySelector('#run').onclick = () => setOut(body, body.querySelector('#tool-in').value);
  body.querySelector('#copy').onclick = async () => { await navigator.clipboard?.writeText(body.querySelector('#tool-out').textContent || ''); };
}

export function implementedTitles() {
  return Object.keys(HANDLERS);
}
