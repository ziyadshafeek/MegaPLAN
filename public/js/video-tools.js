/**
 * The video tools, mounted in the browser.
 *
 * Everything runs on this device with the platform's own decoders and
 * `MediaRecorder`. Where a job cannot be done — a browser that will not decode a
 * container, a file with no audio track — the tool says so instead of writing a
 * note and pretending.
 */
import {
  fileForm, mountShell, wireDrop, setOut, setProgress, downloadBlob, canvasToFile,
  loadJSZip, esc
} from './kit.js';
import {
  recordVideo, videoToGif, gifToVideo, extractAudio, audioBufferToWav, planJob, frameTimestamps,
  scaleToFit, evenSize, pickRecorderType, pickAudioType, formatBytes, extensionFor
} from './video-engine.js';

/* ------------------------------------------------------------------ *
 * Platform adapters — every one is optional, and every failure is reported
 * ------------------------------------------------------------------ */

/** `Blob.arrayBuffer` is not on every Blob; FileReader always is. */
const readBytes = blob => new Promise((resolve, reject) => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(resolve, reject);
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(fr.error || Error('The file could not be read.'));
  fr.readAsArrayBuffer(blob);
});

// Always through `window`: the bare global is not the same object inside a
// worker or an iframe, and guessing costs a whole recording.
const isTypeSupported = t => {
  try { return window.MediaRecorder?.isTypeSupported ? window.MediaRecorder.isTypeSupported(t) : false; }
  catch { return false; }
};

const createImageElement = url => new Promise((resolve, reject) => {
  const img = new window.Image();
  img.addEventListener('load', () => resolve(img), { once: true });
  img.addEventListener('error', () => reject(Error('This browser could not read that image.')), { once: true });
  img.src = url;
});

const createVideoElement = file => new Promise((resolve, reject) => {
  const v = document.createElement('video');
  v.preload = 'auto';
  v.playsInline = true;
  v.addEventListener('loadedmetadata', () => resolve(v), { once: true });
  v.addEventListener('error', () => reject(Error(`This browser cannot decode ${file.name || 'that file'}.`)), { once: true });
  v.src = URL.createObjectURL(file);
});

const platformDeps = () => ({
  createVideo: createVideoElement,
  createImage: createImageElement,
  createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
  MediaRecorderCtor: window.MediaRecorder,
  createObjectURL: f => URL.createObjectURL(f),
  revokeObjectURL: u => URL.revokeObjectURL(u),
  isTypeSupported,
  AudioContextCtor: window.AudioContext || window.webkitAudioContext || null,
  requestAnimationFrame: cb => requestAnimationFrame(cb),
  cancelAnimationFrame: id => cancelAnimationFrame(id)
});

/** Everything the browser must support before any of this is worth offering. */
export function videoSupport() {
  const canvas = document.createElement('canvas');
  return {
    decode: typeof document.createElement('video').canPlayType === 'function',
    record: !!window.MediaRecorder && !!pickRecorderType(isTypeSupported),
    audio: !!(window.AudioContext || window.webkitAudioContext),
    capture: !!canvas.captureStream,
    type: pickRecorderType(isTypeSupported)
  };
}

/* ------------------------------------------------------------------ *
 * A shared form
 * ------------------------------------------------------------------ */

const numField = (id, label, attrs = '') => `<label class="field-label">${esc(label)}<input id="${id}" class="field" type="number" ${attrs}></label>`;

/**
 * Builds the mount for a recording tool.
 * @param {object} spec what the tool does and what it needs to ask for
 */
