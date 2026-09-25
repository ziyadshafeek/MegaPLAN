/** MegaPLAN PDF studio: thumbs, click-select, n-up, booklet, fill, sign, OCR, wrap. */
import * as kit from './kit.js';
import {
  parseRange, saveDoc, loadScript, fitText, createFromIndices, textPagesToPdf,
  extractDocxText, extractXlsxText, extractPptxText, extractEpubText,
  addSimplePageBookmarks, getPdfTextLines, rasterizePdf, imageFilesToPdf,
  wrapDocx, wrapXlsx, wrapPptx, wrapEpub
} from './pdf-ops.js';

const { esc, downloadBlob, downloadText, mountShell, wireDrop, setOut, setProgress, fileForm, loadPdfLib, loadPdfJs, loadJSZip, clamp } = kit;

function extraHtml(title) {
  const range = '<input id="range" class="field" placeholder="Pages, e.g. 1-3,5 — or click thumbnails">';
  const map = {
    'Split PDF': '<label class="field-label">Pages per part <input id="pages" class="num" type="number" min="1" value="10"></label><input id="prefix" class="field" value="split">',
    'Extract PDF Pages': range, 'PDF Page Extractor': range, 'Delete PDF Pages': range,
    'Rotate PDF': `${range}<select id="degrees" class="sel"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270°</option></select>`,
    'Reorder PDF Pages': '<input id="order" class="field" placeholder="New order, e.g. 3,1,2,4"><p class="muted">Click thumbnails in the new order, or type every page once.</p>',
    'Compress PDF': '<select id="compressionMode" class="sel"><option value="structural">Safe structural rewrite</option><option value="raster">Image recompression (scans)</option></select><label class="field-label"><input id="stripMeta" type="checkbox" checked> Strip metadata</label><label class="field-label">JPEG quality <input id="jpegQuality" class="num" type="number" min="0.35" max="0.95" step="0.05" value="0.72"></label><label class="field-label">Render DPI <input id="compressDpi" class="num" type="number" min="72" max="180" value="110"></label>',
    'Add PDF Watermark': '<input id="watermark" class="field" value="MegaPLAN"><input id="wmOpacity" class="num" type="number" min="0.05" max="1" step="0.05" value="0.25"><select id="wmPos" class="sel"><option value="diagonal">Diagonal</option><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option></select>',
    'Add PDF Page Numbers': '<select id="numPos" class="sel"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-center">Top center</option></select><input id="numStart" class="num" type="number" value="1" min="1">',
    'Overlay PDFs': '<select id="overlayMode" class="sel"><option value="each">Same overlay page on every base page</option><option value="match">Match overlay page number</option></select>',
    'Crop PDF': '<input id="crop" class="field" value="36,36,36,36" placeholder="left,top,right,bottom pt">',
    'Resize PDF Pages': '<select id="size" class="sel"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A5">A5</option></select><select id="resizeMode" class="sel"><option value="contain">Contain</option><option value="stretch">Stretch</option></select>',
    'Pages per Sheet': '<select id="sheet" class="sel"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A3">A3</option></select><select id="orientation" class="sel"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>',
    'Two Pages per Sheet': '<select id="sheet" class="sel"><option value="A4">A4</option><option value="Letter">Letter</option><option value="A3">A3</option></select><select id="orientation" class="sel"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select>',
    'PDF to Images': '<select id="imageFormat" class="sel"><option value="png">PNG</option><option value="jpeg">JPEG</option></select><input id="imageScale" class="num" type="number" min="0.5" max="3" step="0.25" value="1.5">',
    'Fill PDF': '<p class="muted">Fillable fields appear after you choose a PDF.</p><div id="form-fields"></div>',
    'PDF Form Field Viewer': '<div id="form-fields"></div>',
    'Annotate PDF': '<input id="noteText" class="field" value="Reviewed"><input id="notePage" class="num" type="number" min="1" value="1"><input id="noteX" class="num" value="50"><input id="noteY" class="num" value="50"><p class="muted">Click the preview to place the note.</p>',
    'Sign PDF': '<input id="sigText" class="field" value="Signed"><input id="sigPage" class="num" type="number" min="1" value="1"><input id="sigX" class="num" value="50"><input id="sigY" class="num" value="70"><input id="sigSize" class="num" type="number" min="8" value="20"><p class="muted">PDF first, optional PNG/JPG second. Click preview to place. Visible stamp, not a cryptographic signature.</p>',
    'Booklet PDF Maker': '<select id="bookletSize" class="sel"><option value="A4">A4 landscape</option><option value="Letter">Letter landscape</option></select><p class="muted">2-up saddle-stitch imposition. Blanks pad to a multiple of four.</p>',
    'PDF Batch Rename': '<input id="renamePattern" class="field" value="document-{n}">',
    'Invoice PDF Maker': '<input id="invTitle" class="field" value="Invoice"><input id="invTo" class="field" placeholder="Bill to"><textarea id="invItems" class="input-area" placeholder="Description | Qty | Rate"></textarea>',
    'Text to PDF': '<textarea id="textpdf" class="input-area" placeholder="Text…"></textarea><select id="textSize" class="sel"><option value="11">11 pt</option><option value="12" selected>12 pt</option><option value="14">14 pt</option></select>',
    'Markdown to PDF': '<textarea id="textpdf" class="input-area" placeholder="Markdown…"></textarea>',
    'HTML to PDF': '<textarea id="htmlpdf" class="input-area" placeholder="HTML…"><h1>MegaPLAN</h1><p>Hello.</p></textarea>',
    'PDF Bookmark Helper': '<textarea id="bookmarkTitles" class="input-area" placeholder="One title per line"></textarea>',
    'PDF to Text': '<label class="field-label"><input id="onePerPage" type="checkbox" checked> Page headings</label>',
    'PDF to Markdown': '<label class="field-label"><input id="onePerPage" type="checkbox" checked> Page headings</label>',
    'PDF to HTML': '<label class="field-label"><input id="onePerPage" type="checkbox" checked> Page headings</label>',
    'Redact PDF': '<p class="muted">Drag on the preview to add black boxes (page:x,y,w,h percent). Pages are rebuilt as images so original text is not kept.</p><textarea id="redactions" class="input-area" placeholder="1:10,20,30,10"></textarea>',
    'Remove PDF Metadata': '<label class="field-label"><input id="blankMeta" type="checkbox" checked> Clear title, author, subject, keywords, creator, producer</label>',
    'Word to PDF': '<p class="muted">DOCX text from WordprocessingML. Images and complex layout are not preserved.</p>',
    'Excel to PDF': '<p class="muted">First worksheet cell text. Charts and formulas are not preserved.</p>',
    'PowerPoint to PDF': '<p class="muted">Slide text only. Themes and images are not preserved.</p>',
    'EPUB to PDF': '<p class="muted">Chapter text from the EPUB spine. CSS and media are not preserved.</p>',
    'PDF/A Helper': '<p class="muted">Readiness checklist, not a PDF/A certification.</p>',
    'OCR PDF': '<p class="muted">Reads each page in this browser. Photographed scans take longer. Selectable text layer is approximate.</p>'
  };
  return map[title] || '';
}

