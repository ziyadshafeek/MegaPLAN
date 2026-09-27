/**
 * AI Mode — local text intelligence.
 *
 * PURE MODULE. No DOM, no network, no storage, no timers. It is imported by
 * the browser runtime *and* by the server, so an AI Mode answer produced
 * server-side is byte-identical to the one produced in the tab.
 *
 * This is what lets AI Mode deliver real notes, summaries, question splits and
 * batched study prompts **without** depending on a hosted language model. The
 * hosted assistant, when present, refines this output; it never replaces it and
 * never fabricates what is missing.
 */

const STOP = new Set(`a an the and or but if of to in on for with from by at as is are was were be been being it its this that these those
i me my we our you your he she they them do does did can could would should shall may might must will just so than then there here what which who whom whose when where why how all any both each few more most other some such no nor not only own same too very s t don now d ll m o re ve y ain aren couldn didn doesn hadn hasn haven isn ma mightn mustn needn shan shouldn wasn weren won wouldn
about above after again against all also am among any because been before being below between both but can cannot could did do does doing down during each few further here how into itself just more most nor not now off once only other out over own same should some such than that their them then there these they this those through too under until very was were what when where which while who whom why will with would you your
say says said make makes made get gets got use uses used using one two three first second next last new old good great big small long short high low many much lot lots way ways thing things`.split(/\s+/).filter(Boolean));

const QUESTION_RE = /^\s*(?:(?:question|q)\s*[.)-]?\s*(\d{1,3})[.)-]?|(\d{1,3})[.)])\s+(.{3,400})$/i;
const SECTION_RE = /^\s*(?:#{1,3}\s+)?((?:chapter|unit|module|section|part|lesson|topic)\s+[0-9ivxlcdm]+[.:)]?\s*.*|appendix\s+[a-z0-9]+[.:)]?\s*.*)$/i;

export const STOP_WORDS = STOP;

/**
 * Only http(s) links are allowed out of this product.
 *
 * The server already refuses to emit anything else, but source records also
 * arrive from browser-side tools, transcript payloads and pasted links, so the
 * sink checks for itself: an escaped `javascript:` href would still run on
 * click, because escaping quotes stops the injection but not the scheme.
 */
export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f#+.\-\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

export function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map(s => s.trim())
    .filter(s => s.length > 24 && s.length < 600);
}

export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

export function charCount(text) { return String(text || '').length; }

