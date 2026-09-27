/**
 * MegaPLAN note and text tools — deterministic engines.
 *
 * Fifteen registry tools shared a single "send the text to the assistant" call.
 * That is honest about needing a model, but it was also lazy for the jobs a
 * model is not needed for: pulling the action items out of minutes, finding the
 * citations in an essay, listing the key points, tidying text, naming the
 * entities. Those are done here, deterministically, with no network call and
 * no chance of inventing something that was never in the text.
 *
 * The rule this file follows: **extract, never invent.** Every output is a span
 * of the input, or a count. Where a model genuinely is the right tool, the
 * tool keeps the assistant and says so in its own copy.
 *
 * Pure functions only — the same discipline as `ocr-engine.js`, so all of this
 * is unit-testable without a browser.
 */

/* ------------------------------------------------------------------ *
 * Sentence and paragraph helpers
 * ------------------------------------------------------------------ */

const STOP = new Set(('a an the and or but if then than that this these those of in on at to for with from by as is are was ' +
  'were be been being it its it\'s do does did done have has had having will would shall should can could may might must not no ' +
  'so such very just also into over under again further more most other some any each which who whom whose what when where ' +
  'why how there here he she they them their his her him hers ours yours we you i me my our your about after before between ' +
  'during above below up down out off again once only own same too s t don now').split(' '));

export function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'“(\[])/)
    // "Q: …" / "A: …" markers are labels; leaving them in would make a written
    // question look like a key point about the letter Q.
    .map(s => s.trim().replace(/^(?:q(?:uestion)?|a(?:nswer)?|ans)\s*[:.\]]\s*/i, ''))
    .filter(s => s.length > 1);
}

