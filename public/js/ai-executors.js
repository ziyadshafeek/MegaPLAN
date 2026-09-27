/**
 * AI Mode — executor runtime.
 *
 * Every planner step that claims to be automatic has a real implementation here.
 * If an executor cannot complete honestly (offline, CORS, no captions, no
 * source), it returns `ok:false` with a reason and the UI shows that reason —
 * there is no path in this file that fabricates a result.
 *
 * `runStep` never throws for an expected failure. Exceptions are converted into
 * a failed step with a readable message so one broken link cannot abort a chain.
 */
import {
  summarize, buildNotes, revisionQuestions, detectQuestions, detectSections,
  buildStudyBatches, mergeSources, citationList, renderCitationsMarkdown,
  promptPack, sentences, truncate, words
} from './ai-compose.js';
import { draftToolSpec, normalizeRequest } from './planner.js';
import { loadPdfJs } from './kit.js';
import { runTool } from './toolbus.js';
import { runPdfOp, pdfOpForSlug, PDF_OP_TITLES } from './ai-pdf-ops.js';

const PENDING = Symbol('pending');

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

export async function apiPost(path, body, { timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
    if (!res.ok) throw Error(json?.error || `${path} failed (HTTP ${res.status})`);
    return json ?? {};
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path, { timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
    if (!res.ok) throw Error(json?.error || `${path} failed (HTTP ${res.status})`);
    return json ?? {};
  } finally {
    clearTimeout(timer);
  }
}

function ok(summary, extra = {}) { return { ok: true, summary, ...extra }; }
function fail(summary, extra = {}) { return { ok: false, summary, error: summary, ...extra }; }

/**
 * Read an uploaded file as text.
 * `Blob.text()` is used when present, with a FileReader fallback because older
 * mobile Safari and some embedded webviews do not implement it.
 */
export function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') return reject(Error('this browser cannot read files as text'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(Error('the file could not be read'));
    reader.readAsText(file);
  });
}

/** The results a step is allowed to read: its declared dependencies, or everything gathered. */
function upstream(step) {
  const results = step.ctx?.results || {};
  const ids = Array.isArray(step.requires) && step.requires.length ? step.requires : Object.keys(results);
  return ids.map(id => results[id]).filter(Boolean);
}

const textOf = step =>
  upstream(step)
    .map(r => (typeof r === 'string' ? r : r?.text || r?.body || ''))
    .filter(Boolean)
    .join('\n\n');

const collect = (step, kinds) => {
  const out = [];
  for (const r of upstream(step)) {
    if (typeof r === 'string') continue;
    if (Array.isArray(r)) { out.push(...r); continue; }
    if (r.items) out.push(...(Array.isArray(r.items) ? r.items : [r.items]));
    if (r.article) out.push(r.article);
    if (r.sources) out.push(...r.sources);
  }
  return out.filter(Boolean).filter(i => !kinds || kinds.includes(i.kind));
};

/* ------------------------------------------------------------------ *
 * Gather executors
 * ------------------------------------------------------------------ */

async function runResearch(step) {
  const query = String(step.params?.query || '').trim();
  if (!query) return fail('No subject was detected to research.');
  const out = await apiPost('/api/ai-mode', {
    action: 'research',
    query,
    groups: step.params?.groups || undefined,
    language: step.params?.language || 'en',
    limit: step.params?.limit || 5
  });
  const groups = out.groups || [];
  const okGroups = groups.filter(g => g.ok && g.items.length);
  const dead = groups.filter(g => !g.ok).map(g => g.label);
  if (!out.items?.length) {
    return fail(
      dead.length
        ? `No results. ${dead.join(', ')} could not be reached right now.`
        : `No open source returned results for “${query}”. Try a different wording.`,
      { groups, items: [] }
    );
  }
  return ok(`${out.items.length} result(s) from ${okGroups.length} source(s)${dead.length ? ` · unavailable: ${dead.join(', ')}` : ''}`, {
    groups,
    items: out.items,
    availability: out.availability,
    text: mergeSources(groups, { maxChars: 80_000 }).map(s => `### ${s.title}\n${s.body}`).join('\n\n')
  });
}