export function truncate(text, max, ellipsis = '…') {
  const t = String(text || '');
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - ellipsis.length)).trimEnd()}${ellipsis}`;
}

/* ------------------------------------------------------------------ *
 * Extractive summary — always traceable to a sentence in the source
 * ------------------------------------------------------------------ */

export function termScores(text) {
  const list = words(text);
  const counts = new Map();
  for (const w of list) counts.set(w, (counts.get(w) || 0) + 1);
  // Reward bigrams slightly: "solar energy" should outrank "energy" alone.
  for (let i = 0; i + 1 < list.length; i++) {
    const bigram = `${list[i]} ${list[i + 1]}`;
    counts.set(bigram, (counts.get(bigram) || 0) + 1.6);
  }
  return counts;
}

/**
 * Credential-shaped strings are replaced before anything is echoed back.
 *
 * Research records, article text and pasted notes are quoted verbatim by
 * design — that is what makes the output traceable. But a summary, a PDF or
 * a prompt pack is exactly the kind of thing a person copies into another
 * tool, so a token that looks like a real key must not ride along. The
 * patterns are deliberately narrow: a well-known vendor prefix, or
 * NAME=value where the name ends in a secret-ish word.
 */
const SECRET_PATTERNS = [
  /\b(?:sk|nvapi|rk|pk)-(?:live|test|prod|secret|admin)?[-_][A-Za-z0-9_-]{16,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Z][A-Z0-9_]{2,}(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*["']?[^\s"']{8,}/g
];

/** Replace credential-shaped substrings with a visible marker. */
export function redactSecrets(value) {
  let text = String(value ?? '');
  if (!text) return text;
  for (const re of SECRET_PATTERNS) {
    text = text.replace(re, m => {
      // Keep the variable name so the reader still knows what was removed.
      const named = m.match(/^([A-Z][A-Z0-9_]{2,}(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]\s*)/);
      return named ? `${named[1]}[redacted]` : '[redacted]';
    });
  }
  return text;
}

/**
 * @returns {{summary:string, picks:Array<{text:string,index:number,score:number}>, terms:Array<[string,number]>}}
 */
export function summarize(text, { maxSentences = 6, title = '' } = {}) {
  const body = redactSecrets(String(text || '')).replace(/\s+/g, ' ').trim();
  const sents = sentences(body);
  if (!sents.length) return { summary: '', picks: [], terms: [] };
  const counts = termScores(body);
  const maxCount = Math.max(1, ...counts.values());
  const scored = sents.map((s, index) => {
    const toks = words(s);
    if (!toks.length) return { text: s, index, score: 0 };
    let sum = 0;
    for (let i = 0; i < toks.length; i++) {
      sum += (counts.get(toks[i]) || 0) / maxCount;
      if (i + 1 < toks.length) sum += 0.6 * (counts.get(`${toks[i]} ${toks[i + 1]}`) || 0) / maxCount;
    }
    // Lead bias: the first and last sentence of a section usually carry the claim.
    const position = index === 0 ? 1.35 : index < 3 ? 1.1 : index >= sents.length - 2 ? 1.05 : 1;
    const density = sum / Math.sqrt(toks.length + 1);
    return { text: s, index, score: density * position };
  });
  const target = Math.max(1, Math.min(maxSentences, Math.ceil(sents.length / 4)));
  const picked = [...scored].sort((a, b) => b.score - a.score).slice(0, target).sort((a, b) => a.index - b.index);
  const summary = picked.map(p => p.text).join(' ');
  const terms = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return { summary, picks: picked, terms, title };
}

/* ------------------------------------------------------------------ *
 * Structured notes
 * ------------------------------------------------------------------ */

export function keyTerms(text, count = 10) {
  return summarize(text, { maxSentences: 1 }).terms.slice(0, count).map(([term, score]) => ({ term, score: Math.round(score * 100) / 100 }));
}

/**
 * Readable key phrases: multi-word terms first, and a term that is contained in
 * a stronger term is dropped ("calvin" goes when "calvin cycle" stays).
 */
export function keyPhrases(text, count = 10) {
  const ranked = summarize(text, { maxSentences: 1 }).terms.map(([term, score]) => ({ term: String(term), score }));
  const keep = [];
  for (const item of ranked) {
    if (item.term.length < 4) continue;
    if (keep.some(k => k.term.includes(item.term) || item.term.includes(k.term))) continue;
    keep.push(item);
    if (keep.length >= count * 2) break;
  }
  return keep.slice(0, count);
}

export function definitions(text, limit = 8) {
  return sentences(text)
    .filter(s => /\b(?:is|are|was|were|refers to|stands for|means|is defined as|is known as)\b/i.test(s))
    .slice(0, limit)
    .map(s => truncate(s, 220));
}

export function numbers(text, limit = 12) {
  return (String(text || '').match(/[^\n.;]*(?:\b\d[\d,.]*\s?(?:%|percent|km|kg|mg|mL|litres?|years?|days?|hours?|minutes?|\$|₹|USD|INR|EUR)?)\b[^\n.;]*/gi) || [])
    .map(s => s.trim())
    .filter(s => s.length > 6 && s.length < 200)
    .slice(0, limit);
}

const QUESTION_STARTS = /\b(?:what|why|how|when|where|who|which|define|explain|list|state|describe|compare|differentiate|write|draw|calculate|prove|derive|suggest|give)\b/i;

export function revisionQuestions(text, count = 8, { includeAnswers = true } = {}) {
  const key = keyPhrases(text, 14);
  const defs = definitions(text, 10);
  const sents = sentences(text);
  const asked = [];
  const push = (q, a) => {
    const key2 = String(q).toLowerCase().replace(/\s+/g, ' ');
    if (asked.some(x => String(x.question).toLowerCase().replace(/\s+/g, ' ') === key2)) return;
    asked.push({ question: q, answer: a || null });
  };
  defs.forEach(d => {
    const m = d.match(/^(.{2,70}?)\s+(?:is|are|was|were|refers to|stands for|means)\s+(.{10,300})$/i);
    if (m) push(`What is ${m[1].trim()}?`, m[2].trim());
  });
  key.forEach(({ term }) => {
    if (term.includes(' ')) push(`Explain ${term}.`, null);
    else push(`What is ${term}?`, null);
  });
  const lead = sents.slice(0, 3);
  lead.forEach(s => {
    const core = truncate(s, 110).replace(/\s+\S*$/, '');
    if (core.length > 25) push(`${core} — why is that significant?`, null);
  });
  QUESTION_STARTS.lastIndex = 0;
  return asked.slice(0, count).map(q => (includeAnswers ? q : { question: q.question }));
}

/**
 * Build markdown notes from gathered text. Deterministic and source-bound.
 * @param {string} text
 * @param {{style?:'summary'|'notes'|'translate', heading?:string, maxChars?:number}} opts
 */
export function buildNotes(text, { style = 'notes', heading = 'Notes', maxChars = 6000 } = {}) {
  const source = redactSecrets(String(text || '')).trim();
  if (!source) return '';
  const { summary } = summarize(source, { maxSentences: style === 'summary' ? 5 : 8 });
  const phrases = keyPhrases(source, 10);
  const out = [];
  if (style === 'translate') {
    out.push(`# ${heading}`, '', '> Translation needs a language model. MegaPLAN prepared the source and the instruction; it will not invent a translation.', '', '## Source to translate', '', truncate(source, maxChars));
    return out.join('\n');
  }
  out.push(`# ${heading}`, '');
  out.push('## Summary', '', summary || truncate(source, 700));
  const defs = definitions(source);
  if (defs.length) {
    out.push('', '## Key definitions', '');
    defs.forEach(d => out.push(`- ${d}`));
  }
  const facts = numbers(source);
  if (facts.length) {
    out.push('', '## Figures and quantities', '');
    [...new Set(facts)].slice(0, 10).forEach(f => out.push(`- ${truncate(f, 180)}`));
  }
  if (phrases.length) {
    out.push('', '## Key terms', '');
    out.push(phrases.map(p => p.term).join(' · '));
  }
  const qs = revisionQuestions(source, 8, { includeAnswers: false });
  if (qs.length) {
    out.push('', '## Revision questions', '');
    qs.forEach(q => out.push(`- ${q.question}`));
  }
  out.push('', '---', `Built on this device from ${source.length.toLocaleString('en-IN')} characters of source text. Every line above is traceable to the source.`);
  return out.join('\n').slice(0, maxChars + 2000);
}

