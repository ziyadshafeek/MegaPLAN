/**
 * AI Mode orchestrator API.
 *
 * One endpoint, several actions, so the customer UI has a single stable URL:
 *
 *   GET  /api/ai-mode                      → capability manifest + health
 *   GET  /api/ai-mode?view=guide           → the in-app guide (single source of truth)
 *   POST /api/ai-mode  { action: 'plan' }            → deterministic plan (same planner the browser uses)
 *   POST /api/ai-mode  { action: 'research', ... }    → open-source research (Wikipedia, PubMed, …)
 *   POST /api/ai-mode  { action: 'article', ... }     → full plain-text article + lead image
 *   POST /api/ai-mode  { action: 'compose', ... }     → optional hosted writing pass
 *   POST /api/ai-mode  { action: 'batches', ... }     → question-paper batching for AI Studio / NotebookLM
 *   POST /api/ai-mode  { action: 'private-tool' }     → draft a private tool when nothing matches
 *   POST /api/ai-mode  { action: 'document' }         → build a real PDF (returns file bytes)
 *
 * Provider and model identity never appear in any response.
 */
import fs from 'node:fs';
import { nvidiaChat, providerConfigured, publicError, looksLikeModelProbe, IDENTITY_REFUSAL } from '../nvidia.js';
import { planRequest, buildIndex, draftToolSpec, normalizeRequest, PLANNER_VERSION, CAPABILITIES } from '../../public/js/planner.js';
import {
  buildNotes, summarize, revisionQuestions, detectQuestions, detectSections, definitions,
  buildStudyBatches, citationList, renderCitationsMarkdown, promptPack, truncate
} from '../../public/js/ai-compose.js';
import { research, wikipediaArticle, RESEARCH_SOURCES } from '../ai-mode/research.js';
import { buildPdf, pdfFilename } from '../ai-mode/pdf.js';
import { GUIDE, GUIDE_VERSION } from '../../public/js/ai-guide.js';
import { sendJSON, readJSONBody, createLimiter, createCache } from '../ai-mode/http.js';

const limited = createLimiter({ max: 40, windowMs: 60_000 });
const planCache = createCache({ ttlMs: 5 * 60_000 });
const researchCache = createCache({ ttlMs: 15 * 60_000, max: 120 });

let registryCache = null;
function registry() {
  if (registryCache) return registryCache;
  try {
    // Traced by @vercel/nft as a literal file read, so data/tools.json ships with the function.
    const raw = fs.readFileSync(new URL('../../data/tools.json', import.meta.url), 'utf8');
    registryCache = JSON.parse(raw);
    if (!Array.isArray(registryCache)) registryCache = [];
  } catch { registryCache = []; }
  return registryCache;
}

const MANIFEST = {
  planner: PLANNER_VERSION,
  guide: GUIDE_VERSION,
  capabilities: Object.entries(CAPABILITIES).map(([id, cap]) => ({
    id, title: cap.title, stage: cap.stage, output: cap.output, optional: Boolean(cap.optional)
  })),
  researchSources: RESEARCH_SOURCES.map(s => ({ id: s.id, label: s.label, blurb: s.blurb, kinds: s.kinds })),
  research: {
    article: 'POST /api/ai-mode {action:"article", query, language, includeImages}',
    search: 'POST /api/ai-mode {action:"research", query, groups?, limit?}',
    pubmed: 'GET  /api/pubmed?q=…  |  POST /api/pubmed {query, limit, email}',
    youtube: 'POST /api/youtube-transcript {url, lang, format}',
    playlist: 'POST /api/youtube-playlist {url}',
    deck: 'POST /api/presentation {topic, notes|outline, slideCount}',
    pdf: 'POST /api/ai-mode {action:"document", format:"pdf", title, body|sections, sources}'
  },
  limits: [
    'No stream downloading from YouTube, Netflix, Spotify or similar — public captions, thumbnails, playlists and metadata only.',
    'No private accounts, DMs, follower lists or credential work — public data only.',
    'No medical diagnosis, prescriptions or legal advice.',
    'No live WHOIS registry proxy; the WHOIS interface formats what you paste in.'
  ]
};

