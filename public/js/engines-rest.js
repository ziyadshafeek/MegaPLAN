import * as kit from './kit.js';
import { HANDLERS, textTool, calcTool, fileTool, aiTool, imageOp, audioBufferTool, wavFromBuffer, docPdf, qrDataUrl } from './engines.js';
import { mountAudioStudio } from './audio-studio.js';
import { mountYouTubeTranscript, mountYouTubePlaylist, mountYouTubeChapter } from './youtube-tools.js';
import { mountAIMode } from './ai-mode.js';
import { mountAgenticPdfSplitter, mountQuestionPaperToNotes } from './agentic-pdf.js';
import { mountChess, mount2048, mountSnake, mountTicTacToe, mountMinesweeper, mountTetris } from './games.js';
import { mountMaps } from './maps-tool.js';
import { mountInstagramOSINT, mountOSINTAdvanced } from './osint-advanced.js';
import { mountMapDirectory, mountMapAutoScraper } from './map-directory.js';
import { mountKeralaExpansion } from './kerala-expansion.js';
import { mountKeralaDirectoryFull } from './kerala-directory-full.js';
import { mountInceptionTool } from './inception-tool.js';
import { mountProductDirectory } from './product-directory.js';
import { mountMusicDirectory } from './music-directory.js';
import { mountCityMusicDirectory, mountCityShopDirectory } from './city-directory.js';

const { esc, downloadBlob, downloadText, inspect, loadImageFile, canvasToFile, clamp, mountShell, setOut, parseCsv, toCsv, randomString, askAssistant, loadJSZip } = kit;

function imgExtra(html) { return html; }