async function runArticle(step) {
  const query = String(step.params?.query || '').trim();
  if (!query) return fail('No article title was detected.');
  const out = await apiPost('/api/ai-mode', { action: 'article', query, language: step.params?.language || 'en', includeImages: step.params?.includeImages !== false });
  const article = out.article;
  if (!article?.text) return fail(`No encyclopedia article was found for “${query}”.`);
  return ok(`Fetched “${article.title}” — ${article.characters.toLocaleString('en-IN')} characters`, {
    article,
    items: out.items || [],
    text: article.text
  });
}

async function runWebRead(step) {
  const url = String(step.params?.url || '');
  if (!/^https:\/\//i.test(url)) return fail('Only public https links can be read.');
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return fail(`The page answered HTTP ${res.status}.`);
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim().slice(0, 160);
    const body = (html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ') || '').trim();
    if (body.length < 200) return fail('The page returned almost no readable text (it is probably a script-rendered app).');
    return ok(`Read ${url.slice(0, 60)} — ${body.length.toLocaleString('en-IN')} characters`, {
      text: `# ${title || url}\n\n${truncate(body, 60_000)}`,
      items: [{ id: `web:${url}`, kind: 'web', title: title || url, url, source: 'Web page' }]
    });
  } catch (err) {
    return fail(`The browser could not read that page (${err?.message || 'blocked by the site'}). Open it in a new tab if you need it.`);
  }
}

async function runYoutubeTranscript(step) {
  const url = String(step.params?.url || '');
  const out = await apiPost('/api/youtube-transcript', { url, lang: step.params?.lang || 'en', format: 'text' });
  if (!out?.text) return fail('No captions were returned for that video.');
  // Never build a citation from a missing field: "watch?v=undefined" is worse than no link.
  const id = String(out.videoId || out.id || out.video?.id || '').trim();
  const videoUrl = id ? `https://www.youtube.com/watch?v=${id}` : (/^https?:\/\//i.test(url) ? url : '');
  const segments = Array.isArray(out.segments) ? out.segments.length : Number(out.count) || 0;
  return ok(`Captions for ${id || 'that video'} — ${segments} segment${segments === 1 ? '' : 's'}${out.isAutoGenerated ? ' (auto-generated)' : ''}`, {
    text: out.text,
    segments: out.segments,
    videoId: id,
    language: out.language,
    items: [{
      id: `youtube:${id || url}`,
      kind: 'video',
      title: out.video?.title || out.title || `YouTube ${id}`.trim(),
      url: videoUrl,
      source: 'YouTube captions',
      meta: out
    }]
  });
}

async function runYoutubePlaylist(step) {
  const url = String(step.params?.url || '');
  const out = await apiPost('/api/youtube-playlist', { url });
  const videos = (out.videos || out.items || []).filter(v => v && (v.videoId || v.id || v.title));
  if (!videos.length) return fail('That playlist returned no public videos.');
  const watch = v => (v.videoId || v.id) ? `https://www.youtube.com/watch?v=${v.videoId || v.id}` : (/^https?:/.test(String(v.url || '')) ? v.url : '');
  return ok(`${videos.length} video(s) in the playlist`, {
    videos,
    text: videos.map((v, i) => `${i + 1}. ${v.title || v.videoId || v.id}${v.duration ? ` (${v.duration})` : ''}${watch(v) ? ` — ${watch(v)}` : ''}`).join('\n'),
    items: videos.map(v => ({
      id: `youtube:${v.videoId || v.id || v.title}`,
      kind: 'video',
      title: v.title || `YouTube ${v.videoId || v.id}`.trim(),
      url: watch(v),
      source: 'YouTube playlist'
    }))
  });
}

async function runFileRead(step) {
  const file = step.ctx?.files?.[step.params?.fileIndex];
  if (!file) return fail('That file is no longer attached.');
  if (file.size > 12 * 1024 * 1024) return fail(`${file.name} is larger than 12 MB — AI Mode will not read it in the browser.`);
  try {
    const text = await readFileText(file);
    if (!text.trim()) return fail(`${file.name} has no readable text.`);
    return ok(`Read ${file.name} — ${text.length.toLocaleString('en-IN')} characters`, { text, items: [] });
  } catch (err) {
    return fail(`Could not read ${file.name}: ${err?.message || 'unsupported file'}`);
  }
}

async function runPdfRead(step) {
  const file = step.ctx?.files?.[step.params?.fileIndex];
  if (!file) return fail('That PDF is no longer attached.');
  let pages = 0, scanned = 0;
  const chunks = [];
  try {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    pages = doc.numPages;
    const limit = Math.min(pages, 400);
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str || '').join(' ').replace(/\s+/g, ' ').trim();
      if (text.length < 24) scanned++;
      chunks.push(`\n\n--- page ${i} of ${pages} ---\n${text}`);
    }
  } catch (err) {
    return fail(`The PDF could not be opened: ${err?.message || 'unreadable file'}`);
  }
  const text = chunks.join('').trim();
  const ratio = pages ? scanned / pages : 1;
  const needsOcr = text.length < 80 || ratio > 0.6;
  if (needsOcr) {
    return fail(
      `${file.name} has no usable text layer (${scanned}/${pages} pages look scanned). Open the OCR PDF tool — it reads scans in this browser.`,
      { needsOcr: true, pages, scanned }
    );
  }
  return ok(`Read ${file.name} — ${pages} page(s), ${text.length.toLocaleString('en-IN')} characters`, { text, pages });
}