export function videoTool(root, tool, spec) {
  const extra = [
    spec.start || spec.end ? `<div class="field-row">${spec.start === false ? '' : numField('vStart', 'From (s)', 'min="0" step="0.1"')}${spec.end === false ? '' : numField('vEnd', 'To (s)', 'min="0" step="0.1"')}</div>` : '',
    spec.size ? `<div class="field-row">${numField('vW', 'Width', 'min="16" step="2"')}${numField('vH', 'Height', 'min="16" step="2"')}</div>
      <div class="field-row"><label class="field-label">Fill<select id="vMode" class="field"><option value="${spec.defaultMode || 'contain'}"${spec.defaultMode ? ' selected' : ''}>Keep everything (bars)</option><option value="cover"${spec.defaultMode === 'cover' ? ' selected' : ''}>Fill the frame (crops)</option></select></label></div>` : '',
    spec.rotate ? `<div class="field-row">${numField('vRot', 'Rotate (degrees)', 'value="0" step="90"')}</div>` : '',
    spec.bitrate ? `<div class="field-row">${numField('vRate', 'Target bit rate (kbps)', 'min="50" step="50"')}</div>` : '',
    spec.fps ? `<div class="field-row">${numField('vFps', 'Frames per second', 'min="1" max="30"')}</div>` : '',
    spec.frames || spec.sheet ? `<div class="field-row">${numField('vCount', spec.sheet ? 'Frames in the sheet' : 'How many frames', 'min="1" max="120" value="' + (spec.sheet ? 12 : 12) + '"')}</div>` : '',
    spec.gif ? `<div class="field-row">${numField('vGifW', 'GIF width', 'min="64" max="800" step="2" value="320"')}${numField('vGifFps', 'GIF frame rate', 'min="2" max="24" value="12"')}</div>` : '',
    spec.gifSource ? `<div class="field-row">${numField('vSeconds', 'How many seconds to record', 'min="1" max="60" value="3"')}${numField('vGifSrcW', 'Width (blank = original)', 'min="64" max="1920" step="2"')}</div>
      <p class="muted">A GIF is an image, not a video file. It is played and re-recorded at its own speed; give it the length it should run for.</p>` : '',
    spec.audioOnly ? `<p class="muted">Audio is decoded where the browser allows it, and captured live where it does not. Keep this tab in the foreground while it runs.</p>` : '',
    `<p class="muted" id="vNote"></p>`
  ].join('\n');

  const body = mountShell(root, tool, fileForm({
    accept: spec.accept || 'video/*',
    multiple: !!spec.multiple,
    label: spec.label || 'Choose a video',
    run: spec.run || 'Run',
    extra
  }));
  const drop = wireDrop(body);

  const val = id => {
    const el = body.querySelector('#' + id);
    return el && el.value !== '' ? Number(el.value) : null;
  };
  const note = body.querySelector('#vNote');
  if (note && spec.kind) {
    const t = pickRecorderType(isTypeSupported);
    note.textContent = t
      ? `Records in ${t}. The file never leaves this device, and recording runs in real time — a 30-second clip takes about 30 seconds.`
      : 'This browser cannot record video: it offers no MediaRecorder container this page can use. Converting and trimming need Chrome, Edge or Firefox.';
  }

  body.querySelector('#run').onclick = async () => {
    const files = drop.getFiles();
    try {
      if (!files.length) throw Error('Choose a video first.');
      if (spec.gifSource) await runGifSource(body, files, val);
      else if (spec.kind) await runRecording(body, files, spec, val);
      else if (spec.frames || spec.sheet) await runFrames(body, files, val, spec);
      else if (spec.gif) await runGif(body, files, val);
      else if (spec.audioOnly) await runAudio(body, files, spec);
      else if (spec.probe) await runProbe(body, files, spec);
    } catch (e) {
      setOut(body, 'Error: ' + e.message);
      setProgress(body, null);
    }
  };
  return body;
}

const num = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);

async function runGifSource(body, files, val) {
  setProgress(body, 10, 'Reading the GIF…');
  setOut(body, 'Playing the GIF and recording it. This runs in real time — keep this tab in the foreground.');
  const res = await gifToVideo({
    file: files[0],
    seconds: num(val('vSeconds'), 3),
    width: val('vGifSrcW') || null,
    deps: platformDeps()
  }, msg => setOut(body, msg));
  downloadBlob(res.blob, (files[0]?.name || 'animation').replace(/\.[^.]+$/, '') + '.mp4'.replace('mp4', extensionFor(res.mimeType)));
  setOut(body, `Recorded ${res.seconds}s of the GIF at ${res.width}×${res.height} as ${res.mimeType}, ${formatBytes(res.blob.size)}.\nA GIF is played back at its own speed, so this is a straight recording of it, not a re-timing.`);
  setProgress(body, 100, 'Done');
  setTimeout(() => setProgress(body, null), 700);
}