Object.assign(HANDLERS, {
  'Image Compressor': (r, t) => imageOp(r, t, `<div class="field-row" style="margin-top:8px"><input id="q" class="num" type="number" min="0.3" max="1" step="0.05" value="0.72" placeholder="Quality"></div>`, async (c, body) => {
    const blob = await canvasToFile(c, 'image/jpeg', Number(body.querySelector('#q').value) || 0.72, 'megaplan.jpg');
    return `Saved JPEG · ${Math.round(blob.size / 1024)} KB`;
  }),
  'Image Resizer': (r, t) => imageOp(r, t, `<input id="w" class="num" style="margin-top:8px" type="number" placeholder="Width px">`, async (c, body) => {
    const w = Number(body.querySelector('#w').value) || c.width, h = Math.max(1, Math.round(c.height * w / c.width));
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(c, 0, 0, w, h);
    const blob = await canvasToFile(cc, 'image/jpeg', 0.9, 'megaplan-resized.jpg');
    return `${w}×${h} · ${Math.round(blob.size / 1024)} KB`;
  }),
  'Image Cropper': (r, t) => imageOp(r, t, `<div class="field-row" style="margin-top:8px"><input id="x" class="num" placeholder="X" value="0"><input id="y" class="num" placeholder="Y" value="0"><input id="cw" class="num" placeholder="W"><input id="ch" class="num" placeholder="H"></div>`, async (c, body) => {
    const x = Number(body.querySelector('#x').value) || 0, y = Number(body.querySelector('#y').value) || 0;
    const w = Number(body.querySelector('#cw').value) || c.width - x, h = Number(body.querySelector('#ch').value) || c.height - y;
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
    await canvasToFile(cc, 'image/png', 1, 'cropped.png'); return `${w}×${h}`;
  }),
  'Image Rotator': (r, t) => imageOp(r, t, `<select id="deg" class="sel" style="margin-top:8px"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>`, async (c, body) => {
    const deg = Number(body.querySelector('#deg').value), swap = deg % 180 !== 0;
    const cc = document.createElement('canvas'); cc.width = swap ? c.height : c.width; cc.height = swap ? c.width : c.height;
    const ctx = cc.getContext('2d'); ctx.translate(cc.width / 2, cc.height / 2); ctx.rotate(deg * Math.PI / 180); ctx.drawImage(c, -c.width / 2, -c.height / 2);
    await canvasToFile(cc, 'image/png', 1, 'rotated.png'); return `Rotated ${deg}°`;
  }),
  'Image Flipper': (r, t) => imageOp(r, t, `<select id="axis" class="sel" style="margin-top:8px"><option value="h">Horizontal</option><option value="v">Vertical</option></select>`, async (c, body) => {
    const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d');
    if (body.querySelector('#axis').value === 'h') { ctx.translate(c.width, 0); ctx.scale(-1, 1); } else { ctx.translate(0, c.height); ctx.scale(1, -1); }
    ctx.drawImage(c, 0, 0); await canvasToFile(cc, 'image/png', 1, 'flipped.png'); return 'Flipped';
  }),
  'JPG to PNG': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/png', 1, 'converted.png'); return 'Saved PNG'; }),
  'PNG to JPG': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/jpeg', 0.9, 'converted.jpg'); return 'Saved JPEG'; }),
  'WEBP to JPG': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/jpeg', 0.9, 'converted.jpg'); return 'Saved JPEG'; }),
  'JPG to WEBP': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/webp', 0.85, 'converted.webp'); return 'Saved WebP'; }),
  'PNG to WEBP': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/webp', 0.85, 'converted.webp'); return 'Saved WebP'; }),
  'AVIF Converter': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/jpeg', 0.9, 'from-avif.jpg'); return 'Re-encoded via the browser canvas. AVIF encode support varies.'; }),
  'HEIC Converter': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/jpeg', 0.9, 'from-heic.jpg'); return 'If your browser decoded the HEIC, a JPEG was saved.'; }),
  'TIFF Converter': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/png', 1, 'from-tiff.png'); return 'Saved PNG if the browser could decode the TIFF.'; }),
  'SVG Previewer': (r, t) => textTool(r, t, s => s, `<p class="muted">Paste SVG markup, then copy or save. Preview draws below after Run.</p>`),
  'SVG to PNG': (r, t) => textTool(r, t, async s => {
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth || 800; c.height = img.naturalHeight || 600;
    c.getContext('2d').drawImage(img, 0, 0); await canvasToFile(c, 'image/png', 1, 'svg.png'); URL.revokeObjectURL(url);
    return 'Saved PNG';
  }),
  'Favicon Generator': (r, t) => imageOp(r, t, '', async c => {
    const cc = document.createElement('canvas'); cc.width = 32; cc.height = 32; cc.getContext('2d').drawImage(c, 0, 0, 32, 32);
    await canvasToFile(cc, 'image/png', 1, 'favicon-32.png'); return 'Saved 32×32 PNG favicon.';
  }),
  'ICO Converter': (r, t) => HANDLERS['Favicon Generator'](r, t),
  'Image Dimensions': (r, t) => imageOp(r, t, '', async c => `Width: ${c.width}px\nHeight: ${c.height}px\nAspect: ${(c.width / c.height).toFixed(4)}`),
  'Color Picker': (r, t) => imageOp(r, t, `<div class="field-row" style="margin-top:8px"><input id="x" class="num" value="0"><input id="y" class="num" value="0"></div>`, async (c, body) => {
    const x = Number(body.querySelector('#x').value), y = Number(body.querySelector('#y').value);
    const p = c.getContext('2d').getImageData(x, y, 1, 1).data;
    return `rgb(${p[0]}, ${p[1]}, ${p[2]})\n#${[p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }),
  'Palette Generator': (r, t) => imageOp(r, t, '', async c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, bins = new Map();
    for (let i = 0; i < d.length; i += 16) { const k = [d[i], d[i + 1], d[i + 2]].map(v => Math.round(v / 32) * 32).join(','); bins.set(k, (bins.get(k) || 0) + 1); }
    return [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => '#' + k.split(',').map(n => Number(n).toString(16).padStart(2, '0')).join('')).join('\n');
  }),
  'Dominant Color Finder': (r, t) => HANDLERS['Palette Generator'](r, t),
  'Color Palette Generator': (r, t) => HANDLERS['Palette Generator'](r, t),
  'Contrast Checker': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="fg" class="field" value="#000000"><input id="bg" class="field" value="#ffffff"></div><div class="button-row"><button class="btn primary" id="run">Check</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    const lum = hex => { const h = hex.replace('#', ''); const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); const f = v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
    body.querySelector('#run').onclick = () => {
      const a = lum(body.querySelector('#fg').value), b = lum(body.querySelector('#bg').value); const z = [a, b].sort((x, y) => y - x); const ratio = (z[0] + 0.05) / (z[1] + 0.05);
      setOut(body, `Contrast: ${ratio.toFixed(2)}:1\nAA: ${ratio >= 4.5 ? 'Pass' : 'Fail'}\nAAA: ${ratio >= 7 ? 'Pass' : 'Fail'}`);
    };
  },
  'EXIF Viewer': (r, t) => fileTool(r, t, { accept: 'image/*', label: 'Choose an image', run: 'Inspect' }, async files => {
    if (!files[0]) throw Error('Choose an image.');
    return `${files[0].name}\nType: ${files[0].type}\nSize: ${files[0].size} bytes\nLast modified: ${new Date(files[0].lastModified).toISOString()}\nA full EXIF tag dump needs a dedicated parser; this shows file-level metadata that the browser exposes.`;
  }),
  'Remove EXIF': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/jpeg', 0.92, 'no-exif.jpg'); return 'Re-encoded JPEG without original metadata packets.'; }),
  'Image Blur': (r, t) => imageOp(r, t, `<input id="r" class="num" style="margin-top:8px" type="number" value="4">`, async (c, body) => {
    const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.filter = `blur(${Number(body.querySelector('#r').value) || 4}px)`; ctx.drawImage(c, 0, 0);
    await canvasToFile(cc, 'image/jpeg', 0.9, 'blurred.jpg'); return 'Blurred';
  }),
  'Image Pixelate': (r, t) => imageOp(r, t, `<input id="b" class="num" style="margin-top:8px" type="number" value="12">`, async (c, body) => {
    const bs = Number(body.querySelector('#b').value) || 12, small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(c.width / bs)); small.height = Math.max(1, Math.ceil(c.height / bs));
    small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
    const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, cc.width, cc.height);
    await canvasToFile(cc, 'image/png', 1, 'pixelated.png'); return 'Pixelated';
  }),
  'Image Sharpen': (r, t) => imageOp(r, t, '', async c => { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.filter = 'contrast(1.15) saturate(1.05)'; ctx.drawImage(c, 0, 0); await canvasToFile(cc, 'image/jpeg', 0.92, 'sharpened.jpg'); return 'Contrast-boosted (simple sharpen).'; }),
  'Image Watermark': (r, t) => imageOp(r, t, `<input id="wm" class="field" style="margin-top:8px" value="MegaPLAN">`, async (c, body) => {
    const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.drawImage(c, 0, 0);
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(16, Math.round(Math.min(c.width, c.height) / 12))}px sans-serif`;
    ctx.textAlign = 'right'; ctx.fillText(body.querySelector('#wm').value, c.width - 20, c.height - 20);
    await canvasToFile(cc, 'image/png', 1, 'watermarked.png'); return 'Watermarked';
  }),
  'Image Background Remover': (r, t) => imageOp(r, t, `<p class="muted">Removes near-white or near-green pixels on this device. Not a studio-grade cutout.</p><select id="mode" class="sel"><option value="white">Near white</option><option value="green">Near green</option></select>`, async (c, body) => {
    const ctx = c.getContext('2d'), im = ctx.getImageData(0, 0, c.width, c.height), mode = body.querySelector('#mode').value;
    for (let i = 0; i < im.data.length; i += 4) {
      const r0 = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
      if (mode === 'white' && r0 > 245 && g > 245 && b > 245) im.data[i + 3] = 0;
      if (mode === 'green' && g > 90 && g > r0 * 1.4 && g > b * 1.4) im.data[i + 3] = 0;
    }
    ctx.putImageData(im, 0, 0); await canvasToFile(c, 'image/png', 1, 'cutout.png'); return 'Saved transparent PNG';
  }),
  'Image Border Maker': (r, t) => imageOp(r, t, `<div class="field-row" style="margin-top:8px"><input id="b" class="num" value="20"><input id="c" class="field" type="color" value="#000000"></div>`, async (c, body) => {
    const b = Number(body.querySelector('#b').value) || 20, cc = document.createElement('canvas'); cc.width = c.width + 2 * b; cc.height = c.height + 2 * b;
    const ctx = cc.getContext('2d'); ctx.fillStyle = body.querySelector('#c').value; ctx.fillRect(0, 0, cc.width, cc.height); ctx.drawImage(c, b, b);
    await canvasToFile(cc, 'image/png', 1, 'bordered.png'); return `${cc.width}×${cc.height}`;
  }),
  'Image Padding Tool': (r, t) => HANDLERS['Image Border Maker'](r, t),
  'Image Collage Maker': (r, t) => fileTool(r, t, { accept: 'image/*', multiple: true, label: 'Choose images', run: 'Collage' }, async files => {
    if (files.length < 2) throw Error('Choose at least two images.');
    const imgs = []; for (const f of files.slice(0, 6)) imgs.push(await loadImageFile(f));
    const cols = Math.ceil(Math.sqrt(imgs.length)); const rows = Math.ceil(imgs.length / cols);
    const cw = 320, ch = 240, cc = document.createElement('canvas'); cc.width = cols * cw; cc.height = rows * ch; const ctx = cc.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cc.width, cc.height);
    imgs.forEach((im, i) => ctx.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch));
    await canvasToFile(cc, 'image/jpeg', 0.9, 'collage.jpg'); return `Collage of ${imgs.length} images`;
  }),
  'Contact Sheet Maker': (r, t) => HANDLERS['Image Collage Maker'](r, t),
  'Sprite Sheet Maker': (r, t) => HANDLERS['Image Collage Maker'](r, t),
  'Passport Photo Cropper': (r, t) => imageOp(r, t, '', async c => {
    const side = Math.min(c.width, c.height), cc = document.createElement('canvas'); cc.width = 413; cc.height = 531;
    const sx = (c.width - side) / 2, sy = (c.height - side) / 2;
    cc.getContext('2d').drawImage(c, sx, sy, side, side, 0, 0, 413, 531);
    await canvasToFile(cc, 'image/jpeg', 0.92, 'passport.jpg'); return '413×531 px crop. Check your local photo rules.';
  }),
  'Signature Cropper': (r, t) => imageOp(r, t, '', async c => { await canvasToFile(c, 'image/png', 1, 'signature.png'); return 'Saved PNG. Crop first if you need a tighter box.'; }),
  'Scan Cleanup': (r, t) => imageOp(r, t, '', async c => { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.filter = 'grayscale(1) contrast(1.25)'; ctx.drawImage(c, 0, 0); await canvasToFile(cc, 'image/jpeg', 0.9, 'scan.jpg'); return 'Grayscale contrast cleanup.'; }),
  'Screenshot Cropper': (r, t) => HANDLERS['Image Cropper'](r, t),
  'Image to PDF': (r, t) => fileTool(r, t, { accept: 'image/*', multiple: true, label: 'Choose images', run: 'Make PDF' }, async files => {
    if (!files.length) throw Error('Choose images.');
    const { PDFDocument } = await kit.loadPdfLib(); const doc = await PDFDocument.create();
    for (const f of files) {
      const c = await loadImageFile(f); const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
      const img = await doc.embedJpg(await blob.arrayBuffer()); const p = doc.addPage([img.width, img.height]); p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), 'megaplan-images.pdf'); return `PDF with ${files.length} page(s)`;
  }),
  'Image OCR': (r, t) => fileTool(r, t, { accept: 'image/*', label: 'Choose an image', run: 'Read text' }, async files => {
    if (!files[0]) throw Error('Choose an image.');
    const Tesseract = (await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm')).default;
    const { data } = await Tesseract.recognize(files[0], 'eng');
    return data.text || '(no text found)';
  }),
  'Image Difference': (r, t) => fileTool(r, t, { accept: 'image/*', multiple: true, label: 'Choose two images', run: 'Compare' }, async files => {
    if (files.length < 2) throw Error('Choose two images.');
    const a = await loadImageFile(files[0]), b = await loadImageFile(files[1]);
    return `A: ${a.width}×${a.height}\nB: ${b.width}×${b.height}\n${a.width === b.width && a.height === b.height ? 'Same pixel size' : 'Different pixel size'}`;
  }),
  'Image Average Color': (r, t) => imageOp(r, t, '', async c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r0 = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r0 += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const rgb = [r0 / n, g / n, b / n].map(Math.round);
    return `rgb(${rgb.join(', ')})\n#${rgb.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }),
  'Image File Size Calculator': (r, t) => calcTool(r, t, ['Bytes'], b => `KB: ${(b / 1024).toFixed(2)}\nMB: ${(b / 1048576).toFixed(2)}`),
  'DPI Calculator': (r, t) => calcTool(r, t, ['Pixels', 'Inches'], (p, i) => i ? `DPI: ${(p / i).toFixed(2)}` : 'Enter inches.'),
  'Print Size Calculator': (r, t) => calcTool(r, t, ['Pixels', 'DPI'], (p, d) => d ? `Inches: ${(p / d).toFixed(2)}\ncm: ${(p / d * 2.54).toFixed(2)}` : 'Enter DPI.'),
  'Social Image Resizer': (r, t) => imageOp(r, t, `<select id="sz" class="sel" style="margin-top:8px"><option value="1200x630">OG 1200×630</option><option value="1080x1080">Square 1080</option><option value="1080x1920">Story 1080×1920</option></select>`, async (c, body) => {
    const [w, h] = body.querySelector('#sz').value.split('x').map(Number); const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
    const ctx = cc.getContext('2d'); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w / c.width, h / c.height); const dw = c.width * s, dh = c.height * s;
    ctx.drawImage(c, (w - dw) / 2, (h - dh) / 2, dw, dh); await canvasToFile(cc, 'image/jpeg', 0.9, 'social.jpg'); return `${w}×${h}`;
  }),
  'Thumbnail Maker': (r, t) => imageOp(r, t, '', async c => {
    const w = Math.min(320, c.width), h = Math.max(1, Math.round(c.height * w / c.width));
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(c, 0, 0, w, h);
    await canvasToFile(cc, 'image/jpeg', 0.85, 'thumb.jpg'); return `${w}×${h}`;
  }),
  'Photo Strip Maker': (r, t) => HANDLERS['Image Collage Maker'](r, t),
  'Round Image Maker': (r, t) => imageOp(r, t, `<input id="rad" class="num" style="margin-top:8px" value="40">`, async (c, body) => {
    const rad = Number(body.querySelector('#rad').value) || 40, cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height;
    const ctx = cc.getContext('2d'); ctx.beginPath(); ctx.moveTo(rad, 0); ctx.arcTo(cc.width, 0, cc.width, cc.height, rad); ctx.arcTo(cc.width, cc.height, 0, cc.height, rad); ctx.arcTo(0, cc.height, 0, 0, rad); ctx.arcTo(0, 0, cc.width, 0, rad); ctx.closePath(); ctx.clip(); ctx.drawImage(c, 0, 0);
    await canvasToFile(cc, 'image/png', 1, 'round.png'); return 'Rounded';
  }),
  'Transparent PNG Maker': (r, t) => HANDLERS['Image Background Remover'](r, t),
});

Object.assign(HANDLERS, {
  'Audio Duration': (r, t) => audioBufferTool(r, t, async (_ac, buf, file) => `${file.name}\nDuration: ${buf.duration.toFixed(2)} s\nChannels: ${buf.numberOfChannels}\nSample rate: ${buf.sampleRate}`),
  'Audio Metadata Viewer': (r, t) => HANDLERS['Audio Duration'](r, t),
  'Remove Audio Metadata': (r, t) => audioBufferTool(r, t, async (_ac, buf) => { downloadBlob(wavFromBuffer(buf), 'megaplan-audio.wav'); return 'Rewrote as WAV without original tags.'; }),
  'Audio Trimmer': (r, t) => {
    const body = mountShell(r, t, kit.fileForm({ accept: 'audio/*', extra: `<div class="field-row" style="margin-top:8px"><input id="a" class="num" placeholder="Start s" value="0"><input id="b" class="num" placeholder="End s"></div>`, label: 'Choose audio', run: 'Trim' }));
    const drop = kit.wireDrop(body);
    body.querySelector('#run').onclick = async () => {
      try {
        const f = drop.getFiles()[0]; if (!f) throw Error('Choose audio.');
        const ac = new AudioContext(); const buf = await ac.decodeAudioData(await f.arrayBuffer());
        const start = Number(body.querySelector('#a').value) || 0, end = Number(body.querySelector('#b').value) || buf.duration;
        downloadBlob(wavFromBuffer(buf, start, end), 'trimmed.wav'); await ac.close(); setOut(body, 'Saved WAV');
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
  },
  'Audio Cutter': (r, t) => HANDLERS['Audio Trimmer'](r, t),
  'Podcast Intro Trimmer': (r, t) => HANDLERS['Audio Trimmer'](r, t),
  'Audio Splitter': (r, t) => HANDLERS['Audio Trimmer'](r, t),
  'Audio Merger': (r, t) => fileTool(r, t, { accept: 'audio/*', multiple: true, label: 'Choose audio files', run: 'Merge' }, async files => {
    if (files.length < 2) throw Error('Choose at least two files.');
    const ac = new AudioContext(); const bufs = []; for (const f of files) bufs.push(await ac.decodeAudioData(await f.arrayBuffer()));
    const sr = bufs[0].sampleRate, ch = bufs[0].numberOfChannels, total = bufs.reduce((s, b) => s + b.length, 0);
    const out = ac.createBuffer(ch, total, sr); let off = 0;
    for (const b of bufs) { for (let c = 0; c < ch; c++) out.getChannelData(c).set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), off); off += b.length; }
    downloadBlob(wavFromBuffer(out), 'merged.wav'); await ac.close(); return `Merged ${files.length} files`;
  }),
  'Audio Normalizer': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (const x of d) peak = Math.max(peak, Math.abs(x)); }
    const g = peak ? 0.95 / peak : 1;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
    downloadBlob(wavFromBuffer(buf), 'normalized.wav'); return `Peak gain ×${g.toFixed(3)}`;
  }),
  'Volume Changer': (r, t) => HANDLERS['Audio Normalizer'](r, t),
  'Audio Compressor': (r, t) => HANDLERS['Audio Normalizer'](r, t),
  'Mono to Stereo': (r, t) => audioBufferTool(r, t, async (ac, buf) => {
    const out = ac.createBuffer(2, buf.length, buf.sampleRate);
    out.getChannelData(0).set(buf.getChannelData(0)); out.getChannelData(1).set(buf.getChannelData(0));
    downloadBlob(wavFromBuffer(out), 'stereo.wav'); return 'Duplicated mono to both channels.';
  }),
  'Stereo to Mono': (r, t) => audioBufferTool(r, t, async (ac, buf) => {
    const out = ac.createBuffer(1, buf.length, buf.sampleRate); const d = out.getChannelData(0);
    for (let i = 0; i < buf.length; i++) { let s = 0; for (let c = 0; c < buf.numberOfChannels; c++) s += buf.getChannelData(c)[i]; d[i] = s / buf.numberOfChannels; }
    downloadBlob(wavFromBuffer(out), 'mono.wav'); return 'Mixed to mono.';
  }),
  'Sample Rate Converter': (r, t) => HANDLERS['Audio Duration'](r, t),
  'Silence Detector': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    const d = buf.getChannelData(0); let silent = 0; for (let i = 0; i < d.length; i += 64) if (Math.abs(d[i]) < 0.01) silent++;
    return `Approx. quiet frames: ${silent} / ${Math.ceil(d.length / 64)}`;
  }),
  'Silence Remover': (r, t) => HANDLERS['Silence Detector'](r, t),
  'Waveform Viewer': (r, t) => {
    const body = mountShell(r, t, kit.fileForm({ accept: 'audio/*', extra: `<div style="margin-top:10px"><canvas id="wf" style="width:100%;height:120px;background:#1a1613;border-radius:8px"></canvas></div>`, label: 'Choose audio', run: 'Show waveform' }));
    const drop = kit.wireDrop(body);
    body.querySelector('#run').onclick = async () => {
      try {
        const f = drop.getFiles()[0]; if (!f) throw Error('Choose audio');
        const ac = new AudioContext(); const buf = await ac.decodeAudioData(await f.arrayBuffer());
        const canvas = body.querySelector('#wf');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1613'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const data = buf.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / canvas.width));
        ctx.strokeStyle = '#e8b44c'; ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          const s = Math.floor((x / canvas.width) * data.length);
          const e = Math.min(data.length, s + step);
          let min = 1, max = -1;
          for (let i = s; i < e; i += Math.max(1, Math.floor(step / 4))) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
          const y1 = (1 - (max * 0.5 + 0.5)) * canvas.height;
          const y2 = (1 - (min * 0.5 + 0.5)) * canvas.height;
          if (x === 0) ctx.moveTo(x, y1); ctx.lineTo(x, y1); ctx.lineTo(x, y2);
        }
        ctx.stroke();
        setOut(body, `${f.name}\nDuration ${buf.duration.toFixed(2)}s · ${buf.sampleRate}Hz · ${buf.numberOfChannels}ch`);
        await ac.close();
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
  },
  'Audio Fade In': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    const n = Math.min(buf.length, Math.floor(buf.sampleRate * 1.5));
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= i / n; }
    downloadBlob(wavFromBuffer(buf), 'fade-in.wav'); return '1.5s fade-in applied.';
  }),
  'Audio Fade Out': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    const n = Math.min(buf.length, Math.floor(buf.sampleRate * 1.5));
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n; }
    downloadBlob(wavFromBuffer(buf), 'fade-out.wav'); return '1.5s fade-out applied.';
  }),
  'Podcast Loudness Checker': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    const d = buf.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 8) s += d[i] * d[i];
    const rms = Math.sqrt(s / (d.length / 8));
    return `RMS (rough): ${rms.toFixed(4)}\nThis is not LUFS. Use it as a relative loudness check.`;
  }),
  'WAV to MP3': (r, t) => {
    const body = mountShell(r, t, kit.fileForm({ accept: 'audio/*', extra: `<p class="muted">Converts to MP3 in this browser using lamejs when available, otherwise saves WAV. For best results use Audio Studio.</p><div class="field-row" style="margin-top:8px"><select id="kbps" class="sel"><option value="128">128 kbps</option><option value="192" selected>192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></div>`, label: 'Choose audio', run: 'Convert to MP3' }));
    const drop = kit.wireDrop(body);
    body.querySelector('#run').onclick = async () => {
      try {
        const f = drop.getFiles()[0]; if (!f) throw Error('Choose audio');
        const ac = new AudioContext(); const buf = await ac.decodeAudioData(await f.arrayBuffer());
        const kbps = Number(body.querySelector('#kbps').value) || 192;
        setOut(body, 'Encoding MP3… (first time loads encoder)');
        // try lamejs
        let lame = window.lamejs;
        if (!lame) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
            s.onload = res; s.onerror = rej; document.head.appendChild(s);
          }).catch(() => {});
          lame = window.lamejs;
        }
        if (lame) {
          const Mp3Encoder = lame.Mp3Encoder;
          const enc = new Mp3Encoder(buf.numberOfChannels, buf.sampleRate, kbps);
          const left = buf.getChannelData(0);
          const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
          const l = new Int16Array(left.length);
          for (let i = 0; i < left.length; i++) l[i] = Math.max(-32768, Math.min(32767, left[i] * 32767));
          let r = null;
          if (right) { r = new Int16Array(right.length); for (let i = 0; i < right.length; i++) r[i] = Math.max(-32768, Math.min(32767, right[i] * 32767)); }
          const block = 1152;
          const out = [];
          for (let i = 0; i < l.length; i += block) {
            const b = enc.encodeBuffer(l.subarray(i, i + block), r ? r.subarray(i, i + block) : undefined);
            if (b.length) out.push(b);
          }
          const end = enc.flush(); if (end.length) out.push(end);
          downloadBlob(new Blob(out, { type: 'audio/mpeg' }), f.name.replace(/\.[^.]+$/, '') + '.mp3');
          setOut(body, `Saved MP3 ${kbps} kbps · ${Math.round(out.reduce((s, x) => s + x.length, 0) / 1024)} KB`);
        } else {
          downloadBlob(wavFromBuffer(buf), f.name.replace(/\.[^.]+$/, '') + '.wav');
          setOut(body, 'MP3 encoder not available offline — saved WAV instead. Try Audio Studio for offline WAV.');
        }
        await ac.close();
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
  },
  'MP3 to WAV': (r, t) => audioBufferTool(r, t, async (_ac, buf, file) => { downloadBlob(wavFromBuffer(buf), (file.name.replace(/\.[^.]+$/, '') || 'audio') + '.wav'); return `Decoded ${file.name} to WAV · ${buf.duration.toFixed(2)}s`; }),
  'M4A to MP3': (r, t) => HANDLERS['WAV to MP3'](r, t),
  'OGG to MP3': (r, t) => HANDLERS['WAV to MP3'](r, t),
  'FLAC Converter': (r, t) => HANDLERS['MP3 to WAV'](r, t),
  'Audio Denoiser': (r, t) => audioBufferTool(r, t, async (_ac, buf) => {
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) < 0.008) d[i] = 0; }
    downloadBlob(wavFromBuffer(buf), 'gated.wav'); return 'Applied a simple noise gate. Not an ML denoiser.';
  }),
  'Speech Cleanup': (r, t) => HANDLERS['Audio Denoiser'](r, t),
  'Audio Dereverb': (r, t) => HANDLERS['Audio Denoiser'](r, t),
  'Voice Isolation': (r, t) => HANDLERS['Audio Denoiser'](r, t),
  'Speech to Text': (r, t) => {
    const body = mountShell(r, t, `<p class="muted">Uses this device’s speech recognizer when the browser provides one. Nothing is labeled as a downloadable model.</p><div class="button-row"><button class="btn primary" id="run">Start listening</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Rec) return setOut(body, 'Speech recognition is not available in this browser.');
      const rec = new Rec(); rec.lang = 'en-IN'; rec.onresult = e => setOut(body, e.results[0][0].transcript); rec.onerror = e => setOut(body, e.error); rec.start();
      setOut(body, 'Listening…');
    };
  },
  'Transcript Cleaner': (r, t) => textTool(r, t, s => s.replace(/\b(um|uh|like)\b/gi, '').replace(/\s+/g, ' ').trim()),
});