async function runMapPlace(step) {
  const query = String(step.params?.query || '').trim();
  if (!query) return fail('No place name was detected.');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) return fail('The geocoder did not answer.');
  const hit = (await res.json())[0];
  if (!hit) return fail(`“${query}” was not found by OpenStreetMap geocoding.`);
  return ok(`Located ${hit.display_name?.slice(0, 90) || query}`, {
    place: { name: hit.display_name, lat: Number(hit.lat), lon: Number(hit.lon), type: hit.type },
    text: `${hit.display_name} (${hit.lat}, ${hit.lon})`
  });
}

async function runMapNearby(step) {
  const results = step.ctx?.results || {};
  const originId = step.params?.origin;
  const origin = originId ? results[originId]?.place : null;
  if (!origin) return fail('The place to search around was not located first.');
  const poi = String(step.params?.poi || 'amenity');
  const radius = Math.max(200, Math.min(20_000, Number(step.params?.radius) || 2000));
  const query =
    `[out:json][timeout:20];(node["amenity"="${poi}"](around:${radius},${origin.lat},${origin.lon});` +
    `node["shop"="${poi}"](around:${radius},${origin.lat},${origin.lon}););out center ${20};`;
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let data = null;
  for (const mirror of mirrors) {
    try {
      const res = await fetch(`${mirror}?data=${encodeURIComponent(query)}`);
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json.elements) && json.elements.length) { data = json; break; }
    } catch { /* try the next mirror */ }
  }
  if (!data) return fail('No nearby places were returned — the open map service may be rate-limiting.');
  const places = data.elements.slice(0, 20).map(el => ({
    name: el.tags?.name || '(unnamed)',
    kind: el.tags?.amenity || el.tags?.shop || poi,
    lat: el.lat ?? el.center?.lat,
    lon: el.lon ?? el.center?.lon,
    address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber'], el.tags?.['addr:city']].filter(Boolean).join(' ')
  }));
  return ok(`${places.length} ${poi.replace(/_/g, ' ')} within ${Math.round(radius / 1000)} km`, {
    places,
    text: places.map((p, i) => `${i + 1}. ${p.name} — ${p.kind}${p.address ? `, ${p.address}` : ''}`).join('\n')
  });
}

