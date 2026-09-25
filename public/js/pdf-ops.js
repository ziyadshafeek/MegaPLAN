/** Shared PDF algorithms for MegaPLAN. Browser-only. */
import { downloadBlob } from './kit.js';

export function parseRange(s, n) {
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

export async function saveDoc(doc, name) {
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), name);
  return bytes;
}

export function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (globalName && window[globalName]) return resolve(window[globalName]);
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(globalName ? window[globalName] : true);
    s.onerror = () => reject(Error('Could not load a helper script.'));
    document.head.appendChild(s);
  });
}

export function xmlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

export function fitText(font, text, maxWidth, size) {
  const lines = [];
  let cur = '';
  for (const raw of String(text ?? '').split(/\s+/)) {
    if (!raw) continue;
    let w = raw;
    while (w && font.widthOfTextAtSize(w, size) > maxWidth) {
      let take = 1;
      while (take < w.length && font.widthOfTextAtSize(w.slice(0, take + 1), size) <= maxWidth) take++;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, take));
      w = w.slice(take);
    }
    if (!w) continue;
    const cand = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(cand, size) <= maxWidth) cur = cand;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

export async function createFromIndices(src, indices, PDFDocument) {
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, indices);
  pages.forEach(p => doc.addPage(p));
  return doc;
}

export async function textPagesToPdf(PDFDocument, StandardFonts, rgb, pages, title = 'MegaPLAN') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  const pageW = 595.28, pageH = 841.89, margin = 42, size = 11;
  let page = doc.addPage([pageW, pageH]), y = pageH - margin;
  const newPage = () => { page = doc.addPage([pageW, pageH]); y = pageH - margin; };
  for (let pi = 0; pi < pages.length; pi++) {
    const label = pages[pi]?.label || `Page ${pi + 1}`;
    const body = String(pages[pi]?.text || '').replace(/\r/g, '');
    for (const line of fitText(bold, label, pageW - margin * 2, 15)) {
      if (y < margin + 20) newPage();
      page.drawText(line, { x: margin, y, size: 15, font: bold, color: rgb(0, 0, 0) });
      y -= 20;
    }
    for (const raw of body.split(/\n/)) {
      for (const line of fitText(font, raw || ' ', pageW - margin * 2, size)) {
        if (y < size + margin) newPage();
        page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
        y -= size + 4;
      }
      y -= 2;
    }
    y -= 8;
    if (y < margin + 30) newPage();
  }
  return doc;
}

export async function extractDocxText(file, JSZip) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await z.file('word/document.xml')?.async('text');
  if (!xml) throw Error('Invalid DOCX: word/document.xml not found.');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) throw Error('Could not parse DOCX XML.');
  return [...dom.getElementsByTagName('w:p')]
    .map(p => [...p.getElementsByTagName('w:t')].map(n => n.textContent || '').join(''))
    .join('\n');
}

export async function extractXlsxText(file, JSZip) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const shared = [];
  const ss = await z.file('xl/sharedStrings.xml')?.async('text');
  if (ss) {
    const dom = new DOMParser().parseFromString(ss, 'application/xml');
    for (const si of [...dom.getElementsByTagName('si')]) shared.push([...si.getElementsByTagName('t')].map(n => n.textContent || '').join(''));
  }
  const sheetName = Object.keys(z.files).filter(k => /^xl\/worksheets\/sheet[^/]+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw Error('Invalid XLSX: worksheet XML not found.');
  const xml = await z.file(sheetName).async('text');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  return [...dom.getElementsByTagName('row')].map(row => [...row.getElementsByTagName('c')].map(c => {
    const v = c.getElementsByTagName('v')[0]?.textContent || '';
    const t = c.getAttribute('t');
    if (t === 's') return shared[Number(v)] || '';
    if (t === 'inlineStr') return [...c.getElementsByTagName('t')].map(n => n.textContent || '').join('');
    return v;
  }).join('\t')).filter(x => x.trim()).join('\n');
}

export async function extractPptxText(file, JSZip) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(z.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!names.length) throw Error('Invalid PPTX: no slides found.');
  const pages = [];
  for (const name of names) {
    const dom = new DOMParser().parseFromString(await z.file(name).async('text'), 'application/xml');
    pages.push([...dom.getElementsByTagName('a:t')].map(n => n.textContent || '').join(' '));
  }
  return pages;
}

function normalizeZipPath(base, href) {
  const parts = (base + decodeURIComponent(href || '')).split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  return out.join('/');
}

