/**
 * MegaPLAN video engine.
 *
 * Fourteen of the video tools used to share one handler that printed "re-encoding
 * needs a heavier encoder than this page ships", and "Extract Frames" and
 * "Video to GIF" handed back a single JPEG named `frame.jpg` — neither extracted
 * frames nor made a GIF.
 *
 * Everything here is done in the browser with the platform's own decoders and
 * `MediaRecorder`, so no encoder is downloaded and nothing is uploaded:
 *
 *   extract frames  seek to chosen times, draw each to a canvas, zip them
 *   trim / cut      record only the segment asked for
 *   mute            record the canvas stream with no audio track
 *   resize / crop   draw at the size asked for
 *   rotate          draw with a rotation
 *   compress        record smaller and at a lower bit rate
 *   merge           one recording, several sources in turn
 *   convert         same, recording in the container the browser supports
 *   extract audio   decode to WAV where possible, otherwise capture live
 *   video to GIF    a real GIF89a encoder below, not a JPEG
 *
 * The pure half of the file — the planner, the geometry, the GIF encoder — has no
 * DOM dependency and is covered directly by `tests/ai-mode-video.mjs`.
 */

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

/**
 * Picks a container the browser can actually record. The list is in order of
 * preference; `isTypeSupported` is injectable so this is testable in Node.
 */
export function pickRecorderType(isSupported, kinds = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
  for (const type of kinds) if (isSupported(type)) return type;
  return null;
}

export function pickAudioType(isSupported, kinds = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
  for (const type of kinds) if (isSupported(type)) return type;
  return null;
}

/** The file extension a recorded container should be saved with. */
export function extensionFor(mimeType = '') {
  if (/mp4/i.test(mimeType)) return 'mp4';
  if (/ogg/i.test(mimeType)) return 'ogv';
  return 'webm';
}

/**
 * Where to grab frames from. Evenly spread, never the very last instant (many
 * decoders report a black frame there) and never before the start.
 */
export function frameTimestamps(duration, { count = 8, from = 0, to = null, skipLast = 0.04 } = {}) {
  const end = Math.min(Number.isFinite(to) ? to : duration, duration);
  const start = Math.max(0, Number(from) || 0);
  const span = end - start;
  if (!(span > 0)) return [];
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (n === 1) return [Math.min(start + span / 2, end - skipLast)];
  return Array.from({ length: n }, (_, i) => {
    const t = start + (span * i) / (n - 1);
    return Number(Math.min(Math.max(t, start), end - skipLast).toFixed(3));
  });
}

/**
 * Where the picture sits in the output frame.
 * `contain` keeps everything and adds bars; `cover` fills and crops the excess.
 */
export function fitBox(source, target, mode = 'contain') {
  const sw = Math.max(1, Number(source?.w) || 1), sh = Math.max(1, Number(source?.h) || 1);
  const tw = Math.max(1, Math.round(Number(target?.w) || 1)), th = Math.max(1, Math.round(Number(target?.h) || 1));
  const scale = mode === 'cover'
    ? Math.max(tw / sw, th / sh)
    : Math.min(tw / sw, th / sh);
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  return {
    w, h,
    dx: Math.round((tw - w) / 2),
    dy: Math.round((th - h) / 2),
    mode,
    // The source rectangle that survives a `cover` crop.
    crop: mode === 'cover' ? { x: Math.round((sw - tw / scale) / 2), y: Math.round((sh - th / scale) / 2), w: Math.round(tw / scale), h: Math.round(th / scale) } : null
  };
}

/** Even dimensions: some encoders refuse odd widths. */
export function evenSize(n) { const v = Math.max(2, Math.round(Number(n) || 2)); return v % 2 ? v + 1 : v; }

/** A size that fits inside a box while keeping the aspect ratio. */
export function scaleToFit(source, maxW, maxH) {
  const sw = Math.max(1, Number(source?.w) || 1), sh = Math.max(1, Number(source?.h) || 1);
  const k = Math.min((maxW || sw) / sw, (maxH || sh) / sh);
  return { w: evenSize(sw * k), h: evenSize(sh * k) };
}