Object.assign(HANDLERS, {
  'Video Duration': (r, t) => fileTool(r, t, { accept: 'video/*', label: 'Choose a video', run: 'Inspect' }, async files => {
    if (!files[0]) throw Error('Choose a video.');
    const v = document.createElement('video'); v.src = URL.createObjectURL(files[0]); await v.play().catch(() => {}); v.pause();
    return `${files[0].name}\nDuration: ${Number.isFinite(v.duration) ? v.duration.toFixed(2) : '?'} s\nSize: ${Math.round(files[0].size / 1024)} KB`;
  }),
  'Video Metadata Viewer': (r, t) => HANDLERS['Video Duration'](r, t),
  'Video Thumbnail Extractor': (r, t) => fileTool(r, t, { accept: 'video/*', label: 'Choose a video', run: 'Capture frame' }, async files => {
    if (!files[0]) throw Error('Choose a video.');
    const v = document.createElement('video'); v.src = URL.createObjectURL(files[0]); v.muted = true; await v.play().catch(() => {}); v.pause(); v.currentTime = 0.1;
    await new Promise(res => v.onseeked = res);
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    await canvasToFile(c, 'image/jpeg', 0.9, 'frame.jpg'); return `${c.width}×${c.height}`;
  }),
  'Extract Frames': (r, t) => HANDLERS['Video Thumbnail Extractor'](r, t),
  'Video to GIF': (r, t) => HANDLERS['Video Thumbnail Extractor'](r, t),
  'Mute Video': (r, t) => fileTool(r, t, { accept: 'video/*', label: 'Choose a video', run: 'Note' }, async () => 'This browser desk can inspect and capture frames. Re-encoding a muted MP4 needs a heavier encoder than this page ships.'),
  'Video Compressor': (r, t) => HANDLERS['Mute Video'](r, t),
  'Video Trimmer': (r, t) => HANDLERS['Mute Video'](r, t),
  'Video Cutter': (r, t) => HANDLERS['Mute Video'](r, t),
  'Video Merger': (r, t) => HANDLERS['Mute Video'](r, t),
  'Extract Audio': (r, t) => HANDLERS['Mute Video'](r, t),
  'GIF to MP4': (r, t) => HANDLERS['Mute Video'](r, t),
  'MP4 to WebM': (r, t) => HANDLERS['Mute Video'](r, t),
  'WebM to MP4': (r, t) => HANDLERS['Mute Video'](r, t),
  'Resize Video': (r, t) => HANDLERS['Mute Video'](r, t),
  'Crop Video': (r, t) => HANDLERS['Mute Video'](r, t),
  'Rotate Video': (r, t) => HANDLERS['Mute Video'](r, t),
  'Video Contact Sheet': (r, t) => HANDLERS['Video Thumbnail Extractor'](r, t),
  'Subtitle Extractor': (r, t) => textTool(r, t, s => s.split(/\r?\n/).map(x => x.trim()).filter(x => x && x !== 'WEBVTT' && !/^\d+$/.test(x) && !/-->/.test(x)).join('\n'), '<p class="muted">Paste SRT/VTT captions to extract dialogue; video files are not decoded here.</p>'),
  'Subtitle Formatter': (r, t) => textTool(r, t, s => s.replace(/\r/g, '')),
  'Subtitle Timing Helper': (r, t) => textTool(r, t, s => s),
  'Transcript to SRT': (r, t) => textTool(r, t, s => s.split(/\n\s*\n/).map((p, i) => `${i + 1}\n00:00:${String(i * 5).padStart(2, '0')},000 --> 00:00:${String(i * 5 + 4).padStart(2, '0')},000\n${p.trim()}`).join('\n\n')),
  'SRT to VTT': (r, t) => textTool(r, t, s => 'WEBVTT\n\n' + s.replace(/(\d+),(\d+)/g, '$1.$2')),
  'VTT to SRT': (r, t) => textTool(r, t, s => s.replace(/^WEBVTT\s*/i, '').replace(/(\d+)\.(\d+)/g, '$1,$2').trim()),
  'Frame Rate Calculator': (r, t) => calcTool(r, t, ['Frames', 'Seconds'], (f, s) => s ? `${(f / s).toFixed(3)} fps` : 'Enter seconds.'),
  'Video Bitrate Calculator': (r, t) => calcTool(r, t, ['Size MB', 'Duration s'], (m, d) => d ? `${((m * 8 * 1024) / d).toFixed(1)} kbps` : 'Enter duration.'),
});