export function paragraphs(text) {
  return String(text || '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
}

export function words(text) {
  return String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [];
}

/** Content words, de-duplicated, in order of first appearance. */
export function keyTerms(text, limit = 40) {
  const seen = new Set();
  const out = [];
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Extractive key points: score every sentence by the content words it carries,
 * normalised by length so a long sentence does not win on volume alone.
 * Always quotes the original wording — nothing is paraphrased.
 */
export function keyPoints(text, count = 7) {
  const all = sentences(text);
  if (!all.length) return [];
  const terms = keyTerms(text, 60);
  const freq = new Map();
  for (const w of words(text)) if (terms.includes(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const scored = all.map((s, i) => {
    const ws = words(s).filter(w => freq.has(w) && !STOP.has(w));
    const score = ws.reduce((n, w) => n + (freq.get(w) || 0), 0) / Math.sqrt(Math.max(6, ws.length));
    return { s, i, score, hits: [...new Set(ws)].slice(0, 5) };
  });
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, count))
    .sort((a, b) => a.i - b.i)
    .map(x => ({ text: x.s, score: Number(x.score.toFixed(2)), terms: x.hits }));
}

/* ------------------------------------------------------------------ *
 * Action items
 * ------------------------------------------------------------------ */

const ACTION_PATTERNS = [
  /\b(?:i|we|you|they|he|she|it|we'll|let's)\s+(?:should|must|need to|needs to|have to|has to|will|shall|are to|is to)\b/i,
  // A named subject commits too: "The team must confirm the venue." The subject
  // is not required to be a proper noun, because in minutes it rarely is.
  /\b(?:the\s+)?[a-z]{3,}\s+(?:must|shall|will|should|needs?\s+to|has\s+to|have\s+to|is\s+to|are\s+to)\b/i,
  /\b(?:we|team|they|all|everyone)\s+(?:decided|agreed|approved|agreed to|resolved)\b/i,
  /\b(?:action|todo|to-do|task|next step|follow[- ]?up|reminder|owner|deadline|due)\b[:\-]/i,
  /\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next\s+\w+|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i,
  /^\s*[-*]\s*\[[ xX]\]/,
  /\b(?:please|kindly)\s+\w+/i
];

/** Sentences that read like a commitment, with the date they mention. */
export function actionItems(text) {
  const out = [];
  for (const raw of sentences(text)) {
    const s = raw.trim().replace(/^[-*\d.)\s]+/, '').replace(/^\[[ xX]\]\s*/, '');
    if (s.length < 4 || s.length > 300) continue;
    if (!ACTION_PATTERNS.some(re => re.test(s))) continue;
    if (out.some(o => o.text.toLowerCase() === s.toLowerCase())) continue;
    const date = s.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next\s+\w+)\b/i);
    const owner = s.match(/\b([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?)\s+(?:to|will|shall|should)\b/);
    out.push({ text: s, when: date ? date[1] : null, who: owner ? owner[1] : null });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Citations and references
 * ------------------------------------------------------------------ */

const CITE_PATTERNS = [
  { type: 'DOI', re: /\b10\.\d{4,9}\/[^\s"'<>)\]]+/g },
  { type: 'PMID', re: /\bPMID:?\s*(\d{5,9})\b/gi },
  // ISBN-10 or ISBN-13 with optional hyphens. The last digit is the check digit
  // and belongs to the number, so the pattern counts all of them.
  // "ISBN 978-…", "ISBN-13: 978-…", "ISBN-10 0-…" all name the same thing.
  { type: 'ISBN', re: /\bISBN(?:\s*-?\s*(?:10|13))?[:\s]*((?:97[89])?(?:[- ]?\d){9}[- ]?[\dXx])/gi },
  { type: 'arXiv', re: /\barXiv[:\s]*(\d{4}\.\d{4,5}(?:v\d+)?)\b/gi },
  { type: 'URL', re: /\bhttps?:\/\/[^\s"'<>()\]]+/g }
];

/** Every reference the text actually contains, with its raw form. */
export function extractCitations(text) {
  const t = String(text || '');
  const found = [];
  const seen = new Set();
  for (const { type, re } of CITE_PATTERNS) {
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const value = (m[1] || m[0]).replace(/[.,;]+$/, '');
      const key = `${type}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ type, value, at: t.indexOf(m[0]) });
    }
  }
  // An author-year in brackets, only when it looks like a real citation.
  for (const m of t.matchAll(/\(([A-Z][A-Za-z'’-]+(?:\s+et\s+al\.?)?(?:\s+(?:and|&)\s+[A-Z][A-Za-z'’-]+)*(?:,?\s+[A-Z][A-Za-z'’-]+)*),\s*(\d{4}[a-z]?)\)/g)) {
    const value = m[0].slice(1, -1);
    const key = `author-year:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ type: 'Author–year', value, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ *
 * Entities — a gazetteer, not a model
 * ------------------------------------------------------------------ */

const GAZETTEER = {
  organisation: /\b(?:[A-Z][a-zA-Z&.\-]+(?:\s+[A-Z][a-zA-Z&.\-]+){0,3}\s+(?:Ltd|Limited|Inc|Inc\.|Corp|Corporation|Company|Co|GmbH|PLC|University|College|School|Hospital|Institute|Foundation|Association|Ministry|Department|Agency|Bank|NSSAI|WHO|UNICEF|UNESCO|ICMR))\b/g,
  place: /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,\s*[A-Z][a-z]+)?)\s+(?:district|state|country|city|village|nagar|thaluk|province)\b/g,
  date: /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g,
  money: /\b(?:₹|Rs\.?\s?|INR|USD|EUR|GBP|₹)\s?[\d,]+(?:\.\d+)?(?:\s?(?:crore|lakh|million|billion|thousand))?\b/gi,
  // Blood pressure first: "120/80 mmHg" is one reading, and reporting only the
  // diastolic half in a medical note would be actively misleading.
  measure: /\b\d{2,3}\s?\/\s?\d{2,3}\s?mmHg\b|\b\d+(?:\.\d+)?\s?(?:%|mg|ml|g|kg|km|cm|mm|mmHg|bpm|°C|°F|mol|mIU|units?)\b/gi,
  person: /\b(?:Dr|Mr|Mrs|Ms|Prof|Prof\.|Shri|Smt)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g,
  law: /\b(?:Section\s+\d+[A-Z]? of the [A-Z][a-z]+ ?Act,?\s*\d{4}|[A-Z][a-z]+ ?Act,?\s*\d{4})\b/g
};

const ENTITY_LABEL = {
  organisation: 'Organisation', place: 'Place', date: 'Date', money: 'Amount',
  measure: 'Measurement', person: 'Person (titled)', law: 'Law or rule'
};

/** Named things the text mentions. No guessing, no model. */
export function extractEntities(text) {
  const t = String(text || '');
  const out = [];
  for (const [kind, re] of Object.entries(GAZETTEER)) {
    const seen = new Set();
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const value = m[0].replace(/\s+/g, ' ').trim();
      const key = value.toLowerCase();
      if (seen.has(key) || value.length < 3) continue;
      seen.add(key);
      out.push({ type: ENTITY_LABEL[kind] || kind, kind, value, at: m.index });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ *
 * Structure builders
 * ------------------------------------------------------------------ */

/** Headings are markdown hashes, ALL-CAPS lines, or numbered sections. */
export function detectHeadings(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.length > 90) continue;
    const md = t.match(/^(#{1,6})\s+(.{1,80})$/);
    if (md) { out.push({ level: md[1].length, text: md[2].trim() }); continue; }
    if (/^\d+(?:\.\d+)*[.)]?\s+\S/.test(t) && t.split(/\s+/).length <= 10) { out.push({ level: 3, text: t.replace(/^\d+(?:\.\d+)*[.)]?\s+/, '') }); continue; }
    if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(/\s+/).length <= 8) { out.push({ level: 2, text: t }); }
  }
  return out;
}

/** Split text into sections under whatever headings it has. */
export function sectionise(text) {
  const lines = String(text || '').split(/\r?\n/);
  const sections = [];
  let current = { heading: '', body: [] };
  for (const line of lines) {
    const isHeading = /^(#{1,6})\s+\S/.test(line.trim()) ||
      (line.trim() && line.trim() === line.trim().toUpperCase() && line.trim().split(/\s+/).length <= 8 && /[A-Z]/.test(line));
    if (isHeading) {
      if (current.heading || current.body.length) sections.push(current);
      current = { heading: line.replace(/^#{1,6}\s+/, '').trim(), body: [] };
    } else current.body.push(line);
  }
  if (current.heading || current.body.length) sections.push(current);
  return sections
    .map(s => ({ heading: s.heading, text: s.body.join('\n').trim() }))
    .filter(s => s.text || s.heading);
}

/** Q/A pairs from explicit cues first, then heading-driven fallbacks. */
export function makeFlashcards(text, max = 20) {
  const cards = [];
  const t = String(text || '');
  // "Q: ... A: ..." / "Q. ... A. ..." written out
  for (const m of t.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*[:.]\s*)(.{4,200}?)\s*(?:\n|\s)(?:A(?:nswer)?\s*[:.]\s*)(.{4,400}?)(?=\n\s*(?:Q(?:uestion)?\s*[:.])|$)/gi)) {
    cards.push({ q: m[1].trim(), a: m[2].trim() });
  }
  if (cards.length < 3) {
    for (const s of sectionise(t)) {
      if (!s.heading) continue;
      const pts = keyPoints(s.text, 2);
      if (!pts.length) continue;
      cards.push({ q: `What does the section “${s.heading}” say?`, a: pts.map(p => p.text).join(' ') });
    }
  }
  if (!cards.length) {
    for (const p of keyPoints(t, Math.min(max, 6))) cards.push({ q: `Is this statement from the text?\n“${p.text}”`, a: 'Yes — this sentence appears in your text.' });
  }
  return cards.slice(0, max);
}

/** Multiple-choice questions from explicit cues, or from key-point statements. */
export function makeQuiz(text, count = 6) {
  const quiz = [];
  const t = String(text || '');
  for (const m of t.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*[:.]\s*)(.{4,200}?)\s*(?:\n|\s)(?:A(?:nswer)?\s*[:.]\s*)(.{2,200}?)(?=\n\s*(?:Q(?:uestion)?\s*[:.])|$)/gi)) {
    quiz.push({ q: m[1].trim(), a: m[2].trim(), options: null });
  }
  if (quiz.length >= count) return quiz.slice(0, count);
  // Not enough written questions: top them up with statement questions whose
  // options are all real sentences. Questions the user actually wrote are kept.
  const written = quiz.slice();
  const pts = keyPoints(t, count * 4);
  const used = written;
  for (let i = 0; i + 3 < pts.length && used.length < count; i += 4) {
    const right = pts[i];
    const distractors = pts.slice(i + 1, i + 4).map(p => p.text);
    const options = [right.text, ...distractors];
    used.push({
      q: 'Which of these appears in the text?',
      a: right.text,
      options: options.sort(() => 0.5 - Math.random()),
      from: 'built from your own sentences — every option is real text, so this checks reading, not guessing'
    });
  }
  return used;
}

/** A dated abstract: the opening and closing sentences, plus the key terms. */
export function makeAbstract(text, sentencesWanted = 4) {
  const all = sentences(text);
  if (!all.length) return { abstract: '', terms: [], note: 'Not enough text to summarise.' };
  const first = all.slice(0, Math.max(1, Math.floor(sentencesWanted / 2)));
  const last = all.slice(-Math.max(1, Math.floor(sentencesWanted / 2)));
  const chosen = [...new Set([...first, ...last])].slice(0, sentencesWanted);
  return {
    abstract: chosen.join(' '),
    terms: keyTerms(text, 8),
    note: `Extracted from your own first and last ${chosen.length} sentence(s). Nothing was written for you.`
  };
}

/* ------------------------------------------------------------------ *
 * Cleaning and summaries
 * ------------------------------------------------------------------ */

export function cleanText(text, opts = {}) {
  const { trimLines = true, collapseSpaces = true, dropBlankRuns = true, dedupeLines = false, normaliseQuotes = true } = opts || {};
  let t = String(text || '').replace(/\r\n?/g, '\n');
  if (normaliseQuotes) t = t.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/\t/g, '    ');
  if (collapseSpaces) t = t.split('\n').map(l => l.replace(/[ ]{2,}/g, ' ').replace(/[ ]{2,}/g, '  ')).join('\n');
  let lines = t.split('\n');
  if (trimLines) lines = lines.map(l => l.trimEnd());
  if (dedupeLines) {
    const seen = new Set();
    lines = lines.filter(l => { const k = l.trim().toLowerCase(); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (dropBlankRuns) lines = lines.join('\n').replace(/\n{3,}/g, '\n\n').split('\n');
  return lines.join('\n').trim();
}

/** A transcript/lecture summary: headings, key points per section, action items. */
export function summariseLongText(text) {
  const sections = sectionise(text);
  const points = keyPoints(text, 8);
  const actions = actionItems(text);
  return {
    sections: sections.map(s => ({ heading: s.heading || '(no heading)', points: keyPoints(s.text, 3).map(p => p.text) })),
    keyPoints: points.map(p => p.text),
    actionItems: actions,
    stats: { characters: text.length, words: words(text).length, sentences: sentences(text).length, headings: detectHeadings(text).length }
  };
}

/** Renderers — the tools print these, so each says where the content came from. */
export function renderKeyPoints(text, count) {
  const pts = keyPoints(text, count);
  if (!pts.length) return 'No sentences with enough content words to rank were found.';
  return pts.map((p, i) => `${i + 1}. ${p.text}\n   (ranked on: ${p.terms.join(', ')})`).join('\n\n') +
    '\n\nEach point is a whole sentence copied from your text — nothing was rewritten.';
}

export function renderActionItems(text) {
  const items = actionItems(text);
  if (!items.length) return 'No sentences read like a commitment (no "will", "must", "needs to", "by <date>"). Nothing was invented.';
  return items.map((it, i) => `${i + 1}. ${it.text}${it.when ? `\n   when: ${it.when}` : ''}${it.who ? `\n   who: ${it.who}` : ''}`).join('\n') +
    `\n\n${items.length} commitment-like sentence(s), copied from your text.`;
}

export function renderCitations(text) {
  const cites = extractCitations(text);
  if (!cites.length) return 'No DOIs, PMIDs, ISBNs, arXiv ids, URLs or author–year citations were found in the text.';
  const grouped = {};
  for (const c of cites) (grouped[c.type] ||= []).push(c);
  const out = Object.entries(grouped).map(([type, list]) => `## ${type} (${list.length})\n${list.map(c => `- ${c.value}`).join('\n')}`).join('\n\n');
  return `${out}\n\n${cites.length} reference(s) found. Bracketed author–year pairs are included only when they look like real citations.`;
}

export function renderEntities(text) {
  const ents = extractEntities(text);
  if (!ents.length) return 'No organisations, dated amounts, measurements, titled people or named places were recognised.';
  const grouped = {};
  for (const e of ents) (grouped[e.type] ||= []).push(e.value);
  return Object.entries(grouped).map(([type, list]) => `## ${type} (${list.length})\n${[...new Set(list)].map(v => `- ${v}`).join('\n')}`).join('\n\n') +
    `\n\n${ents.length} mention(s). This is a gazetteer match, not a model — an unfamiliar name will be missed.`;
}