async function runMapRoute(step) {
  const results = step.ctx?.results || {};
  const geoIds = (step.params?.origin || []).map(id => results[id]?.place).filter(Boolean);
  const { from, to } = step.params || {};
  let a = geoIds[0] || null;
  let b = null;
  if (from && to) {
    const [ra, rb] = await Promise.all([geocode(from), geocode(to)]);
    a = a || ra;
    b = rb;
  }
  if (!a || !b) return fail('A route needs both a start and a destination. Add "from X to Y" to the request.');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&steps=false`);
  if (!res.ok) return fail('The routing service did not answer.');
  const json = await res.json();
  const route = json.routes?.[0];
  if (!route) return fail('No driving route was found between those points.');
  return ok(`Route: ${(route.distance / 1000).toFixed(1)} km · about ${Math.round(route.duration / 60)} min by car`, {
    route,
    place: b,
    text: `From ${a.name}\nTo ${b.name}\n${(route.distance / 1000).toFixed(1)} km, ~${Math.round(route.duration / 60)} minutes by car (OpenStreetMap / OSRM).`
  });
}
async function geocode(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const hit = (await res.json())[0];
  return hit ? { name: hit.display_name, lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

async function runMapWeather(step) {
  const results = step.ctx?.results || {};
  const origin = (step.params?.origin || []).map(id => results[id]?.place).filter(Boolean)[0];
  let lat = origin?.lat, lon = origin?.lon;
  if (lat == null) {
    const g = await geocode(String(step.params?.query || ''));
    if (!g) return fail('The place was not found, so the weather could not be read.');
    lat = g.lat; lon = g.lon;
  }
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`
  );
  if (!res.ok) return fail('The weather service did not answer.');
  const data = await res.json();
  const c = data.current || {};
  return ok(`${c.temperature_2m ?? '—'}°C now at ${origin?.name || step.params?.query}`, {
    weather: data,
    text: `Now ${c.temperature_2m ?? '—'}°C (feels ${c.apparent_temperature ?? '—'}°C), humidity ${c.relative_humidity_2m ?? '—'}%, wind ${c.wind_speed_10m ?? '—'} km/h. 3-day range: ${(data.daily?.temperature_2m_min || []).join('/')} to ${(data.daily?.temperature_2m_max || []).join('/')}°C. (Open-Meteo)`
  });
}

/* ------------------------------------------------------------------ *
 * Transform executors
 * ------------------------------------------------------------------ */

function runOutline(step) {
  const text = textOf(step);
  if (!text.trim()) return fail('There is no gathered text to structure yet.');
  const style = step.params?.style || 'notes';
  if (style === 'translate') {
    return ok('Source prepared for translation, with the instruction pack that goes with it.', { text: buildNotes(text, { style: 'translate', heading: 'Ready to translate' }) });
  }
  const notes = buildNotes(text, { style: style === 'summary' ? 'summary' : 'notes', heading: step.title || 'Notes', maxChars: 30_000 });
  const qs = revisionQuestions(text, 8);
  return ok(`Structured notes from ${text.length.toLocaleString('en-IN')} characters + ${qs.length} revision questions`, {
    text: `${notes}\n\n## Revision questions with answers\n\n${qs.map((q, i) => `**Q${i + 1}. ${q.question}**\n${q.answer || '_Derive this from the source._'}`).join('\n\n')}`,
    questions: qs
  });
}

function runCombine(step) {
  const items = collect(step);
  const merged = mergeSources(items.length ? [{ items }] : [], { maxChars: 120_000, perItem: 4000 });
  const text = textOf(step);
  if (!merged.length && !text.trim()) return fail('Nothing to combine.');
  const body = [
    `Sources gathered: ${merged.length || 0}`,
    '',
    ...merged.map(s => `### ${s.title}\n${s.body}\n${s.url || ''}`)
  ].join('\n\n');
  return ok(`Merged ${merged.length || 1} source(s) into one ordered body`, { text: body || text, items: merged });
}