/** Draw transform for a rotation in degrees, scaled to fit inside the frame. */
export function rotationPlan(degrees, source, target) {
  const deg = ((Math.round(Number(degrees) || 0) % 360) + 360) % 360;
  if (deg === 0) return { deg: 0, ...fitBox(source, target, 'contain') };
  const swapped = deg === 90 || deg === 270;
  const w = evenSize(swapped ? (target?.h || source?.h) : (target?.w || source?.w));
  const h = evenSize(swapped ? (target?.w || source?.w) : (target?.h || source?.h));
  return { deg, swapped, w, h, ...fitBox(swapped ? { w: source.h, h: source.w } : source, { w, h }, 'contain') };
}

/** Rough output size, so the UI can say what to expect before recording. */
export function estimateBytes({ seconds, width, height, fps = 30, bitrate }) {
  const rate = Number(bitrate) > 0 ? Number(bitrate) : width * height * fps * 0.12;
  return Math.max(0, Math.round((Number(seconds) || 0) * rate / 8));
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Frames per second to record at, capped so the encoder keeps up. */
export function chooseFps(sourceFps, wanted, { max = 30, min = 1 } = {}) {
  const f = Number(wanted) > 0 ? Number(wanted) : Number(sourceFps) || 25;
  return Math.max(min, Math.min(max, Math.round(f)));
}

/**
 * The plan for a whole job: which clips, in what order, with what settings.
 * Pure, so the tool list and the tests can both read it.
 */
export function planJob({
  files = [], kind = 'trim', start = null, end = null, width = null, height = null,
  mode = 'contain', rotate = 0, fps = null, bitrate = null, frameCount = 8, from = 0, to = null,
  sourceSize = { w: 1280, h: 720 }, sourceFps = 25, sourceDuration = 0
} = {}) {
  const size = { w: width || sourceSize.w, h: height || sourceSize.h };
  const frame = rotationPlan(rotate, sourceSize, size);
  const out = { w: frame.w, h: frame.h };
  const seconds = Math.max(0, (end == null ? sourceDuration : end) - (start == null ? 0 : start));
  const recordFps = chooseFps(sourceFps, fps);
  const bitRate = Number(bitrate) > 0 ? Number(bitrate) : 0;
  const clips = files.map((f, i) => ({
    index: i,
    name: typeof f === 'string' ? f : f?.name,
    start: start == null ? 0 : start,
    end: end == null ? sourceDuration : end
  }));
  return {
    kind,
    clips,
    out,
    rotate: frame.deg,
    fit: frame,
    fps: recordFps,
    bitRate,
    seconds,
    estimatedBytes: estimateBytes({ seconds: seconds * Math.max(1, clips.length), width: out.w, height: out.h, fps: recordFps, bitrate: bitRate }),
    frames: frameTimestamps(sourceDuration, { count: frameCount, from, to })
  };
}

/* ------------------------------------------------------------------ *
 * GIF89a encoder
 * ------------------------------------------------------------------ */

const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // "GIF89a"

/**
 * A colour table for the GIF. GIF only allows a power-of-two table of at most
 * 256 colours, so this is a 6x6x6 cube (216 colours) padded out to 256, with
 * the colours that actually appear in the frame put first so the common ones do
 * not drift.
 */
export function buildPalette(samples, levels = 6) {
  const n = Math.max(2, Math.min(6, Math.round(levels)));
  const step = 255 / (n - 1);
  const used = new Set();
  for (let i = 0; i + 2 < samples.length + 1; i += 3) {
    if (i + 2 >= samples.length) break;
    used.add(`${Math.round(samples[i] / step)},${Math.round(samples[i + 1] / step)},${Math.round(samples[i + 2] / step)}`);
  }
  const palette = new Uint8Array(256 * 3);
  let at = 0;
  const put = (r, g, b) => { palette[at++] = r; palette[at++] = g; palette[at++] = b; };
  for (const key of used) {
    if (at >= 768) break;
    const [r, g, b] = key.split(',').map(v => Math.round(Number(v) * step));
    put(Math.min(255, r), Math.min(255, g), Math.min(255, b));
  }
  for (let r = 0; r < n && at < 768; r++) {
    for (let g = 0; g < n && at < 768; g++) {
      for (let b = 0; b < n && at < 768; b++) put(Math.round(r * step), Math.round(g * step), Math.round(b * step));
    }
  }
  while (at < 768) put(0, 0, 0);
  return { palette, levels: n };
}

// A 4x4 Bayer matrix. Quantising to 216 colours bands badly on gradients; a
// half-pixel-scale ordered dither costs nothing and removes most of the rings.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Nearest colour in the table, as a GIF index. */
export function nearestIndex(palette, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 768; i += 3) {
    const dr = r - palette[i], dg = g - palette[i + 1], db = b - palette[i + 2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i / 3; if (d === 0) break; }
  }
  return best;
}