function manifest() {
  const tools = registry();
  const byCategory = {};
  for (const t of tools) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
  return {
    ok: true,
    product: 'MegaPLAN AI Mode',
    version: MANIFEST.planner,
    guideVersion: MANIFEST.guide,
    tools: tools.length,
    categories: byCategory,
    assistant: { configured: providerConfigured(), role: 'optional writing pass — every other step works without it' },
    capabilities: MANIFEST.capabilities,
    researchSources: MANIFEST.researchSources,
    research: MANIFEST.research,
    limits: MANIFEST.limits
  };
}

const MAX_TEXT = 240_000;

function clampTextInput(value, max = MAX_TEXT) {
  return String(value ?? '').slice(0, max);
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

async function actionPlan(body) {
  const tools = registry();
  const cacheKey = JSON.stringify([body.prompt || '', body.links || [], body.files || [], body.options || {}]);
  const cached = planCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };
  const plan = planRequest({
    prompt: String(body.prompt || '').slice(0, 4000),
    files: Array.isArray(body.files) ? body.files.slice(0, 40) : [],
    links: Array.isArray(body.links) ? body.links.slice(0, 40).map(l => (typeof l === 'string' ? l : l?.url)) : [],
    options: body.options || {},
    tools,
    index: buildIndex(tools)
  });
  planCache.set(cacheKey, plan);
  return plan;
}

async function actionResearch(body, req) {
  const query = String(body.query || body.q || '').trim();
  const key = `r:${query.toLowerCase()}|${(body.groups || []).join(',')}|${body.limit || 5}|${body.language || 'en'}`;
  const cached = researchCache.get(key);
  if (cached) return { ...cached, cached: true };
  const out = await research(query, {
    groups: Array.isArray(body.groups) ? body.groups : undefined,
    language: String(body.language || 'en').slice(0, 8),
    limit: Math.max(1, Math.min(10, Number(body.limit) || 5))
  });
  researchCache.set(key, out);
  return out;
}

async function actionArticle(body) {
  return wikipediaArticle(String(body.query || body.title || ''), {
    language: String(body.language || 'en').slice(0, 8),
    images: body.includeImages !== false
  });
}

async function actionBatches(body) {
  const paper = clampTextInput(body.paper || body.text || '');
  const book = clampTextInput(body.textbook || '');
  const questions = Array.isArray(body.questions) && body.questions.length
    ? body.questions.map((q, i) => (typeof q === 'string' ? { number: i + 1, text: q } : { number: Number(q.number) || i + 1, text: String(q.text || '') }))
    : detectQuestions(paper);
  const sections = Array.isArray(body.sections) && body.sections.length
    ? body.sections.map(String)
    : [...detectSections(book || paper), ...detectSections(paper)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 60);
  const built = buildStudyBatches({
    questions,
    sections,
    mode: body.mode === 'per' ? 'per' : 'batch',
    batchSize: Math.max(1, Math.min(20, Number(body.batchSize) || 5)),
    topic: String(body.topic || 'the syllabus').slice(0, 160),
    subject: body.textbook ? 'the attached textbook' : 'the attached source'
  });
  return {
    ok: true,
    ...built,
    detectedQuestions: questions.length,
    detectedSections: sections.length,
    notebooklm: built.groups.length ? 'Upload the textbook to NotebookLM as a source, then paste each prompt in order.' : null,
    aiStudio: 'Paste the batched prompt into AI Studio with the textbook attached for a single-pass answer.'
  };
}

/**
 * The optional hosted pass. Always returns a usable `text`:
 * the hosted answer when it is configured, otherwise the deterministic
 * local result. `via` always says which one produced it.
 */
