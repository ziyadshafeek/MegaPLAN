/**
 * MegaPLAN Audio Studio — Audacity-like in-browser DAW
 * Features:
 * - Open multiple audio files, each as a track
 * - Waveform display (fast downsampled canvas)
 * - Multi-track mixing, mute/solo, gain, pan, offset
 * - Trim, cut, fade in/out, normalize, reverse, gain
 * - Playback with Web Audio API, playhead, loop, zoom
 * - Export WAV always, MP3 via lamejs if available
 * - Autosave to IndexedDB + localStorage, restore on reload
 * - Modern dark UI, touch-friendly, performant
 */
import { esc, downloadBlob, mountShell, setOut, toast } from './kit.js';

const DB_NAME = 'megaplan-audio-studio';
const DB_STORE = 'tracks';
const LS_KEY = 'mp-audio-studio-project-v1';

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  try {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, key);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* ignore */ }
}
async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get(key);
      rq.onsuccess = () => { db.close(); res(rq.result); };
      rq.onerror = () => rej(rq.error);
    });
  } catch { return null; }
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
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
  }
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

// Fast waveform: downsample to min/max per pixel
function drawWaveform(canvas, buffer, opts = {}) {
  const { color = '#e8b44c', bg = '#1a1613', selection = null, playhead = null, offset = 0 } = opts;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (!buffer) return;
  const data = buffer.getChannelData(0);
  const len = data.length;
  const step = Math.max(1, Math.floor(len / w));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const start = Math.floor((x / w) * len);
    const end = Math.min(len, start + step);
    let min = 1, max = -1;
    for (let i = start; i < end; i += Math.max(1, Math.floor(step / 8))) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = (1 - (max * 0.5 + 0.5)) * h;
    const y2 = (1 - (min * 0.5 + 0.5)) * h;
    if (x === 0) ctx.moveTo(x, y1);
    ctx.lineTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
  // center line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  if (selection) {
    const [a, b] = selection;
    const xa = Math.floor((a / buffer.duration) * w);
    const xb = Math.floor((b / buffer.duration) * w);
    ctx.fillStyle = 'rgba(232,180,76,0.18)';
    ctx.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), h);
    ctx.strokeStyle = 'rgba(232,180,76,0.6)';
    ctx.strokeRect(Math.min(xa, xb), 0, Math.abs(xb - xa), h);
  }
  if (playhead != null) {
    const xp = Math.floor((playhead / buffer.duration) * w);
    ctx.fillStyle = '#c45c26';
    ctx.fillRect(xp, 0, 2, h);
  }
  if (offset) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, Math.floor((offset / buffer.duration) * w), h);
  }
}

let lameLoading = null;
async function loadLame() {
  if (window.lamejs) return window.lamejs;
  if (lameLoading) return lameLoading;
  lameLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    s.onload = () => res(window.lamejs || window.LAME || null);
    s.onerror = () => rej(new Error('lame load failed'));
    document.head.appendChild(s);
  });
  try { return await lameLoading; } catch { return null; }
}