const AI_MAP = {
  'OCR Image to Text': ['extract', 'Read all visible text from the description. If only an image was mentioned, ask for pasted text; this writing path is for text.'],
  'Handwriting OCR': ['extract', 'Clean handwriting-like text.'],
  'Receipt OCR': ['json', 'Extract merchant, date, items, totals as JSON.'],
  'Invoice OCR': ['json', 'Extract invoice number, dates, parties, line items, totals as JSON.'],
  'Table OCR': ['custom', 'Turn the text into a markdown table.'],
  'Form OCR': ['json', 'Extract form fields as JSON.'],
  'ID Document OCR': ['custom', 'Mask ID numbers except last 4. Extract labels only. Do not store identities.'],
  'Document Classifier': ['classify'],
  'Document JSON Extractor': ['json'],
  'Smart Note Maker': ['notes'],
  'Lecture Note Maker': ['lecture'],
  'Meeting Note Maker': ['meeting'],
  'Transcript Summarizer': ['summarize'],
  'Study Guide Maker': ['study'],
  'Flashcard Maker': ['flashcards'],
  'Quiz Maker': ['quiz'],
  'Action Item Extractor': ['meeting'],
  'Citation Extractor': ['citations'],
  'Abstract Summarizer': ['summarize'],
  'Key Point Extractor': ['notes'],
  'Email Summarizer': ['email'],
  'Text Rewriter': ['rewrite'],
  'Text Cleaner': ['cleaner'],
  'Entity Extractor': ['entities']
};
for (const [title, [task, extra]] of Object.entries(AI_MAP)) {
  HANDLERS[title] = (r, t) => aiTool(r, t, task, extra);
}

const DOCS = ['Invoice Maker', 'Quotation Maker', 'Receipt Maker', 'Purchase Order Maker', 'Proforma Invoice', 'Credit Note Maker', 'Debit Note Maker', 'Delivery Challan', 'Packing Slip', 'Payslip Maker', 'Timesheet Maker', 'Attendance Sheet', 'Expense Report', 'Petty Cash Sheet', 'Inventory Sheet', 'Label Maker', 'Business Card Maker', 'Letterhead Maker', 'Proposal Maker', 'SOP Maker', 'Meeting Minutes Maker', 'Meeting Agenda Maker', 'Shipping Label Maker', 'Invoice PDF Maker'];
for (const title of DOCS) HANDLERS[title] = (r, t) => docPdf(r, t, { title });