function runPrompts(step) {
  const items = collect(step);
  const text = textOf(step);
  const target = step.params?.target || 'gemini';
  const prompts = promptPack({
    request: step.ctx?.plan?.request?.prompt || '',
    topic: step.ctx?.plan?.request?.topic || '',
    files: (step.ctx?.plan?.request?.files || []).map(f => f.name),
    links: (step.ctx?.plan?.request?.links || []).map(l => l.url),
    gathered: (step.requires || []).map(id => step.ctx?.steps?.find?.(s => s.id === id)?.title).filter(Boolean),
    outputs: (step.ctx?.plan?.steps || []).filter(s => s.stage === 'output').map(s => s.title),
    mode: step.params?.mode || 'auto',
    body: text,
    citations: citationList(items)
  });
  const key = ['notebooklm', 'assistant', 'gemini'].includes(target) ? target : 'gemini';
  return ok(`Prompt pack written for ${key === 'gemini' ? 'Google AI Studio' : key === 'notebooklm' ? 'NotebookLM' : 'the writing assistant'} — copy it, nothing is sent anywhere`, {
    text: prompts[key],
    prompts
  });
}

async function runAssistant(step) {
  const text = textOf(step);
  if (!text.trim()) return fail('There is no material for the writing pass.');
  const out = await apiPost('/api/ai-mode', {
    action: 'compose',
    task: step.params?.task || 'notes',
    text: truncate(text, 48_000),
    request: step.ctx?.plan?.request?.prompt || ''
  }, { timeoutMs: 90_000 });
  return ok(out.via === 'assistant' ? 'Hosting writing pass complete.' : `On-device result (${out.note || 'no hosted assistant on this deployment'})`, {
    text: out.text,
    via: out.via
  });
}

/* ------------------------------------------------------------------ *
 * Output executors
 * ------------------------------------------------------------------ */