function mixBuffers(tracks, sampleRate = 44100) {
  // find max duration
  let maxEnd = 0;
  for (const t of tracks) {
    if (t.muted) continue;
    const dur = (t.trimEnd ?? t.buffer.duration) - (t.trimStart ?? 0);
    const end = (t.offset || 0) + dur;
    if (end > maxEnd) maxEnd = end;
  }
  if (maxEnd <= 0) return null;
  const length = Math.ceil(maxEnd * sampleRate);
  const channels = 2;
  const mixed = new Float32Array(length * channels);
  for (const tr of tracks) {
    if (tr.muted) continue;
    if (tr.solo && tracks.some(x => x.solo && !x.muted && x !== tr)) {
      // if any solo exists, only soloed tracks play
      if (!tr.solo) continue;
    }
    const buf = tr.buffer;
    const srcRate = buf.sampleRate;
    const start = Math.floor((tr.trimStart || 0) * srcRate);
    const end = Math.floor((tr.trimEnd ?? buf.duration) * srcRate);
    const gain = tr.gain ?? 1;
    const pan = tr.pan ?? 0; // -1 left, 1 right
    const leftGain = gain * (pan <= 0 ? 1 : 1 - pan);
    const rightGain = gain * (pan >= 0 ? 1 : 1 + pan);
    const offsetSamples = Math.floor((tr.offset || 0) * sampleRate);
    // resample if needed (simple linear)
    const srcLen = end - start;
    const destLen = Math.floor((srcLen / srcRate) * sampleRate);
    for (let c = 0; c < Math.min(buf.numberOfChannels, 2); c++) {
      const src = buf.getChannelData(c);
      for (let i = 0; i < destLen; i++) {
        const srcIdx = start + Math.floor((i / destLen) * srcLen);
        const v = src[srcIdx] || 0;
        const destIdx = offsetSamples + i;
        if (destIdx >= length) break;
        if (c === 0) {
          mixed[destIdx * 2] += v * leftGain;
          if (buf.numberOfChannels === 1) mixed[destIdx * 2 + 1] += v * rightGain;
        } else {
          mixed[destIdx * 2 + 1] += v * rightGain;
        }
      }
    }
    // if mono, duplicate already handled
    if (buf.numberOfChannels === 1) {
      // mono already added to both via left/right
    }
  }
  // clamp
  for (let i = 0; i < mixed.length; i++) {
    if (mixed[i] > 1) mixed[i] = 1;
    if (mixed[i] < -1) mixed[i] = -1;
  }
  // convert to AudioBuffer-like object
  return { data: mixed, length, sampleRate, channels };
}

function mixedToWavBlob(mixed) {
  const { data, length, sampleRate, channels } = mixed;
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
  }
  const out = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(out);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, pcm.byteLength, true);
  new Uint8Array(out, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([out], { type: 'audio/wav' });
}

async function mixedToMp3Blob(mixed, kbps = 192) {
  const lame = await loadLame();
  if (!lame) throw Error('MP3 encoder not loaded');
  // lamejs expects 16-bit PCM
  const { data, sampleRate, channels } = mixed;
  // split interleaved to left/right
  const len = data.length / channels;
  const left = new Int16Array(len);
  const right = channels === 2 ? new Int16Array(len) : null;
  for (let i = 0; i < len; i++) {
    left[i] = Math.max(-32768, Math.min(32767, Math.floor(data[i * channels] * 32767)));
    if (right) right[i] = Math.max(-32768, Math.min(32767, Math.floor(data[i * channels + 1] * 32767)));
  }
  const MP3Encoder = lame.Mp3Encoder || lame.Mp3Encoder;
  const enc = new MP3Encoder(channels, sampleRate, kbps);
  const block = 1152;
  const mp3Data = [];
  for (let i = 0; i < len; i += block) {
    const l = left.subarray(i, i + block);
    const r = right ? right.subarray(i, i + block) : null;
    const buf = enc.encodeBuffer(l, r);
    if (buf.length) mp3Data.push(buf);
  }
  const end = enc.flush();
  if (end.length) mp3Data.push(end);
  return new Blob(mp3Data, { type: 'audio/mpeg' });
}