/* ------------------------------------------------------------------ *
 * Question papers → batches (the AI Studio / NotebookLM path)
 * ------------------------------------------------------------------ */

/** Detect numbered questions in a question paper. Falls back to paragraph chunks. */
export function detectQuestions(text, { minLength = 12 } = {}) {
  const lines = String(text || '').split(/\n/);
  const questions = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(QUESTION_RE);
    if (m && trimmed.length > minLength) {
      if (current) questions.push(current);
      current = { number: Number(m[1] || m[2]) || questions.length + 1, text: (m[3] || '').trim(), raw: trimmed };
      continue;
    }
    if (current && trimmed && /^[a-z(]/i.test(trimmed) && trimmed.length < 400) {
      current.text += ` ${trimmed}`;
      current.raw += ` ${trimmed}`;
      continue;
    }
    if (current && !trimmed) { questions.push(current); current = null; }
  }
  if (current) questions.push(current);
  const usable = questions.filter(q => q.text.length >= minLength);
  if (usable.length) return usable;
  return paragraphs(text)
    .filter(p => QUESTION_STARTS.test(p))
    .slice(0, 60)
    .map((p, i) => ({ number: i + 1, text: p.replace(/\s+/g, ' '), raw: p }));
}

export function detectSections(text) {
  const out = [];
  for (const line of String(text || '').split(/\n/)) {
    const m = line.trim().match(SECTION_RE);
    if (m) out.push(m[1].replace(/^#+\s*/, '').trim());
  }
  return out;
}

/** Best-effort question → chapter mapping by shared vocabulary. */
export function mapQuestionsToSections(questions, sections) {
  if (!sections.length) return questions.map(q => ({ ...q, section: null, confidence: 0 }));
  const secTokens = sections.map(s => new Set(words(s)));
  return questions.map(q => {
    const qTokens = new Set(words(q.text));
    let best = null, bestScore = 0;
    secTokens.forEach((set, i) => {
      let hits = 0;
      for (const t of set) if (qTokens.has(t)) hits++;
      const score = set.size ? hits / Math.sqrt(set.size) : 0;
      if (score > bestScore) { bestScore = score; best = sections[i]; }
    });
    return { ...q, section: best, confidence: Math.round(bestScore * 100) / 100 };
  });
}

export function batch(items, size) {
  const n = Math.max(1, Number(size) || 5);
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push({ index: out.length, items: items.slice(i, i + n) });
  return out;
}

/**
 * Study-batch planner: questions + textbook sections → batched prompt packs.
 * `mode` 'per' produces one prompt per question (NotebookLM shape);
 * `mode` 'batch' produces one prompt per group of questions (long-context shape).
 */
export function buildStudyBatches({ questions = [], sections = [], mode = 'batch', batchSize = 5, topic = 'the source', subject = 'the textbook' } = {}) {
  const mapped = mapQuestionsToSections(questions, sections);
  const groups = mode === 'per'
    ? mapped.map((q, i) => ({ index: i, items: [q] }))
    : batch(mapped, batchSize);
  const prompts = groups.map(group => {
    const qs = group.items.map(q => `${q.number}. ${truncate(q.text, 600)}`).join('\n');
    const sectionLines = [...new Set(group.items.map(q => q.section).filter(Boolean))];
    return {
      index: group.index,
      count: group.items.length,
      questions: group.items.map(q => ({ number: q.number, section: q.section, text: q.text })),
      chapters: sectionLines,
      prompt: [
        `You are answering ${mode === 'per' ? 'one question' : `${group.items.length} questions`} about ${topic} using only ${subject} as the source.`,
        sectionLines.length ? `Relevant section(s): ${sectionLines.join('; ')}.` : '',
        '',
        qs,
        '',
        mode === 'per'
          ? 'Answer the single question. Cite the section or page it came from. If the source does not contain the answer, write "Not in the source" — never invent one.'
          : `Answer every question in order, grouped under its number. Cite the section or page for each answer. If the source does not contain an answer, write "Not in the source" — never invent one.`,
        '',
        'Finish with a one-line "Source check" naming the sections you actually used.'
      ].filter(Boolean).join('\n')
    };
  });
  return { mode, batchSize, groups: prompts, totalQuestions: mapped.length, sections };
}

/* ------------------------------------------------------------------ *
 * Source merging + citation rendering
 * ------------------------------------------------------------------ */

export function mergeSources(groups, { maxChars = 60000, perItem = 1200 } = {}) {
  const seen = new Set();
  const merged = [];
  let used = 0;
  for (const group of Array.isArray(groups) ? groups : []) {
    const items = Array.isArray(group?.items) ? group.items : Array.isArray(group) ? group : [group];
    for (const item of items) {
      if (!item) continue;
      const key = item.url || item.id || item.title;
      if (seen.has(key)) continue;
      seen.add(key);
      const body = truncate(item.text || item.abstract || item.snippet || '', perItem);
      if (!body) continue;
      const chunk = [`### ${item.title || 'Source'}`, item.source ? `_${item.source}${item.year ? ` · ${item.year}` : ''}_` : '', '', body, item.url ? `\n${item.url}` : ''].filter(Boolean).join('\n');
      if (used + chunk.length > maxChars) continue;
      used += chunk.length;
      merged.push({ ...item, body });
    }
  }
  return merged;
}

export function citationList(items) {
  return (items || [])
    .filter(i => i && (i.title || i.url))
    .map((i, n) => ({
      n: n + 1,
      title: truncate(i.title || i.url, 180),
      url: i.url || null,
      source: i.source || null,
      author: i.authors || i.artist || null,
      year: i.year || null,
      doi: i.doi || null,
      pmid: i.pmid || null,
      journal: i.journal || null,
      retrieved: new Date().toISOString().slice(0, 10)
    }));
}

export function renderCitationsMarkdown(items) {
  const list = citationList(items);
  if (!list.length) return '';
  return ['## Sources', '', ...list.map(c => {
    const bits = [c.author, c.journal, c.year, c.doi ? `doi:${c.doi}` : null, c.pmid ? `PMID ${c.pmid}` : null].filter(Boolean);
    return `${c.n}. **${c.title}**${bits.length ? ` — ${bits.join(' · ')}` : ''}${c.url ? `\n   ${c.url}` : ''}`;
  })].join('\n');
}

export function renderCitationsText(items) {
  const list = citationList(items);
  return list.map(c => {
    const bits = [c.author, c.journal, c.year, c.doi ? `doi:${c.doi}` : null, c.pmid ? `PMID ${c.pmid}` : null].filter(Boolean);
    return `${c.n}. ${c.title}${bits.length ? ` — ${bits.join(' · ')}` : ''}${c.url ? `\n   ${c.url}` : ''}`;
  }).join('\n\n');
}

/* ------------------------------------------------------------------ *
 * Prompt packs for external assistants
 * ------------------------------------------------------------------ */

export function promptPack({ request, topic, files = [], links = [], gathered = [], outputs = [], mode = 'auto', body = '', citations = [] } = {}) {
  const perItem = mode === 'per';
  const corpus = [
    `Request: ${request || '(describe the task)'}`,
    topic ? `Subject: ${topic}` : '',
    files.length ? `Files: ${files.map(f => `${f.name || f} (${f.kind || 'file'})`).join(', ')}` : '',
    links.length ? `Links: ${links.map(l => l.url || l).join(', ')}` : '',
    gathered.length ? `MegaPLAN gathered: ${gathered.join('; ')}` : ''
  ].filter(Boolean).join('\n');
  const refs = citations.length ? `\n\n${renderCitationsText(citations)}` : '';
  const sourceBlock = body ? `\n\n--- MATERIAL ---\n${truncate(body, 24000)}` : '';
  return {
    gemini: [
      'Paste into Google AI Studio with your sources attached. Everything below is the brief; nothing above it matters.',
      '',
      'Answer using only the material below. Cite the section or page for every claim.',
      'If the material does not contain the answer, write "Not in the source" — never invent one.',
      perItem ? 'Work one item at a time and label every answer with its number.' : 'Work in one batch and keep answers grouped by section.',
      '', corpus, sourceBlock, refs,
      '', 'Expected output shape:', ...(outputs.length ? outputs.map((o, i) => `${i + 1}. ${o}`) : ['1. A clear, structured answer'])
    ].filter(Boolean).join('\n'),
    notebooklm: [
      'Paste into NotebookLM as the instruction for the sources you uploaded there.',
      '',
      'Answer using only the sources you have been given.',
      topic ? `Topic: ${topic}` : '',
      perItem ? 'Produce one answer block per question, each with a short source note.' : 'Produce a single structured summary with headings and a source note per section.',
      '', corpus, sourceBlock, refs
    ].filter(Boolean).join('\n'),
    assistant: [
      'Rewrite pass. Keep every attribution and add no claim that is not in the text.',
      '',
      `Rewrite the material below as ${perItem ? 'one clear block per item' : 'one clear document'}.`,
      'Keep every fact and every attribution line. Add no claim that is not in the text.',
      '', corpus, sourceBlock
    ].filter(Boolean).join('\n')
  };
}