Object.assign(HANDLERS, {
  'SKU Generator': (r, t) => textTool(r, t, () => 'SKU-' + randomString(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')),
  'Invoice Number Generator': (r, t) => textTool(r, t, () => 'INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + randomString(4, '0123456789')),
  'Barcode Generator': (r, t) => textTool(r, t, s => `Code payload: ${s.trim()}\nUse a dedicated barcode font or printer for Code128 rendering. This stores the payload.`),
  'Barcode': (r, t) => HANDLERS['Barcode Generator'](r, t),
  'Email Signature Maker': (r, t) => textTool(r, t, (s, body) => `${body.querySelector('#n').value}\n${body.querySelector('#r').value}\n${s}`, `<div class="field-row" style="margin-top:8px"><input id="n" class="field" placeholder="Name"><input id="r" class="field" placeholder="Role"></div>`),
  'QR Business Card': (r, t) => textTool(r, t, async s => { const url = await qrDataUrl(s); const a = document.createElement('a'); a.href = url; a.download = 'card-qr.png'; a.click(); return 'Saved QR PNG'; }),
  'UTM Builder': (r, t) => textTool(r, t, (s, body) => {
    const u = new URL(s); u.searchParams.set('utm_source', body.querySelector('#src').value); u.searchParams.set('utm_medium', body.querySelector('#med').value); u.searchParams.set('utm_campaign', body.querySelector('#camp').value); return u.toString();
  }, `<div class="field-row" style="margin-top:8px"><input id="src" class="field" placeholder="source"><input id="med" class="field" placeholder="medium"><input id="camp" class="field" placeholder="campaign"></div>`),
  'Purchase Tracker': (r, t) => textTool(r, t, s => {
    let total = 0;
    const rows = s.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [name, qty, price] = line.split('|').map(x => x.trim());
      const q = Number(qty), p = Number(price);
      if (!name || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) throw Error('Use Item | Quantity | Unit price on each line.');
      const amount = q * p; total += amount;
      return `${name}: ${q} × ${p.toFixed(2)} = ${amount.toFixed(2)}`;
    });
    if (!rows.length) throw Error('Add at least one purchase.');
    return rows.join('\n') + `\nTotal: ${total.toFixed(2)}`;
  }, '<p class="muted">One purchase per line: Item | Quantity | Unit price</p>'),
  'CGPA Calculator': (r, t) => textTool(r, t, s => {
    const rows = s.split(/\r?\n/).map(x => x.split(/[,\s]+/).map(Number)).filter(x => x.length >= 2 && x.every(Number.isFinite));
    const cr = rows.reduce((a, [g, c]) => a + c, 0), gp = rows.reduce((a, [g, c]) => a + g * c, 0);
    return cr ? `CGPA: ${(gp / cr).toFixed(3)}` : 'Enter grade,credits per line.';
  }),
  'GPA Converter': (r, t) => calcTool(r, t, ['GPA /10'], a => `Approx 4.0 scale: ${(a / 10 * 4).toFixed(2)}`),
  'Grade Calculator': (r, t) => HANDLERS['CGPA Calculator'](r, t),
  'Marks Percentage': (r, t) => calcTool(r, t, ['Scored', 'Total'], (a, b) => b ? `${(a / b * 100).toFixed(2)}%` : 'Enter total.'),
  'Study Planner': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map((x, i) => `Day ${i + 1}: ${x}`).join('\n')),
  'Study Timer': (r, t) => timerTool(r, t, 25 * 60),
  'Pomodoro Timer': (r, t) => timerTool(r, t, 25 * 60),
  'Pomodoro': (r, t) => timerTool(r, t, 25 * 60),
  'Countdown Timer': (r, t) => timerTool(r, t, 60),
  'Stopwatch': (r, t) => timerTool(r, t, 0, true),
  'MCQ Worksheet Maker': (r, t) => aiTool(r, t, 'quiz'),
  'Citation Formatter': (r, t) => textTool(r, t, s => s),
  'APA Citation Helper': (r, t) => textTool(r, t, (s, b) => `${b.querySelector('#a').value} (${b.querySelector('#y').value}). ${s}.`),
  'MLA Citation Helper': (r, t) => textTool(r, t, (s, b) => `${b.querySelector('#a').value}. ${s}. ${b.querySelector('#y').value}.`),
  'Chicago Citation Helper': (r, t) => HANDLERS['APA Citation Helper'](r, t),
  'Vancouver Citation Helper': (r, t) => HANDLERS['APA Citation Helper'](r, t),
  'Reference List Cleaner': (r, t) => textTool(r, t, s => [...new Set(s.split(/\r?\n/).map(x => x.trim()).filter(Boolean))].sort().join('\n')),
  'Note Outline Maker': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n')),
  'Lecture Note Formatter': (r, t) => HANDLERS['Note Outline Maker'](r, t),
  'PDF Study Pack Maker': (r, t) => HANDLERS['Note Outline Maker'](r, t),
  'Question Paper Formatter': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map((x, i) => `Q${i + 1}. ${x}`).join('\n\n')),
  'Answer Sheet Generator': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map((x, i) => `${i + 1}. ${x}\nAnswer: ________\n`).join('\n')),
  'Timetable Maker': (r, t) => textTool(r, t, s => {
    const rows = s.split(/\r?\n/).filter(Boolean).map(line => line.split('|').map(x => x.trim()));
    if (!rows.length || rows.some(row => row.length !== 3)) throw Error('Use Day | Time | Activity on each line.');
    return ['| Day | Time | Activity |', '| --- | --- | --- |', ...rows.map(row => '| ' + row.map(x => x.replace(/\|/g, '\\|')).join(' | ') + ' |')].join('\n');
  }, '<p class="muted">One entry per line: Day | Time | Activity</p>'),
  'Exam Countdown': (r, t) => {
    const body = mountShell(r, t, `<input id="d" class="field" type="date"><div class="button-row"><button class="btn primary" id="run">Days left</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = () => { const d = new Date(body.querySelector('#d').value + 'T00:00:00'); setOut(body, `${Math.ceil((d - Date.now()) / 86400000)} days`); };
  },
  'Semester Planner': (r, t) => HANDLERS['Study Planner'](r, t),
});

function timerTool(root, tool, seconds, stopwatch = false) {
  const body = mountShell(root, tool, `<div class="button-row"><button class="btn primary" id="run">${stopwatch ? 'Start' : 'Start timer'}</button><button class="btn secondary" id="stop">Stop</button></div><pre id="tool-out" class="out" style="margin-top:12px">${stopwatch ? '0.0' : seconds}</pre>`);
  let t0, id;
  body.querySelector('#run').onclick = () => {
    clearInterval(id); t0 = Date.now();
    id = setInterval(() => {
      if (stopwatch) setOut(body, ((Date.now() - t0) / 1000).toFixed(1));
      else setOut(body, Math.max(0, seconds - Math.floor((Date.now() - t0) / 1000)) + ' s');
    }, 200);
  };
  body.querySelector('#stop').onclick = () => clearInterval(id);
}

Object.assign(HANDLERS, {
  'PII Masker': (r, t) => textTool(r, t, s => s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[email]').replace(/\b\d{10,}\b/g, '[number]')),
  'Email Masker': (r, t) => textTool(r, t, s => s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, m => m[0] + '***@' + m.split('@')[1])),
  'Phone Number Masker': (r, t) => textTool(r, t, s => s.replace(/\d(?=\d{4})/g, '•')),
  'Text Anonymizer': (r, t) => HANDLERS['PII Masker'](r, t),
  'Metadata Inspector': (r, t) => fileTool(r, t, { label: 'Choose a file', run: 'Inspect' }, async files => files[0] ? `${files[0].name}\n${files[0].type}\n${files[0].size} bytes` : 'Choose a file.'),
  'Remove Metadata': (r, t) => HANDLERS['Remove EXIF'](r, t),
  'Secure Password Generator': (r, t) => textTool(r, t, () => randomString(20, 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%')),
  'Passphrase Generator': (r, t) => textTool(r, t, () => ['correct', 'river', 'maple', 'lantern', 'orbit', 'cocoa', 'velvet', 'nimbus', 'pebble', 'saffron', 'harbor', 'quill'].sort(() => Math.random() - 0.5).slice(0, 5).join('-')),
  'Password Strength Checker': (r, t) => textTool(r, t, s => {
    let score = 0; if (s.length >= 12) score++; if (/[A-Z]/.test(s) && /[a-z]/.test(s)) score++; if (/\d/.test(s)) score++; if (/[^A-Za-z0-9]/.test(s)) score++;
    return ['Very weak', 'Weak', 'Okay', 'Strong', 'Stronger'][score];
  }),
  'URL Privacy Cleaner': (r, t) => textTool(r, t, s => { const u = new URL(s); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(k => u.searchParams.delete(k)); return u.toString(); }),
  'HTTP Security Header Viewer': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('headers', { url: s.trim() }), null, 2)),
  'CSP Helper': (r, t) => textTool(r, t, () => "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'"),
  'Robots.txt Viewer': (r, t) => textTool(r, t, async s => { const j = await inspect('robots', { url: s.trim().startsWith('http') ? s.trim() : 'https://' + s.trim() }); return j.body; }),
  'Sitemap Viewer': (r, t) => textTool(r, t, async s => { const j = await inspect('sitemap', { url: s.trim().startsWith('http') ? s.trim() : 'https://' + s.trim() }); return j.body; }),
  'TLS Certificate Inspector': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('tls', { host: s.trim().replace(/^https?:\/\//, '').split('/')[0] }), null, 2)),
  'Redirect Chain Viewer': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('redirects', { url: s.trim() }), null, 2)),
  'DNS Record Viewer': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('dns', { host: s.trim() }), null, 2)),
  'IP/ASN Lookup Interface': (r, t) => textTool(r, t, s => `Parsed: ${s.trim()}\nThis desk does not query a commercial ASN database.`),
  'Public URL Inspector': (r, t) => textTool(r, t, async s => JSON.stringify(await inspect('metadata', { url: s.trim() }), null, 2)),
  'Image Perceptual Hash': (r, t) => imageOp(r, t, '', async c => {
    const cc = document.createElement('canvas'); cc.width = 8; cc.height = 8; cc.getContext('2d').drawImage(c, 0, 0, 8, 8);
    const d = cc.getContext('2d').getImageData(0, 0, 8, 8).data; const g = []; for (let i = 0; i < d.length; i += 4) g.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    const avg = g.reduce((a, b) => a + b, 0) / g.length; return g.map(x => x > avg ? '1' : '0').join('');
  }),
  'URL Metadata Inspector': (r, t) => HANDLERS['Public URL Inspector'](r, t),
  'DNS Lookup': (r, t) => HANDLERS['DNS Record Viewer'](r, t),
  'ASN Lookup': (r, t) => HANDLERS['IP/ASN Lookup Interface'](r, t),
  'HTTP Headers Inspector': (r, t) => HANDLERS['HTTP Security Header Viewer'](r, t),
  'Redirect Chain Inspector': (r, t) => HANDLERS['Redirect Chain Viewer'](r, t),
  'Robots.txt Inspector': (r, t) => HANDLERS['Robots.txt Viewer'](r, t),
  'Sitemap Inspector': (r, t) => HANDLERS['Sitemap Viewer'](r, t),
  'Public Profile URL Checker': (r, t) => {
    const body = mountShell(r, t, `<input id="url" class="field" placeholder="https://instagram.com/username or any public profile URL"><div class="button-row"><button class="btn primary" id="run">Inspect</button><button class="btn secondary" id="copy">Copy</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre><div id="extra" style="margin-top:8px"></div>`);
    body.querySelector('#run').onclick = async () => {
      const s = body.querySelector('#url').value.trim();
      try {
        const u = new URL(s.startsWith('http') ? s : 'https://' + s);
        setOut(body, `Checking ${u.href}…`);
        const r = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'metadata', url: u.href }) });
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        setOut(body, `URL: ${j.finalUrl}\nStatus: ${j.status}\nTitle: ${j.title}\nContent-Type: ${j.contentType}\n\nPublic OSINT only — checks if URL exists, no login, no bypass.\nOpen manually to verify: ${u.href}`);
        body.querySelector('#extra').innerHTML = `<div class="note">Status ${j.status} — ${j.status===200 ? 'likely exists (public)' : 'may not exist or blocked'}. <a href="${esc(u.href)}" target="_blank" rel="noopener">Open ${esc(u.hostname)}</a></div>`;
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
    body.querySelector('#copy').onclick = async () => { const txt = body.querySelector('#tool-out').textContent; if (txt) { await navigator.clipboard.writeText(txt); toast('Copied'); } };
  },
  'Username Permutation Generator': (r, t) => textTool(r, t, s => { const b = s.trim().toLowerCase().replace(/\s+/g, ''); return [b, b + '1', b + '_', 'the' + b, b + 'hq', b + '123', b + '.official', 'real' + b].join('\n'); }),
  'Public Social Link Extractor': (r, t) => textTool(r, t, s => (s.match(/https?:\/\/[^\s]+/g) || []).join('\n') || 'No URLs found.'),
  'Public Instagram URL Inspector': (r, t) => {
    const body = mountShell(r, t, `<input id="url" class="field" placeholder="https://instagram.com/username"><div class="button-row"><button class="btn primary" id="run">Inspect Instagram (public)</button><button class="btn secondary" id="all">Check all platforms</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre><div id="extra" style="margin-top:8px"></div>`);
    body.querySelector('#run').onclick = async () => {
      const s = body.querySelector('#url').value.trim();
      try {
        const u = new URL(s.startsWith('http') ? s : 'https://instagram.com/' + s.replace(/^@/, ''));
        if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ''))) throw Error('Not an instagram.com URL');
        setOut(body, `Checking ${u.href}… public OSINT only, no login`);
        const r = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'metadata', url: u.href }) });
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        setOut(body, `Instagram URL: ${u.href}\nStatus: ${j.status}\nTitle: ${j.title}\nExists: ${j.status===200 ? 'Likely yes (public URL 200)' : 'No or blocked'}\n\nSafety: Only checks public URL existence, no private data, no bypass. Instagram may show login wall. Open manually: ${u.href}`);
        body.querySelector('#extra').innerHTML = `<a href="${esc(u.href)}" target="_blank" rel="noopener" class="btn secondary" style="font-size:12px">Open Instagram</a>`;
      } catch (e) { setOut(body, 'Error: ' + e.message); }
    };
    body.querySelector('#all').onclick = () => {
      const user = body.querySelector('#url').value.trim().split('/').filter(Boolean).pop().replace(/^@/, '');
      if (user) {
        // Redirect to Instagram OSINT Checker tool
        location.hash = '';
        history.pushState({}, '', '/tools/instagram-osint-checker');
        window.dispatchEvent(new Event('popstate'));
        location.reload();
      }
    };
  },
  'Public Page Metadata Inspector': (r, t) => HANDLERS['Public URL Inspector'](r, t),
  'Favicon Extractor': (r, t) => textTool(r, t, s => { const u = new URL(s.trim().startsWith('http') ? s.trim() : 'https://' + s.trim()); return new URL('/favicon.ico', u.origin).href; }),
  'Image EXIF Inspector': (r, t) => HANDLERS['EXIF Viewer'](r, t),
  'Domain WHOIS Interface': (r, t) => textTool(r, t, s => `Look up WHOIS for ${s.trim()} in a public WHOIS service. This desk does not proxy WHOIS (rate limits / ToS).`),
  'Email Domain Hygiene Checker': (r, t) => textTool(r, t, s => { const d = s.split('@')[1] || s; return `Domain: ${d}\nMX lookup is a public DNS check you can run with DNS Lookup.`; }),
  'Phone Country Analyzer': (r, t) => textTool(r, t, s => s.trim().startsWith('+91') ? 'Country code 91 — India' : s.trim().startsWith('+1') ? 'Country code 1 — NANP' : 'Enter a number with +country code.'),
  'IP Address Parser': (r, t) => textTool(r, t, s => {
    const p = s.trim().split('.').map(Number);
    if (p.length !== 4 || p.some(n => n < 0 || n > 255)) throw Error('Not an IPv4 address.');
    return `Octets: ${p.join(', ')}\nInteger: ${(((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0}`;
  }),
});

Object.assign(HANDLERS, {
  'CSV Cleaner': (r, t) => textTool(r, t, s => toCsv(parseCsv(s).map(row => row.map(c => c.trim())))),
  'CSV Deduplicator': (r, t) => textTool(r, t, s => { const rows = parseCsv(s); const seen = new Set(); return toCsv(rows.filter(r0 => { const k = r0.join('\0'); if (seen.has(k)) return false; seen.add(k); return true; })); }),
  'CSV Column Selector': (r, t) => textTool(r, t, (s, body) => {
    const rows = parseCsv(s), idx = body.querySelector('#cols').value.split(',').map(x => Number(x.trim()) - 1);
    return toCsv(rows.map(r0 => idx.map(i => r0[i] ?? '')));
  }, `<input id="cols" class="field" style="margin-top:8px" placeholder="Columns e.g. 1,3">`),
  'CSV Splitter': (r, t) => textTool(r, t, (s, body) => {
    const rows = parseCsv(s), n = Number(body.querySelector('#n').value) || 50, head = rows[0];
    let part = 0;
    for (let i = 1; i < rows.length; i += n) { part++; downloadText(toCsv([head, ...rows.slice(i, i + n)]), `part-${part}.csv`, 'text/csv'); }
    return `Wrote ${part} CSV part(s).`;
  }, `<input id="n" class="num" style="margin-top:8px" value="50">`),
  'CSV Merger': (r, t) => textTool(r, t, s => {
    const parts = s.trim().split(/\r?\n\s*---\s*\r?\n/).map(parseCsv).filter(rows => rows.length);
    if (!parts.length) throw Error('Paste two CSV datasets separated by a line containing ---');
    const header = parts[0][0].join('\0');
    for (const rows of parts.slice(1)) if (rows[0].join('\0') !== header) throw Error('CSV headers do not match.');
    return toCsv([parts[0][0], ...parts.flatMap(rows => rows.slice(1))]);
  }, '<p class="muted">Paste CSV datasets with matching headers, separated by a line containing ---.</p>'),
  'CSV Transposer': (r, t) => textTool(r, t, s => {
    const rows = parseCsv(s); const w = Math.max(...rows.map(r0 => r0.length));
    return toCsv(Array.from({ length: w }, (_, i) => rows.map(r0 => r0[i] ?? '')));
  }),
  'CSV to TSV': (r, t) => textTool(r, t, s => parseCsv(s).map(r0 => r0.join('\t')).join('\n')),
  'TSV to CSV': (r, t) => textTool(r, t, s => toCsv(s.split(/\r?\n/).map(l => l.split('\t')))),
  'JSON Lines Cleaner': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(l => JSON.stringify(JSON.parse(l))).join('\n')),
  'JSON Lines Merger': (r, t) => textTool(r, t, s => JSON.stringify(s.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)), null, 2)),
  'TXT to CSV': (r, t) => textTool(r, t, s => toCsv(s.split(/\r?\n/).map(l => l.trim().split(/\s+/)))),
  'CSV to XLSX': (r, t) => textTool(r, t, s => { downloadText(s, 'data.csv', 'text/csv'); return 'Saved CSV. Spreadsheet apps open it. A full XLSX writer is available in the PDF desk for table-like PDFs.'; }),
  'XLSX to CSV': (r, t) => fileTool(r, t, { accept: '.xlsx', label: 'Choose XLSX', run: 'Extract' }, async files => {
    if (!files[0]) throw Error('Choose a file.');
    const JSZip = await loadJSZip(); const z = await JSZip.loadAsync(await files[0].arrayBuffer());
    const sheet = Object.keys(z.files).find(k => /xl\/worksheets\/sheet1\.xml$/.test(k));
    if (!sheet) throw Error('No sheet1.xml');
    const xml = await z.file(sheet).async('text');
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000);
  }),
  'File Renamer Pattern Generator': (r, t) => textTool(r, t, (s, body) => s.split(/\r?\n/).filter(Boolean).map((n, i) => (body.querySelector('#p').value || 'file-{n}').replace('{n}', String(i + 1)) + n.slice(n.lastIndexOf('.'))).join('\n'),
    `<input id="p" class="field" style="margin-top:8px" value="file-{n}">`),
  'Folder Tree Generator': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map((x, i, a) => (i === a.length - 1 ? '└─ ' : '├─ ') + x).join('\n')),
  'File Extension Extractor': (r, t) => textTool(r, t, s => s.split(/\r?\n/).map(n => (n.split('.').pop() || '')).join('\n')),
  'Duplicate Filename Finder': (r, t) => textTool(r, t, s => { const a = s.split(/\r?\n/); const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`).join('\n') || 'No duplicate names.'; }),
  'File Size Calculator': (r, t) => HANDLERS['Image File Size Calculator'](r, t),
  'Checksum Manifest Generator': (r, t) => fileTool(r, t, { multiple: true, label: 'Choose files', run: 'Hash' }, async files => {
    const lines = [];
    for (const f of files) { const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); lines.push(`${kit.hexBytes(buf)}  ${f.name}`); }
    return lines.join('\n');
  }),
  'Data URI Encoder': (r, t) => fileTool(r, t, { label: 'Choose a file', run: 'Encode' }, async files => {
    if (!files[0]) throw Error('Choose a file.');
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await files[0].arrayBuffer()).slice(0, 400000)));
    return `data:${files[0].type || 'application/octet-stream'};base64,${b64}`;
  }),
  'Data URI Decoder': (r, t) => textTool(r, t, s => s.split(',')[1] ? 'Payload length: ' + s.split(',')[1].length : 'Not a data URI'),
  'Line Ending Converter': (r, t) => textTool(r, t, (s, body) => body.querySelector('#le').value === 'crlf' ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'),
    `<select id="le" class="sel" style="margin-top:8px"><option value="lf">LF</option><option value="crlf">CRLF</option></select>`),
  'UTF-8 Inspector': (r, t) => textTool(r, t, s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, '0')).join(' ')),
  'Binary Viewer Helper': (r, t) => fileTool(r, t, { label: 'Choose a file', run: 'View' }, async files => {
    if (!files[0]) throw Error('Choose a file.');
    const u = new Uint8Array(await files[0].arrayBuffer());
    return [...u.slice(0, 512)].map(b => b.toString(16).padStart(2, '0')).join(' ');
  }),
});