/** GIF's variable-width LZW, written out little-endian in sub-blocks. */
export function lzwEncode(indices, minCodeSize = 8) {
  if (!indices.length) return [0];
  const clear = 1 << minCodeSize, end = clear + 1;
  const maxCode = 1 << 12;
  let codeSize = minCodeSize + 1, next = end + 1, dict = new Map();
  const bytes = [];
  let bitBuf = 0, bitCount = 0;
  const writeCode = code => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) { bytes.push(bitBuf & 0xff); bitBuf >>>= 8; bitCount -= 8; }
  };
  const resetTable = () => { dict = new Map(); codeSize = minCodeSize + 1; next = end + 1; };

  writeCode(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix + ',' + k;
    // Already a known sequence: extend it. Nothing is emitted and — this is
    // the part that matters — nothing new enters the table, or the table here
    // and the table in the decoder drift apart and the image decodes as noise.
    if (dict.has(key)) { prefix = dict.get(key); continue; }
    writeCode(prefix);
    if (next < maxCode) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      writeCode(clear);
      resetTable();
    }
    prefix = k;
  }
  writeCode(prefix);
  writeCode(end);
  if (bitCount) bytes.push(bitBuf & 0xff);
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 255) blocks.push(bytes.length - i > 255 ? 255 : bytes.length - i, ...bytes.slice(i, i + 255));
  return blocks;
}

/**
 * Encodes RGB frames to an animated GIF.
 * @param {{w:number,h:number}} size
 * @param {{rgba:Uint8ClampedArray|Uint8Array, delayMs:number}[]} frames RGBA pixels
 * @returns {Uint8Array}
 */