async function runPresentation(step) {
  const items = collect(step);
  const topic = String(step.params?.topic || step.ctx?.plan?.request?.topic || 'Presentation').slice(0, 150);
  const notes = textOf(step);
  const outline = buildOutline(topic, items, notes);
  const res = await fetch('/api/presentation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, notes: outline ? '' : notes, outline, slideCount: Math.max(4, Math.min(14, outline.length + 2)) })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return fail(err.error || `The deck could not be built (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const name = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'presentation'}.pptx`;
  triggerDownload(blob, name);
  return ok(`Built ${name} (${Math.round(blob.size / 1024)} KB) with ${outline.length} sourced section(s)`, {
    artifact: { name, size: blob.size, kind: 'pptx' },
    items
  });
}

/** Turn research results into a real slide outline, keeping every source link. */
export function buildOutline(topic, items, notes = '') {
  const slides = [];
  const bySource = new Map();
  for (const item of items || []) {
    const key = item.source || 'Source';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(item);
  }
  for (const [source, list] of bySource) {
    const bullets = list
      .map(i => {
        // Prefer the snippet, fall back to the title — a short but valid source
        // line should still make the deck rather than silently vanishing.
        const text = truncate(i.snippet || i.abstract || i.text || i.title || '', 240);
        return { text, source: i.url || null };
      })
      .filter(b => b.text.length > 3)
      .slice(0, 5);
    if (bullets.length) slides.push({ title: `${source}: what it says`, bullets });
  }
  const noteLines = String(notes || '')
    .split(/[\n.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 24 && s.length < 300)
    .slice(0, 5);
  if (noteLines.length) {
    slides.unshift({ title: `Key points on ${topic}`, bullets: noteLines.map(t => ({ text: t, source: null })) });
  }
  return slides.slice(0, 10);
}

async function runArticlePdf(step) {
  const items = collect(step);
  const text = textOf(step);
  const title = String(step.params?.title || step.ctx?.plan?.request?.topic || 'MegaPLAN document').slice(0, 160);
  if (!text.trim() && !items.length) return fail('There is nothing to put in the PDF yet.');
  const sources = citationList(items);
  const body = text.trim()
    ? text
    : items.map(i => `### ${i.title}\n${truncate(i.text || i.snippet || '', 2000)}`).join('\n\n');
  const sections = [{ heading: '', body, bullets: [] }];
  const res = await fetch('/api/ai-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'document',
      format: 'pdf',
      title,
      sections,
      sources,
      keywords: [step.ctx?.plan?.request?.topic || title].filter(Boolean)
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return fail(err.error || `The PDF could not be written (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const name = `megaplan-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'document'}.pdf`;
  triggerDownload(blob, name);
  // The standard PDF fonts cannot draw every script. Never hand back a file
  // that quietly lost characters without saying so on the step.
  const folded = Number(res.headers?.get?.('X-MegaPLAN-Folded') || 0);
  const note = folded
    ? ` ${folded} character run(s) outside the standard PDF fonts appear as [?] in the file — the answer above and the prompt pack keep the original script.`
    : '';
  return ok(`Wrote ${name} (${Math.round(blob.size / 1024)} KB)${sources.length ? ` with ${sources.length} source(s)` : ''}.${note}`, {
    artifact: { name, size: blob.size, kind: 'pdf' },
    sources,
    folded
  });
}

export function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * PDF operations executor — runs the common PDF jobs on the attached file
 * instead of only offering to open the studio. Anything the module cannot do
 * honestly (signing, filling, redaction review) is not routed here.
 */
async function runPdfOps(step) {
  const ctx = step.ctx || {};
  const op = step.params?.op || pdfOpForSlug(step.tool);
  if (!op) return fail('That PDF job needs the PDF studio, so it has been left for the tool itself.');
  const files = Array.isArray(step.params?.fileIndexes)
    ? step.params.fileIndexes.map(i => ctx.files?.[i]).filter(Boolean)
    : (ctx.files || []);
  try {
    const res = await runPdfOp({ op, files, params: { ...(step.params || {}), prompt: step.params?.prompt || ctx.prompt || '' } });
    if (res.needsOcr) {
      return fail(
        res.text || 'This PDF has no text layer, so its pages cannot be searched yet. The OCR PDF tool reads scans in your browser.',
        { needsOcr: true, op }
      );
    }
    const artifacts = [];
    for (const f of res.files || []) {
      const blob = new Blob([f.bytes], { type: 'application/pdf' });
      triggerDownload(blob, f.name);
      artifacts.push({ name: f.name, size: f.bytes.length, kind: 'pdf' });
    }
    const summary = artifacts.length
      ? `${PDF_OP_TITLES[op] || 'PDF job'} — saved ${artifacts.length} file(s) (${res.detail}).`
      : `${PDF_OP_TITLES[op] || 'PDF job'} — ${res.detail}.`;
    return ok(summary, { text: res.text || '', artifact: artifacts[0] || null, artifacts, pdfOp: op });
  } catch (err) {
    return fail(err?.message || 'The PDF operation could not be completed.', { op });
  }
}

function runToolbus(step) {
  const ctx = step.ctx || {};
  const tool = (ctx.tools || []).find(t => t.slug === step.tool);
  if (!tool) return fail(`Tool “${step.tool}” is not in the library index.`);
  const fileIndexes = step.params?.fileIndexes;
  const files = Array.isArray(fileIndexes)
    ? fileIndexes.map(i => ctx.files?.[i]).filter(Boolean)
    : (tool.category === 'PDF' ? [] : (ctx.files || []).slice(0, 1));
  return runTool({
    tool,
    text: step.params?.text || ctx.prompt || '',
    files,
    numbers: step.params?.numbers,
    extra: step.params?.extra,
    timeoutMs: 15_000
  }).then(r => (r.ok
    ? ok(`Ran ${r.title} (${r.ms} ms)${r.artifacts?.length ? ` · ${r.artifacts.length} file(s) produced` : ''}`, { text: r.text, artifacts: r.artifacts, toolResult: r })
    : fail(r.skipped ? `${r.title} is not automatable — ${r.reason}. Open the tool instead.` : `${r.title} failed: ${r.error || 'no output produced'}`, { toolResult: r })));
}

async function runNewTool(step) {
  const ctx = step.ctx || {};
  const spec = step.params?.spec || draftToolSpec(normalizeRequest({
    prompt: ctx.prompt || '',
    files: (ctx.files || []).map(f => ({ name: f.name, size: f.size, type: f.type })),
    links: (ctx.plan?.request?.links || []).map(l => l.url),
    tools: ctx.tools || []
  }));
  return ok(`Drafted private tool “${spec.title}” — save it under your session code`, { spec, private: true });
}

/* ------------------------------------------------------------------ *
 * Study-batch executor (AI Studio / NotebookLM path)
 * ------------------------------------------------------------------ */

export function buildBatchesLocally({ paper = '', textbook = '', mode = 'batch', batchSize = 5, topic = '' }) {
  const questions = paper.trim() ? detectQuestions(paper) : [];
  const sections = [...new Set([...detectSections(textbook), ...detectSections(paper)])].slice(0, 60);
  return buildStudyBatches({ questions, sections, mode, batchSize, topic: topic || 'the syllabus' });
}

export function batchToMarkdown(batches) {
  return [
    `# Study batches — ${batches.mode === 'per' ? 'one prompt per question' : `${batches.batchSize} questions per prompt`}`,
    '',
    `${batches.totalQuestions} question(s) detected · ${batches.sections.length} section(s) found.`,
    batches.mode === 'per'
      ? 'NotebookLM shape: upload the textbook once, then paste each prompt in order.'
      : 'AI Studio shape: upload the textbook and paste the combined prompt for a single pass.',
    '',
    ...batches.groups.flatMap(g => [
      `## Batch ${g.index + 1} (${g.count} question${g.count === 1 ? '' : 's'})`,
      g.chapters.length ? `Chapters: ${g.chapters.join('; ')}` : '',
      '',
      '```',
      g.prompt,
      '```',
      ''
    ])
  ].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const EXECUTORS = {
  research: runResearch,
  article: runArticle,
  'web-read': runWebRead,
  'youtube-transcript': runYoutubeTranscript,
  'youtube-playlist': runYoutubePlaylist,
  'file-read': runFileRead,
  'pdf-read': runPdfRead,
  'map-place': runMapPlace,
  'map-nearby': runMapNearby,
  'map-route': runMapRoute,
  'map-weather': runMapWeather,
  outline: runOutline,
  combine: runCombine,
  prompts: runPrompts,
  assistant: runAssistant,
  presentation: runPresentation,
  'article-pdf': runArticlePdf,
  toolbus: runToolbus,
  'pdf-ops': runPdfOps,
  'new-tool': runNewTool
};

export function canExecute(executor) {
  return Boolean(EXECUTORS[executor]);
}

/**
 * Execute one step.
 * @param {object} step
 * @param {object} ctx  { files, tools, plan, results, prompt, steps }
 */
export async function runStep(step, ctx) {
  const executor = EXECUTORS[step.executor];
  if (!executor) return fail(`No executor for “${step.executor}”.`, { skipped: true });
  const enriched = { ...step, ctx: { ...ctx, results: ctx.results || {} } };
  try {
    const result = await executor(enriched);
    return { ...result, executor: step.executor, stepId: step.id };
  } catch (err) {
    return fail(err?.message || 'The step failed unexpectedly.', { executor: step.executor, stepId: step.id });
  }
}

export { PENDING };