async function runRecording(body, files, spec, val) {
  setProgress(body, 12, 'Preparing…');
  setOut(body, 'Recording…');
  const opts = {
    files,
    kind: spec.kind,
    start: val('vStart') ?? 0,
    end: val('vEnd') ?? null,
    // Cutting removes the middle; trimming keeps only it.
    segments: spec.cut ? [[0, val('vStart') ?? 0], [val('vEnd') ?? null, null]] : null,
    width: val('vW') ?? null,
    height: val('vH') ?? null,
    mode: body.querySelector('#vMode')?.value || 'contain',
    rotate: val('vRot') ?? 0,
    fps: val('vFps') ?? null,
    bitrate: val('vRate') ? val('vRate') * 1000 : null,
    keepAudio: spec.keepAudio !== false,
    deps: platformDeps()
  };
  if (opts.start && opts.end && opts.end <= opts.start) throw Error('The end time must be after the start time.');
  if (spec.multiple && files.length > 1) opts.end = opts.end ?? null;
  const res = await recordVideo(opts, msg => setOut(body, (msg ? msg + '\n' : '') + 'Recording…'));
  downloadBlob(res.blob, (files[0]?.name || 'video').replace(/\.[^.]+$/, '') + '-' + spec.kind + '.' + extensionFor(res.mimeType));
  const { out } = res.plan;
  setOut(body, [
    `Recorded ${formatBytes(res.size)} of ${res.mimeType}.`,
    `Frame: ${out.w}×${out.h}${res.plan.rotate ? `, turned ${res.plan.rotate}°` : ''}, ${res.plan.fps} fps.`,
    files.length > 1 ? `Joined ${files.length} clips.` : '',
    res.plan.seconds ? `Length: about ${res.plan.seconds.toFixed(1)}s.` : '',
    'Saved. The file never left this device.'
  ].filter(Boolean).join('\n'));
  setProgress(body, 100, 'Done');
  setTimeout(() => setProgress(body, null), 700);
}

async function runFrames(body, files, val, spec = {}) {
  setProgress(body, 10, 'Reading the video…');
  const deps = platformDeps();
  const file = files[0];
  const v = await deps.createVideo(file);
  const url = deps.createObjectURL(file);
  try {
    v.src = url;
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    if (!duration) throw Error('This browser could not read the length of that video.');
    const size = scaleToFit({ w: v.videoWidth, h: v.videoHeight }, val('vMaxW') || 1280, val('vMaxW') || 1280);
    const times = frameTimestamps(duration, { count: num(val('vCount'), 12) });
    const canvas = deps.createCanvas(size.w, size.h);
    const ctx = canvas.getContext('2d');
    const shots = [];
    for (const [i, t] of times.entries()) {
      setProgress(body, 10 + Math.round(80 * i / times.length), `Frame ${i + 1} of ${times.length}…`);
      await new Promise((resolve, reject) => {
        v.addEventListener('seeked', resolve, { once: true });
        v.addEventListener('error', () => reject(Error('Seeking to ' + t.toFixed(2) + 's failed.')), { once: true });
        v.currentTime = t;
      });
      ctx.drawImage(v, 0, 0, size.w, size.h);
      shots.push({ t, blob: await new Promise(res => canvas.toBlob(b => res(b), 'image/png')) });
    }
    const base = (file.name || 'frame').replace(/\.[^.]+$/, '');

    if (spec.sheet) {
      // One picture with every frame in a grid, which is what a contact sheet is.
      const cols = Math.ceil(Math.sqrt(shots.length));
      const rows = Math.ceil(shots.length / cols);
      const cell = Math.max(80, Math.min(320, Math.round(size.w / Math.min(cols, 4))));
      const cw = evenSize(cell), chh = evenSize(Math.round(cell * size.h / size.w));
      const sheet = deps.createCanvas(evenSize(cw * cols), evenSize(chh * rows));
      const sctx = sheet.getContext('2d');
      sctx.fillStyle = '#111'; sctx.fillRect(0, 0, sheet.width, sheet.height);
      for (const [i, shot] of shots.entries()) {
        await new Promise((resolve, reject) => {
          v.addEventListener('seeked', resolve, { once: true });
          v.addEventListener('error', () => reject(Error('Seeking to ' + shot.t.toFixed(2) + 's failed.')), { once: true });
          v.currentTime = shot.t;
        });
        sctx.drawImage(v, (i % cols) * cw, Math.floor(i / cols) * chh, cw, chh);
      }
      const blob = await new Promise(res => sheet.toBlob(b => res(b), 'image/png'));
      downloadBlob(blob, `${base}-contact-sheet.png`);
      setOut(body, `Saved a contact sheet: ${shots.length} frames in a ${cols}×${rows} grid, ${sheet.width}×${sheet.height}, ${formatBytes(blob.size)}.\nFrames run left to right from ${shots[0].t.toFixed(2)}s to ${shots.at(-1).t.toFixed(2)}s.`);
      setProgress(body, 100, 'Done');
      setTimeout(() => setProgress(body, null), 700);
      return;
    }
    if (shots.length === 1) {
      downloadBlob(shots[0].blob, `${base}-${shots[0].t.toFixed(2)}s.png`);
      setOut(body, `Captured 1 frame at ${shots[0].t.toFixed(2)}s (${size.w}×${size.h}).`);
    } else {
      const zip = await loadJSZip();
      const z = new zip();
      shots.forEach((s, i) => z.file(`${base}-${String(i + 1).padStart(2, '0')}-${s.t.toFixed(2)}s.png`, s.blob));
      const out = await z.generateAsync({ type: 'blob' });
      downloadBlob(out, `${base}-${shots.length}-frames.zip`);
      setOut(body, `Captured ${shots.length} frames between 0 and ${duration.toFixed(1)}s, saved as a zip.\nFirst at ${shots[0].t.toFixed(2)}s, last at ${shots.at(-1).t.toFixed(2)}s.\nEach frame is ${size.w}×${size.h}.`);
    }
  } finally { try { deps.revokeObjectURL(url); } catch { /* already gone */ } }
  setProgress(body, 100, 'Done');
  setTimeout(() => setProgress(body, null), 700);
}

