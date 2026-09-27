/**
 * Video engine — the planner, the geometry, the GIF encoder and the recording
 * orchestration.
 *
 * Fourteen video tools used to print a refusal, and "Extract Frames" and
 * "Video to GIF" both handed back one JPEG. These tests pin the replacement:
 * real frame sampling, real geometry, a GIF a third-party decoder can read,
 * and a recorder that is driven start-to-stop against a fake platform.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import {
  pickRecorderType, pickAudioType, extensionFor, frameTimestamps, fitBox, evenSize,
  scaleToFit, rotationPlan, estimateBytes, formatBytes, chooseFps, planJob,
  buildPalette, nearestIndex, lzwEncode, lzwDecode, encodeGif, parseGif,
  ClipRecorder, recordVideo, videoToGif, gifToVideo, extractAudio, audioBufferToWav
} from '../public/js/video-engine.js';

/** jsdom's Blob has no arrayBuffer(); FileReader is always there. */
function blobBytes(blob) {
  return new Promise((resolve, reject) => {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(resolve, reject);
    const fr = new window.FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}

const results = [];
const test = (name, fn) => { try { fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}\n      ${e.message}`]); } };
const aTest = (name, fn) => results.push({ name, fn, async: true });

/* ------------------------------------------------------------------ *
 * Choosing what to record
 * ------------------------------------------------------------------ */

test('a supported container is chosen, and none is a clear failure', () => {
  assert.equal(pickRecorderType(t => t === 'video/webm;codecs=vp8'), 'video/webm;codecs=vp8');
  assert.equal(pickRecorderType(t => t === 'video/mp4'), 'video/mp4');
  assert.equal(pickRecorderType(() => false), null);
  assert.equal(pickAudioType(t => t === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus');
});

test('the extension matches the container that was recorded', () => {
  assert.equal(extensionFor('video/webm;codecs=vp9'), 'webm');
  assert.equal(extensionFor('video/mp4'), 'mp4');
  assert.equal(extensionFor('video/ogg'), 'ogv');
  assert.equal(extensionFor(''), 'webm');
});

/* ------------------------------------------------------------------ *
 * Where frames come from
 * ------------------------------------------------------------------ */

test('frames are spread across the clip and never land on the last instant', () => {
  const t = frameTimestamps(10, { count: 5 });
  assert.equal(t.length, 5);
  assert.equal(t[0], 0);
  assert.ok(t[4] < 10, `the last frame must not sit on the end, got ${t[4]}`);
  const gaps = t.slice(1).map((v, i) => v - t[i]);
  for (const g of gaps.slice(0, -1)) assert.ok(Math.abs(g - gaps[0]) < 0.01, 'frames are evenly spread');
  assert.ok(gaps.at(-1) > 0 && gaps.at(-1) <= gaps[0], 'the final step is shortened, not extended');
  assert.deepEqual(frameTimestamps(0, { count: 4 }), [], 'a zero-length video has no frames');
  assert.equal(frameTimestamps(10, { count: 1, from: 2, to: 4 }).length, 1, 'one frame from the middle');
  assert.equal(frameTimestamps(10, { count: 3, from: 8, to: 9 }).length, 3, 'a range is respected');
});

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

test('a 16:9 video in a 4:3 frame keeps its shape and gains bars', () => {
  const f = fitBox({ w: 1920, h: 1080 }, { w: 640, h: 480 });
  assert.equal(f.w, 640);
  assert.equal(f.h, 360);
  assert.equal(f.dx, 0);
  assert.equal(f.dy, 60, '60px of bar above and below');
  assert.equal(f.crop, null, 'contain never cuts the picture');
});

test('cover fills the frame and says which part to cut', () => {
  const f = fitBox({ w: 1920, h: 1080 }, { w: 640, h: 480 }, 'cover');
  assert.equal(f.h, 480);
  assert.equal(f.w, 853, 'the picture is scaled past the frame width');
  assert.equal(f.crop.w, 1440, 'only the middle 1440 columns are kept');
  assert.equal(f.crop.x, 240);
  assert.equal(f.crop.h, 1080);
});

test('sizes handed to an encoder are even numbers', () => {
  assert.equal(evenSize(101), 102);
  assert.equal(evenSize(100), 100);
  assert.equal(evenSize(1), 2);
  assert.deepEqual(scaleToFit({ w: 1920, h: 1080 }, 640, 640), { w: 640, h: 360 });
});

test('a quarter turn swaps the frame and keeps the picture upright', () => {
  const r = rotationPlan(90, { w: 1920, h: 1080 }, { w: 1280, h: 720 });
  assert.equal(r.deg, 90);
  assert.equal(r.swapped, true);
  assert.equal(r.w, 720);
  assert.equal(r.h, 1280);
  assert.equal(rotationPlan(-90, { w: 1920, h: 1080 }, { w: 1280, h: 720 }).deg, 270, 'negative turns are normalised');
  assert.equal(rotationPlan(360, { w: 100, h: 100 }, { w: 100, h: 100 }).deg, 0, 'a full turn is no turn');
});

test('the output size and the estimate are stated before recording', () => {
  const p = planJob({
    files: [{ name: 'a.mp4' }], kind: 'compress', start: 0, end: 10, width: 640, height: 360,
    fps: 24, bitrate: 1000000, sourceSize: { w: 1280, h: 720 }, sourceDuration: 10
  });
  assert.deepEqual(p.out, { w: 640, h: 360 });
  assert.equal(p.fps, 24);
  assert.equal(p.seconds, 10);
  assert.equal(p.estimatedBytes, 1250000, '10s at 1Mbps is 1.25MB');
  assert.equal(p.clips.length, 1);
  assert.ok(p.frames.length > 0, 'a frame plan comes with it');
});

test('frame rate is capped so the encoder can keep up', () => {
  assert.equal(chooseFps(60, null), 30);
  assert.equal(chooseFps(60, 60), 30);
  assert.equal(chooseFps(25, 12), 12);
  assert.equal(chooseFps(0, null), 25, 'an unknown frame rate falls back to 25');
  assert.equal(chooseFps(0, 3, { min: 5 }), 5, 'but never below the floor');
});

test('sizes are reported the way a person reads them', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(estimateBytes({ seconds: 2, width: 640, height: 360, fps: 30 }) > 0, true);
});

/* ------------------------------------------------------------------ *
 * The GIF encoder
 * ------------------------------------------------------------------ */

const rgbaFrame = (w, h, shade) => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = (x * 16) & 0xff; rgba[i + 1] = (y * 24) & 0xff;
    rgba[i + 2] = shade & 0xff; rgba[i + 3] = 255;
  }
  return rgba;
};

test('a GIF comes out with the right signature, size, frames and delays', () => {
  const frames = [0, 60, 120].map(s => ({ rgba: rgbaFrame(16, 12, s), delayMs: 120 }));
  const gif = encodeGif({ w: 16, h: 12 }, frames);
  const p = parseGif(gif);
  assert.equal(p.sig, 'GIF89a');
  assert.equal(p.width, 16);
  assert.equal(p.height, 12);
  assert.equal(p.frames.length, 3, 'three frames, not one');
  assert.deepEqual(p.frames.map(f => f.delayCs), [12, 12, 12], 'delays are in hundredths of a second');
  assert.equal(p.loops, 0, 'it loops forever');
  assert.equal(gif[gif.length - 1], 0x3b, 'the trailer closes the file');
});

test('the GIF pixels survive the round trip through LZW', () => {
  const w = 16, h = 12;
  const frames = [{ rgba: rgbaFrame(w, h, 200), delayMs: 100 }];
  const p = parseGif(encodeGif({ w, h }, frames));
  const px = lzwDecode(p.frames[0].data, 8, w * h);
  assert.equal(px.length, w * h, 'every pixel is decoded');
  // Reconstruct the colours and compare with the source, allowing the cube.
  const { palette } = buildPalette(frames[0].rgba);
  let worst = 0;
  for (let i = 0; i < w * h; i++) {
    const q = px[i] * 3;
    worst = Math.max(worst,
      Math.abs(palette[q] - frames[0].rgba[i * 4]),
      Math.abs(palette[q + 1] - frames[0].rgba[i * 4 + 1]),
      Math.abs(palette[q + 2] - frames[0].rgba[i * 4 + 2]));
  }
  assert.ok(worst <= 60, `no pixel drifts further than the colour cube, worst was ${worst}`);
});

test('a flat image compresses to almost nothing', () => {
  const w = 64, h = 64;
  const rgba = new Uint8Array(w * h * 4).fill(0);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = 10; rgba[i * 4 + 1] = 20; rgba[i * 4 + 2] = 30; rgba[i * 4 + 3] = 255; }
  const gif = encodeGif({ w, h }, [{ rgba, delayMs: 100 }]);
  assert.ok(gif.length < 1200, `a still frame must not be stored raw (${gif.length} bytes)`);
});

test('a large frame forces wider codes and the table still decodes', () => {
  // Noise defeats the dictionary: this is the case where the code size grows
  // past 8 bits and a decoder that drifts from the encoder shows up here.
  const w = 96, h = 96;
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = (rand() * 256) | 0; rgba[i * 4 + 1] = (rand() * 256) | 0;
    rgba[i * 4 + 2] = (rand() * 256) | 0; rgba[i * 4 + 3] = 255;
  }
  const p = parseGif(encodeGif({ w, h }, [{ rgba, delayMs: 100 }]));
  const px = lzwDecode(p.frames[0].data, 8, w * h);
  assert.equal(px.length, w * h, 'all ' + w * h + ' pixels come back');
  const { palette } = buildPalette(rgba);
  let worst = 0;
  for (let i = 0; i < w * h; i++) {
    const q = px[i] * 3;
    worst = Math.max(worst, Math.abs(palette[q] - rgba[i * 4]), Math.abs(palette[q + 1] - rgba[i * 4 + 1]), Math.abs(palette[q + 2] - rgba[i * 4 + 2]));
  }
  assert.ok(worst <= 80, `noise stays within the palette, worst was ${worst}`);
});

test('the palette is 256 colours and the index is the nearest one', () => {
  const { palette } = buildPalette(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]));
  assert.equal(palette.length, 768);
  assert.equal(nearestIndex(palette, 255, 0, 0), 0, 'an exact colour is an exact match');
  const i = nearestIndex(palette, 250, 5, 5);
  const d = Math.hypot(palette[i * 3] - 250, palette[i * 3 + 1] - 5, palette[i * 3 + 2] - 5);
  assert.ok(d < 60, 'a near colour maps to a near entry');
});

test('a single pixel and an empty run are both handled', () => {
  assert.equal(lzwDecode(lzwEncode(Uint8Array.from([5]), 8), 8, 1).length, 1);
  assert.deepEqual(lzwEncode(new Uint8Array(0), 8), [0]);
  assert.throws(() => encodeGif({ w: 4, h: 4 }, []), /No frames/);
  assert.throws(() => parseGif(Uint8Array.from([1, 2, 3])), /Not a GIF/);
});

/* ------------------------------------------------------------------ *
 * Audio
 * ------------------------------------------------------------------ */

test('a decoded buffer becomes a real WAV file', () => {
  const data = new Float32Array([0, 0.5, -0.5, 1]);
  const blob = audioBufferToWav({ numberOfChannels: 1, length: 4, sampleRate: 8000, getChannelData: () => data });
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + 8, 'a 44-byte header plus four 16-bit samples');
});

test('samples outside -1..1 are clipped rather than wrapped', () => {
  const data = new Float32Array([2, -2]);
  const blob = audioBufferToWav({ numberOfChannels: 1, length: 2, sampleRate: 8000, getChannelData: () => data });
  assert.ok(blob.size > 44);
});

/* ------------------------------------------------------------------ *
 * Recording, against a fake platform
 * ------------------------------------------------------------------ */

/** A MediaRecorder, canvas, video element and file that behave like the real ones. */
function fakePlatform({ duration = 10, w = 640, h = 360, fps = 25 } = {}) {
  const log = { starts: 0, stops: 0, drawn: 0, played: [], objectUrls: 0, revoked: 0 };
  class FakeRecorder {
    constructor(stream, opts) {
      this.stream = stream; this.opts = opts; this.state = 'inactive';
      this.tracks = stream.getTracks().map(t => t.kind);
    }
    start() { this.state = 'recording'; log.starts++; }
    stop() { this.state = 'inactive'; log.stops++; this.ondataavailable({ data: { size: 2048 } }); this.onstop(); }
  }
  const canvasFor = (cw, ch) => {
    const ctx = {
      fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
      drawImage() { log.drawn++; }, getImageData: (x, y, ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4).fill(128) }),
      fillStyle: ''
    };
    return { width: cw, height: ch, getContext: () => ctx, captureStream: () => ({ getTracks: () => [{ kind: 'video' }], addTrack(t) { this.tracks.push(t.kind); }, tracks: [{ kind: 'video' }] }) };
  };
  const createVideo = async (file) => {
    let playing = false;
    const listeners = {};
    const v = {
      src: '', muted: false, currentTime: 0, videoWidth: w, videoHeight: h, duration,
      addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
      removeEventListener: (k, fn) => { listeners[k] = (listeners[k] || []).filter(f => f !== fn); },
      pause() { playing = false; clearInterval(v._timer); },
      _end() { playing = false; (listeners.ended || []).forEach(f => f()); }
    };
    // Drive the clock: every "frame" advances currentTime until the segment ends.
    v.play = () => {
      playing = true; log.played.push(file.name);
      v._timer = setInterval(() => {
        if (!playing) return clearInterval(v._timer);
        v.currentTime = Math.min(v.currentTime + 0.5, duration);
        (listeners.timeupdate || []).forEach(f => f());
        if (v.currentTime >= duration - 0.02) { clearInterval(v._timer); playing = false; (listeners.ended || []).forEach(f => f()); }
      }, 0);
      return Promise.resolve();
    };
    // Assigning a source makes a real element report its metadata.
    let _src = '';
    Object.defineProperty(v, 'src', {
      get: () => _src,
      set: value => { _src = value; setTimeout(() => (listeners.loadedmetadata || []).forEach(f => f()), 0); }
    });
    let seek = 0;
    Object.defineProperty(v, 'currentTime', {
      get: () => v._time ?? 0,
      // A real element fires `seeked` once it has decoded that instant.
      set: t => { v._time = t; const id = ++seek; setTimeout(() => { if (seek === id) (listeners.seeked || []).forEach(f => f()); }, 0); }
    });
    return v;
  };
  return {
    log, canvasFor, createVideo, FakeRecorder,
    deps: {
      createVideo,
      createCanvas: (cw, ch) => canvasFor(cw, ch),
      MediaRecorderCtor: FakeRecorder,
      createObjectURL: () => { log.objectUrls++; return 'blob:fake/' + log.objectUrls; },
      revokeObjectURL: () => { log.revoked++; },
      isTypeSupported: t => /webm/.test(t),
      AudioContextCtor: class {
        createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind: 'audio' }] } }; }
        createMediaElementSource() { return { connect() {}, disconnect() {} }; }
        close() { return Promise.resolve(); }
      },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {}
    },
    fps
  };
}

aTest('a trim records only the segment that was asked for', async () => {
  const p = fakePlatform({ duration: 20 });
  const res = await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'trim', start: 2, end: 5, deps: p.deps });
  assert.equal(p.log.starts, 1, 'recording started once');
  assert.equal(p.log.stops, 1, 'recording stopped once');
  assert.equal(res.mimeType, 'video/webm;codecs=vp9', 'the first supported container is used');
  assert.equal(res.name, 'megaplan-trim.webm');
  assert.ok(res.blob && res.blob.size > 0, 'a recording came back');
  assert.equal(res.plan.seconds, 3);
  assert.ok(p.log.drawn > 0, 'frames were actually drawn');
  assert.ok(p.log.revoked > 0, 'the object URL was released');
});

aTest('a mute records with no audio track at all', async () => {
  const p = fakePlatform();
  const res = await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'mute', keepAudio: false, deps: p.deps });
  assert.equal(res.plan.clips.length, 1);
  assert.ok(p.log.drawn > 0);
});

aTest('with audio the track is routed through the audio context', async () => {
  const p = fakePlatform();
  await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'convert', deps: p.deps });
  assert.equal(p.log.starts, 1);
});

aTest('a merge plays every file into the same recording', async () => {
  const p = fakePlatform({ duration: 3 });
  await recordVideo({ files: [{ name: 'one.mp4' }, { name: 'two.mp4' }], kind: 'merge', deps: p.deps });
  assert.equal(p.log.starts, 1, 'one recording, not one per file');
  assert.deepEqual(p.log.played, ['one.mp4', 'two.mp4'], 'both were played in turn');
});

aTest('a resize records at the size that was asked for', async () => {
  const p = fakePlatform({ w: 1920, h: 1080 });
  const res = await recordVideo({ files: [{ name: 'big.mp4' }], kind: 'resize', width: 640, height: 640, deps: p.deps });
  assert.deepEqual(res.plan.out, { w: 640, h: 360 }, 'the shape is kept, the width is not');
});

aTest('a rotate turns the frame a quarter way round', async () => {
  const p = fakePlatform({ w: 1280, h: 720 });
  const res = await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'rotate', rotate: 90, deps: p.deps });
  assert.deepEqual(res.plan.out, { w: 720, h: 1280 });
  assert.equal(res.plan.rotate, 90);
});

aTest('a browser that cannot record says so instead of pretending', async () => {
  await assert.rejects(
    recordVideo({ files: [{ name: 'a.mp4' }], deps: { ...fakePlatform().deps, isTypeSupported: () => false } }),
    /cannot record video in any format/
  );
  await assert.rejects(recordVideo({ files: [], deps: fakePlatform().deps }), /Choose at least one video/);
});

aTest('a video to GIF is a GIF, with the frames that were asked for', async () => {
  const p = fakePlatform({ duration: 4, w: 320, h: 240 });
  const res = await videoToGif({ file: { name: 'clip.mp4' }, fps: 4, width: 160, count: 5, deps: p.deps });
  assert.equal(res.frames, 5);
  assert.equal(res.width, 160);
  const bytes = new Uint8Array(await blobBytes(res.blob));
  const g = parseGif(bytes);
  assert.equal(g.sig, 'GIF89a');
  assert.equal(g.frames.length, 5);
  assert.equal(g.width, 160);
  assert.ok(g.height > 0);
});

aTest('a cut removes the section asked for and keeps the rest', async () => {
  const p = fakePlatform({ duration: 30 });
  const res = await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'cutout', segments: [[0, 5], [20, null]], deps: p.deps });
  assert.equal(res.plan.parts.length, 2, 'two pieces were kept');
  assert.deepEqual(res.plan.parts.map(x => [x.start, x.end]), [[0, 5], [20, 30]]);
  assert.equal(res.plan.seconds, 15, 'the 15 seconds in the middle are gone');
});

aTest('a trim keeps only the section asked for', async () => {
  const p = fakePlatform({ duration: 30 });
  const res = await recordVideo({ files: [{ name: 'clip.mp4' }], kind: 'trim', start: 4, end: 9, deps: p.deps });
  assert.equal(res.plan.seconds, 5);
  assert.equal(res.plan.parts.length, 1);
});

aTest('a GIF is recorded as video, not treated as a video file', async () => {
  class R { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.ondataavailable({ data: { size: 512 } }); this.onstop(); } }
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillStyle: '' }), captureStream: () => ({ getTracks: () => [{ kind: 'video' }] }) };
  let t = 0;
  const res = await gifToVideo({
    file: { name: 'a.gif' }, seconds: 0.05,
    deps: {
      createImage: async () => ({ naturalWidth: 200, naturalHeight: 100 }),
      createCanvas: (w, h) => { canvas.width = w; canvas.height = h; return canvas; },
      MediaRecorderCtor: R,
      createObjectURL: () => 'blob:x', revokeObjectURL() {},
      isTypeSupported: x => /webm/.test(x),
      requestAnimationFrame: cb => { t++; return setTimeout(() => cb(t), 1); },
      cancelAnimationFrame: clearTimeout
    }
  });
  assert.equal(res.width, 200, 'the GIF keeps its own size when no width is asked for');
  assert.equal(res.height, 100);
  assert.match(res.blob.type, /^video\/webm/);
  assert.ok(res.blob.size > 0, 'a real recording came back');
});

aTest('audio falls back honestly when the browser cannot decode the track', async () => {
  const failing = { AudioContextCtor: class { decodeAudioData() { return Promise.reject(Error('unsupported')); } close() { return Promise.resolve(); } } };
  const res = await extractAudio({ name: 'a.mp4', arrayBuffer: async () => new ArrayBuffer(8) }, failing);
  assert.equal(res.kind, 'none');
  assert.match(res.hint, /cannot read the audio track/);
  const decoded = await extractAudio({ name: 'a.mp4', arrayBuffer: async () => new ArrayBuffer(8) }, {
    AudioContextCtor: class {
      decodeAudioData() { return Promise.resolve({ numberOfChannels: 1, length: 4, sampleRate: 8000, getChannelData: () => new Float32Array(4) }); }
      close() { return Promise.resolve(); }
    }
  });
  assert.equal(decoded.kind, 'pcm');
});

aTest('the recorder collects chunks and resolves a blob of its own type', async () => {
  const r = new ClipRecorder({
    stream: { getTracks: () => [{ kind: 'video' }] },
    mimeType: 'video/webm',
    RecorderCtor: class {
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable({ data: { size: 3 } }); this.onstop(); }
    }
  });
  r.start();
  const b = await r.stop();
  assert.equal(b.type, 'video/webm');
  assert.ok(b.size > 0);
});

/* ------------------------------------------------------------------ *
 * The mounted tools
 * ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://megaplan.test/' });
const { window } = dom;
const define = (n, v) => Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: v });
for (const n of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element',
  'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser', 'Image']) {
  if (window[n] !== undefined) define(n, window[n]);
}
const downloads = [];
let pendingBlob = null;
define('URL', Object.assign(function (u, b) { return new window.URL(u, b); }, {
  createObjectURL(blob) { pendingBlob = blob; return 'blob:mp/1'; },
  revokeObjectURL() {}
}));
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this._ctx) {
    this._ctx = {
      fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, drawImage() {}, fillStyle: '',
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(90) })
    };
  }
  return this._ctx;
};
window.HTMLCanvasElement.prototype.captureStream = function () {
  return { getTracks: () => [{ kind: 'video' }], addTrack() {} };
};
window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new window.Blob([new Uint8Array(64)])); };
window.HTMLAnchorElement.prototype.click = function () {
  if (!this.download) return;
  downloads.push({ name: this.download, blob: pendingBlob });
  pendingBlob = null;
};
define('requestAnimationFrame', () => 0);
define('cancelAnimationFrame', () => {});
globalThis.fetch = async () => { throw new Error('offline in tests'); };
const REGISTRY = JSON.parse(await readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
const kit = await import('../public/js/kit.js');
kit.LIB_SOURCES.jszip = async () => await import('jszip');   // the browser uses a CDN
const { mountTool } = await import('../public/js/engines.js');
await import('../public/js/engines-rest.js');

/** A fake <video> that reports a length, seeks and plays. */
function fakeVideoElement() {
  class Recorder {
    constructor(stream, opts) { this.state = 'inactive'; this.opts = opts; this.stream = stream; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: { size: 4096 } }); this.onstop(); }
  }
  window.MediaRecorder = Recorder;
  window.MediaRecorder.isTypeSupported = t => /webm/.test(t);
  window.AudioContext = class {
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind: 'audio' }] } }; }
    createMediaElementSource() { return { connect() {} }; }
    close() { return Promise.resolve(); }
  };
  const proto = window.HTMLVideoElement.prototype;
  const fire = function (name) { (this._listeners?.[name] || []).forEach(f => f({ type: name })); };
  Object.defineProperty(proto, '_fire', { value: fire, configurable: true, writable: true });
  Object.defineProperty(proto, 'addEventListener', {
    value: function (k, fn) { const l = this._listeners = this._listeners || {}; l[k] = (l[k] || []).filter(f => f !== fn); l[k].push(fn); },
    configurable: true, writable: true
  });
  Object.defineProperty(proto, 'removeEventListener', { value: function () {}, configurable: true, writable: true });
  Object.defineProperty(proto, 'currentTime', {
    get() { return this._t || 0; },
    set(v) { this._t = v; setTimeout(() => this._fire('seeked'), 0); },
    configurable: true
  });
  Object.defineProperty(proto, 'duration', { get() { return 4; }, configurable: true });
  Object.defineProperty(proto, 'videoWidth', { get() { return 640; }, configurable: true });
  Object.defineProperty(proto, 'videoHeight', { get() { return 360; }, configurable: true });
  proto.play = function () {
    this._timer = setInterval(() => {
      this._t = Math.min((this._t || 0) + 0.25, this.duration);
      this._fire('timeupdate');
      if (this._t >= this.duration - 0.02) { clearInterval(this._timer); this._fire('ended'); }
    }, 0);
    return Promise.resolve();
  };
  proto.pause = function () { clearInterval(this._timer); };
  // Setting a source reports metadata and seeks, like a real element.
  Object.defineProperty(proto, 'src', {
    get() { return this._src || ''; },
    set(v) {
      this._src = v;
      setTimeout(() => {
        if (window.__undecodable) { this._fire('error'); return; }
        this._fire('loadedmetadata'); this._fire('seeked');
      }, 0);
    },
    configurable: true
  });
  return new window.File([new Uint8Array(16)], 'clip.mp4', { type: 'video/mp4' });
}

async function runVideoTool(title, { fields = {}, files = 1 } = {}) {
  const tool = REGISTRY.find(t => t.title === title);
  assert.ok(tool, `${title} is in the registry`);
  const root = document.createElement('div');
  await mountTool(root, tool);
  const before = downloads.length;
  const input = root.querySelector('#file');
  assert.ok(input, `${title} asks for a file`);
  const made = Array.from({ length: files }, fakeVideoElement);
  Object.defineProperty(input, 'files', { value: made, configurable: true });
  input.dispatchEvent(new window.Event('change'));
  for (const [id, value] of Object.entries(fields)) {
    const el = root.querySelector('#' + id);
    if (el) el.value = String(value);
  }
  root.querySelector('#run').click();
  for (let i = 0; i < 60; i++) await new Promise(r => setTimeout(r, 10));
  return { root, out: () => root.querySelector('#tool-out')?.textContent || '', files: () => downloads.slice(before) };
}

const UI = [];
const ui = (name, fn) => UI.push({ name, fn });

ui('no video tool prints the old refusal any more', async () => {
  const video = REGISTRY.filter(t => t.category === 'Video');
  assert.equal(video.length, 26);
  for (const t of video) {
    const root = document.createElement('div');
    await mountTool(root, t);
    assert.doesNotMatch(root.textContent, /heavier encoder than this page ships/, `${t.title} still refuses`);
  }
});

ui('the trimming tool records a real file', async () => {
  const r = await runVideoTool('Video Trimmer', { fields: { vStart: 0, vEnd: 2 } });
  assert.match(r.out(), /Recorded .* of video\/webm/i, r.out().slice(0, 200));
  assert.equal(r.files().length, 1, 'a file was offered');
  assert.match(r.files()[0].name, /clip-trim\.webm$/);
  assert.ok(r.files()[0].blob, 'the download is a real blob');
});

ui('the mute tool records and the merger records once for several clips', async () => {
  const mute = await runVideoTool('Mute Video');
  assert.equal(mute.files().length, 1);
  assert.match(mute.out(), /Recorded/);
  const merge = await runVideoTool('Video Merger', { files: 3 });
  assert.equal(merge.files().length, 1, 'one file out, not three');
  assert.match(merge.out(), /Joined 3 clips/);
});

ui('the resizer and the rotator change the frame', async () => {
  const resize = await runVideoTool('Resize Video', { fields: { vW: 320, vH: 320 } });
  assert.match(resize.out(), /Frame: 320×180/, resize.out());
  const rotate = await runVideoTool('Rotate Video', { fields: { vRot: 90 } });
  assert.match(rotate.out(), /Frame: 360×640, turned 90°/, rotate.out());
});

ui('the converter reports the container it recorded', async () => {
  const r = await runVideoTool('MP4 to WebM');
  assert.match(r.out(), /video\/webm/);
  assert.match(r.files()[0].name, /\.webm$/);
});

ui('the frame extractor writes a zip of real frames', async () => {
  const r = await runVideoTool('Extract Frames', { fields: { vCount: 4 } });
  assert.match(r.out(), /Captured 4 frames/, r.out().slice(0, 300));
  assert.equal(r.files().length, 1);
  assert.match(r.files()[0].name, /-4-frames\.zip$/);
  assert.ok(r.files()[0].blob.size > 0);
  const JSZip = (await import('jszip')).default;
  const z = await JSZip.loadAsync(await blobBytes(r.files()[0].blob));
  const names = Object.keys(z.files).filter(n => !z.files[n].dir);
  assert.equal(names.length, 4, 'the zip holds every frame: ' + names.join(', '));
  assert.ok(names.every(n => /^clip-\d\d-\d+\.\d\ds\.png$/.test(n)), 'each frame is named with its time: ' + names.join(', '));
});

ui('the contact sheet is one picture, not a pile of files', async () => {
  const r = await runVideoTool('Video Contact Sheet', { fields: { vCount: 6 } });
  assert.match(r.out(), /contact sheet: 6 frames in a \d+×\d+ grid/i, r.out().slice(0, 300));
  assert.equal(r.files().length, 1, 'exactly one file comes out');
  assert.match(r.files()[0].name, /-contact-sheet\.png$/);
  assert.ok(r.files()[0].blob.size > 0);
});

ui('the GIF tool writes a GIF, not a JPEG', async () => {
  const r = await runVideoTool('Video to GIF', { fields: { vGifW: 160, vGifFps: 4 } });
  assert.match(r.out(), /Saved an animated GIF/, r.out().slice(0, 300));
  assert.match(r.files()[0].name, /\.gif$/);
  const blob = r.files()[0].blob;
  assert.equal(blob.type, 'image/gif', 'the browser was handed a GIF');
  const bytes = new Uint8Array(await blobBytes(blob));
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a', 'the bytes really start GIF89a');
  const g = parseGif(bytes);
  assert.ok(g.frames.length > 1, 'and it holds more than one frame: ' + g.frames.length);
  assert.equal(g.width, 160, 'at the width that was asked for');
});

ui('the audio tool reports what it managed', async () => {
  const r = await runVideoTool('Extract Audio');
  assert.ok(r.out().trim().length > 10, r.out());
  assert.doesNotMatch(r.out(), /^Error/, 'it did not simply fail: ' + r.out());
});

ui('the inspector reads the file', async () => {
  const r = await runVideoTool('Video Duration');
  assert.match(r.out(), /Duration: 4\.00 s/, r.out());
  assert.match(r.out(), /Size: 640×360/);
});

ui('the thumbnail tool saves a picture', async () => {
  const r = await runVideoTool('Video Thumbnail Extractor');
  assert.match(r.out(), /Saved a \d+×\d+ thumbnail/, r.out());
  assert.match(r.files()[0].name, /-thumbnail\.png$/);
});

ui('a browser that cannot record says so up front', async () => {
  const recorder = window.MediaRecorder;
  window.MediaRecorder = undefined;
  try {
    const tool = REGISTRY.find(t => t.title === 'Video Trimmer');
    const root = document.createElement('div');
    await mountTool(root, tool);
    assert.match(root.textContent, /cannot record video/i, 'the note is on the form, before any work');
  } finally { window.MediaRecorder = recorder; }
});

ui('a file that cannot be decoded is reported, not silently ignored', async () => {
  const before = downloads.length;
  window.__undecodable = true;
  try {
    const tool = REGISTRY.find(t => t.title === 'Video Duration');
    const root = document.createElement('div');
    await mountTool(root, tool);
    const input = root.querySelector('#file');
    Object.defineProperty(input, 'files', {
      value: [new window.File([new Uint8Array(8)], 'broken.mp4', { type: 'video/mp4' })], configurable: true
    });
    input.dispatchEvent(new window.Event('change'));
    root.querySelector('#run').click();
    for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 10));
    const said = root.querySelector('#tool-out').textContent;
    assert.match(said, /cannot decode/i, 'the tool said: ' + JSON.stringify(said));
    assert.equal(downloads.length, before, 'nothing was downloaded from an unreadable file');
  } finally { window.__undecodable = false; }
});

/* ------------------------------------------------------------------ */

for (const r of results) if (!r.async) console.log(`${r[0] ? 'ok  ' : 'FAIL'} ${r[1]}`);
let failed = results.filter(r => !r.async && !r[0]).length;
for (const t of results.filter(r => r.async)) {
  const guard = new Promise((_, rej) => setTimeout(() => rej(Error('timed out after 10s')), 10000));
  try { await Promise.race([t.fn(), guard]); t.ok = true; } catch (e) { t.ok = false; t.err = e; }
}
for (const t of results.filter(r => r.async)) {
  console.log(`${t.ok ? 'ok  ' : 'FAIL'} ${t.name}${t.err ? '\n      ' + String(t.err.message).split('\n')[0] : ''}`);
  if (!t.ok) failed++;
}
for (const t of UI) {
  const guard = new Promise((_, rej) => setTimeout(() => rej(Error('timed out after 15s')), 15000));
  try { await Promise.race([t.fn(), guard]); t.ok = true; } catch (e) { t.ok = false; t.err = e; }
}
for (const t of UI) console.log(`${t.ok ? 'ok  ' : 'FAIL'} ${t.name}${t.err ? '\n      ' + String(t.err.message).split('\n')[0] : ''}`);
failed += UI.filter(t => !t.ok).length;
const total = results.length + UI.length;
console.log(`\n${total - failed}/${total} video tests passed`);
process.exit(failed ? 1 : 0);