export async function extractEpubText(file, JSZip) {
  const z = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await z.file('META-INF/container.xml')?.async('text');
  if (!container) throw Error('Invalid EPUB: META-INF/container.xml not found.');
  const cdom = new DOMParser().parseFromString(container, 'application/xml');
  const opfPath = cdom.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw Error('EPUB package path not found.');
  const opf = await z.file(opfPath)?.async('text');
  if (!opf) throw Error('EPUB package document not found.');
  const odom = new DOMParser().parseFromString(opf, 'application/xml');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map([...odom.getElementsByTagName('item')].map(i => [i.getAttribute('id'), i.getAttribute('href')]));
  const spine = [...odom.getElementsByTagName('itemref')].map(i => manifest.get(i.getAttribute('idref'))).filter(Boolean);
  const pages = [];
  for (const href of spine) {
    const path = normalizeZipPath(opfDir, (href || '').replace(/^\//, ''));
    const xml = await z.file(path)?.async('text');
    if (!xml) continue;
    const dom = new DOMParser().parseFromString(xml, 'text/html');
    pages.push(dom.body?.textContent?.replace(/\s+/g, ' ').trim() || '');
  }
  if (!pages.length) throw Error('No readable EPUB chapters were found.');
  return pages;
}

export async function addSimplePageBookmarks(src, PDFName, titles = []) {
  const pages = src.getPages();
  if (!pages.length) return 0;
  const outlineRef = src.context.nextRef();
  const itemRefs = pages.map(() => src.context.nextRef());
  src.context.assign(outlineRef, src.context.obj({
    Type: 'Outlines', First: itemRefs[0], Last: itemRefs[itemRefs.length - 1], Count: pages.length
  }));
  for (let i = 0; i < pages.length; i++) {
    const dict = { Title: (titles[i] || `Page ${i + 1}`), Dest: src.context.obj([pages[i].ref, PDFName.of('Fit')]), Parent: outlineRef };
    if (i > 0) dict.Prev = itemRefs[i - 1];
    if (i < pages.length - 1) dict.Next = itemRefs[i + 1];
    src.context.assign(itemRefs[i], src.context.obj(dict));
  }
  src.catalog.set(PDFName.of('Outlines'), outlineRef);
  return pages.length;
}

export function getPdfTextLines(tc) {
  const items = (tc.items || []).filter(x => typeof x.str === 'string');
  const rows = [];
  for (const item of items) {
    const y = Number(item.transform?.[5] || 0);
    let row = rows.find(r => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.items.sort((a, b) => Number(a.transform?.[4] || 0) - Number(b.transform?.[4] || 0))
    .map(x => x.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export async function rasterizePdf(pdfjs, PDFDocument, file, { scale = 1.5, jpegQuality = 0.78, onPage, paint } = {}) {
  const task = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const doc = await PDFDocument.create();
  for (let i = 1; i <= task.numPages; i++) {
    onPage?.(i, task.numPages);
    const page = await task.getPage(i);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(vp.width));
    canvas.height = Math.max(1, Math.ceil(vp.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    paint?.(canvas, i);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Canvas export failed.')), 'image/jpeg', jpegQuality));
    const outPage = doc.addPage([vp.width / scale, vp.height / scale]);
    const img = await doc.embedJpg(await blob.arrayBuffer());
    outPage.drawImage(img, { x: 0, y: 0, width: outPage.getWidth(), height: outPage.getHeight() });
    canvas.width = 1; canvas.height = 1;
    await page.cleanup?.();
  }
  await task.cleanup?.();
  return doc;
}

export async function imageFilesToPdf(PDFDocument, files) {
  const doc = await PDFDocument.create();
  for (const f of files) {
    const b = await f.arrayBuffer();
    let img;
    if (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name)) img = await doc.embedJpg(b);
    else if (f.type === 'image/png' || /\.png$/i.test(f.name)) img = await doc.embedPng(b);
    else {
      const bmp = await createImageBitmap(f);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      img = await doc.embedPng(await blob.arrayBuffer());
      bmp.close();
    }
    const margin = 24;
    const page = doc.addPage([Math.max(1, img.width + margin * 2), Math.max(1, img.height + margin * 2)]);
    page.drawImage(img, { x: margin, y: margin, width: img.width, height: img.height });
  }
  return doc;
}

export async function wrapDocx(JSZip, paragraphs) {
  const body = paragraphs.map(p => `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(p)}</w:t></w:r></w:p>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob' });
}

export async function wrapXlsx(JSZip, rows) {
  const sheet = rows.map((r, i) => `<row r="${i + 1}">${r.map(c => `<c t="inlineStr"><is><t>${xmlEsc(c)}</t></is></c>`).join('')}</row>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extract" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob' });
}

export async function wrapPptx(JSZip, slides) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst></p:presentation>`);
  slides.forEach((text, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr/><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${xmlEsc(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  });
  return zip.generateAsync({ type: 'blob' });
}

export async function wrapEpub(JSZip, chapters) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const manifest = chapters.map((_, i) => `<item id="c${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bid">megaplan</dc:identifier><dc:title>MegaPLAN extract</dc:title><dc:language>en</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
  chapters.forEach((text, i) => {
    zip.file(`OEBPS/ch${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${i + 1}</title></head><body><h1>Page ${i + 1}</h1><p>${xmlEsc(text)}</p></body></html>`);
  });
  return zip.generateAsync({ type: 'blob' });
}