async function actionCompose(body) {
  const text = clampTextInput(body.text || body.body || '', 60_000);
  if (!text.trim()) throw Object.assign(Error('There is no text to work on.'), { status: 400 });
  const task = String(body.task || 'notes').slice(0, 30);
  const local = (() => {
    switch (task) {
      case 'summary': return summarize(text, { maxSentences: 6 }).summary;
      case 'quiz': return revisionQuestions(text, 8).map(q => `${q.question}${q.answer ? `\n   ${q.answer}` : ''}`).join('\n\n');
      case 'definitions': return definitions(text).map((d, i) => `${i + 1}. ${d}`).join('\n');
      default: return buildNotes(text, { style: task === 'custom' ? 'summary' : 'notes', heading: String(body.heading || 'Notes').slice(0, 80) });
    }
  })();
  if (!providerConfigured()) {
    return { ok: true, via: 'local', assistant: false, task, text: local, note: 'The hosted writing pass is not configured on this deployment, so the on-device result is used. Nothing is missing except fluency.' };
  }
  if (looksLikeModelProbe(text)) {
    return { ok: true, via: 'guard', assistant: true, task, text: IDENTITY_REFUSAL };
  }
  const request = String(body.request || '').slice(0, 2000);
  const extra = String(body.extra || '').slice(0, 2000);
  const instruction = {
    summarize: 'Summarise the source. Keep every fact. Do not invent anything.',
    notes: 'Turn the source into structured study notes with headings, definitions, figures and revision questions.',
    quiz: 'Write 8 revision questions with short answers drawn only from the source.',
    definitions: 'List the definitions stated in the source, verbatim where possible.',
    email: 'Rewrite as a concise professional email with a subject line.',
    translate: 'Translate into the requested language, or into clear English if none is given.',
    custom: 'Follow the request using only the supplied source. Do not invent live facts or sources.'
  }[task] || 'Follow the request using only the supplied source.';
  try {
    const { content } = await nvidiaChat({
      messages: [
        { role: 'system', content: 'You are the MegaPLAN AI Mode writing pass. Answer only from the supplied material. Never name or discuss the underlying model or provider. Never fabricate citations. If the material is insufficient, say exactly what is missing.' },
        { role: 'user', content: [request && `Request: ${request}`, extra && `Notes: ${extra}`, instruction, '', '--- MATERIAL ---', text].filter(Boolean).join('\n') }
      ],
      max_tokens: 3000,
      temperature: task === 'quiz' || task === 'translate' ? 0.4 : 0.25
    });
    const answer = String(content || '').trim();
    return { ok: true, via: 'assistant', assistant: true, task, text: answer || local, fallback: answer ? null : 'The assistant returned nothing, so the on-device result is used instead.' };
  } catch (err) {
    return { ok: true, via: 'local', assistant: true, task, text: local, note: publicError(err) };
  }
}

function actionPrivateTool(body) {
  const ctx = normalizeRequest({
    prompt: String(body.prompt || '').slice(0, 2000),
    files: Array.isArray(body.files) ? body.files : [],
    links: Array.isArray(body.links) ? body.links : [],
    tools: registry()
  });
  const spec = draftToolSpec(ctx);
  return { ok: true, spec, private: true, review: 'Private tools stay on this device under your session code until you push them for public review.' };
}

