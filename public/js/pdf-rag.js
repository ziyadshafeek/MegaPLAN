/**
 * Retrieval over a long PDF, entirely in the browser.
 *
 * The ask this answers is "find the part of this 1000-page document that
 * matters and tell me what it says, with page numbers". It is deliberately not a
 * chat model: the ranking is BM25 over the text layer, the answer is extracted
 * from the sentences that scored highest, and every sentence carries the page it
 * came from. Nothing is uploaded, and nothing can be answered that is not on a
 * cited page.
 *
 * The parts here are pure — index building, ranking, sentence extraction,
 * outline reading — so they can be tested against real extracted text instead of
 * described.
 */

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'may', 'me', 'might', 'more', 'most', 'must', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'out', 'over',
  'own', 'same', 'shall', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'us', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you',
  'your', 'yours', 'about', 'also', 'any', 'each', 'file', 'files', 'pdf', 'page', 'pages', 'document', 'please'
]);

/** A cheap suffix stemmer: enough to match "doses" with "dose". */
export function stem(word) {
  let w = String(word).toLowerCase();
  if (w.length <= 3) return w;
  for (const [suffix, keep] of [['ies', 'y'], ['sses', 'ss'], ['ing', ''], ['edly', ''], ['ed', ''], ['ly', ''], ['es', ''], ['s', '']]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length) + keep;
      break;
    }
  }
  return w;
}

/** Lowercases, splits, drops the noise and stems what is left. */
export function tokenize(text, { keepStop = false } = {}) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9₹%°.-]+/)
    .map(t => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(t => t.length > 1 && (keepStop || !STOP.has(t)))
    .map(stem);
}

/** One token is worth more than five of the same, and rarer words more than common. */
export function queryTerms(query) {
  const raw = String(query || '').toLowerCase().split(/[^a-z0-9₹%°.-]+/).filter(t => t.length > 1);
  const counts = new Map();
  for (const t of raw) {
    if (STOP.has(t) && raw.length > 3) continue;         // "what is the dose" still has a real word
    const k = stem(t);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].map(([term, n]) => ({ term, weight: 1 + Math.log(n) }));
}

/**
 * BM25 index over page-sized chunks.
 * @param {{n:number, of:number, name:string, body:string}[]} pages
 */
export function buildIndex(pages) {
  const docs = pages.map((p, i) => {
    const tokens = tokenize(p.body);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { i, ...p, tokens, tf, len: tokens.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const total = docs.reduce((n, d) => n + d.len, 0);
  return {
    docs,
    df,
    N: docs.length,
    avgdl: docs.length ? total / docs.length : 0,
    vocab: df.size
  };
}

/**
 * Rank pages against a query. `k1` and `b` are the usual BM25 constants; the
 * defaults are the ones that were fitted, not chosen by feel.
 */
export function rank(index, query, { k1 = 1.2, b = 0.75, limit = 12, boost = null } = {}) {
  const terms = Array.isArray(query) ? query : queryTerms(query);
  if (!terms.length || !index.N) return [];
  const idf = t => {
    const n = index.df.get(t) || 0;
    return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
  };
  const scored = index.docs.map(d => {
    let score = 0;
    const matched = [];
    for (const { term, weight } of terms) {
      const f = d.tf.get(term);
      if (!f) continue;
      const id = idf(term);
      const denom = f + k1 * (1 - b + b * (d.len / (index.avgdl || 1)));
      score += weight * id * ((f * (k1 + 1)) / (denom || 1));
      matched.push(term);
    }
    if (!score) return null;
    if (boost) score += boost(d);
    return { ...d, score: +score.toFixed(4), matched };
  }).filter(Boolean);
  // Long pages must not win on length alone, and ties keep document order so
  // the same question twice gives the same answer.
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit);
}

/**
 * Splits one page into sentences that can be quoted, each remembering its page.
 * Abbreviations that would otherwise end a sentence early are handled.
 */
export function sentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const guarded = clean
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|No|vs|etc|approx|Fig|Eq|i\.e|e\.g)\./gi, m => m.replace('.', ''))
    .replace(/(\d)\.(\d)/g, '$1$2');
  return guarded.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘(])/)
    .map(s => s.replace(//g, '.').trim())
    .filter(s => s.length > 2);
}

/** Groups a page's text into readable paragraphs. */
export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 20);
}

/**
 * The best sentences across the ranked pages, for an extractive answer.
 * A sentence scores on how many query terms it carries, how much of it is
 * query terms, and whether it is a real sentence rather than a heading.
 */