async function runGif(body, files, val) {
  setProgress(body, 10, 'Reading frames…');
  setOut(body, 'Reading frames from the video…');
  const res = await videoToGif({
    file: files[0],
    fps: num(val('vGifFps'), 12),
    width: num(val('vGifW'), 320),
    deps: platformDeps()
  }, msg => setOut(body, msg));
  downloadBlob(res.blob, (files[0]?.name || 'video').replace(/\.[^.]+$/, '') + '.gif');
  setOut(body, `Saved an animated GIF: ${res.frames} frames at ${res.width}×${res.height}, ${formatBytes(res.blob.size)}.\nGIF holds 256 colours, so fine detail is reduced — this is the format, not the tool.`);
  setProgress(body, 100, 'Done');
  setTimeout(() => setProgress(body, null), 700);
}

async function runAudio(body, files, spec) {
  setProgress(body, 20, 'Reading the audio track…');
  const res = await extractAudio(files[0], { AudioContextCtor: window.AudioContext || window.webkitAudioContext, createVideo: createVideoElement, readBytes });
  const base = (files[0]?.name || 'audio').replace(/\.[^.]+$/, '');
  if (res.kind === 'pcm') {
    downloadBlob(audioBufferToWav(res.buffer), base + '.wav');
    setOut(body, `Saved ${base}.wav — ${res.buffer.duration.toFixed(2)}s, ${res.buffer.sampleRate} Hz, ${res.buffer.numberOfChannels} channel(s).`);
  } else if (res.kind === 'element') {
    const type = pickAudioType(isTypeSupported);
    if (!type) { setOut(body, 'This browser can play the file but cannot record its audio. ' + res.hint); return; }
    const stream = res.element.captureStream ? res.element.captureStream() : null;
    if (!stream) { setOut(body, 'This browser cannot capture audio from a playing file. ' + res.hint); return; }
    setOut(body, 'Playing the file now and recording its audio — keep this tab in the foreground…');
    const rec = new window.MediaRecorder(stream, { mimeType: type });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    res.element.play().catch(() => {});
    await new Promise(r => setTimeout(r, Math.max(500, (res.element.duration || 1) * 1000 + 400)));
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type });
    downloadBlob(blob, base + '.' + extensionFor(type));
    setOut(body, `Saved ${base}.${extensionFor(type)} — ${formatBytes(blob.size)} of ${type}.\n${res.hint}`);
  } else {
    setOut(body, res.hint);
  }
  setProgress(body, 100, 'Done');
  setTimeout(() => setProgress(body, null), 700);
}