async function actionDocument(body, req, res) {
  const title = String(body.title || 'MegaPLAN document').slice(0, 180);
  const bodyText = clampTextInput(body.body || '', MAX_TEXT);
  const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 60);
  const sections = Array.isArray(body.sections) && body.sections.length
    ? body.sections.slice(0, 60).map(s => ({ heading: String(s.heading || '').slice(0, 200), body: clampTextInput(s.body || '', 40_000), bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 40).map(String) : [] }))
    : [{ heading: '', body: bodyText, bullets: [] }];
  if (!sections.some(s => s.body || s.bullets.length)) {
    throw Object.assign(Error('There is nothing to put in the document yet.'), { status: 400 });
  }
  const file = await buildPdf({
    title,
    subtitle: String(body.subtitle || '').slice(0, 240),
    sections,
    body: bodyText,
    sources,
    author: String(body.author || 'MegaPLAN AI Mode').slice(0, 90),
    pageSize: body.pageSize === 'letter' ? 'letter' : 'a4',
    keywords: Array.isArray(body.keywords) ? body.keywords.slice(0, 12).map(String) : [],
    footer: String(body.footer || '').slice(0, 120) || 'Generated with MegaPLAN AI Mode'
  });
  const name = pdfFilename(title);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', String(file.length));
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(file));
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') return sendJSON(res, 405, { error: 'GET or POST only.' });

  const url = new URL(req.url || '/api/ai-mode', 'https://megaplan.invalid');
  const view = url.searchParams.get('view') || '';
  if (req.method === 'GET') {
    if (view === 'guide') return sendJSON(res, 200, { ok: true, guide: GUIDE });
    if (view === 'plan' || view === 'health') return sendJSON(res, 200, manifest());
    if (view === 'sources') return sendJSON(res, 200, { ok: true, sources: MANIFEST.researchSources });
    return sendJSON(res, 200, manifest());
  }

  if (limited(req)) return sendJSON(res, 429, { error: 'Too many requests. Wait a minute and try again.' });

  const body = readJSONBody(req);
  if (body === null) return sendJSON(res, 400, { error: 'Invalid JSON.' });
  const action = String(body.action || '').slice(0, 30);

  try {
    switch (action) {
      case 'plan': return sendJSON(res, 200, { ok: true, ...(await actionPlan(body)) });
      case 'research': {
        const out = await actionResearch(body, req);
        return sendJSON(res, 200, { ok: true, ...out });
      }
      case 'article': {
        const out = await actionArticle(body);
        if (!out.ok) return sendJSON(res, 502, { error: 'The encyclopedia could not be reached.', detail: out.error });
        if (out.missing) return sendJSON(res, 404, { error: 'No article found for that title.', items: out.items });
        return sendJSON(res, 200, { ok: true, article: out.article, items: out.items });
      }
      case 'compose':
        return sendJSON(res, 200, await actionCompose(body));
      case 'batches':
        return sendJSON(res, 200, await actionBatches(body));
      case 'private-tool':
        return sendJSON(res, 200, actionPrivateTool(body));
      case 'document': {
        if (body.format && body.format !== 'pdf') return sendJSON(res, 400, { error: 'Only PDF documents are supported by this action.' });
        return await actionDocument(body, req, res);
      }
      case 'sources':
        return sendJSON(res, 200, { ok: true, items: citationList(body.items || []), markdown: renderCitationsMarkdown(body.items || []) });
      case 'prompt-pack':
        return sendJSON(res, 200, {
          ok: true,
          prompts: promptPack({
            request: String(body.request || '').slice(0, 2000),
            topic: body.topic,
            files: body.files || [],
            links: body.links || [],
            gathered: body.gathered || [],
            outputs: body.outputs || [],
            mode: body.mode || 'auto',
            body: clampTextInput(body.body || '', 60_000),
            citations: body.citations || []
          })
        });
      case 'plan-preview': {
        const text = clampTextInput(body.text || '', 40_000);
        return sendJSON(res, 200, {
          ok: true,
          notes: buildNotes(text, { style: body.style === 'summary' ? 'summary' : 'notes', heading: String(body.heading || 'Notes').slice(0, 80), maxChars: Math.min(40_000, Number(body.maxChars) || 12_000) }),
          summary: summarize(text, { maxSentences: 5 }).summary,
          questions: revisionQuestions(text, 8).slice(0, 8),
          truncated: truncate(text, 400)
        });
      }
      case 'health':
        return sendJSON(res, 200, manifest());
      default:
        return sendJSON(res, 400, {
          error: 'Unknown action.',
          actions: ['plan', 'research', 'article', 'compose', 'batches', 'private-tool', 'document', 'sources', 'prompt-pack', 'plan-preview', 'health'],
          views: ['guide', 'health', 'sources']
        });
    }
  } catch (err) {
    const status = err?.status || 502;
    return sendJSON(res, status, { error: err?.status ? String(err.message) : publicError(err) });
  }
}