export function encodeGif(size, frames, { levels = 6, loop = 0, dither = true, spread = 26 } = {}) {
  const w = Math.max(1, Math.round(size.w)), h = Math.max(1, Math.round(size.h));
  if (!frames?.length) throw Error('No frames to encode.');
  const { palette } = buildPalette(frames[0].rgba, levels);
  const bytes = [...GIF_HEADER];
  // Logical screen descriptor: global colour table of 256 (size code 7).
  bytes.push(w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0xf7, 0, 0);
  for (let i = 0; i < 768; i++) bytes.push(palette[i]);
  // Netscape looping extension
  bytes.push(0x21, 0xff, 0x0b);
  for (const ch of 'NETSCAPE2.0') bytes.push(ch.charCodeAt(0));
  bytes.push(0x03, 0x01, loop & 0xff, (loop >> 8) & 0xff, 0x00);

  const minCodeSize = 8;
  for (const frame of frames) {
    const px = frame.rgba;
    const delay = Math.max(2, Math.round((frame.delayMs ?? 100) / 10));   // GIF stores hundredths
    // Graphic control extension: disposal "do not dispose", no transparency.
    bytes.push(0x21, 0xf9, 0x04, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    // Image descriptor, full frame
    bytes.push(0x2c, 0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff, 0x00);
    bytes.push(minCodeSize);
    const indices = new Uint8Array(w * h);
    for (let y = 0, i = 0, p = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++, p += 4) {
        const d = dither ? (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * spread : 0;
        indices[i] = nearestIndex(palette,
          Math.max(0, Math.min(255, px[p] + d)),
          Math.max(0, Math.min(255, px[p + 1] + d)),
          Math.max(0, Math.min(255, px[p + 2] + d)));
      }
    }
    bytes.push(...lzwEncode(indices, minCodeSize));
    bytes.push(0x00);   // block terminator
  }
  bytes.push(0x3b);     // trailer
  return Uint8Array.from(bytes);
}

/** Reads a GIF back: header, size, frame count and delays. Used by the tests. */
export function parseGif(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw Error('Not a GIF: ' + sig);
  const width = b[6] | (b[7] << 8), height = b[8] | (b[9] << 8);
  const packed = b[10];
  let at = 13 + ((packed & 0x80) ? 3 * (1 << ((packed & 0x0f) + 1)) : 0);
  const frames = [];
  let loops = null;
  const readSubBlocks = () => {
    const out = [];
    while (b[at] !== 0) {
      const n = b[at++];
      for (let i = 0; i < n; i++) out.push(b[at++]);
    }
    at++;
    return out;
  };
  while (at < b.length) {
    const marker = b[at++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = b[at++];
      if (label === 0xf9) {
        // Block size, packed flags, delay (hundredths), transparent index, 0x00.
        const size = b[at++];
        const delay = b[at + 1] | (b[at + 2] << 8);
        at += size;
        if (b[at] === 0) at++;
        frames.push({ delayCs: delay });
      } else if (label === 0xff) {
        const size = b[at++];
        const app = String.fromCharCode(...b.slice(at, at + 11));
        at += 11;
        const data = readSubBlocks();
        if (/NETSCAPE/i.test(app)) loops = data[1] | (data[2] << 8);
        void size;
      } else {
        at++; const size = b[at++]; at += size;
        while (b[at] !== 0) at += b[at] + 1;
        at++;
      }
      continue;
    }
    if (marker !== 0x2c) throw Error(`Unexpected GIF block 0x${marker.toString(16)} at ${at - 1}`);
    at += 8;
    const lp = b[at++];
    at += (lp & 0x80) ? 3 * (1 << ((lp & 0x0f) + 1)) : 0;
    at++;                                        // LZW minimum code size
    const data = readSubBlocks();
    frames[frames.length - 1] = { ...(frames[frames.length - 1] || {}), data };
  }
  return { sig, width, height, frames, loops, bytes: b.length };
}

/** LZW decode, so a test can prove the pixels really round-trip. */
export function lzwDecode(data, minCodeSize, pixelCount) {
  const clear = 1 << minCodeSize, end = clear + 1;
  let codeSize = minCodeSize + 1, next = end + 1;
  let dict = [];
  const reset = () => {
    dict = Array.from({ length: end }, (_, i) => [i]);
    codeSize = minCodeSize + 1; next = end + 1;
  };
  reset();
  const out = [];
  let bitBuf = 0, bitCount = 0, at = 0, prev = null;
  for (let i = 0; i < pixelCount && at <= data.length; i++) {
    while (bitCount < codeSize) {
      if (at >= data.length) break;
      bitBuf |= data[at++] << bitCount; bitCount += 8;
    }
    if (bitCount < codeSize) break;
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize; bitCount -= codeSize;
    if (code === clear) { reset(); prev = null; continue; }
    if (code === end) break;
    let entry;
    if (code < next && dict[code]) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw Error('Corrupt GIF data at pixel ' + i);
    out.push(...entry);
    if (prev) {
      dict[next++] = [...prev, entry[0]];
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return Uint8Array.from(out.slice(0, pixelCount));
}

/* ------------------------------------------------------------------ *
 * Recording (browser only)
 * ------------------------------------------------------------------ */

/** A recording in progress. */
export class ClipRecorder {
  constructor({ stream, mimeType, bitrate, RecorderCtor }) {
    this.chunks = [];
    this.mimeType = mimeType;
    this.recorder = new RecorderCtor(stream, bitrate ? { mimeType, videoBitsPerSecond: bitrate } : { mimeType });
    this.done = new Promise((resolve, reject) => {
      this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      this.recorder.onerror = e => reject(Error('Recording failed: ' + (e?.error?.message || 'the encoder stopped')));
    });
  }
  start(timeslice = 250) { this.recorder.start(timeslice); }
  async stop() {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.done;
  }
}

/**
 * Plays a file, draws it frame by frame and records the result.
 * Everything the platform provides is injectable so the plan can be tested.
 */
export async function recordVideo({
  files, kind = 'trim', start = 0, end = null, segments = null, width = null, height = null, mode = 'contain',
  rotate = 0, fps = null, bitrate = null, keepAudio = true, sourceDuration = 0, sourceSize = { w: 1280, h: 720 },
  deps = {}
}, onProgress = () => {}) {
  const {
    createVideo, createCanvas, MediaRecorderCtor, createObjectURL, revokeObjectURL,
    AudioContextCtor, isTypeSupported, createZip
  } = deps;
  if (!createVideo || !createCanvas || !MediaRecorderCtor) throw Error('This browser cannot record video.');
  if (!files?.length) throw Error('Choose at least one video file.');

  const mimeType = pickRecorderType(isTypeSupported || (() => false));
  if (!mimeType) throw Error('This browser cannot record video in any format it supports.');

  const first = await createVideo(files[0]);
  const src = { w: first.videoWidth || sourceSize.w, h: first.videoHeight || sourceSize.h };
  const dur = Number.isFinite(first.duration) && first.duration > 0 ? first.duration : sourceDuration;
  const plan = planJob({
    files, kind, start, end, width, height, mode, rotate, fps, bitrate,
    sourceSize: src, sourceFps: 30, sourceDuration: dur
  });
  // A cut leaves a hole: the parts either side are recorded in order, so the
  // result plays straight through with the chosen section missing.
  const ranges = segments?.length ? segments : plan.clips.map(c => [c.start, c.end]);
  const parts = ranges
    .map(([a, b]) => ({ start: Math.max(0, a || 0), end: b == null ? dur : b }))
    .filter(p => p.end > p.start)
    .sort((a, b) => a.start - b.start);
  if (!parts.length) throw Error('The chosen range is empty. Choose at least part of the video to keep.');
  plan.seconds = roundTo(parts.reduce((n, p) => n + (p.end - p.start), 0));
  plan.parts = parts;

  const canvas = createCanvas(plan.out.w, plan.out.h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, plan.out.w, plan.out.h);

  const stream = canvas.captureStream(plan.fps);
  let audioCtx = null, audioDest = null;
  if (keepAudio && AudioContextCtor) {
    try {
      audioCtx = new AudioContextCtor();
      audioDest = audioCtx.createMediaStreamDestination();
      for (const f of files) {
        const v = f === files[0] ? first : await createVideo(f);
        const node = audioCtx.createMediaElementSource(v);
        node.connect(audioDest);
        if (node !== audioDest) node.connect(audioCtx.destination);
      }
      for (const track of audioDest.stream.getAudioTracks()) stream.addTrack(track);
    } catch (e) {
      audioCtx = null;
      onProgress(`The audio track could not be routed (${e.message}); the video is being recorded without it.`);
    }
  }

  const recorder = new ClipRecorder({ stream, mimeType, bitrate: plan.bitRate, RecorderCtor: MediaRecorderCtor });
  const urls = [];
  const trackUrl = f => { const u = createObjectURL(f); urls.push(u); return u; };
  const vids = [];
  const raf = deps.requestAnimationFrame || (cb => setTimeout(() => cb(Date.now()), 16));
  const caf = deps.cancelAnimationFrame || clearTimeout;

  try {
    recorder.start();
    let clip = plan.clips[0];
    for (const part of plan.parts) {
      const v = clip.index === 0 ? first : await createVideo(files[clip.index]);
      v.src = trackUrl(files[clip.index]);
      v.muted = !keepAudio || !!audioCtx;          // routed through the context when we have one
      const from = Math.max(0, part.start || 0);
      const to = part.end && part.end > from ? part.end : dur;
      await new Promise((resolve, reject) => {
        let drawing = true;
        const draw = () => {
          if (!drawing) return;
          const f = plan.fit;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, plan.out.w, plan.out.h);
          ctx.save();
          ctx.translate(plan.out.w / 2, plan.out.h / 2);
          if (plan.rotate) ctx.rotate(plan.rotate * Math.PI / 180);
          if (f.crop) ctx.drawImage(v, f.crop.x, f.crop.y, f.crop.w, f.crop.h, -f.w / 2, -f.h / 2, f.w, f.h);
          else ctx.drawImage(v, -f.w / 2, -f.h / 2, f.w, f.h);
          ctx.restore();
          raf(draw);
        };
        const onTime = () => {
          if (v.currentTime >= to - 0.02) { drawing = false; v.pause(); v.removeEventListener('timeupdate', onTime); resolve(); }
        };
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('ended', () => { drawing = false; resolve(); });
        v.addEventListener('error', () => { drawing = false; reject(Error('This browser could not decode ' + (clip.name || 'the video') + '.')); });
        v.currentTime = from;
        v.play().then(() => { v.currentTime = from; draw(); })
          .catch(err => { drawing = false; reject(Error('The browser refused to play this video: ' + err.message)); });
      });
      onProgress(`Recorded ${formatSeconds(from)}–${formatSeconds(to)}.`);
      if (plan.parts.length > 1) { clip = plan.clips.find(c => c.index > clip.index) || clip; }
    }
    const blob = await recorder.stop();
    return { blob, mimeType, plan, size: blob.size, name: `megaplan-${kind}.${extensionFor(mimeType)}` };
  } finally {
    for (const v of vids) { try { v.pause(); } catch { /* already gone */ } }
    for (const u of urls) { try { revokeObjectURL(u); } catch { /* nothing to revoke */ } }
    if (audioCtx) { try { await audioCtx.close(); } catch { /* already closed */ } }
  }
}

const roundTo = n => Math.round(n * 1000) / 1000;
const formatSeconds = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Plays an animated GIF in an image element and records the canvas, which is the
 * only way to turn a GIF into a video in the browser: a GIF is an image, not a
 * video file, so it is painted frame by frame at its own speed.
 */
export async function gifToVideo({ file, seconds = 3, width = null, deps = {} }, onProgress = () => {}) {
  const { createImage, createCanvas, MediaRecorderCtor, createObjectURL, revokeObjectURL, isTypeSupported } = deps;
  if (!createImage || !createCanvas || !MediaRecorderCtor) throw Error('This browser cannot record video.');
  const mimeType = pickRecorderType(isTypeSupported || (() => false));
  if (!mimeType) throw Error('This browser cannot record video in any format it supports.');
  const url = createObjectURL(file);
  try {
    const img = await createImage(url);
    const w = width ? evenSize(width) : evenSize(img.naturalWidth || 320);
    const h = evenSize(Math.round(w * (img.naturalHeight || 240) / (img.naturalWidth || 320)));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const recorder = new ClipRecorder({ stream, mimeType, RecorderCtor: MediaRecorderCtor });
    recorder.start();
    const raf = deps.requestAnimationFrame || (cb => setTimeout(() => cb(Date.now()), 16));
    const start = Date.now();
    // The image element animates the GIF itself; the canvas is repainted as
    // often as the browser will give us a frame.
    let stopped = false;
    let pending = 0;
    await new Promise((resolve, reject) => {
      const bail = setTimeout(() => { stopped = true; reject(Error('The GIF could not be painted.')); }, seconds * 1000 + 5000);
      const paint = () => {
        if (stopped) return;
        ctx.drawImage(img, 0, 0, w, h);
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed >= seconds) { stopped = true; clearTimeout(bail); return resolve(); }
        onProgress(`Recording ${elapsed.toFixed(1)}s of ${seconds}s.`);
        pending = raf(paint);
      };
      paint();
    });
    if (stopped && pending) deps.cancelAnimationFrame?.(pending);
    const blob = await recorder.stop();
    return { blob, mimeType, frames: 1, width: w, height: h, seconds, name: `megaplan-gif.${extensionFor(mimeType)}` };
  } finally { try { revokeObjectURL(url); } catch { /* nothing to revoke */ } }
}

/** Decodes a media file to PCM, or reports honestly when the browser will not. */
export async function extractAudio(file, { AudioContextCtor, createVideo, readBytes } = {}) {
  const raw = await (readBytes ? readBytes(file) : file.arrayBuffer());
  const bytes = new Uint8Array(raw);
  if (AudioContextCtor) {
    const ctx = new AudioContextCtor();
    try {
      const buf = await ctx.decodeAudioData(bytes.buffer);
      await ctx.close();
      return { kind: 'pcm', buffer: buf };
    } catch (e) {
      await ctx.close().catch(() => {});
      void e;
    }
  }
  // The container may hold audio the decoder does not expose to Web Audio (AAC
  // in MP4, for instance). Capturing the element's own output works there.
  if (createVideo) {
    const v = await createVideo(file);
    v.src = URL.createObjectURL(file);
    v.muted = false;
    v.play().catch(() => {});
    return { kind: 'element', element: v, hint: 'This browser cannot decode the audio track directly, so it is captured live while the file plays. Keep the tab in the foreground.' };
  }
  return { kind: 'none', hint: 'This browser cannot read the audio track of this file.' };
}

/** WAV from a decoded AudioBuffer. */
export function audioBufferToWav(buffer) {
  const chans = Math.min(2, buffer.numberOfChannels), len = buffer.length, rate = buffer.sampleRate;
  const out = new ArrayBuffer(44 + len * chans * 2);
  const view = new DataView(out);
  const str = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + len * chans * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, chans, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * chans * 2, true); view.setUint16(32, chans * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, len * chans * 2, true);
  const data = Array.from({ length: chans }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < chans; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Draws a video's frames into GIF frames and encodes them. The frames are read
 * off the canvas one at a time, so a long video is not held in memory.
 */
export async function videoToGif({ file, fps = 12, width = 320, count = 0, deps = {} }, onProgress = () => {}) {
  const { createVideo, createCanvas, createObjectURL, revokeObjectURL } = deps;
  if (!createVideo || !createCanvas) throw Error('This browser cannot read video frames.');
  const v = await createVideo(file);
  const url = createObjectURL(file);
  try {
    v.src = url;
    v.muted = true;
    v.preload = 'auto';
    const meta = await new Promise((resolve, reject) => {
      v.addEventListener('loadedmetadata', () => resolve({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }), { once: true });
      v.addEventListener('error', () => reject(Error('This browser could not decode that video.')), { once: true });
    });
    const scale = Math.min(1, width / (meta.w || width));
    const w = evenSize((meta.w || width) * scale), h = evenSize((meta.h || width) * scale);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const frameCount = count > 0 ? Math.floor(count) : Math.max(2, Math.round((meta.duration || 1) * fps));
    const times = frameTimestamps(meta.duration || 1, { count: frameCount });
    const frames = [];
    for (const t of times) {
      await new Promise((resolve, reject) => {
        v.addEventListener('seeked', resolve, { once: true });
        v.addEventListener('error', () => reject(Error('Seeking failed.')), { once: true });
        v.currentTime = t;
      });
      ctx.drawImage(v, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      frames.push({ rgba: new Uint8Array(data.data), delayMs: 1000 / fps });
      onProgress(`Captured ${frames.length} of ${times.length} frames.`);
    }
    const bytes = encodeGif({ w, h }, frames);
    return { blob: new Blob([bytes], { type: 'image/gif' }), frames: frames.length, size: w, width: w, height: h };
  } finally {
    try { revokeObjectURL(url); } catch { /* nothing to revoke */ }
  }
}