async function runProbe(body, files, spec = {}) {
  const deps = platformDeps();
  const file = files[0];
  const v = await deps.createVideo(file);
  const url = deps.createObjectURL(file);
  try {
    v.src = url;
    v.muted = true;
    await new Promise((resolve, reject) => {
      v.addEventListener('loadedmetadata', resolve, { once: true });
      v.addEventListener('error', () => reject(Error('This browser cannot decode that file.')), { once: true });
    });
    const lines = [
      file.name,
      `Duration: ${Number.isFinite(v.duration) ? v.duration.toFixed(2) : '?'} s`,
      `Size: ${v.videoWidth}×${v.videoHeight}${v.videoWidth % 2 ? ' (odd width — some encoders will round it)' : ''}`,
      `File: ${formatBytes(file.size)}${file.type ? `, ${file.type}` : ''}`
    ];
    if (spec.thumbs) {
      // The thumbnail tool also saves the picture, which is the point of it.
      const size = scaleToFit({ w: v.videoWidth, h: v.videoHeight }, 1280, 1280);
      const canvas = deps.createCanvas(size.w, size.h);
      await new Promise((resolve, reject) => {
        v.addEventListener('seeked', resolve, { once: true });
        v.addEventListener('error', () => reject(Error('Seeking failed.')), { once: true });
        v.currentTime = Math.min(0.5, (v.duration || 1) / 4);
      });
      canvas.getContext('2d').drawImage(v, 0, 0, size.w, size.h);
      await canvasToFile(canvas, 'image/png', 1, (file.name || 'video').replace(/\.[^.]+$/, '') + '-thumbnail.png');
      lines.push(`Saved a ${size.w}×${size.h} thumbnail.`);
    }
    setOut(body, lines.join('\n'));
  } finally { try { deps.revokeObjectURL(url); } catch { /* already gone */ } }
}

/* ------------------------------------------------------------------ *
 * The tools
 * ------------------------------------------------------------------ */

const RECORD = { accept: 'video/*', label: 'Choose a video', run: 'Record' };
const clipFields = { start: true, end: true, size: true };

export const VIDEO_TOOLS = {
  'Video Trimmer': { ...RECORD, kind: 'trim', size: true, run: 'Trim', start: true, end: true },
  // Cutter removes a section; Trimmer keeps one. They are not the same job.
  'Video Cutter': { ...RECORD, kind: 'cutout', run: 'Cut out', start: true, end: true, cut: true },
  'Mute Video': { ...RECORD, kind: 'mute', run: 'Remove audio' },
  'Video Compressor': { ...RECORD, kind: 'compress', run: 'Compress', size: true, bitrate: true, fps: true },
  'Resize Video': { ...RECORD, kind: 'resize', run: 'Resize', size: true },
  'Crop Video': { ...RECORD, kind: 'crop', run: 'Crop', size: true, defaultMode: 'cover' },
  'Rotate Video': { ...RECORD, kind: 'rotate', run: 'Rotate', rotate: true },
  'Video Merger': { accept: 'video/*', label: 'Choose the clips, in order', run: 'Join', multiple: true, kind: 'merge' },
  'MP4 to WebM': { ...RECORD, kind: 'convert', run: 'Convert to WebM' },
  'WebM to MP4': { ...RECORD, kind: 'convert', run: 'Convert to MP4' },
  'GIF to MP4': { accept: 'image/gif', label: 'Choose a GIF', run: 'Convert to video', gifSource: true },
  'Extract Audio': { accept: 'video/*,audio/*', label: 'Choose a video or audio file', run: 'Extract audio', audioOnly: true },
  'Extract Frames': { accept: 'video/*', label: 'Choose a video', run: 'Extract frames', frames: true },
  'Video to GIF': { accept: 'video/*', label: 'Choose a video', run: 'Make a GIF', gif: true },
  'Video Contact Sheet': { accept: 'video/*', label: 'Choose a video', run: 'Contact sheet', sheet: true },
  'Video Thumbnail Extractor': { accept: 'video/*', label: 'Choose a video', run: 'Capture frame', probe: true, thumbs: true },
  'Public Video Frame Extractor': { accept: 'video/*', label: 'Choose a video', run: 'Capture frame', probe: true, thumbs: true }
};

/** Mounts a video tool by title; unknown titles mount the studio. */
export function mountVideoTool(root, tool) {
  const spec = VIDEO_TOOLS[tool.title];
  if (spec) return videoTool(root, tool, spec);
  if (tool.title === 'Video Duration' || tool.title === 'Video Metadata Viewer') {
    return videoTool(root, tool, { accept: 'video/*', label: 'Choose a video', run: 'Inspect', probe: true });
  }
  return null;
}
