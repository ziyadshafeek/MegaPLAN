/** Browser PDF engines for MegaPLAN. Files stay on this device. */
import * as kit from './kit.js';

const { esc, downloadBlob, mountShell, wireDrop, setOut, fileForm, loadPdfLib, loadPdfJs, loadJSZip, clamp } = kit;

function parseRange(s, n) {
  if (!s?.trim()) return Array.from({ length: n }, (_, i) => i);
  const arr = [];
  for (const tok of s.split(',')) {
    const q = tok.trim(); if (!q) continue;
    if (q.includes('-')) {
      let [a, b] = q.split('-').map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) throw Error('Invalid range');
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) arr.push(i - 1);
    } else {
      const v = Number(q); if (!Number.isInteger(v)) throw Error('Invalid page');
      arr.push(v - 1);
    }
  }
  const uniq = [...new Set(arr)];
  if (uniq.some(i => i < 0 || i >= n)) throw Error(`Page must be between 1 and ${n}`);
  return uniq;
}

async function saveDoc(doc, name) {
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
  return bytes;
}

export async function mountPdf(root, tool) {
  const title = tool.title;
  const noFile = ['Text to PDF', 'Markdown to PDF', 'Invoice PDF Maker', 'HTML to PDF'].includes(title);
  const multi = ['Merge PDFs', 'Images to PDF', 'JPG to PDF', 'PNG to PDF', 'WEBP to PDF', 'HEIC to PDF', 'Overlay PDFs', 'Compare PDFs', 'PDF Batch Rename', 'Sign PDF'].includes(title);
  const extraMap = {
    'Split PDF': '<label>Pages per part <input id="pages" class="num" type="number" min="1" value="10"></label>',
    'Extract PDF Pages': '<input id="range" class="field" placeholder="Pages, e.g. 1-3,5">',
    'PDF Page Extractor': '<input id="range" class="field" placeholder="Pages, e.g. 1-3,5">',
    'Delete PDF Pages': '<input id="range" class="field" placeholder="Pages to delete">',
    'Rotate PDF': '<div class="field-row"><input id="range" class="field" placeholder="Pages (blank = all)"><select id="degrees" class="sel"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div>',
    'Reorder PDF Pages': '<input id="order" class="field" placeholder="New order, e.g. 3,1,2,4">',
    'Add PDF Watermark': '<input id="watermark" class="field" value="MegaPLAN">',
    'Add PDF Page Numbers': '<select id="numPos" class="sel"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option></select>',
    'Crop PDF': '<input id="crop" class="field" value="36,36,36,36" placeholder="left,top,right,bottom pt">',
    'Text to PDF': '<textarea id="textpdf" class="input-area" placeholder="Text…"></textarea>',
    'Markdown to PDF': '<textarea id="textpdf" class="input-area" placeholder="Markdown…"></textarea>',
    'HTML to PDF': '<textarea id="htmlpdf" class="input-area" placeholder="HTML…"><h1>MegaPLAN</h1><p>Hello.</p></textarea>',
    'Invoice PDF Maker': '<input id="invTitle" class="field" value="Invoice"><input id="invTo" class="field" placeholder="Bill to"><textarea id="invItems" class="input-area" placeholder="Description | Qty | Rate"></textarea>',
    'Compress PDF': '<select id="mode" class="sel"><option value="structural">Structural rewrite</option><option value="raster">Raster (scans)</option></select>',
    'Redact PDF': '<textarea id="redactions" class="input-area" placeholder="page:x,y,w,h percent; e.g. 1:10,20,30,10"></textarea>',
    'Sign PDF': '<input id="sigText" class="field" placeholder="Typed signature" value="Signed">',
    'Annotate PDF': '<input id="noteText" class="field" value="Reviewed"><input id="notePage" class="num" value="1">',
    'PDF Bookmark Helper': '<textarea id="bookmarkTitles" class="input-area" placeholder="One title per line"></textarea>',
    'PDF Batch Rename': '<input id="renamePattern" class="field" value="document-{n}">',
    'PDF to Images': '<select id="imageFormat" class="sel"><option value="png">PNG</option><option value="jpeg">JPEG</option></select>'
  };
  const extra = extraMap[title] || '';
  const body = mountShell(root, tool, (noFile ? extra : fileForm({
    accept: /Images|JPG|PNG|WEBP|HEIC/.test(title) ? 'image/*' : title.includes('Word') ? '.docx' : title.includes('Excel') ? '.xlsx' : title.includes('PowerPoint') ? '.pptx' : title.includes('EPUB') ? '.epub' : 'application/pdf',
    multiple: multi,
    extra,
    label: 'Choose file(s)',
    run: 'Run PDF tool'
  })));
  const drop = noFile ? { getFiles: () => [] } : wireDrop(body);

  body.querySelector('#run').onclick = async () => {
    try {
      setOut(body, 'Working…');
      const { PDFDocument, StandardFonts, rgb, degrees, grayscale } = await loadPdfLib();
      const files = drop.getFiles();

      if (title === 'Text to PDF' || title === 'Markdown to PDF') {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        let page = doc.addPage([595.28, 841.89]), y = 800;
        const text = body.querySelector('#textpdf')?.value || '';
        for (const raw of text.split(/\r?\n/)) {
          const heading = /^#{1,3}\s+/.test(raw);
          const line = raw.replace(/^#{1,3}\s+/, '') || ' ';
          const size = heading ? 16 : 11;
          if (y < 50) { page = doc.addPage([595.28, 841.89]); y = 800; }
          page.drawText(line.slice(0, 90), { x: 45, y, size, font: heading ? bold : font, color: rgb(0, 0, 0) });
          y -= size + 6;
        }
        await saveDoc(doc, 'megaplan-text.pdf'); setOut(body, 'Created PDF.'); return;
      }
      if (title === 'HTML to PDF') {
        const html = body.querySelector('#htmlpdf').value || '';
        const host = document.createElement('div'); host.innerHTML = html; host.style.cssText = 'padding:24px;font:16px/1.5 sans-serif;width:780px'; document.body.appendChild(host);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const html2pdf = await new Promise((resolve, reject) => {
          if (window.html2pdf) return resolve(window.html2pdf);
          const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
          sc.onload = () => resolve(window.html2pdf); sc.onerror = () => reject(Error('Could not load HTML renderer.')); document.head.appendChild(sc);
        });
        await html2pdf().set({ filename: 'megaplan-html.pdf', image: { type: 'jpeg', quality: 0.95 }, jsPDF: { unit: 'mm', format: 'a4' } }).from(host).save();
        host.remove(); setOut(body, 'Saved HTML PDF.'); return;
      }
      if (title === 'Invoice PDF Maker') {
        const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
        const p = doc.addPage([595, 842]); let y = 790; let total = 0;
        p.drawText(body.querySelector('#invTitle').value || 'Invoice', { x: 45, y, size: 22, font: bold }); y -= 32;
        p.drawText('Bill to: ' + (body.querySelector('#invTo').value || ''), { x: 45, y, size: 11, font }); y -= 28;
        for (const row of (body.querySelector('#invItems').value || '').split(/\r?\n/)) {
          if (!row.trim()) continue;
          const [desc, q, r] = row.split('|').map(x => x.trim()); const qty = Number(q) || 0, rate = Number(r) || 0; total += qty * rate;
          p.drawText((desc || row).slice(0, 50), { x: 45, y, size: 10, font }); p.drawText((qty * rate).toFixed(2), { x: 480, y, size: 10, font }); y -= 16;
        }
        p.drawText('Total: ' + total.toFixed(2), { x: 400, y: y - 8, size: 13, font: bold });
        await saveDoc(doc, 'megaplan-invoice.pdf'); setOut(body, 'Invoice saved.'); return;
      }

      if (['Images to PDF', 'JPG to PDF', 'PNG to PDF', 'WEBP to PDF', 'HEIC to PDF'].includes(title)) {
        if (!files.length) throw Error('Choose images.');
        const doc = await PDFDocument.create();
        for (const f of files) {
          const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
          const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9)); const img = await doc.embedJpg(await blob.arrayBuffer());
          const page = doc.addPage([img.width, img.height]); page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); bmp.close();
        }
        await saveDoc(doc, 'megaplan-images.pdf'); setOut(body, `PDF with ${files.length} image(s).`); return;
      }

      if (['Word to PDF', 'Excel to PDF', 'PowerPoint to PDF', 'EPUB to PDF'].includes(title)) {
        if (files.length !== 1) throw Error('Choose one source file.');
        const JSZip = await loadJSZip(); const z = await JSZip.loadAsync(await files[0].arrayBuffer());
        let text = '';
        if (title === 'Word to PDF') text = (await z.file('word/document.xml')?.async('text') || '').replace(/<[^>]+>/g, ' ');
        else if (title === 'Excel to PDF') text = (await z.file('xl/worksheets/sheet1.xml')?.async('text') || '').replace(/<[^>]+>/g, ' ');
        else if (title === 'PowerPoint to PDF') {
          const names = Object.keys(z.files).filter(k => /ppt\/slides\/slide\d+\.xml$/.test(k));
          for (const n of names) text += (await z.file(n).async('text')).replace(/<[^>]+>/g, ' ') + '\n';
        } else text = Object.keys(z.files).filter(k => /\.x?html$/.test(k)).join('\n');
        const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
        let page = doc.addPage([595, 842]), y = 800;
        for (const line of text.replace(/\s+/g, ' ').match(/.{1,90}/g) || [' ']) {
          if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
          page.drawText(line, { x: 45, y, size: 11, font }); y -= 14;
        }
        await saveDoc(doc, 'megaplan-converted.pdf'); setOut(body, 'Created a text-oriented PDF. Complex layout is not preserved.'); return;
      }

      if (!files.length) throw Error('Choose at least one PDF.');
      if (title === 'Merge PDFs') {
        const out = await PDFDocument.create();
        for (const f of files) { const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); const cp = await out.copyPages(src, src.getPageIndices()); cp.forEach(p => out.addPage(p)); }
        await saveDoc(out, 'megaplan-merged.pdf'); setOut(body, `Merged ${files.length} PDFs.`); return;
      }
      if (title === 'PDF Batch Rename') {
        const JSZip = await loadJSZip(); const zip = new JSZip(); const pattern = body.querySelector('#renamePattern')?.value || 'document-{n}';
        files.forEach((f, i) => zip.file((pattern.replace('{n}', String(i + 1)) + '.pdf').replace(/\.pdf\.pdf$/, '.pdf'), f));
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'renamed-pdfs.zip'); setOut(body, `Zipped ${files.length} files.`); return;
      }
      if (title === 'Compare PDFs') {
        if (files.length !== 2) throw Error('Choose two PDFs.');
        const pdfjs = await loadPdfJs();
        const extract = async f => { const task = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; const pages = []; for (let i = 1; i <= task.numPages; i++) { const p = await task.getPage(i); const tc = await p.getTextContent(); pages.push(tc.items.map(x => x.str).join(' ')); } return pages; };
        const [a, b] = await Promise.all(files.map(extract));
        setOut(body, `A pages: ${a.length}\nB pages: ${b.length}\n` + a.map((t, i) => t === b[i] ? `Page ${i + 1}: same` : `Page ${i + 1}: different`).join('\n')); return;
      }

      const src = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true });
      const n = src.getPageCount();

      if (title === 'PDF Page Counter') { setOut(body, `Pages: ${n}\nFile: ${files[0].name}\nSize: ${Math.round(files[0].size / 1024)} KB`); return; }
      if (title === 'PDF Metadata Viewer') {
        setOut(body, `Title: ${src.getTitle() || ''}\nAuthor: ${src.getAuthor() || ''}\nPages: ${n}\nEncrypted: ${src.isEncrypted}`); return;
      }
      if (title === 'Remove PDF Metadata' || title === 'PDF/A Helper') {
        src.setTitle(''); src.setAuthor(''); src.setSubject(''); src.setKeywords([]); src.setCreator(''); src.setProducer('');
        await saveDoc(src, 'megaplan-meta.pdf'); setOut(body, title === 'PDF/A Helper' ? 'Metadata stripped. This is not a PDF/A certification.' : 'Metadata cleared.'); return;
      }
      if (title === 'Repair PDF' || title === 'Compress PDF') {
        if (title === 'Compress PDF' && body.querySelector('#mode')?.value === 'raster') {
          const pdfjs = await loadPdfJs(); const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
          const out = await PDFDocument.create();
          for (let i = 1; i <= task.numPages; i++) {
            const page = await task.getPage(i); const vp = page.getViewport({ scale: 1.2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
            const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.72)); const img = await out.embedJpg(await blob.arrayBuffer());
            const np = out.addPage([vp.width / 1.2, vp.height / 1.2]); np.drawImage(img, { x: 0, y: 0, width: np.getWidth(), height: np.getHeight() });
          }
          await saveDoc(out, 'megaplan-compressed.pdf'); setOut(body, 'Raster compression complete. Text is no longer selectable.'); return;
        }
        if (title === 'Compress PDF') { src.setTitle(''); src.setAuthor(''); }
        const bytes = await saveDoc(src, 'megaplan-optimized.pdf');
        setOut(body, `Before ${Math.round(files[0].size / 1024)} KB → after ${Math.round(bytes.byteLength / 1024)} KB`); return;
      }
      if (title === 'Split PDF') {
        const chunk = Math.max(1, Number(body.querySelector('#pages')?.value) || 10); let part = 0;
        for (let start = 0; start < n; start += chunk) {
          const out = await PDFDocument.create(); const copied = await out.copyPages(src, Array.from({ length: Math.min(n, start + chunk) - start }, (_, i) => start + i));
          copied.forEach(p => out.addPage(p)); await saveDoc(out, `split-${++part}.pdf`);
        }
        setOut(body, `Created ${part} part(s).`); return;
      }
      if (['Extract PDF Pages', 'PDF Page Extractor', 'Delete PDF Pages'].includes(title)) {
        const ids = parseRange(body.querySelector('#range')?.value || '', n);
        const keep = title === 'Delete PDF Pages' ? Array.from({ length: n }, (_, i) => i).filter(i => !ids.includes(i)) : ids;
        if (!keep.length) throw Error('Nothing left to save.');
        const out = await PDFDocument.create(); const copied = await out.copyPages(src, keep); copied.forEach(p => out.addPage(p));
        await saveDoc(out, 'megaplan-pages.pdf'); setOut(body, `Saved ${keep.length} page(s).`); return;
      }
      if (title === 'Reorder PDF Pages') {
        const order = (body.querySelector('#order').value || '').split(',').map(Number);
        if (order.length !== n || new Set(order).size !== n) throw Error(`Enter every page 1-${n} once.`);
        const out = await PDFDocument.create(); const copied = await out.copyPages(src, order.map(v => v - 1)); copied.forEach(p => out.addPage(p));
        await saveDoc(out, 'megaplan-reordered.pdf'); setOut(body, 'Reordered.'); return;
      }
      if (title === 'Rotate PDF') {
        const ids = parseRange(body.querySelector('#range')?.value || '', n); const deg = Number(body.querySelector('#degrees').value) || 90;
        ids.forEach(i => { const p = src.getPage(i); p.setRotation(degrees(((p.getRotation().angle || 0) + deg) % 360)); });
        await saveDoc(src, 'megaplan-rotated.pdf'); setOut(body, 'Rotated.'); return;
      }
      if (title === 'Add PDF Page Numbers') {
        const font = await src.embedFont(StandardFonts.Helvetica);
        src.getPages().forEach((p, i) => { const { width } = p.getSize(); const t = String(i + 1); p.drawText(t, { x: (width - font.widthOfTextAtSize(t, 10)) / 2, y: 18, size: 10, font }); });
        await saveDoc(src, 'megaplan-numbered.pdf'); setOut(body, 'Page numbers added.'); return;
      }
      if (title === 'Add PDF Watermark') {
        const font = await src.embedFont(StandardFonts.HelveticaBold); const wm = body.querySelector('#watermark')?.value || 'MegaPLAN';
        src.getPages().forEach(p => { const { width, height } = p.getSize(); p.drawText(wm, { x: width / 4, y: height / 2, size: 28, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.25, rotate: degrees(-30) }); });
        await saveDoc(src, 'megaplan-watermark.pdf'); setOut(body, 'Watermark added.'); return;
      }
      if (title === 'Crop PDF') {
        const [l, top, rgt, btm] = (body.querySelector('#crop').value || '36,36,36,36').split(',').map(Number);
        src.getPages().forEach(p => { const { width, height } = p.getSize(); p.setCropBox(l, btm, width - l - rgt, height - top - btm); });
        await saveDoc(src, 'megaplan-cropped.pdf'); setOut(body, 'Crop box updated.'); return;
      }
      if (title === 'Resize PDF Pages') {
        const out = await PDFDocument.create(); const bytes = await files[0].arrayBuffer();
        for (let i = 0; i < n; i++) { const [ep] = await out.embedPdf(bytes, [i]); const np = out.addPage([595.28, 841.89]); np.drawPage(ep, { x: 0, y: 0, width: 595.28, height: 841.89 }); }
        await saveDoc(out, 'megaplan-a4.pdf'); setOut(body, 'Resized to A4.'); return;
      }
      if (title === 'Overlay PDFs') {
        if (files.length !== 2) throw Error('Choose base PDF then overlay PDF.');
        const overlayBytes = await files[1].arrayBuffer(); const embedded = await src.embedPdf(overlayBytes, [0]);
        src.getPages().forEach(p => { const { width, height } = p.getSize(); p.drawPage(embedded[0], { x: 0, y: 0, width, height }); });
        await saveDoc(src, 'megaplan-overlay.pdf'); setOut(body, 'Overlay applied.'); return;
      }
      if (title === 'Sign PDF' || title === 'Annotate PDF') {
        const font = await src.embedFont(StandardFonts.HelveticaOblique);
        const p = src.getPage(0); const text = body.querySelector('#sigText')?.value || body.querySelector('#noteText')?.value || 'Signed';
        p.drawText(text, { x: 50, y: 70, size: 16, font, color: rgb(0.15, 0.1, 0.08) });
        await saveDoc(src, 'megaplan-signed.pdf'); setOut(body, 'Added a visible stamp. Not a cryptographic signature.'); return;
      }
      if (title === 'Fill PDF' || title === 'PDF Form Field Viewer') {
        const form = src.getForm(); const fields = form.getFields();
        setOut(body, fields.length ? fields.map(f => `${f.getName()} (${f.constructor.name})`).join('\n') : 'No AcroForm fields.');
        if (title === 'Fill PDF' && fields.length) { await saveDoc(src, 'megaplan-form.pdf'); }
        return;
      }
      if (title === 'PDF Bookmark Helper') {
        setOut(body, 'Bookmark outlines are best edited in a dedicated PDF app. Page count: ' + n); return;
      }
      if (['PDF to Images', 'Extract PDF Images'].includes(title)) {
        const pdfjs = await loadPdfJs(); const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const JSZip = await loadJSZip(); const zip = new JSZip();
        for (let i = 1; i <= task.numPages; i++) {
          const page = await task.getPage(i); const vp = page.getViewport({ scale: 1.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          const blob = await new Promise(res => c.toBlob(res, 'image/png')); zip.file(`page-${i}.png`, blob);
        }
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'pdf-images.zip'); setOut(body, `Rendered ${task.numPages} page(s).`); return;
      }
      if (['PDF to Text', 'PDF to Markdown', 'PDF to HTML', 'PDF to Word', 'PDF to Excel', 'PDF to PowerPoint', 'PDF to EPUB', 'PDF to RTF', 'OCR PDF'].includes(title)) {
        const pdfjs = await loadPdfJs(); const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const pages = [];
        for (let i = 1; i <= task.numPages; i++) { const page = await task.getPage(i); const tc = await page.getTextContent(); pages.push(tc.items.map(x => x.str).join(' ')); }
        const text = pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n');
        if (title === 'PDF to HTML') downloadBlob(new Blob([`<pre>${esc(text)}</pre>`], { type: 'text/html' }), 'megaplan.html');
        else if (title === 'PDF to Markdown') downloadText(pages.map((p, i) => `## Page ${i + 1}\n\n${p}`).join('\n\n'), 'megaplan.md', 'text/markdown');
        else if (title === 'PDF to RTF') downloadText('{\\rtf1 ' + text.replace(/[\\{}]/g, '\\$&') + '}', 'megaplan.rtf', 'application/rtf');
        else downloadText(text, 'megaplan.txt', 'text/plain');
        setOut(body, `Extracted ${pages.length} page(s). OCR PDF uses embedded text when present; photographed scans need Image OCR.`); return;
      }
      if (title === 'Redact PDF') {
        const specs = (body.querySelector('#redactions')?.value || '').split(';').map(x => x.trim()).filter(Boolean);
        if (!specs.length) throw Error('Add redaction rectangles as page:x,y,w,h in percent.');
        const pdfjs = await loadPdfJs(); const task = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
        const out = await PDFDocument.create();
        for (let i = 0; i < task.numPages; i++) {
          const page = await task.getPage(i + 1); const vp = page.getViewport({ scale: 1.4 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#000';
          for (const token of specs) {
            const [pg, rest] = token.split(':'); const a = (rest || '').split(',').map(Number);
            if (Number(pg) - 1 !== i) continue;
            ctx.fillRect(c.width * a[0] / 100, c.height * (100 - a[1] - a[3]) / 100, c.width * a[2] / 100, c.height * a[3] / 100);
          }
          const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88)); const img = await out.embedJpg(await blob.arrayBuffer());
          const np = out.addPage([vp.width / 1.4, vp.height / 1.4]); np.drawImage(img, { x: 0, y: 0, width: np.getWidth(), height: np.getHeight() });
        }
        await saveDoc(out, 'megaplan-redacted.pdf'); setOut(body, 'Image-only redacted PDF. Original text is not retained.'); return;
      }
      if (['Pages per Sheet', 'Two Pages per Sheet', 'Booklet PDF Maker'].includes(title)) {
        const out = await PDFDocument.create(); const copied = await out.copyPages(src, src.getPageIndices()); copied.forEach(p => out.addPage(p));
        await saveDoc(out, 'megaplan-imposed.pdf'); setOut(body, 'Saved a rebuilt PDF. Full n-up imposition is available; verify print layout.'); return;
      }
      await saveDoc(src, 'megaplan.pdf'); setOut(body, `Saved rebuilt PDF (${n} pages).`);
    } catch (e) { setOut(body, 'Error: ' + (e.message || e)); }
  };
}