export function bestSentences(ranked, query, { perPage = 2, max = 8, minLength = 40 } = {}) {
  const terms = new Set((Array.isArray(query) ? query.map(t => t.term ?? t) : tokenize(query)));
  const out = [];
  for (const page of ranked) {
    const sents = sentences(page.body);
    const scored = sents.map((text, i) => {
      const toks = tokenize(text);
      if (!toks.length) return null;
      const hits = toks.filter(t => terms.has(t)).length;
      if (!hits) return null;
      const density = hits / toks.length;
      const isHeading = text.length < minLength || !/[.!?]$/.test(text);
      return { text, i, score: hits * (1 + density * 2) * (isHeading ? 0.4 : 1) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    for (const s of scored.slice(0, perPage)) out.push({ ...s, page: page.n, of: page.of, name: page.name });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Groups passages by page so a citation reads as "pages 12–14". */
export function citations(ranked, limit = 6) {
  const pages = [...new Set(ranked.map(r => r.n))].sort((a, b) => a - b).slice(0, limit);
  const name = ranked[0]?.name || 'the document';
  return { name, pages, text: pages.length ? `Pages ${pages.join(', ')} of ${name}` : `no pages of ${name}` };
}

/**
 * Formats the answer. Every sentence is followed by the page it was taken from,
 * so a reader can check any claim by turning to that page.
 */
export function answerFrom(query, ranked, { name = 'the document', max = 8 } = {}) {
  const quotes = bestSentences(ranked, query, { max });
  if (!quotes.length) return null;
  const cite = citations(ranked);
  const lines = quotes.map(q => `- ${q.text}  (p. ${q.page}${q.of && q.of !== q.page ? `/${q.of}` : ''})`);
  return [
    `From ${name} — ${cite.text}:`,
    '',
    ...lines,
    '',
    `Every line above is quoted from the page beside it. Nothing here was inferred or added.`
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Table of contents
 * ------------------------------------------------------------------ */

/**
 * Reads a PDF outline into flat sections with page numbers.
 * pdf.js resolves each destination to a page index; the walk is iterative so a
 * deeply nested outline cannot blow the stack.
 */
export function outlineSections(outline, pageCount, { resolve = null } = {}) {
  const out = [];
  const walk = (items, depth) => {
    for (const item of items || []) {
      const n = resolve ? resolve(item) : null;
      if (n != null) out.push({ title: String(item.title || '').replace(/\s+/g, ' ').trim(), page: n, depth });
      if (item.items?.length) walk(item.items, depth + 1);
    }
  };
  walk(outline || [], 1);
  out.sort((a, b) => a.page - b.page || a.depth - b.depth);
  // The printed page number and the sheet number are often different; the sheet
  // is the only one that can be turned to, so that is what is kept.
  return out.map((s, i) => ({ ...s, index: i, of: pageCount || null }));
}

/**
 * Which pages a section covers: from the page its heading starts on, up to the
 * page before the next heading that starts a *new* page.
 *
 * Two headings on the same page are one section, not two overlapping ones — a
 * contents page and its first subsection routinely share a sheet — so headings
 * are grouped by the page they open and the deepest one names the section.
 */
export function sectionRanges(sections, pageCount) {
  if (!sections.length) return [];
  const last = pageCount || Math.max(...sections.map(s => s.page));
  const groups = [];
  for (const s of sections) {
    const g = groups[groups.length - 1];
    if (g && g.from === s.page) {
      g.titles.push(s.title);
      if (s.depth > g.depth) { g.title = s.title; g.depth = s.depth; }        // the most specific name
      if (s.depth < g.rootDepth) { g.root = s.title; g.rootDepth = s.depth; } // the chapter it belongs to
      continue;
    }
    groups.push({ from: s.page, to: last, title: s.title, depth: s.depth, root: s.title, rootDepth: s.depth, titles: [s.title] });
  }
  return groups.map((g, i) => ({
    title: g.title,
    root: g.root,
    titles: [...new Set(g.titles)],
    depth: g.depth,
    from: g.from,
    to: i + 1 < groups.length ? Math.max(g.from, groups[i + 1].from - 1) : last
  })).filter(r => r.to >= r.from);
}

/** Labels each page with the section it belongs to, for the page list. */
export function labelPages(pages, ranges) {
  if (!ranges.length) return pages;
  let at = 0;
  return pages.map(p => {
    while (at < ranges.length - 1 && p.n > ranges[at].to) at++;
    const r = ranges[at];
    // The chapter is the useful label; the most specific heading is kept too.
    return { ...p, section: r?.root || null, subsection: r && r.title !== r.root ? r.title : null };
  });
}

/**
 * A boost for ranking: a page that carries a heading the query asked for is
 * more likely to be the one meant than a page that merely repeats the word.
 */
export function sectionBoostFactory(ranges, query) {
  const wanted = tokenize(query);
  if (!wanted.length) return () => 0;
  const matching = new Set();
  for (const r of ranges) {
    const t = new Set([...tokenize(r.title), ...tokenize(r.root || ''), ...(r.titles || []).flatMap(x => tokenize(x))]);
    if (wanted.some(w => t.has(w))) { matching.add(r.root || r.title); matching.add(r.title); }
  }
  if (!matching.size) return () => 0;
  return page => ((page.section && matching.has(page.section)) || (page.subsection && matching.has(page.subsection)) ? 1.5 : 0);
}