function acceptFor(title) {
  if (title === 'Sign PDF') return 'application/pdf,image/png,image/jpeg,image/webp';
  if (title === 'JPG to PDF') return 'image/jpeg';
  if (title === 'PNG to PDF') return 'image/png';
  if (title === 'WEBP to PDF') return 'image/webp';
  if (title === 'HEIC to PDF') return '.heic,.heif,image/heic,image/heif';
  if (title === 'Images to PDF') return 'image/*';
  if (title === 'Word to PDF') return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (title === 'Excel to PDF') return '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (title === 'PowerPoint to PDF') return '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (title === 'EPUB to PDF') return '.epub,application/epub+zip';
  return 'application/pdf';
}

export async function mountPdf(root, tool) {
  const title = tool.title;
  const noFile = ['Text to PDF', 'Markdown to PDF', 'Invoice PDF Maker', 'HTML to PDF'].includes(title);
  const multi = ['Merge PDFs', 'Images to PDF', 'JPG to PDF', 'PNG to PDF', 'WEBP to PDF', 'HEIC to PDF', 'Overlay PDFs', 'Compare PDFs', 'PDF Batch Rename', 'Sign PDF'].includes(title);
  const extra = extraHtml(title);
  const studio = fileForm({
    accept: acceptFor(title), multiple: multi, extra: '',
    label: title === 'Sign PDF' ? 'PDF first, optional signature image second' : 'Choose file(s)',
    run: 'Run PDF tool'
  }).replace('<div class="button-row">', extra + '<div class="studio"><div><div id="thumbs" class="thumbs"></div></div><div class="preview-stage" id="preview-stage"><span class="muted">Preview appears after you choose a file. Click a page to select it.</span></div></div><div class="button-row">');
  const body = mountShell(root, tool, noFile
    ? extra + '<div class="button-row"><button class="btn primary" id="run">Create PDF</button></div><pre id="tool-out" class="out" style="margin-top:12px"></pre>'
    : studio);
  const drop = noFile ? { getFiles: () => [] } : wireDrop(body, { onChange: files => onFiles(files) });
  const selected = new Set();
  let previewPage = 0, dragStart = null;
  const q = id => body.querySelector('#' + id);

  async function showPreview(file, index) {
    const stage = q('preview-stage');
    if (!stage || !file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return;
    previewPage = index;
    const pdfjs = await loadPdfJs();
    const task = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await task.getPage(index + 1);
    const vp = page.getViewport({ scale: 1.15 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    stage.innerHTML = ''; stage.appendChild(canvas);
    canvas.style.cursor = /Sign PDF|Annotate PDF|Redact PDF/.test(title) ? 'crosshair' : 'default';
    canvas.onmousedown = e => {
      const r = canvas.getBoundingClientRect();
      dragStart = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    canvas.onmouseup = e => {
      if (!dragStart) return;
      const r = canvas.getBoundingClientRect();
      const x2 = (e.clientX - r.left) / r.width, y2 = (e.clientY - r.top) / r.height;
      const xPct = Math.min(dragStart.x, x2) * 100, yPct = (1 - Math.max(dragStart.y, y2)) * 100;
      const wPct = Math.abs(x2 - dragStart.x) * 100, hPct = Math.abs(y2 - dragStart.y) * 100;
      if (title === 'Redact PDF' && wPct > 1 && hPct > 1) {
        const ta = q('redactions');
        const token = `${previewPage + 1}:${xPct.toFixed(1)},${yPct.toFixed(1)},${wPct.toFixed(1)},${hPct.toFixed(1)}`;
        ta.value = (ta.value ? ta.value.replace(/;?\s*$/, '') + '; ' : '') + token;
        setOut(body, 'Added redaction ' + token);
      } else if (title === 'Sign PDF' || title === 'Annotate PDF') {
        const pdfX = (dragStart.x * canvas.width / 1.15).toFixed(0);
        const pdfY = ((1 - dragStart.y) * canvas.height / 1.15).toFixed(0);
        if (q('sigX')) { q('sigX').value = pdfX; q('sigY').value = pdfY; q('sigPage').value = previewPage + 1; }
        if (q('noteX')) { q('noteX').value = pdfX; q('noteY').value = pdfY; q('notePage').value = previewPage + 1; }
        setOut(body, `Placed on page ${previewPage + 1} at ${pdfX}, ${pdfY}`);
      }
      dragStart = null;
    };
    await task.cleanup?.();
  }

  async function renderThumbs(file) {
    const strip = q('thumbs');
    if (!strip) return;
    strip.innerHTML = ''; selected.clear();
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
      if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) {
        const url = URL.createObjectURL(file);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'thumb selected';
        btn.innerHTML = '<img alt=""><span class="n">1</span>';
        btn.querySelector('img').src = url; strip.appendChild(btn);
        const stage = q('preview-stage'); if (stage) stage.innerHTML = `<img alt="preview" src="${url}">`;
      }
      return;
    }
    const pdfjs = await loadPdfJs();
    const task = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const max = Math.min(task.numPages, 48);
    for (let i = 1; i <= max; i++) {
      setProgress(body, (i / max) * 100, `Preview page ${i} of ${task.numPages}`);
      const page = await task.getPage(i);
      const vp = page.getViewport({ scale: 0.22 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'thumb'; btn.dataset.i = String(i - 1);
      btn.innerHTML = `<img alt="Page ${i}"><span class="n">${i}</span>`;
      btn.querySelector('img').src = c.toDataURL('image/jpeg', 0.7);
      btn.onclick = () => {
        const id = Number(btn.dataset.i);
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        btn.classList.toggle('selected', selected.has(id));
        if (q('range')) q('range').value = [...selected].sort((a, b) => a - b).map(x => x + 1).join(',');
        if (q('order') && title === 'Reorder PDF Pages') {
          const cur = q('order').value ? q('order').value.split(',').map(Number).filter(Boolean) : [];
          if (!cur.includes(id + 1)) { cur.push(id + 1); q('order').value = cur.join(','); }
        }
        showPreview(file, id);
      };
      strip.appendChild(btn);
      if (i === 1) showPreview(file, 0);
    }
    if (task.numPages > max) {
      const more = document.createElement('div'); more.className = 'muted';
      more.textContent = `Showing first ${max} of ${task.numPages} pages. Use the range field for the rest.`;
      strip.appendChild(more);
    }
    setProgress(body, null);
    setOut(body, `${file.name} · ${task.numPages} page${task.numPages === 1 ? '' : 's'} · ${Math.max(1, Math.round(file.size / 1024))} KB`);
    await task.cleanup?.();
  }

  async function loadFormFields(file) {
    const mount = q('form-fields'); if (!mount || !file) return;
    try {
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const fields = doc.getForm().getFields();
      if (!fields.length) { mount.innerHTML = '<p class="muted">No AcroForm fields detected.</p>'; return; }
      mount.innerHTML = fields.map((f, i) => {
        const name = esc(f.getName()); const typ = f.constructor?.name || 'Field';
        if (typ.includes('CheckBox')) return `<label class="field-label"><input type="checkbox" data-fi="${i}" ${f.isChecked?.() ? 'checked' : ''}> ${name}</label>`;
        if (typ.includes('Dropdown') || typ.includes('RadioGroup')) {
          const selectedVal = (f.getSelected?.() || [])[0] || f.getSelected?.() || '';
          const opts = (f.getOptions?.() || []).map(o => `<option value="${esc(o)}" ${o === selectedVal ? 'selected' : ''}>${esc(o)}</option>`).join('');
          return `<label class="field-label">${name}<select data-fi="${i}" class="sel"><option value="">—</option>${opts}</select></label>`;
        }
        return `<label class="field-label">${name}<input data-fi="${i}" class="field" value="${esc(f.getText?.() || '')}"></label>`;
      }).join('');
    } catch (e) { mount.innerHTML = '<p class="muted">Unable to inspect form fields: ' + esc(e.message) + '</p>'; }
  }

  async function onFiles(files) {
    if (!files.length) return;
    await renderThumbs(files[0]);
    if (['Fill PDF', 'PDF Form Field Viewer'].includes(title)) await loadFormFields(files[0]);
  }

  async function extractPageTexts(file, onPage) {
    const pdfjs = await loadPdfJs();
    const task = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= task.numPages; i++) {
      onPage?.(i, task.numPages);
      const page = await task.getPage(i);
      pages.push(getPdfTextLines(await page.getTextContent()).join('\n'));
      await page.cleanup?.();
    }
    await task.cleanup?.();
    return pages;
  }

  q('run').onclick = async () => {
    try {
      setOut(body, 'Working…');
      const { PDFDocument, StandardFonts, rgb, grayscale, degrees, PDFName } = await loadPdfLib();
      const files = drop.getFiles();

      if (title === 'Text to PDF' || title === 'Markdown to PDF') {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const size = Number(q('textSize')?.value) || 12;
        const txt = q('textpdf')?.value || '';
        const pageW = 595.28, pageH = 841.89, margin = 45;
        let page = doc.addPage([pageW, pageH]), y = pageH - margin;
        for (const raw of txt.split(/\r?\n/)) {
          const heading = title === 'Markdown to PDF' && /^#{1,3}\s+/.test(raw);
          const lineRaw = raw.replace(/^#{1,3}\s+/, '') || ' ';
          const use = heading ? bold : font, sz = heading ? 16 : size;
          for (const line of fitText(use, lineRaw, pageW - margin * 2, sz)) {
            if (y < sz + margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; }
            page.drawText(line, { x: margin, y, size: sz, font: use, color: rgb(0, 0, 0) }); y -= sz + 5;
          }
          y -= heading ? 6 : 4;
        }
        await saveDoc(doc, 'megaplan-text.pdf'); setOut(body, 'Created PDF.'); return;
      }
      if (title === 'HTML to PDF') {
        const html = q('htmlpdf').value || '';
        const host = document.createElement('div'); host.innerHTML = html;
        host.style.cssText = 'position:fixed;left:-100000px;top:0;width:780px;background:white;padding:24px;font:16px/1.5 sans-serif';
        document.body.appendChild(host);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const html2pdf = await loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js', 'html2pdf');
        await html2pdf().set({ filename: 'megaplan-html.pdf', image: { type: 'jpeg', quality: 0.95 }, jsPDF: { unit: 'mm', format: 'a4' } }).from(host).save();
        host.remove(); setOut(body, 'Generated PDF from HTML.'); return;
      }
      if (title === 'Invoice PDF Maker') {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const p = doc.addPage([595, 842]); let y = 790, total = 0;
        p.drawText(q('invTitle').value || 'Invoice', { x: 45, y, size: 22, font: bold }); y -= 32;
        p.drawText('Bill to: ' + (q('invTo').value || ''), { x: 45, y, size: 11, font }); y -= 28;
        for (const row of (q('invItems').value || '').split(/\r?\n/)) {
          if (!row.trim()) continue;
          const [desc, qtyS, rateS] = row.split('|').map(x => x.trim());
          const qty = Number(qtyS) || 0, rate = Number(rateS) || 0; total += qty * rate;
          p.drawText((desc || row).slice(0, 60), { x: 45, y, size: 10, font });
          p.drawText((qty * rate).toFixed(2), { x: 480, y, size: 10, font }); y -= 16;
        }
        p.drawText('Total: ' + total.toFixed(2), { x: 400, y: y - 8, size: 13, font: bold });
        await saveDoc(doc, 'megaplan-invoice.pdf'); setOut(body, 'Invoice saved.'); return;
      }
      if (title === 'HEIC to PDF') {
        const heic2any = await loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', 'heic2any');
        const converted = [];
        for (const f of files) {
          const blob = await heic2any({ blob: f, toType: 'image/png', quality: 0.92 });
          for (const b of (Array.isArray(blob) ? blob : [blob])) converted.push(new File([b], f.name + '.png', { type: 'image/png' }));
        }
        await saveDoc(await imageFilesToPdf(PDFDocument, converted), 'megaplan-heic.pdf');
        setOut(body, `Converted ${files.length} HEIC file(s).`); return;
      }
      if (['Images to PDF', 'JPG to PDF', 'PNG to PDF', 'WEBP to PDF'].includes(title)) {
        if (!files.length) throw Error('Choose at least one image.');
        await saveDoc(await imageFilesToPdf(PDFDocument, files), 'megaplan-images.pdf');
        setOut(body, `Converted ${files.length} image(s).`); return;
      }
      if (['Word to PDF', 'Excel to PDF', 'PowerPoint to PDF', 'EPUB to PDF'].includes(title)) {
        if (files.length !== 1) throw Error('Choose exactly one source file.');
        const JSZip = await loadJSZip(); let pages = [];
        if (title === 'Word to PDF') pages = [{ label: files[0].name, text: await extractDocxText(files[0], JSZip) }];
        if (title === 'Excel to PDF') pages = [{ label: 'Sheet 1', text: await extractXlsxText(files[0], JSZip) }];
        if (title === 'PowerPoint to PDF') pages = (await extractPptxText(files[0], JSZip)).map((x, i) => ({ label: `Slide ${i + 1}`, text: x }));
        if (title === 'EPUB to PDF') pages = (await extractEpubText(files[0], JSZip)).map((x, i) => ({ label: `Chapter ${i + 1}`, text: x }));
        await saveDoc(await textPagesToPdf(PDFDocument, StandardFonts, rgb, pages, title), 'megaplan-converted.pdf');
        setOut(body, `Created a text-oriented PDF from ${files[0].name}. Complex formatting is not preserved.`); return;
      }
      if (!files.length) throw Error('Choose at least one file.');
      if (title === 'Merge PDFs') {
        const out = await PDFDocument.create();
        for (const f of files) {
          const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
          (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
        }
        await saveDoc(out, 'megaplan-merged.pdf'); setOut(body, `Merged ${files.length} PDFs.`); return;
      }
      if (title === 'PDF Batch Rename') {
        const JSZip = await loadJSZip(); const zip = new JSZip();
        const pattern = q('renamePattern')?.value || 'document-{n}';
        files.forEach((f, i) => zip.file((pattern.replace('{n}', String(i + 1)) + '.pdf').replace(/\.pdf\.pdf$/, '.pdf'), f));
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'megaplan-renamed-pdfs.zip');
        setOut(body, `Zipped ${files.length} files.`); return;
      }
      if (title === 'Compare PDFs') {
        if (files.length !== 2) throw Error('Choose two PDFs.');
        const [a, b] = await Promise.all(files.map(f => extractPageTexts(f)));
        const lines = [`A pages: ${a.length}`, `B pages: ${b.length}`];
        for (let i = 0; i < Math.max(a.length, b.length); i++) lines.push(a[i] === b[i] ? `Page ${i + 1}: same` : `Page ${i + 1}: different`);
        setOut(body, lines.join('\n')); return;
      }
      if (['Pages per Sheet', 'Two Pages per Sheet'].includes(title)) {
        if (files.length !== 1) throw Error('Choose one PDF.');
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const dims = { A4: [595, 842], Letter: [612, 792], A3: [842, 1191] };
        let [sw, sh] = dims[q('sheet')?.value || 'A4'];
        if ((q('orientation')?.value || 'portrait') === 'landscape') [sw, sh] = [sh, sw];
        const slots = title === 'Two Pages per Sheet' ? 2 : 4;
        const cols = slots === 2 ? (sw > sh ? 2 : 1) : 2, rows = slots / cols;
        const doc = await PDFDocument.create();
        for (let start = 0; start < task.numPages; start += slots) {
          setProgress(body, (start / task.numPages) * 100, `Imposing sheet ${Math.floor(start / slots) + 1}`);
          const page = doc.addPage([sw, sh]);
          for (let slot = 0; slot < slots && start + slot < task.numPages; slot++) {
            const r = Math.floor(slot / cols), c = slot % cols;
            const rp = await task.getPage(start + slot + 1);
            const vp = rp.getViewport({ scale: 1 });
            const scale = Math.min((sw / cols) / vp.width, (sh / rows) / vp.height) * 0.95;
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(vp.width * scale); canvas.height = Math.ceil(vp.height * scale);
            await rp.render({ canvasContext: canvas.getContext('2d'), viewport: rp.getViewport({ scale }) }).promise;
            const img = await doc.embedPng(await (await new Promise(res => canvas.toBlob(res, 'image/png'))).arrayBuffer());
            const cellW = sw / cols, cellH = sh / rows;
            page.drawImage(img, { x: c * cellW + (cellW - img.width) / 2, y: sh - (r + 1) * cellH + (cellH - img.height) / 2, width: img.width, height: img.height });
            canvas.width = 1; canvas.height = 1; await rp.cleanup?.();
          }
        }
        setProgress(body, null);
        await saveDoc(doc, 'megaplan-n-up.pdf');
        setOut(body, `Created ${doc.getPageCount()} sheet(s), ${slots} pages per sheet.`); return;
      }
      if (title === 'Booklet PDF Maker') {
        if (files.length !== 1) throw Error('Choose one PDF.');
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const dims = { A4: [842, 595], Letter: [792, 612] };
        const [sw, sh] = dims[q('bookletSize')?.value || 'A4'];
        const total = Math.ceil(task.numPages / 4) * 4, order = [];
        for (let base = 0; base < total / 4; base++) {
          const a = base * 2, b = total - 1 - base * 2; order.push(b, a, a + 1, b - 1);
        }
        const doc = await PDFDocument.create();
        const drawPlaced = async (sp, pageNum, col) => {
          if (pageNum >= task.numPages) return;
          const rp = await task.getPage(pageNum + 1);
          const vp = rp.getViewport({ scale: 1.25 });
          const cellW = sw / 2, sc = Math.min((cellW - 20) / vp.width, (sh - 20) / vp.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width * sc); canvas.height = Math.ceil(vp.height * sc);
          await rp.render({ canvasContext: canvas.getContext('2d'), viewport: rp.getViewport({ scale: sc }) }).promise;
          const img = await doc.embedPng(await (await new Promise(r => canvas.toBlob(r, 'image/png'))).arrayBuffer());
          sp.drawImage(img, { x: col * cellW + (cellW - img.width) / 2, y: (sh - img.height) / 2, width: img.width, height: img.height });
          canvas.width = 1; canvas.height = 1; await rp.cleanup?.();
        };
        for (let sidx = 0; sidx < order.length; sidx += 4) {
          setProgress(body, (sidx / order.length) * 100, `Booklet sheet ${sidx / 4 + 1}`);
          const front = doc.addPage([sw, sh]); await drawPlaced(front, order[sidx], 0); await drawPlaced(front, order[sidx + 1], 1);
          const back = doc.addPage([sw, sh]); await drawPlaced(back, order[sidx + 2], 0); await drawPlaced(back, order[sidx + 3], 1);
        }
        setProgress(body, null);
        await saveDoc(doc, 'megaplan-booklet.pdf');
        setOut(body, `Created ${doc.getPageCount()} booklet side(s) (2-up imposition).`); return;
      }

      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const n = src.getPageCount();
      const indices = parseRange(q('range')?.value || (selected.size ? [...selected].sort((a, b) => a - b).map(i => i + 1).join(',') : ''), n);

      if (title === 'PDF Page Counter') { setOut(body, `Pages: ${n}\nFile: ${files[0].name}\nSize: ${Math.round(files[0].size / 1024)} KB`); return; }
      if (title === 'PDF Metadata Viewer') {
        const first = src.getPage(0).getSize();
        setOut(body, [`File: ${files[0].name}`, `Size: ${Math.round(files[0].size / 1024)} KB`, `Title: ${src.getTitle() || ''}`, `Author: ${src.getAuthor() || ''}`, `Subject: ${src.getSubject() || ''}`, `Keywords: ${(src.getKeywords() || []).join(', ')}`, `Creator: ${src.getCreator() || ''}`, `Producer: ${src.getProducer() || ''}`, `Created: ${src.getCreationDate()?.toISOString() || ''}`, `Modified: ${src.getModificationDate()?.toISOString() || ''}`, `Pages: ${n}`, `First page: ${first.width.toFixed(1)} × ${first.height.toFixed(1)} pt`, `Encrypted: ${src.isEncrypted}`].join('\n')); return;
      }
      if (title === 'PDF/A Helper') {
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const meta = await task.getMetadata();
        const attachments = await task.getAttachments();
        const js = await task.getJSActions();
        setOut(body, ['PDF/A readiness report (not a certification)', `Pages: ${task.numPages}`, `Encrypted: ${src.isEncrypted}`, `Title: ${meta.info?.Title || src.getTitle() || '—'}`, `Producer: ${meta.info?.Producer || src.getProducer() || '—'}`, `Attachments: ${attachments ? Object.keys(attachments).length : 0}`, `JavaScript actions: ${js ? Object.keys(js).length : 0}`, `XMP metadata: ${meta.metadata ? 'yes' : 'no'}`, '', 'Full PDF/A needs a standards validator for fonts, color, transparency and embedded files.'].join('\n'));
        await task.cleanup?.(); return;
      }
      if (title === 'PDF Bookmark Helper') {
        const count = await addSimplePageBookmarks(src, PDFName, (q('bookmarkTitles')?.value || '').split(/\r?\n/).map(x => x.trim()));
        await saveDoc(src, 'megaplan-bookmarked.pdf');
        setOut(body, `Created ${count} top-level bookmarks (one per page). Existing outline replaced.`); return;
      }
      if (title === 'Remove PDF Metadata') {
        if (q('blankMeta')?.checked !== false) { src.setTitle(''); src.setAuthor(''); src.setSubject(''); src.setKeywords([]); src.setCreator(''); src.setProducer(''); }
        await saveDoc(src, 'megaplan-metadata-removed.pdf'); setOut(body, 'Standard document metadata cleared.'); return;
      }
      if (title === 'Repair PDF') {
        await saveDoc(src, 'megaplan-repaired.pdf');
        setOut(body, `Parsed and reserialized ${n} page(s). Severely damaged files may still be unreadable.`); return;
      }
      if (title === 'Compress PDF') {
        if (q('compressionMode')?.value === 'raster') {
          const pdfjs = await loadPdfJs();
          const rebuilt = await rasterizePdf(pdfjs, PDFDocument, files[0], {
            scale: clamp(Number(q('compressDpi')?.value) || 110, 72, 180) / 72,
            jpegQuality: clamp(Number(q('jpegQuality')?.value) || 0.72, 0.35, 0.95),
            onPage: (i, total) => { setProgress(body, (i / total) * 100, `Recompressing page ${i} of ${total}`); }
          });
          setProgress(body, null);
          const b = await saveDoc(rebuilt, 'megaplan-compressed.pdf');
          setOut(body, `Raster compression.\nBefore: ${Math.round(files[0].size / 1024)} KB\nAfter: ${Math.round(b.byteLength / 1024)} KB\nPages are JPEG images; selectable text is not kept.`); return;
        }
        if (q('stripMeta')?.checked) { src.setTitle(''); src.setAuthor(''); src.setSubject(''); src.setKeywords([]); src.setCreator(''); src.setProducer(''); }
        const b = await saveDoc(src, 'megaplan-compressed.pdf');
        setOut(body, `Structural rewrite.\nBefore: ${Math.round(files[0].size / 1024)} KB\nAfter: ${Math.round(b.byteLength / 1024)} KB\nEmbedded images are not recompressed in this mode.`); return;
      }
      if (title === 'Split PDF') {
        const chunk = Math.max(1, Number(q('pages')?.value) || 10), prefix = q('prefix')?.value || 'split', parts = [];
        for (let start = 0; start < n; start += chunk) {
          const end = Math.min(n, start + chunk);
          const d = await createFromIndices(src, Array.from({ length: end - start }, (_, i) => start + i), PDFDocument);
          parts.push({ name: `${prefix}-${String(parts.length + 1).padStart(2, '0')}.pdf`, b: await d.save({ useObjectStreams: true, addDefaultPage: false }) });
        }
        if (parts.length === 1) downloadBlob(new Blob([parts[0].b], { type: 'application/pdf' }), parts[0].name);
        else {
          const JSZip = await loadJSZip(); const zip = new JSZip();
          parts.forEach(p => zip.file(p.name, p.b));
          downloadBlob(await zip.generateAsync({ type: 'blob' }), files[0].name.replace(/\.pdf$/i, '') + '-split.zip');
        }
        setOut(body, `Created ${parts.length} part(s); every source page is included once.`); return;
      }
      if (['Extract PDF Pages', 'PDF Page Extractor'].includes(title)) {
        await saveDoc(await createFromIndices(src, indices, PDFDocument), 'megaplan-extracted.pdf');
        setOut(body, `Extracted ${indices.length} page(s).`); return;
      }
      if (title === 'Delete PDF Pages') {
        const del = new Set(indices);
        const keep = Array.from({ length: n }, (_, i) => i).filter(i => !del.has(i));
        if (!keep.length) throw Error('Cannot delete every page.');
        await saveDoc(await createFromIndices(src, keep, PDFDocument), 'megaplan-pages-deleted.pdf');
        setOut(body, `Deleted ${indices.length} page(s); ${keep.length} remain.`); return;
      }
      if (title === 'Reorder PDF Pages') {
        const order = (q('order')?.value || '').split(',').map(Number);
        if (order.length !== n || new Set(order).size !== n || order.some(v => !Number.isInteger(v) || v < 1 || v > n)) throw Error(`Enter every page exactly once (1-${n}).`);
        await saveDoc(await createFromIndices(src, order.map(v => v - 1), PDFDocument), 'megaplan-reordered.pdf');
        setOut(body, 'Reordered PDF pages.'); return;
      }
      if (title === 'Rotate PDF') {
        const deg = Number(q('degrees')?.value) || 90;
        indices.forEach(i => { const p = src.getPage(i); p.setRotation(degrees(((p.getRotation().angle || 0) + deg) % 360)); });
        await saveDoc(src, 'megaplan-rotated.pdf'); setOut(body, `Rotated ${indices.length} page(s) by ${deg}°.`); return;
      }
      if (title === 'Add PDF Page Numbers') {
        const font = await src.embedFont(StandardFonts.Helvetica);
        const pos = q('numPos')?.value || 'bottom-center', startNum = Number(q('numStart')?.value) || 1;
        src.getPages().forEach((p, i) => {
          const { width, height } = p.getSize(); const text = String(startNum + i); const tw = font.widthOfTextAtSize(text, 10);
          let x = (width - tw) / 2, y = 18;
          if (pos === 'bottom-right') x = width - 28 - tw;
          if (pos === 'bottom-left') x = 28;
          if (pos === 'top-center') y = height - 28;
          p.drawText(text, { x, y, size: 10, font, color: rgb(0, 0, 0) });
        });
        await saveDoc(src, 'megaplan-page-numbers.pdf'); setOut(body, `Added page numbers to ${n} pages.`); return;
      }
      if (title === 'Add PDF Watermark') {
        const font = await src.embedFont(StandardFonts.HelveticaBold);
        const wm = q('watermark')?.value || 'MegaPLAN';
        const opacity = clamp(Number(q('wmOpacity')?.value) || 0.25, 0.05, 1);
        const pos = q('wmPos')?.value || 'diagonal';
        src.getPages().forEach(p => {
          const { width, height } = p.getSize();
          const size = Math.max(18, Math.min(60, width / 10)); const tw = font.widthOfTextAtSize(wm, size);
          let x = (width - tw) / 2, y = height / 2, rot = 0;
          if (pos === 'top') y = height - 48; else if (pos === 'bottom') y = 30; else if (pos === 'diagonal') rot = -35;
          p.drawText(wm, { x, y, size, font, color: grayscale(0.45), opacity, rotate: degrees(rot) });
        });
        await saveDoc(src, 'megaplan-watermarked.pdf'); setOut(body, 'Watermark added.'); return;
      }
      if (title === 'Crop PDF') {
        const [l, top, rgt, btm] = (q('crop')?.value || '36,36,36,36').split(',').map(Number);
        src.getPages().forEach(p => { const { width, height } = p.getSize(); p.setCropBox(l, btm, width - l - rgt, height - top - btm); });
        await saveDoc(src, 'megaplan-cropped.pdf'); setOut(body, 'Crop box updated.'); return;
      }
      if (title === 'Resize PDF Pages') {
        const sizes = { A4: [595.28, 841.89], Letter: [612, 792], A5: [419.53, 595.28] };
        const [tw, th] = sizes[q('size')?.value || 'A4']; const mode = q('resizeMode')?.value || 'contain';
        const out = await PDFDocument.create(); const bytes = await files[0].arrayBuffer();
        for (let i = 0; i < n; i++) {
          const [ep] = await out.embedPdf(bytes, [i]); const np = out.addPage([tw, th]);
          if (mode === 'stretch') np.drawPage(ep, { x: 0, y: 0, width: tw, height: th });
          else { const s = Math.min(tw / ep.width, th / ep.height); const w = ep.width * s, h = ep.height * s; np.drawPage(ep, { x: (tw - w) / 2, y: (th - h) / 2, width: w, height: h }); }
        }
        await saveDoc(out, 'megaplan-resized.pdf'); setOut(body, `Resized ${n} page(s) (${mode}).`); return;
      }
      if (title === 'Overlay PDFs') {
        if (files.length !== 2) throw Error('Choose base PDF then overlay PDF.');
        const ov = await PDFDocument.load(await files[1].arrayBuffer(), { ignoreEncryption: true });
        const match = q('overlayMode')?.value === 'match';
        for (let i = 0; i < n; i++) {
          const oi = match ? Math.min(i, ov.getPageCount() - 1) : 0;
          const [emb] = await src.embedPdf(await files[1].arrayBuffer(), [oi]);
          const p = src.getPage(i); const { width, height } = p.getSize();
          p.drawPage(emb, { x: 0, y: 0, width, height });
        }
        await saveDoc(src, 'megaplan-overlay.pdf'); setOut(body, 'Overlay applied.'); return;
      }
      if (title === 'Annotate PDF') {
        const font = await src.embedFont(StandardFonts.Helvetica);
        const i = clamp((Number(q('notePage')?.value) || 1) - 1, 0, n - 1);
        const p = src.getPage(i); const x = Number(q('noteX')?.value) || 50, y = Number(q('noteY')?.value) || 50;
        p.drawRectangle({ x: x - 6, y: y - 4, width: 190, height: 28, color: rgb(1, 0.95, 0.6), borderColor: rgb(0.6, 0.55, 0.2), borderWidth: 1 });
        p.drawText(q('noteText')?.value || 'Reviewed', { x, y, size: 11, font, color: rgb(0, 0, 0) });
        await saveDoc(src, 'megaplan-annotated.pdf'); setOut(body, 'Added a visible text annotation box.'); return;
      }
      if (title === 'Sign PDF') {
        const i = clamp((Number(q('sigPage')?.value) || 1) - 1, 0, n - 1);
        const p = src.getPage(i); const x = Number(q('sigX')?.value) || 50, y = Number(q('sigY')?.value) || 70;
        const size = Math.max(8, Number(q('sigSize')?.value) || 20);
        const imgFile = files.find(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
        if (imgFile) {
          const ab = await imgFile.arrayBuffer(); let img;
          if (/png/i.test(imgFile.type) || /\.png$/i.test(imgFile.name)) img = await src.embedPng(ab);
          else if (/jpe?g/i.test(imgFile.type) || /\.jpe?g$/i.test(imgFile.name)) img = await src.embedJpg(ab);
          else {
            const bmp = await createImageBitmap(imgFile);
            const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d').drawImage(bmp, 0, 0);
            img = await src.embedPng(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); bmp.close();
          }
          const w = Math.min(220, img.width), h = w * (img.height / img.width);
          p.drawImage(img, { x, y, width: w, height: h });
        } else {
          const font = await src.embedFont(StandardFonts.HelveticaOblique);
          const sig = q('sigText')?.value || 'Signed';
          p.drawText(sig, { x, y, size, font, color: rgb(0, 0, 0) });
          p.drawLine({ start: { x, y: y - 4 }, end: { x: x + Math.max(100, font.widthOfTextAtSize(sig, size) + 10), y: y - 4 }, thickness: 1, color: rgb(0, 0, 0) });
        }
        await saveDoc(src, 'megaplan-signed.pdf'); setOut(body, 'Added a visible signature stamp. Not a cryptographic digital signature.'); return;
      }
      if (title === 'Fill PDF') {
        const form = src.getForm(); const fields = form.getFields();
        if (!fields.length) throw Error('No AcroForm fields were found.');
        body.querySelectorAll('#form-fields [data-fi]').forEach(c => {
          const f = fields[Number(c.dataset.fi)]; const kind = f.constructor?.name || '';
          if (kind.includes('TextField')) f.setText(c.value || '');
          else if (kind.includes('CheckBox')) { if (c.checked) f.check(); else f.uncheck?.(); }
          else if (kind.includes('Dropdown') || kind.includes('RadioGroup')) { if (c.value) f.select(c.value); }
        });
        form.updateFieldAppearances?.();
        await saveDoc(src, 'megaplan-filled.pdf'); setOut(body, `Updated ${fields.length} form fields.`); return;
      }
      if (title === 'PDF Form Field Viewer') {
        const fields = src.getForm().getFields();
        if (!fields.length) { setOut(body, 'No AcroForm fields found.'); return; }
        setOut(body, fields.map((f, i) => {
          const typ = f.constructor?.name || 'Field';
          let value = '';
          if (typ.includes('TextField')) value = f.getText?.() || '';
          else if (typ.includes('CheckBox')) value = f.isChecked?.() ? 'checked' : 'unchecked';
          else if (typ.includes('Dropdown') || typ.includes('RadioGroup')) value = [].concat(f.getSelected?.() || []).join(', ');
          const opts = f.getOptions?.();
          return `${i + 1}. ${f.getName()} — ${typ}${opts?.length ? `\n   Options: ${opts.join(', ')}` : ''}${value !== '' ? `\n   Current: ${value}` : ''}`;
        }).join('\n')); return;
      }
      if (title === 'PDF to Images') {
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const JSZip = await loadJSZip(); const zip = new JSZip();
        const fmt = q('imageFormat')?.value || 'png', scale = Number(q('imageScale')?.value) || 1.5;
        for (let i = 1; i <= task.numPages; i++) {
          setProgress(body, (i / task.numPages) * 100, `Rendering page ${i} of ${task.numPages}`);
          const page = await task.getPage(i); const vp = page.getViewport({ scale });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          zip.file(`page-${i}.${fmt === 'jpeg' ? 'jpg' : 'png'}`, await new Promise(res => c.toBlob(res, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92)));
          await page.cleanup?.();
        }
        setProgress(body, null);
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'megaplan-pdf-images.zip');
        setOut(body, `Rendered ${task.numPages} page(s).`); return;
      }
      if (title === 'Extract PDF Images') {
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const JSZip = await loadJSZip(); const zip = new JSZip(); let extracted = 0;
        for (let i = 1; i <= task.numPages; i++) {
          setProgress(body, (i / task.numPages) * 100, `Extracting images from page ${i}`);
          const page = await task.getPage(i); const ops = await page.getOperatorList(); const names = new Set();
          for (let k = 0; k < ops.fnArray.length; k++) {
            const fn = ops.fnArray[k];
            if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintJpegXObject || fn === pdfjs.OPS.paintImageMaskXObject) {
              const nm = ops.argsArray[k]?.[0]; if (nm) names.add(nm);
            }
          }
          for (const nm of names) {
            try {
              const image = await page.objs.get(nm);
              const w = Number(image?.width), h = Number(image?.height), data = image?.data;
              let blob = null;
              if (image?.bitmap) {
                const c = document.createElement('canvas'); c.width = image.bitmap.width; c.height = image.bitmap.height;
                c.getContext('2d').drawImage(image.bitmap, 0, 0);
                blob = await new Promise(r => c.toBlob(r, 'image/png'));
              } else if (w && h && data) {
                const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
                if (data.length === w * h * 4) ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
                else if (data.length === w * h * 3) {
                  const rgba = new Uint8ClampedArray(w * h * 4);
                  for (let p = 0, j = 0; p < data.length; p += 3, j += 4) { rgba[j] = data[p]; rgba[j + 1] = data[p + 1]; rgba[j + 2] = data[p + 2]; rgba[j + 3] = 255; }
                  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
                }
                blob = await new Promise(r => c.toBlob(r, 'image/png'));
              }
              if (blob) { extracted++; zip.file(`page-${i}-${extracted}.png`, blob); }
            } catch { /* skip */ }
          }
          await page.cleanup?.();
        }
        setProgress(body, null);
        if (!extracted) throw Error('No embedded images were found. Use PDF to Images to rasterize pages.');
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'megaplan-extracted-images.zip');
        setOut(body, `Extracted ${extracted} embedded image(s).`); return;
      }
      if (['PDF to Text', 'PDF to Markdown', 'PDF to HTML', 'PDF to Word', 'PDF to Excel', 'PDF to PowerPoint', 'PDF to EPUB', 'PDF to RTF'].includes(title)) {
        const pages = await extractPageTexts(files[0], (i, total) => setProgress(body, (i / total) * 100, `Reading page ${i} of ${total}`));
        setProgress(body, null);
        const headed = q('onePerPage')?.checked !== false;
        const blocks = pages.map((p, i) => headed ? `Page ${i + 1}\n${p}` : p);
        const JSZip = await loadJSZip();
        if (title === 'PDF to HTML') downloadBlob(new Blob([`<main>${pages.map((p, i) => `<section><h2>Page ${i + 1}</h2><pre>${esc(p)}</pre></section>`).join('')}</main>`], { type: 'text/html' }), 'megaplan.html');
        else if (title === 'PDF to Markdown') downloadText(pages.map((p, i) => `## Page ${i + 1}\n\n${p}`).join('\n\n'), 'megaplan.md', 'text/markdown');
        else if (title === 'PDF to RTF') downloadText('{\\rtf1\\ansi ' + pages.join('\\par ').replace(/[\\{}]/g, '\\$&') + '}', 'megaplan.rtf', 'application/rtf');
        else if (title === 'PDF to Word') downloadBlob(await wrapDocx(JSZip, blocks), 'megaplan.docx');
        else if (title === 'PDF to Excel') downloadBlob(await wrapXlsx(JSZip, pages.flatMap((p, i) => [[`Page ${i + 1}`], ...p.split('\n').map(line => [line])])), 'megaplan.xlsx');
        else if (title === 'PDF to PowerPoint') downloadBlob(await wrapPptx(JSZip, pages.map((p, i) => `Page ${i + 1}\n${p}`)), 'megaplan.pptx');
        else if (title === 'PDF to EPUB') downloadBlob(await wrapEpub(JSZip, pages), 'megaplan.epub');
        else downloadText(blocks.join('\n\n'), 'megaplan.txt', 'text/plain');
        setOut(body, `Extracted ${pages.length} page(s). Layout is reconstructed as text.`); return;
      }
      if (title === 'OCR PDF') {
        const pdfjs = await loadPdfJs();
        const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const Tesseract = (await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm')).default;
        const outDoc = await PDFDocument.create();
        const font = await outDoc.embedFont(StandardFonts.Helvetica);
        const texts = [];
        for (let i = 1; i <= task.numPages; i++) {
          setProgress(body, (i / task.numPages) * 100, `Reading page ${i} of ${task.numPages}`);
          setOut(body, `Reading page ${i} of ${task.numPages}…`);
          const page = await task.getPage(i);
          const vp = page.getViewport({ scale: 1.6 });
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          const { data } = await Tesseract.recognize(blob, 'eng');
          const text = String(data?.text || '').trim(); texts.push(text);
          const img = await outDoc.embedPng(await blob.arrayBuffer());
          const np = outDoc.addPage([vp.width / 1.6, vp.height / 1.6]);
          np.drawImage(img, { x: 0, y: 0, width: np.getWidth(), height: np.getHeight() });
          let ty = 3;
          for (const line of fitText(font, text.replace(/\s+/g, ' '), np.getWidth() - 8, 1).slice(0, 800)) {
            np.drawText(line, { x: 3, y: ty, size: 1, font, color: grayscale(1), opacity: 0.001 });
            ty += 1.15; if (ty > np.getHeight() - 1) break;
          }
          canvas.width = 1; canvas.height = 1; await page.cleanup?.();
        }
        setProgress(body, null);
        await saveDoc(outDoc, 'megaplan-ocr.pdf');
        downloadText(texts.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n'), 'megaplan-ocr.txt');
        setOut(body, `Read ${task.numPages} page(s). Searchable layer is approximate. A text file was also saved.`); return;
      }
      if (title === 'Redact PDF') {
        const specs = (q('redactions')?.value || '').split(';').map(x => x.trim()).filter(Boolean).map(token => {
          const [pg, rest] = token.split(':'); const a = (rest || '').split(',').map(Number);
          return { page: Number(pg), x: a[0], y: a[1], w: a[2], h: a[3] };
        });
        if (!specs.length) throw Error('Add redaction rectangles (drag on the preview, or page:x,y,w,h percent).');
        const pdfjs = await loadPdfJs();
        const rebuilt = await rasterizePdf(pdfjs, PDFDocument, files[0], {
          scale: 1.4, jpegQuality: 0.88,
          onPage: (i, total) => setProgress(body, (i / total) * 100, `Redacting page ${i} of ${total}`),
          paint: (canvas, i) => {
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000';
            for (const s of specs.filter(s => s.page === i)) {
              ctx.fillRect(canvas.width * s.x / 100, canvas.height * (100 - s.y - s.h) / 100, canvas.width * s.w / 100, canvas.height * s.h / 100);
            }
          }
        });
        setProgress(body, null);
        await saveDoc(rebuilt, 'megaplan-redacted.pdf');
        setOut(body, 'Image-only redacted PDF. Original searchable text is not retained. Check the blackouts before sharing.'); return;
      }
      await saveDoc(src, 'megaplan.pdf');
      setOut(body, `Saved rebuilt PDF (${n} pages).`);
    } catch (e) {
      setProgress(body, null);
      setOut(body, 'Error: ' + (e.message || e));
    }
  };
}