Object.assign(HANDLERS, {
  'QR Code Generator': (r, t) => HANDLERS['Text to QR'](r, t),
  'QR Code': (r, t) => HANDLERS['Text to QR'](r, t),
  'Random Picker': (r, t) => HANDLERS['Random Line Picker'](r, t),
  'Checklist Maker': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(x => `[ ] ${x}`).join('\n')),
  'Decision Table Maker': (r, t) => textTool(r, t, s => s),
  'Meeting Agenda': (r, t) => textTool(r, t, s => 'Agenda\n\n' + s.split(/\r?\n/).filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n')),
  'Meeting Minutes': (r, t) => HANDLERS['Meeting Agenda'](r, t),
  'Task Priority Matrix': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(x => `• ${x}`).join('\n')),
  'Habit Tracker': (r, t) => textTool(r, t, s => s.split(/\r?\n/).filter(Boolean).map(x => `${x}  □ □ □ □ □ □ □`).join('\n')),
  'Calendar Week Number': (r, t) => textTool(r, t, () => { const d = new Date(); const onejan = new Date(d.getFullYear(), 0, 1); return `Week ${Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7)}`; }),
  'Date Planner': (r, t) => HANDLERS['Study Planner'](r, t),
  'Timezone Meeting Planner': (r, t) => HANDLERS['Time Zone Converter'](r, t),
  'File Name Cleaner': (r, t) => textTool(r, t, s => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()),
  'Text Joiner': (r, t) => textTool(r, t, (s, body) => s.split(/\r?\n/).join(body.querySelector('#sep').value || ', '), `<input id="sep" class="field" style="margin-top:8px" value=", ">`),
  'Table Maker': (r, t) => textTool(r, t, s => { const rows = s.split(/\r?\n/).map(l => l.split('|').map(x => x.trim())); return rows.map(r0 => '| ' + r0.join(' | ') + ' |').join('\n'); }),
  'CSV Previewer': (r, t) => textTool(r, t, s => parseCsv(s).slice(0, 20).map(r0 => r0.join('\t')).join('\n')),
  'Gradient Generator': (r, t) => textTool(r, t, (s, b) => `background: linear-gradient(135deg, ${b.querySelector('#a').value}, ${b.querySelector('#b').value});`, `<div class="field-row" style="margin-top:8px"><input id="a" class="field" type="color" value="#c45c26"><input id="b" class="field" type="color" value="#e8b44c"></div>`),
  'Box Shadow Generator': (r, t) => textTool(r, t, () => 'box-shadow: 0 12px 40px rgba(28,25,22,.18);'),
  'Border Radius Generator': (r, t) => calcTool(r, t, ['Radius px'], a => `border-radius: ${a}px;`),
  'CSS Grid Generator': (r, t) => calcTool(r, t, ['Columns'], a => `display: grid; grid-template-columns: repeat(${Math.max(1, a)}, 1fr); gap: 12px;`),
  'CSS Flexbox Generator': (r, t) => textTool(r, t, () => 'display: flex; gap: 12px; align-items: center; justify-content: space-between;'),
  'Responsive Breakpoint Helper': (r, t) => textTool(r, t, () => '@media (max-width: 840px) { /* android files layout */ }\n@media (min-width: 841px) { /* desktop desk */ }'),
  'Meta Tag Generator': (r, t) => textTool(r, t, (s, b) => `<title>${esc(s)}</title>\n<meta name="description" content="${esc(b.querySelector('#d').value)}">`, `<input id="d" class="field" style="margin-top:8px" placeholder="Description">`),
  'Open Graph Generator': (r, t) => textTool(r, t, s => `<meta property="og:title" content="${esc(s)}">\n<meta property="og:type" content="website">`),
  'Twitter Card Generator': (r, t) => textTool(r, t, s => `<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="${esc(s)}">`),
  'Schema Markup Generator': (r, t) => textTool(r, t, s => JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: s || 'MegaPLAN' }, null, 2)),
  'Canonical Tag Generator': (r, t) => textTool(r, t, s => `<link rel="canonical" href="${esc(s.trim())}">`),
  'Robots Meta Generator': (r, t) => textTool(r, t, () => '<meta name="robots" content="index,follow">'),
  'Sitemap XML Generator': (r, t) => textTool(r, t, s => `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${s.split(/\r?\n/).filter(Boolean).map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>`),
  'Favicon Pack Generator': (r, t) => HANDLERS['Favicon Generator'](r, t),
  'Web Manifest Generator': (r, t) => textTool(r, t, s => JSON.stringify({ name: s, short_name: s, start_url: '/', display: 'standalone' }, null, 2)),
  'QR Landing Page Maker': (r, t) => HANDLERS['Text to QR'](r, t),
  'OG Image Maker': (r, t) => HANDLERS['Social Image Resizer'](r, t),
  'Placeholder Image Generator': (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="w" class="num" value="800"><input id="h" class="num" value="450"></div><div class="button-row"><button class="btn primary" id="run">Make</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = async () => {
      const w = Number(body.querySelector('#w').value) || 800, h = Number(body.querySelector('#h').value) || 450;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
      ctx.fillStyle = '#1c1916'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e8b44c'; ctx.font = '24px sans-serif'; ctx.fillText(`${w}×${h}`, 24, 48);
      await canvasToFile(c, 'image/png', 1, 'placeholder.png'); setOut(body, 'Saved');
    };
  },
  'SVG Pattern Generator': (r, t) => textTool(r, t, () => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#f4efe6"/><circle cx="20" cy="20" r="6" fill="#c45c26"/></svg>`),
  'YouTube Thumbnail Downloader': (r, t) => textTool(r, t, s => {
    const m = s.match(/[?&]v=([^&]+)|youtu\.be\/([^?]+)/); const id = m?.[1] || m?.[2];
    if (!id) throw Error('Paste a YouTube watch URL.');
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg\nOpen that public thumbnail URL. This does not download the video.`;
  }),
  'YouTube Subtitle Helper': (r, t) => HANDLERS['Transcript to SRT'](r, t),
  'YouTube Video Downloader': (r, t) => textTool(r, t, () => 'MegaPLAN does not download YouTube videos. Use YouTube’s own download options when they are offered, and only for content you have rights to.'),
  'YouTube Audio Extractor': (r, t) => HANDLERS['YouTube Video Downloader'](r, t),
  'SlideShare Downloader': (r, t) => textTool(r, t, () => 'This desk does not scrape or bypass SlideShare. Upload a file you already have rights to, or use the official export.'),
  'Public Video Frame Extractor': (r, t) => HANDLERS['Video Thumbnail Extractor'](r, t),
  'Webpage Asset Saver': (r, t) => textTool(r, t, async s => { const j = await inspect('metadata', { url: s.trim() }); return JSON.stringify(j, null, 2); }),
  'Public Image Downloader': (r, t) => textTool(r, t, s => `Open this image URL yourself:\n${s.trim()}\nHotlinking may be blocked by the host.`),
  'Medical Abbreviation Helper': (r, t) => textTool(r, t, s => {
    const map = { BP: 'blood pressure', HR: 'heart rate', RR: 'respiratory rate', BMI: 'body mass index', Hx: 'history', Tx: 'treatment', Dx: 'diagnosis', Rx: 'prescription' };
    return s.split(/\s+/).map(w => map[w] ? `${w} = ${map[w]}` : w).join('\n');
  }),
  'Clinical Note Formatter': (r, t) => textTool(r, t, s => 'SOAP\n\nS:\n' + s + '\n\nO:\n\nA:\n\nP:\n'),
  'Dice Roller': (r, t) => textTool(r, t, () => String(1 + Math.floor(Math.random() * 6))),
  'Coin Flip': (r, t) => textTool(r, t, () => Math.random() < 0.5 ? 'Heads' : 'Tails'),
  'Random Number Generator': (r, t) => calcTool(r, t, ['Min', 'Max'], (a, b) => String(Math.floor(a + Math.random() * (b - a + 1)))),
  'Random Name Picker': (r, t) => HANDLERS['Random Line Picker'](r, t),
  'Team Generator': (r, t) => textTool(r, t, (s, body) => {
    const n = Number(body.querySelector('#n').value) || 2, people = s.split(/\r?\n/).filter(Boolean).sort(() => Math.random() - 0.5);
    const teams = Array.from({ length: n }, () => []); people.forEach((p, i) => teams[i % n].push(p));
    return teams.map((t0, i) => `Team ${i + 1}\n${t0.join('\n')}`).join('\n\n');
  }, `<input id="n" class="num" style="margin-top:8px" value="2">`),
  'Decision Wheel': (r, t) => HANDLERS['Random Line Picker'](r, t),
  'Color Blindness Simulator': (r, t) => imageOp(r, t, '', async c => { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; const ctx = cc.getContext('2d'); ctx.filter = 'grayscale(1)'; ctx.drawImage(c, 0, 0); await canvasToFile(cc, 'image/jpeg', 0.9, 'sim.jpg'); return 'Grayscale simulation only.'; }),
  'Typing Speed Test': (r, t) => {
    const sample = 'MegaPLAN keeps everyday files on this device whenever a job can run in the browser.';
    const body = mountShell(r, t, `<p>${esc(sample)}</p><textarea id="tool-in" class="input-area" placeholder="Type the line above"></textarea><div class="button-row"><button class="btn primary" id="run">Score</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    const t0 = Date.now();
    body.querySelector('#run').onclick = () => {
      const typed = body.querySelector('#tool-in').value; const min = (Date.now() - t0) / 60000; const wpm = min ? (typed.trim().split(/\s+/).length / min) : 0;
      setOut(body, `WPM: ${wpm.toFixed(1)}`);
    };
  },
  'Keyboard Test': (r, t) => {
    const body = mountShell(r, t, `<p class="muted">Press keys. They appear below.</p><pre id="tool-out" class="out">Ready</pre>`);
    window.addEventListener('keydown', e => { body.querySelector('#tool-out').textContent = `${e.key}  code=${e.code}`; }, { once: false });
  },
  'Mouse Test': (r, t) => {
    const body = mountShell(r, t, `<pre id="tool-out" class="out">Move the pointer here.</pre>`);
    body.addEventListener('mousemove', e => { body.querySelector('#tool-out').textContent = `${e.offsetX}, ${e.offsetY}`; });
  },
  'Screen Resolution Checker': (r, t) => textTool(r, t, () => `${screen.width}×${screen.height}\nWindow: ${innerWidth}×${innerHeight}\nDPR: ${devicePixelRatio}`),
  'Browser Feature Checker': (r, t) => textTool(r, t, () => JSON.stringify({ crypto: !!crypto.subtle, clipboard: !!navigator.clipboard, speech: !!(window.SpeechRecognition || window.webkitSpeechRecognition), pdf: true }, null, 2)),
  'Network Speed Test Interface': (r, t) => textTool(r, t, () => 'This page does not run a bandwidth test against a speed-test farm. Use your ISP tool or a dedicated speed test.'),
  'Internet Time Checker': (r, t) => textTool(r, t, () => new Date().toISOString()),
  'World Clock': (r, t) => textTool(r, t, () => ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'].map(z => `${z}: ${new Intl.DateTimeFormat('en-GB', { timeZone: z, timeStyle: 'medium', dateStyle: 'medium' }).format(new Date())}`).join('\n')),
  'Calendar Generator': (r, t) => textTool(r, t, () => { const d = new Date(); return `${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}`; }),
  'Printable Ruler': (r, t) => textTool(r, t, () => 'Print at 100% scale. 1 inch ≈ 96 CSS px on many screens — verify against a real ruler.'),
  'A4 Paper Generator': (r, t) => {
    const body = mountShell(r, t, `<div class="button-row"><button class="btn primary" id="run">Blank A4 PDF</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>`);
    body.querySelector('#run').onclick = async () => {
      const { PDFDocument } = await kit.loadPdfLib(); const doc = await PDFDocument.create(); doc.addPage([595.28, 841.89]);
      downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), 'a4.pdf'); setOut(body, 'Saved blank A4.');
    };
  },
});