export function mountAudioStudio(root, tool) {
  const id = 'as-' + Math.random().toString(36).slice(2, 8);
  root.innerHTML = `
  <div class="tool-pane" style="padding:0;overflow:hidden;display:flex;flex-direction:column;min-height:72vh">
    <div style="padding:16px 18px 10px;background:#1c1916;color:#f4efe6;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
      <div>
        <div class="tool-kicker" style="color:#cbbba8">AUDIO · STUDIO · MULTI-TRACK</div>
        <h1 style="margin:4px 0 2px;font-size:22px;letter-spacing:-.03em">${esc(tool.title)}</h1>
        <p class="lede" style="margin:0;color:#cbbba8;max-width:60ch">Audacity-style editor in your browser. Import, stack, trim, fade, mix, export MP3/WAV. Files stay on this device. Autosaves to this browser.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" id="${id}-add" style="background:#2a241f;color:#f4efe6;border:1px solid #3a322c">+ Add audio</button>
        <button class="btn secondary" id="${id}-rec" style="background:#2a241f;color:#f4efe6">● Record</button>
        <button class="btn secondary" id="${id}-save">Save project</button>
        <button class="btn secondary" id="${id}-load">Load</button>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;background:#211c18;border-top:1px solid #2d2722;border-bottom:1px solid #2d2722;align-items:center">
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn primary" id="${id}-play" style="min-width:84px">▶ Play</button>
        <button class="btn ghost" id="${id}-stop" style="color:#f4efe6;border-color:#3a322c">■ Stop</button>
        <label style="color:#cbbba8;font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="${id}-loop"> Loop</label>
      </div>
      <div style="display:flex;gap:8px;align-items:center;color:#cbbba8;font-size:12px">
        <span id="${id}-time">00:00.0 / 00:00.0</span>
        <input type="range" id="${id}-zoom" min="0.5" max="4" step="0.25" value="1" style="width:90px">
        <span>Zoom</span>
      </div>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn ghost" id="${id}-mix-wav" style="color:#f4efe6;border-color:#3a322c">Export WAV</button>
        <button class="btn primary" id="${id}-mix-mp3">Export MP3</button>
        <button class="btn secondary" id="${id}-mix-clear" style="background:#3a2220;color:#ffd7c2">Clear all</button>
      </div>
    </div>

    <div style="flex:1;overflow:auto;background:#efe6d8;display:flex;flex-direction:column;gap:0" id="${id}-tracks"></div>

    <div style="padding:8px 12px;background:#f4efe6;border-top:1px solid #e0d5c4;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:#6e655b">
      <span id="${id}-status">Idle. Import audio to begin. Autosave every 5s.</span>
      <span style="margin-left:auto">Tip: drag on waveform to select, then Trim/Cut/Fade. Pan and Gain per track. Mix exports the timeline.</span>
    </div>
    <div id="${id}-drop" style="display:none;position:absolute;inset:0;background:rgba(28,25,22,.72);color:#fffaf2;place-items:center;font-size:18px;font-weight:800;z-index:20">Drop audio files to add tracks</div>
  </div>
  <style>
    .as-track { display:grid; grid-template-columns: 240px 1fr; gap:0; border-bottom:1px solid #e0d5c4; background:#fffaf2; }
    .as-track-head { padding:10px 10px; background:#fbf6ee; border-right:1px solid #e0d5c4; display:flex; flex-direction:column; gap:8px; }
    .as-wave { position:relative; background:#1a1613; overflow:hidden; min-height:92px; display:grid; }
    .as-wave canvas { width:100%; height:92px; display:block; }
    .as-controls { display:flex; gap:6px; flex-wrap:wrap; }
    .as-controls .btn { font-size:11px; padding:6px 8px; }
    .as-slider { width:100%; }
    .as-meta { font-size:11px; color:#8a7f72; }
    @media (max-width: 840px) {
      .as-track { grid-template-columns: 1fr; }
      .as-track-head { border-right:0; border-bottom:1px solid #e0d5c4; }
    }
  </style>
  `;

  const $ = sel => root.querySelector('#' + id + '-' + sel);
  const tracksEl = $(`tracks`);
  const statusEl = $(`status`);
  const timeEl = $(`time`);
  const playBtn = $(`play`);
  const stopBtn = $(`stop`);
  const loopCb = $(`loop`);
  const zoomEl = $(`zoom`);

  let ac = null;
  let tracks = [];
  let isPlaying = false;
  let playStartTime = 0;
  let playOffset = 0;
  let scheduled = [];
  let raf = null;
  let dirty = false;
  let zoom = 1;

  function ensureAC() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function uid() { return Math.random().toString(36).slice(2, 9); }

  function fmt(t) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `${String(m).padStart(2, '0')}:${s}`;
  }

  function updateTimeDisplay() {
    const maxDur = tracks.reduce((m, tr) => Math.max(m, (tr.offset || 0) + (tr.trimEnd ?? tr.buffer.duration) - (tr.trimStart ?? 0)), 0);
    const cur = isPlaying ? (ac.currentTime - playStartTime + playOffset) : playOffset;
    timeEl.textContent = `${fmt(cur)} / ${fmt(maxDur)}`;
  }

  function setStatus(s) { statusEl.textContent = s; }

  function createTrackFromBuffer(name, buffer) {
    const tr = {
      id: uid(),
      name: name || 'Track ' + (tracks.length + 1),
      buffer,
      gain: 1,
      pan: 0,
      muted: false,
      solo: false,
      offset: 0,
      trimStart: 0,
      trimEnd: buffer.duration,
      selection: null,
      color: ['#e8b44c', '#c45c26', '#2c9b6a', '#7a4bb5', '#b13a6b', '#2b6cb0'][tracks.length % 6]
    };
    tracks.push(tr);
    dirty = true;
    renderTracks();
    saveProjectDebounced();
    setStatus(`Added ${name} · ${buffer.duration.toFixed(2)}s · ${buffer.sampleRate}Hz`);
  }

  async function importFiles(files) {
    ensureAC();
    for (const f of files) {
      try {
        setStatus(`Decoding ${f.name}…`);
        const buf = await ac.decodeAudioData(await f.arrayBuffer());
        createTrackFromBuffer(f.name, buf);
        // store in idb
        await idbSet('buf-' + tracks[tracks.length - 1].id, f);
      } catch (e) {
        setStatus(`Failed ${f.name}: ${e.message}`);
      }
    }
  }

  function renderTracks() {
    tracksEl.innerHTML = '';
    if (!tracks.length) {
      tracksEl.innerHTML = `<div style="padding:32px 18px;text-align:center;color:#8a7f72">
        <div style="font-size:42px">♫</div>
        <p style="margin:12px 0 6px;font-weight:700">No tracks yet</p>
        <p class="muted">Click + Add audio or drop files. Each file becomes a track you can move, trim, fade, and mix.</p>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <span class="file-chip">MP3, WAV, OGG, M4A, FLAC (if browser can decode)</span>
          <span class="file-chip">Multi-track mixing</span>
          <span class="file-chip">Waves + export</span>
        </div>
      </div>`;
      updateTimeDisplay();
      return;
    }
    tracks.forEach((tr, idx) => {
      const div = document.createElement('div');
      div.className = 'as-track';
      div.innerHTML = `
        <div class="as-track-head">
          <div style="display:flex;gap:6px;align-items:center;justify-content:space-between">
            <input class="field" value="${esc(tr.name)}" data-name style="font-size:12px;padding:6px 8px;flex:1">
            <button class="btn ghost" data-del style="font-size:11px;padding:6px 8px">✕</button>
          </div>
          <div class="as-controls">
            <button class="btn ${tr.muted ? 'primary' : 'secondary'}" data-mute style="${tr.muted ? 'background:#a33b3b;color:#fff' : ''}">${tr.muted ? 'Muted' : 'Mute'}</button>
            <button class="btn ${tr.solo ? 'primary' : 'ghost'}" data-solo style="${tr.solo ? 'background:#e8b44c;color:#1c1916' : ''}">${tr.solo ? 'Solo' : 'Solo'}</button>
            <button class="btn ghost" data-dup>Duplicate</button>
          </div>
          <label class="as-meta">Gain <input type="range" min="0" max="1.5" step="0.02" value="${tr.gain}" data-gain class="as-slider"></label>
          <label class="as-meta">Pan <input type="range" min="-1" max="1" step="0.05" value="${tr.pan}" data-pan class="as-slider"></label>
          <label class="as-meta">Offset s <input type="number" step="0.1" value="${tr.offset}" data-offset class="num" style="padding:4px 6px;font-size:12px"></label>
          <div class="as-meta">${tr.buffer.duration.toFixed(2)}s · ${tr.buffer.sampleRate}Hz · ${tr.buffer.numberOfChannels}ch · Trim ${tr.trimStart.toFixed(2)}–${tr.trimEnd.toFixed(2)}s</div>
          <div class="as-controls">
            <button class="btn ghost" data-trim>Trim to selection</button>
            <button class="btn ghost" data-cut>Cut sel</button>
            <button class="btn ghost" data-fadein>Fade in sel</button>
            <button class="btn ghost" data-fadeout>Fade out sel</button>
            <button class="btn ghost" data-norm>Normalize</button>
            <button class="btn ghost" data-rev>Reverse</button>
            <button class="btn ghost" data-reset>Reset trim</button>
          </div>
        </div>
        <div class="as-wave"><canvas data-canvas></canvas></div>
      `;
      tracksEl.appendChild(div);
      const canvas = div.querySelector('[data-canvas]');
      const draw = () => {
        const cur = isPlaying ? (ac ? ac.currentTime - playStartTime + playOffset : playOffset) : playOffset;
        const rel = cur - (tr.offset || 0);
        drawWaveform(canvas, tr.buffer, {
          color: tr.color,
          bg: '#1a1613',
          selection: tr.selection,
          playhead: rel >= 0 && rel <= tr.buffer.duration ? rel : null,
          offset: tr.trimStart
        });
      };
      draw();
      tr._draw = draw;
      // interactions
      let isDragging = false;
      canvas.addEventListener('pointerdown', e => {
        isDragging = true;
        canvas.setPointerCapture(e.pointerId);
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = (x / rect.width) * tr.buffer.duration;
        tr.selection = [t, t];
        draw();
      });
      canvas.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = Math.max(0, Math.min(tr.buffer.duration, (x / rect.width) * tr.buffer.duration));
        if (tr.selection) tr.selection[1] = t;
        draw();
      });
      canvas.addEventListener('pointerup', () => { isDragging = false; dirty = true; saveProjectDebounced(); });
      canvas.addEventListener('click', e => {
        if (tr.selection && Math.abs(tr.selection[0] - tr.selection[1]) < 0.02) {
          // treat as seek if not dragging selection
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const t = (x / rect.width) * tr.buffer.duration + (tr.offset || 0);
          playOffset = t;
          updateTimeDisplay();
          tracks.forEach(x => x._draw && x._draw());
        }
      });

      div.querySelector('[data-name]').addEventListener('change', e => { tr.name = e.target.value; dirty = true; saveProjectDebounced(); });
      div.querySelector('[data-del]').onclick = () => { tracks = tracks.filter(x => x !== tr); dirty = true; renderTracks(); saveProjectDebounced(); };
      div.querySelector('[data-mute]').onclick = () => { tr.muted = !tr.muted; dirty = true; renderTracks(); };
      div.querySelector('[data-solo]').onclick = () => { tr.solo = !tr.solo; dirty = true; renderTracks(); };
      div.querySelector('[data-dup]').onclick = () => {
        const copy = { ...tr, id: uid(), name: tr.name + ' copy', buffer: tr.buffer, _draw: null };
        tracks.splice(idx + 1, 0, copy);
        dirty = true; renderTracks(); saveProjectDebounced();
      };
      div.querySelector('[data-gain]').oninput = e => { tr.gain = parseFloat(e.target.value); dirty = true; saveProjectDebounced(); };
      div.querySelector('[data-pan]').oninput = e => { tr.pan = parseFloat(e.target.value); dirty = true; saveProjectDebounced(); };
      div.querySelector('[data-offset]').onchange = e => { tr.offset = parseFloat(e.target.value) || 0; dirty = true; saveProjectDebounced(); updateTimeDisplay(); };

      div.querySelector('[data-trim]').onclick = () => {
        if (!tr.selection) return;
        const [a, b] = tr.selection.slice().sort((x, y) => x - y);
        if (Math.abs(b - a) < 0.01) return;
        tr.trimStart = Math.max(0, Math.min(a, b));
        tr.trimEnd = Math.max(tr.trimStart + 0.01, Math.min(tr.buffer.duration, Math.max(a, b)));
        tr.selection = null;
        dirty = true; renderTracks(); saveProjectDebounced();
      };
      div.querySelector('[data-cut]').onclick = () => {
        if (!tr.selection) return;
        const [a, b] = tr.selection.slice().sort((x, y) => x - y);
        // For simplicity, trim out selection by splitting into two tracks (keep before and after)
        const beforeDur = a - tr.trimStart;
        const afterDur = tr.trimEnd - b;
        if (beforeDur > 0.02 && afterDur > 0.02) {
          // create new track for after part
          const newTr = { ...tr, id: uid(), name: tr.name + ' (after cut)', trimStart: b, trimEnd: tr.trimEnd, offset: (tr.offset || 0) + (b - tr.trimStart), _draw: null };
          tr.trimEnd = a;
          tracks.splice(idx + 1, 0, newTr);
        } else if (beforeDur <= 0.02) {
          tr.trimStart = b;
        } else {
          tr.trimEnd = a;
        }
        tr.selection = null;
        dirty = true; renderTracks(); saveProjectDebounced();
      };
      div.querySelector('[data-fadein]').onclick = () => {
        const [a, b] = tr.selection ? tr.selection.slice().sort((x, y) => x - y) : [tr.trimStart, tr.trimStart + 1.5];
        applyFade(tr, a, b, 'in');
      };
      div.querySelector('[data-fadeout]').onclick = () => {
        const [a, b] = tr.selection ? tr.selection.slice().sort((x, y) => x - y) : [tr.trimEnd - 1.5, tr.trimEnd];
        applyFade(tr, a, b, 'out');
      };
      div.querySelector('[data-norm]').onclick = () => {
        let peak = 0;
        for (let c = 0; c < tr.buffer.numberOfChannels; c++) {
          const d = tr.buffer.getChannelData(c);
          for (let i = Math.floor(tr.trimStart * tr.buffer.sampleRate); i < Math.floor(tr.trimEnd * tr.buffer.sampleRate); i++) peak = Math.max(peak, Math.abs(d[i] || 0));
        }
        const g = peak ? 0.95 / peak : 1;
        for (let c = 0; c < tr.buffer.numberOfChannels; c++) {
          const d = tr.buffer.getChannelData(c);
          for (let i = Math.floor(tr.trimStart * tr.buffer.sampleRate); i < Math.floor(tr.trimEnd * tr.buffer.sampleRate); i++) d[i] *= g;
        }
        dirty = true; tr._draw && tr._draw(); saveProjectDebounced(); setStatus(`Normalized ×${g.toFixed(3)}`);
      };
      div.querySelector('[data-rev]').onclick = () => {
        for (let c = 0; c < tr.buffer.numberOfChannels; c++) {
          const d = tr.buffer.getChannelData(c);
          const s = Math.floor(tr.trimStart * tr.buffer.sampleRate);
          const e = Math.floor(tr.trimEnd * tr.buffer.sampleRate);
          const seg = d.slice(s, e);
          seg.reverse();
          d.set(seg, s);
        }
        dirty = true; tr._draw && tr._draw(); saveProjectDebounced();
      };
      div.querySelector('[data-reset]').onclick = () => { tr.trimStart = 0; tr.trimEnd = tr.buffer.duration; tr.selection = null; dirty = true; renderTracks(); saveProjectDebounced(); };
    });
    updateTimeDisplay();
  }

  function applyFade(tr, a, b, type) {
    a = Math.max(tr.trimStart, Math.min(a, b));
    b = Math.min(tr.trimEnd, Math.max(a, b));
    if (b - a < 0.01) return;
    const sr = tr.buffer.sampleRate;
    const sa = Math.floor(a * sr), sb = Math.floor(b * sr);
    const len = sb - sa;
    for (let c = 0; c < tr.buffer.numberOfChannels; c++) {
      const d = tr.buffer.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = type === 'in' ? i / len : 1 - i / len;
        d[sa + i] *= t;
      }
    }
    dirty = true; tr._draw && tr._draw(); saveProjectDebounced(); setStatus(`${type === 'in' ? 'Fade in' : 'Fade out'} ${a.toFixed(2)}–${b.toFixed(2)}s`);
  }

  function stopPlayback() {
    isPlaying = false;
    playBtn.textContent = '▶ Play';
    scheduled.forEach(s => { try { s.stop(); } catch {} });
    scheduled = [];
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (ac) {
      // keep ac
    }
  }

  function play() {
    if (!tracks.length) return;
    ensureAC();
    if (isPlaying) { pause(); return; }
    stopPlayback();
    isPlaying = true;
    playBtn.textContent = '⏸ Pause';
    const now = ac.currentTime;
    playStartTime = now;
    const cur = playOffset;
    // schedule each track
    const anySolo = tracks.some(t => t.solo && !t.muted);
    tracks.forEach(tr => {
      if (tr.muted) return;
      if (anySolo && !tr.solo) return;
      const src = ac.createBufferSource();
      src.buffer = tr.buffer;
      const gainNode = ac.createGain();
      gainNode.gain.value = tr.gain;
      const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (panner) panner.pan.value = tr.pan;
      src.connect(panner || gainNode);
      if (panner) panner.connect(gainNode);
      gainNode.connect(ac.destination);
      const trimStart = tr.trimStart || 0;
      const trimDur = (tr.trimEnd ?? tr.buffer.duration) - trimStart;
      const trackOffset = tr.offset || 0;
      // when should this track start relative to now?
      const startAt = Math.max(0, trackOffset - cur);
      const offsetInBuffer = Math.max(0, cur - trackOffset) + trimStart;
      const remaining = Math.max(0, trimDur - Math.max(0, cur - trackOffset));
      if (remaining <= 0.001) return;
      try {
        src.start(now + startAt, offsetInBuffer, remaining);
        scheduled.push(src);
      } catch {}
    });
    // loop to update UI
    const tick = () => {
      if (!isPlaying) return;
      updateTimeDisplay();
      tracks.forEach(t => t._draw && t._draw());
      const maxDur = tracks.reduce((m, tr) => Math.max(m, (tr.offset || 0) + (tr.trimEnd ?? tr.buffer.duration) - (tr.trimStart ?? 0)), 0);
      const curTime = ac.currentTime - playStartTime + playOffset;
      if (curTime >= maxDur) {
        if (loopCb.checked) {
          playOffset = 0;
          play();
        } else {
          stopPlayback();
          playOffset = maxDur;
          updateTimeDisplay();
          tracks.forEach(t => t._draw && t._draw());
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!isPlaying) return;
    const cur = ac.currentTime - playStartTime + playOffset;
    playOffset = cur;
    stopPlayback();
    updateTimeDisplay();
    tracks.forEach(t => t._draw && t._draw());
  }

  function stop() {
    stopPlayback();
    playOffset = 0;
    updateTimeDisplay();
    tracks.forEach(t => t._draw && t._draw());
  }

  async function exportWAV() {
    if (!tracks.length) return setStatus('No tracks to export');
    setStatus('Mixing…');
    try {
      ensureAC();
      const sr = ac ? ac.sampleRate : 44100;
      const mixed = mixBuffers(tracks, sr);
      if (!mixed) return setStatus('Nothing to mix (all muted?)');
      const blob = mixedToWavBlob(mixed);
      downloadBlob(blob, 'megaplan-mix.wav');
      setStatus(`Exported WAV · ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) { setStatus('Export failed: ' + e.message); }
  }

  async function exportMP3() {
    if (!tracks.length) return setStatus('No tracks');
    setStatus('Mixing + encoding MP3… (first time loads encoder)');
    try {
      ensureAC();
      const sr = ac ? ac.sampleRate : 44100;
      const mixed = mixBuffers(tracks, sr);
      if (!mixed) return setStatus('Nothing to mix');
      const blob = await mixedToMp3Blob(mixed, 192);
      downloadBlob(blob, 'megaplan-mix.mp3');
      setStatus(`Exported MP3 · ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (e) {
      setStatus('MP3 failed: ' + e.message + ' — falling back to WAV');
      await exportWAV();
    }
  }

  // autosave
  let saveTimer = null;
  function saveProjectDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProject, 800);
  }
  async function saveProject() {
    try {
      const proj = {
        tracks: tracks.map(t => ({
          id: t.id, name: t.name, gain: t.gain, pan: t.pan, muted: t.muted, solo: t.solo, offset: t.offset, trimStart: t.trimStart, trimEnd: t.trimEnd, duration: t.buffer.duration, sampleRate: t.buffer.sampleRate, channels: t.buffer.numberOfChannels
        })),
        playOffset,
        savedAt: Date.now()
      };
      localStorage.setItem(LS_KEY, JSON.stringify(proj));
      // save buffers metadata already in idb as files? For quick restore we try to keep buffers in idb
      // we already stored original files on import, but edited buffers need saving too
      for (const tr of tracks) {
        try {
          // store buffer as wav blob in idb for recovery
          const blob = wavFromBuffer(tr.buffer, 0, tr.buffer.duration);
          await idbSet('bufdata-' + tr.id, blob);
        } catch {}
      }
      dirty = false;
      setStatus('Autosaved at ' + new Date().toLocaleTimeString());
    } catch (e) { /* ignore */ }
  }

  async function loadProject() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return setStatus('No saved project found');
      const proj = JSON.parse(raw);
      setStatus('Restoring project…');
      ensureAC();
      const restored = [];
      for (const meta of proj.tracks) {
        try {
          let blob = await idbGet('bufdata-' + meta.id);
          if (!blob) blob = await idbGet('buf-' + meta.id);
          if (!blob) continue;
          const buf = await ac.decodeAudioData(await blob.arrayBuffer());
          restored.push({
            id: meta.id, name: meta.name, buffer: buf, gain: meta.gain, pan: meta.pan, muted: meta.muted, solo: meta.solo, offset: meta.offset, trimStart: meta.trimStart, trimEnd: Math.min(meta.trimEnd, buf.duration), selection: null, color: '#e8b44c'
          });
        } catch {}
      }
      if (restored.length) {
        tracks = restored;
        playOffset = proj.playOffset || 0;
        renderTracks();
        setStatus(`Restored ${restored.length} track(s) from ${new Date(proj.savedAt).toLocaleTimeString()}`);
      } else {
        setStatus('Saved project had no recoverable audio. Import files again.');
      }
    } catch (e) { setStatus('Load failed: ' + e.message); }
  }

  // recording
  let recStream = null, recRecorder = null, recChunks = [];
  async function toggleRecord() {
    if (recRecorder && recRecorder.state === 'recording') {
      recRecorder.stop();
      return;
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recRecorder = new MediaRecorder(recStream);
      recChunks = [];
      recRecorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
      recRecorder.onstop = async () => {
        const blob = new Blob(recChunks, { type: 'audio/webm' });
        recStream.getTracks().forEach(t => t.stop());
        recStream = null;
        ensureAC();
        try {
          const buf = await ac.decodeAudioData(await blob.arrayBuffer());
          createTrackFromBuffer('Recording ' + new Date().toLocaleTimeString(), buf);
          setStatus('Recording added as track');
        } catch (e) { setStatus('Recording decode failed: ' + e.message); }
        $('rec').textContent = '● Record';
      };
      recRecorder.start();
      $('rec').textContent = '■ Stop rec';
      setStatus('Recording… click again to stop');
    } catch (e) { setStatus('Mic error: ' + e.message); }
  }

  // bindings
  $('add').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true;
    inp.onchange = () => importFiles([...inp.files]);
    inp.click();
  };
  $('rec').onclick = toggleRecord;
  $('save').onclick = saveProject;
  $('load').onclick = loadProject;
  $('play').onclick = play;
  $('stop').onclick = stop;
  $('mix-wav').onclick = exportWAV;
  $('mix-mp3').onclick = exportMP3;
  $('mix-clear').onclick = () => {
    if (!confirm('Clear all tracks?')) return;
    stopPlayback();
    tracks = [];
    playOffset = 0;
    renderTracks();
    localStorage.removeItem(LS_KEY);
    setStatus('Cleared');
  };
  zoomEl.oninput = () => { zoom = parseFloat(zoomEl.value); renderTracks(); };

  // drag & drop
  const dropZone = root.querySelector('#' + id + '-drop');
  const pane = root.querySelector('.tool-pane');
  pane.style.position = 'relative';
  pane.addEventListener('dragenter', e => { e.preventDefault(); dropZone.style.display = 'grid'; });
  pane.addEventListener('dragover', e => { e.preventDefault(); });
  pane.addEventListener('dragleave', e => { if (!pane.contains(e.relatedTarget)) dropZone.style.display = 'none'; });
  pane.addEventListener('drop', e => {
    e.preventDefault(); dropZone.style.display = 'none';
    const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(f.name));
    if (files.length) importFiles(files);
  });

  // keyboard shortcuts
  root.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); play(); }
  });

  // autosave interval
  setInterval(() => { if (dirty) saveProject(); }, 5000);

  // initial
  renderTracks();
  setStatus('Ready. Import audio, stack tracks, drag to select, then export. Autosave enabled.');

  // try restore if exists
  if (localStorage.getItem(LS_KEY)) {
    setTimeout(() => { if (confirm('Restore last audio studio project?')) loadProject(); }, 400);
  }
}