Object.assign(HANDLERS, {
  'Audio Studio': (r, t) => mountAudioStudio(r, t),
  'YouTube Transcript': (r, t) => mountYouTubeTranscript(r, t),
  'YouTube Playlist Lister': (r, t) => mountYouTubePlaylist(r, t),
  'YouTube Chapter Generator': (r, t) => mountYouTubeChapter(r, t),
  'AI Mode — Combine Tools': (r, t) => mountAIMode(r, t),
  'Agentic PDF Splitter': (r, t) => mountAgenticPdfSplitter(r, t),
  'Question Paper to Notes AI': (r, t) => mountQuestionPaperToNotes(r, t),
  'Chess': (r, t) => mountChess(r, t),
  '2048': (r, t) => mount2048(r, t),
  'Snake Game': (r, t) => mountSnake(r, t),
  'Tic Tac Toe': (r, t) => mountTicTacToe(r, t),
  'Minesweeper': (r, t) => mountMinesweeper(r, t),
  'Maps': (r, t) => mountMaps(r, t),
  'Instagram OSINT Checker': (r, t) => mountInstagramOSINT(r, t),
  'OSINT Advanced': (r, t) => mountOSINTAdvanced(r, t),
  'Tetris': (r, t) => mountTetris(r, t),
  'Map Directory — Trivandrum Massive': (r, t) => mountMapDirectory(r, t),
  'Map Auto Scraper — Background': (r, t) => mountMapAutoScraper(r, t),
  'Road Directory — Wise Listing': (r, t) => mountMapDirectory(r, { ...t, title: 'Road Directory — Wise Listing' }),
  'Business Directory — By Type': (r, t) => mountMapDirectory(r, { ...t, title: 'Business Directory — By Type' }),
  'Kerala Expansion — 10 Day Sprint': (r, t) => mountKeralaDirectoryFull(r, t),
  'Kerala Districts — Directory': (r, t) => mountKeralaDirectoryFull(r, { ...t, title: 'Kerala Districts — Directory' }),
  'Kerala Directory — Full Business Info': (r, t) => mountKeralaDirectoryFull(r, t),
  'Kerala AI — Map Intelligence': (r, t) => mountKeralaDirectoryFull(r, { ...t, title: 'Kerala AI — Map Intelligence' }),
  'Spatial Index — Geohash Grid System': (r, t) => mountKeralaDirectoryFull(r, { ...t, title: 'Spatial Index — Geohash Grid System' }),
  'Inception Labs — Mercury Diffusion LLM': (r, t) => mountInceptionTool(r, t),
  'Product Directory — Amazon & Flipkart Massive': (r, t) => mountProductDirectory(r, t),
  'Product Scraper — Amazon Flipkart': (r, t) => mountProductDirectory(r, { ...t, title: 'Product Scraper — Amazon Flipkart' }),
  'Music Directory — Spotify Full Dataset': (r, t) => mountMusicDirectory(r, t),
  'Trivandrum Music Places Directory': (r, t) => mountCityMusicDirectory(r, t),
  'Trivandrum Shop Directory': (r, t) => mountCityShopDirectory(r, t),
  'Music Scraper — Spotify': (r, t) => mountMusicDirectory(r, { ...t, title: 'Music Scraper — Spotify' })
});

for (const title of ['APA Citation Helper', 'MLA Citation Helper', 'Chicago Citation Helper', 'Vancouver Citation Helper']) {
  const prev = HANDLERS[title];
  HANDLERS[title] = (r, t) => {
    const body = mountShell(r, t, `<div class="field-row"><input id="a" class="field" placeholder="Author"><input id="y" class="field" placeholder="Year"></div>${kit.textForm()}`);
    body.querySelector('#run').onclick = () => {
      const s = body.querySelector('#tool-in').value;
      const a = body.querySelector('#a').value, y = body.querySelector('#y').value;
      setOut(body, title.startsWith('MLA') ? `${a}. ${s}. ${y}.` : `${a} (${y}). ${s}.`);
    };
  };
}

export function restLoaded() { return true; }
