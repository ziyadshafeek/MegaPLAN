/**
 * AI Mode research — open, keyless, attributable sources.
 *
 * Every source here is public and free to query without an API key, so AI Mode
 * can do real research instead of guessing. Each source is isolated: one that is
 * rate-limited or offline shows up as `ok:false` and the rest of the answer still
 * stands. Nothing is ever fabricated — a source that returns nothing returns
 * nothing.
 *
 * All `run()` functions take an injected `fetch` so they are unit-testable and
 * never rely on ambient globals.
 */
import { newsSearch } from './news.js';
import { getJSON, getText, getXML, stripMarkup, clampText, safeUrl, isSensitiveQuery } from './http.js';

export { isSensitiveQuery, stripMarkup, clampText, safeUrl };

const cap = (items, n = 6) => items.filter(Boolean).slice(0, n);

/* ------------------------------------------------------------------ *
 * Wikipedia / Wikidata
 * ------------------------------------------------------------------ */

export async function wikipediaSearch(query, { fetchImpl = fetch, language = 'en', limit = 5 } = {}) {
  const url =
    `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
    `&srlimit=${limit}&format=json&formatversion=2&origin=*`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.query?.search || []).map(item => {
    const title = stripMarkup(item.title).slice(0, 180);
    const snippet = stripMarkup(item.snippet).slice(0, 400);
    if (!title || !Number.isSafeInteger(item.pageid)) return null;
    return {
      id: `wikipedia:${item.pageid}`,
      kind: 'encyclopedia',
      title,
      snippet,
      url: `https://${language}.wikipedia.org/?curid=${item.pageid}`,
      source: 'Wikipedia'
    };
  }), limit);
  return { ok: true, items };
}

/** Full plain-text article. This is what a PDF or deck is actually built from. */
export async function wikipediaArticle(query, { fetchImpl = fetch, language = 'en', images = true } = {}) {
  const title = stripMarkup(query).slice(0, 200);
  const url =
    `https://${language}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages|info&inprop=url` +
    `&exintro=0&explaintext=1&redirects=1&piprop=original&titles=${encodeURIComponent(title)}&format=json&formatversion=2&origin=*`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const page = (data?.query?.pages || [])[0];
  if (!page || page.missing || !String(page.extract || '').trim()) {
    return { ok: true, items: [], missing: true };
  }
  const text = String(page.extract).replace(/\n{3,}/g, '\n\n').trim();
  const item = {
    id: `wikipedia-article:${page.pageid ?? title}`,
    kind: 'encyclopedia-article',
    title: stripMarkup(page.title).slice(0, 200),
    text: text.slice(0, 400_000),
    characters: text.length,
    url: safeUrl(page.canonicalurl || page.fullurl) || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    revision: page.lastrevid || null,
    source: 'Wikipedia'
  };
  const out = [item];
  if (images && page.original?.source) {
    const img = safeUrl(page.original.source);
    if (img) {
      out.push({
        id: `wikipedia-image:${page.pageid ?? title}`,
        kind: 'image',
        title: `${item.title} — lead image`,
        url: img,
        page: item.url,
        source: 'Wikimedia Commons (via Wikipedia)',
        license: 'check on the file page before reuse'
      });
    }
  }
  return { ok: true, items: out, article: item };
}

/* ------------------------------------------------------------------ *
 * PubMed (NCBI E-utilities) with a Europe PMC fallback
 * ------------------------------------------------------------------ */

const cleanAuthors = list =>
  cap((list || []).map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean), 4).join(', ');

export function formatPubmedItem(raw, { source = 'PubMed' } = {}) {
  const title = clampText(raw.title, 220);
  if (!title) return null;
  const doi = String(raw.doi || '').trim();
  const pmid = String(raw.pmid || raw.id || '').trim();
  const url = pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
    : doi
      ? safeUrl(`https://doi.org/${doi}`)
      : safeUrl(raw.url);
  if (!url) return null;
  const year = String(raw.pubdate || raw.year || '').match(/\d{4}/)?.[0] || null;
  return {
    id: pmid ? `pubmed:${pmid}` : `doi:${doi || raw.id || title}`,
    kind: 'journal-article',
    title,
    authors: clampText(raw.authors, 160),
    journal: clampText(raw.journal, 120),
    year,
    doi: doi || null,
    pmid: pmid || null,
    abstract: raw.abstract ? clampText(raw.abstract, 1400) : null,
    snippet: clampText(raw.abstract || raw.journal || raw.title, 320),
    url,
    source
  };
}

async function pubmedViaEutils(query, { fetchImpl, limit, email }) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const common = `db=pubmed&retmode=json&tool=megaplan&email=${encodeURIComponent(email)}`;
  const search = await getJSON(
    `${base}/esearch.fcgi?${common}&term=${encodeURIComponent(query)}&retmax=${limit}&sort=relevance`,
    { fetchImpl }
  );
  if (!search.ok) return { ok: false, error: search.error, items: [] };
  const ids = (search.data?.esearchresult?.idlist || []).slice(0, limit);
  if (!ids.length) return { ok: true, items: [] };
  const summary = await getJSON(`${base}/esummary.fcgi?${common}&id=${ids.join(',')}`, { fetchImpl });
  if (!summary.ok) return { ok: false, error: summary.error, items: [] };
  const records = summary.data?.result || {};
  const items = cap(ids.map(id => {
    const r = records[id];
    if (!r) return null;
    const doi = (r.articleids || []).find(a => a.idtype === 'doi')?.value || '';
    return formatPubmedItem({
      pmid: id,
      title: r.title,
      authors: (r.authors || []).map(a => a.name),
      journal: r.fulljournalname || r.source,
      pubdate: r.pubdate || r.sortpubdate,
      doi,
      abstract: ''
    });
  }), limit);
  return { ok: true, items };
}

export async function pubmedViaEuropePmc(query, { fetchImpl = fetch, limit } = {}) {
  const url =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}` +
    `&format=json&pageSize=${limit}&resultType=core&sort=CITED%20desc`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.resultList?.result || []).map(r =>
    formatPubmedItem({
      pmid: r.pmid,
      title: r.title,
      authors: r.authorList?.author,
      journal: r.journalInfo?.journal?.title || r.bookOrReportDetails?.publisher,
      year: r.pubYear,
      doi: r.doi,
      abstract: r.abstractText,
      url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : r.doi ? `https://doi.org/${r.doi}` : null
    }, { source: 'Europe PMC' })
  ), limit);
  return { ok: true, items };
}

/**
 * PubMed / Europe PMC biomedical literature search.
 * NCBI is tried first; Europe PMC covers the same corpus and rescues a 429.
 */
export async function pubmedSearch(query, { fetchImpl = fetch, limit = 6, email = 'tools@mega-plan.vercel.app' } = {}) {
  const primary = await pubmedViaEutils(query, { fetchImpl, limit, email });
  if (primary.ok && primary.items.length) return { ok: true, items: primary.items, via: 'PubMed' };
  const fallback = await pubmedViaEuropePmc(query, { fetchImpl, limit });
  if (fallback.ok && fallback.items.length) return { ok: true, items: fallback.items, via: 'Europe PMC' };
  if (!primary.ok && !fallback.ok) {
    return { ok: false, error: primary.error || fallback.error || 'no literature source reachable', items: [] };
  }
  return { ok: true, items: primary.items.length ? primary.items : fallback.items, via: 'PubMed' };
}

/* ------------------------------------------------------------------ *
 * Preprints, DOIs and scholarly graphs
 * ------------------------------------------------------------------ */

function parseAtom(xml) {
  const entries = [];
  const blocks = xml.split(/<entry[\s>]/i).slice(1);
  for (const block of blocks) {
    const pick = tag => (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')) || [])[1] || '';
    const id = stripMarkup(pick('id'));
    const url = safeUrl((id.match(/https?:\/\/[^\s]+/) || [])[0]) || safeUrl(pick('id'));
    const title = clampText(pick('title'), 220);
    if (!title) continue;
    const published = (pick('published').match(/\d{4}/) || [])[0] || null;
    entries.push({
      id: `arxiv:${id.split('/').pop() || title}`,
      kind: 'preprint',
      title,
      authors: cleanAuthors((block.match(/<name>([\s\S]*?)<\/name>/gi) || []).map(n => stripMarkup(n.replace(/<\/?name>/gi, '')))),
      year: published,
      snippet: clampText(pick('summary'), 400),
      abstract: clampText(pick('summary'), 1400),
      url: url || `https://arxiv.org/abs/${id.split('/').pop()}`,
      source: 'arXiv'
    });
  }
  return entries;
}

export async function arxivSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${query}`)}` +
    `&start=0&max_results=${limit}&sortBy=relevance`;
  const res = await getXML(url, { fetchImpl });
  if (!res.ok) return { ok: false, error: res.error, items: [] };
  return { ok: true, items: cap(parseAtom(res.text), limit) };
}

export async function crossrefSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const url =
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}` +
    `&select=DOI,title,author,container-title,issued,abstract,URL,type&sort=relevance`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.message?.items || []).map(w => {
    const doi = String(w.DOI || '');
    const title = clampText((w.title || [])[0], 220);
    if (!title) return null;
    return {
      id: `doi:${doi || title}`,
      kind: w.type === 'posted-content' ? 'preprint' : 'journal-article',
      title,
      authors: cleanAuthors(w.author),
      journal: clampText((w['container-title'] || [])[0], 120),
      year: (w.issued?.['date-parts']?.[0]?.[0]) || null,
      doi: doi || null,
      abstract: w.abstract ? clampText(w.abstract.replace(/<[^>]*>/g, ' '), 1200) : null,
      snippet: clampText((w.abstract || '').replace(/<[^>]*>/g, ' '), 300),
      url: safeUrl(w.URL) || (doi ? safeUrl(`https://doi.org/${doi}`) : null),
      source: 'Crossref'
    };
  }).filter(Boolean), limit);
  return { ok: true, items };
}

export async function openAlexSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&sort=relevance_score:desc`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.results || []).map(w => {
    const title = clampText(w.title || w.display_name, 220);
    if (!title) return null;
    const doi = String(w.doi || '').replace(/^https?:\/\/doi\.org\//, '');
    return {
      id: `openalex:${w.id}`,
      kind: 'scholarly-work',
      title,
      authors: cleanAuthors(w.authorships?.map(a => a.author?.display_name)),
      journal: clampText(w.primary_location?.source?.display_name, 120),
      year: w.publication_year || null,
      doi: doi || null,
      citedBy: Number.isFinite(w.cited_by_count) ? w.cited_by_count : null,
      snippet: clampText(w.abstract_inverted_index ? invertAbstract(w.abstract_inverted_index) : '', 320),
      url: safeUrl(w.doi) || safeUrl(w.id) || null,
      source: 'OpenAlex'
    };
  }), limit);
  return { ok: true, items };
}

function invertAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions || []) words[p] = word;
  }
  return words.filter(Boolean).join(' ').slice(0, 1500);
}

export async function semanticScholarSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}` +
    `&limit=${limit}&fields=title,abstract,authors,year,venue,externalIds,url`;
  const { ok, data, error } = await getJSON(url, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.data || []).map(w => {
    const title = clampText(w.title, 220);
    if (!title) return null;
    const doi = w.externalIds?.DOI || '';
    const pmid = w.externalIds?.PubMed || '';
    return {
      id: pmid ? `pubmed:${pmid}` : doi ? `doi:${doi}` : `s2:${w.paperId}`,
      kind: 'scholarly-work',
      title,
      authors: cleanAuthors(w.authors),
      journal: clampText(w.venue, 120),
      year: w.year || null,
      doi: doi || null,
      pmid: pmid || null,
      snippet: clampText(w.abstract, 320),
      abstract: w.abstract ? clampText(w.abstract, 1400) : null,
      url: safeUrl(w.url) || (pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null),
      source: 'Semantic Scholar'
    };
  }), limit);
  return { ok: true, items };
}

/* ------------------------------------------------------------------ *
 * Books, archives, code and discussion
 * ------------------------------------------------------------------ */

export async function openLibrarySearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const { ok, data, error } = await getJSON(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}&fields=title,author_name,first_publish_year,key,subject,edition_count`,
    { fetchImpl }
  );
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.docs || []).map(d => {
    const title = clampText(d.title, 200);
    if (!title) return null;
    const key = safeUrl(`https://openlibrary.org${d.key}`);
    if (!key) return null;
    return {
      id: `openlibrary:${d.key}`,
      kind: 'book',
      title,
      authors: cleanAuthors(d.author_name),
      year: d.first_publish_year || null,
      snippet: clampText((d.subject || []).slice(0, 4).join(', '), 260),
      url: key,
      source: 'Open Library'
    };
  }), limit);
  return { ok: true, items };
}

export async function gutenbergSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const { ok, data, error } = await getJSON(`https://gutendex.com/books?search=${encodeURIComponent(query)}`, { fetchImpl });
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.results || []).map(b => {
    const title = clampText(b.title, 200);
    if (!title) return null;
    const formats = b.formats || {};
    const read = safeUrl(formats['text/html'] || formats['text/plain; charset=us-ascii'] || formats['application/pdf']);
    const url = safeUrl(`https://www.gutenberg.org/ebooks/${b.id}`) || read;
    if (!url) return null;
    return {
      id: `gutenberg:${b.id}`,
      kind: 'book',
      title,
      authors: cleanAuthors(b.authors?.map(a => a.name)),
      subjects: cap((b.subjects || []).slice(0, 5), 5).join(', '),
      snippet: clampText((b.subjects || []).join(', '), 260),
      url,
      readUrl: read,
      source: 'Project Gutenberg'
    };
  }), limit);
  return { ok: true, items };
}

export async function stackExchangeSearch(query, { fetchImpl = fetch, limit = 5, site = 'stackoverflow' } = {}) {
  const { ok, data, error } = await getJSON(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}` +
      `&site=${encodeURIComponent(site)}&pagesize=${limit}&filter=!nNPvSNVZJS`,
    { fetchImpl }
  );
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.items || []).map(q => {
    const title = clampText(q.title, 200);
    if (!title) return null;
    const url = safeUrl(q.link);
    if (!url) return null;
    return {
      id: `stackexchange:${q.question_id}`,
      kind: 'discussion',
      title,
      snippet: clampText(q.body, 300),
      votes: q.score ?? null,
      answers: q.answer_count ?? null,
      url,
      source: `Stack Exchange (${site})`
    };
  }), limit);
  return { ok: true, items };
}

export async function musicBrainzSearch(query, { fetchImpl = fetch, limit = 5 } = {}) {
  const { ok, data, error } = await getJSON(
    `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`,
    { fetchImpl, headers: { Accept: 'application/json' } }
  );
  if (!ok) return { ok: false, error, items: [] };
  const items = cap((data?.recordings || []).map(r => {
    const title = clampText(r.title, 200);
    if (!title) return null;
    const url = safeUrl(`https://musicbrainz.org/recording/${r.id}`);
    if (!url) return null;
    return {
      id: `musicbrainz:${r.id}`,
      kind: 'recording',
      title,
      artists: cleanAuthors((r['artist-credit'] || []).map(a => a.name)),
      year: r['first-release-date']?.match(/\d{4}/)?.[0] || null,
      snippet: `${title} — ${(r['artist-credit'] || []).map(a => a.name).join(', ')}`.slice(0, 280),
      url,
      source: 'MusicBrainz'
    };
  }), limit);
  return { ok: true, items };
}

/* ------------------------------------------------------------------ *
 * Weather (used by map requests that name a place)
 * ------------------------------------------------------------------ */

export async function openMeteo(query, { fetchImpl = fetch, latitude, longitude, language = 'en' } = {}) {
  let lat = Number.isFinite(Number(latitude)) ? Number(latitude) : null;
  let lon = Number.isFinite(Number(longitude)) ? Number(longitude) : null;
  if (lat == null || lon == null) {
    const place = String(query || '').trim();
    if (!place) return { ok: false, error: 'no place', items: [] };
    const geo = await getJSON(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`,
      { fetchImpl }
    );
    const hit = geo.ok ? (geo.data?.[0] || null) : null;
    if (!hit) return { ok: false, error: geo.ok ? 'place not found' : geo.error, items: [] };
    lat = Number(hit.lat); lon = Number(hit.lon);
  }
  const { ok, data, error } = await getJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=3&timezone=auto`,
    { fetchImpl }
  );
  if (!ok) return { ok: false, error, items: [] };
  const current = data?.current || {};
  return {
    ok: true,
    items: [{
      id: `weather:${lat},${lon}`,
      kind: 'weather',
      title: `${current.temperature_2m ?? '—'}°C in ${String(query || 'your location').slice(0, 80)}`,
      snippet: `Now ${current.temperature_2m ?? '—'}°C (feels ${current.apparent_temperature ?? '—'}°C), humidity ${current.relative_humidity_2m ?? '—'}%, wind ${current.wind_speed_10m ?? '—'} km/h. 3-day outlook included.`,
      current,
      daily: data?.daily || null,
      latitude: lat,
      longitude: lon,
      language,
      url: `https://open-meteo.com/`,
      source: 'Open-Meteo'
    }]
  };
}

/* ------------------------------------------------------------------ *
 * Source registry
 * ------------------------------------------------------------------ */

export const RESEARCH_SOURCES = [
  {
    id: 'news',
    label: 'News (publisher RSS)',
    kinds: ['news'],
    blurb: 'Publisher feeds, each with the publisher\u2019s own timestamp and desk.',
    keywords: ['news', 'latest', 'today', 'recent', 'breaking', 'headlines', 'yesterday', 'this week', 'current events', 'update on', 'what happened'],
    run: (query, opts) => newsSearch(query, opts)
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    kinds: ['encyclopedia', 'encyclopedia-article'],
    blurb: 'Full plain-text articles with revision ids and canonical links.',
    keywords: ['wiki', 'encyclopedia', 'article', 'who is', 'what is', 'history of', 'tell me about'],
    run: (query, opts) => wikipediaSearch(query, opts)
  },
  {
    id: 'pubmed',
    label: 'PubMed / Europe PMC',
    kinds: ['journal-article', 'scientific'],
    blurb: 'Biomedical literature with PMIDs, DOIs, journals and years.',
    keywords: ['pubmed', 'medical', 'clinical', 'study', 'studies', 'trial', 'biomedical', 'disease', 'drug', 'therapy', 'research paper', 'systematic review', 'meta-analysis', 'medicine', 'patient', 'symptom', 'treatment', 'diagnosis', 'health study', 'journal'],
    run: (query, opts) => pubmedSearch(query, opts)
  },
  {
    id: 'arxiv',
    label: 'arXiv',
    kinds: ['preprint'],
    blurb: 'Open preprints in physics, maths, CS, quant biology and statistics.',
    keywords: ['arxiv', 'preprint', 'paper', 'physics', 'mathematics', 'machine learning', 'cs', 'quantum'],
    run: (query, opts) => arxivSearch(query, opts)
  },
  {
    id: 'crossref',
    label: 'Crossref',
    kinds: ['journal-article', 'scholarly-work'],
    blurb: 'DOI metadata for published work across every discipline.',
    keywords: ['doi', 'citation', 'journal', 'published', 'peer reviewed', 'literature'],
    run: (query, opts) => crossrefSearch(query, opts)
  },
  {
    id: 'openalex',
    label: 'OpenAlex',
    kinds: ['scholarly-work'],
    blurb: 'Open scholarly graph with citation counts and inverted abstracts.',
    keywords: ['citations', 'cited', 'scholarly', 'impact', 'literature review'],
    run: (query, opts) => openAlexSearch(query, opts)
  },
  {
    id: 'semantic-scholar',
    label: 'Semantic Scholar',
    kinds: ['scholarly-work'],
    blurb: 'AI reading list with abstracts and PubMed/DOI cross-references.',
    keywords: ['related papers', 'abstracts', 'semantic', 'summarise papers', 'related work'],
    run: (query, opts) => semanticScholarSearch(query, opts)
  },
  {
    id: 'openlibrary',
    label: 'Open Library',
    kinds: ['book'],
    blurb: 'Books with authors, first publication year and subject headings.',
    keywords: ['book', 'books', 'novel', 'library', 'reading', 'author wrote', 'bibliography'],
    run: (query, opts) => openLibrarySearch(query, opts)
  },
  {
    id: 'gutenberg',
    label: 'Project Gutenberg',
    kinds: ['book'],
    blurb: 'Public-domain books with direct read links.',
    keywords: ['public domain', 'gutenberg', 'classic', 'read online', 'full text of'],
    run: (query, opts) => gutenbergSearch(query, opts)
  },
  {
    id: 'stackexchange',
    label: 'Stack Exchange',
    kinds: ['discussion'],
    blurb: 'Answered technical questions with vote and answer counts.',
    keywords: ['error', 'exception', 'stack trace', 'how do i', 'why does', 'debug', 'fix', 'programming', 'code', 'regex', 'api', 'library', 'framework'],
    run: (query, opts) => stackExchangeSearch(query, opts)
  },
  {
    id: 'musicbrainz',
    label: 'MusicBrainz',
    kinds: ['recording'],
    blurb: 'Open music metadata — recordings, artists and release years.',
    keywords: ['song', 'songs', 'music', 'track', 'album', 'artist', 'band', 'lyrics of', 'discography'],
    run: (query, opts) => musicBrainzSearch(query, opts)
  }
];

export function sourceById(id) {
  return RESEARCH_SOURCES.find(s => s.id === id) || null;
}

/**
 * Choose sources for a free-text request.
 * Explicit `groups` always win. Otherwise keywords pick the specialists, and a
 * small standing set (Wikipedia + Crossref + Open Library) guarantees that even
 * a subject with no keyword match still returns real, attributed research
 * instead of a single encyclopedia snippet.
 */
export function chooseSources(query, explicit) {
  if (Array.isArray(explicit) && explicit.length) {
    const picked = explicit.map(sourceById).filter(Boolean);
    if (picked.length) return picked;
  }
  const text = String(query || '').toLowerCase();
  const picked = [];
  for (const source of RESEARCH_SOURCES) {
    if (source.id === 'wikipedia') continue;
    if (source.keywords?.some(k => text.includes(k))) picked.push(source);
    if (picked.length >= 4) break;
  }
  // Standing defaults fill the gap so "tell me about X" is never one snippet.
  for (const id of ['wikipedia', 'crossref', 'openlibrary']) {
    if (picked.length >= 3) break;
    if (picked.some(s => s.id === id)) continue;
    const source = sourceById(id);
    if (source) picked.unshift(source);
  }
  return picked
    .sort((a, b) => ['wikipedia', 'crossref', 'openlibrary'].indexOf(a.id) - ['wikipedia', 'crossref', 'openlibrary'].indexOf(b.id))
    .slice(0, 5);
}

/**
 * Run the chosen sources in parallel. A source that fails is reported, never hidden.
 * @returns {{query:string, groups:Array, items:Array, availability:object, refused:boolean}}
 */
export async function research(query, { groups, language = 'en', limit = 5, fetchImpl = fetch, signal } = {}) {
  const q = stripMarkup(query).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 2) return { query: q, groups: [], items: [], availability: {}, refused: false, error: 'Enter a subject of at least two characters.' };
  if (isSensitiveQuery(q)) {
    return {
      query: q, groups: [], items: [], refused: true,
      error: 'That subject is filtered out. AI Mode does not research adult or explicit material.'
    };
  }
  const chosen = chooseSources(q, groups);
  const results = await Promise.all(
    chosen.map(async source => {
      try {
        const out = await source.run(q, { fetchImpl, language, limit, signal });
        return {
          id: source.id,
          label: source.label,
          blurb: source.blurb,
          ok: Boolean(out.ok),
          error: out.ok ? null : out.error || 'unavailable',
          items: out.items || [],
          via: out.via || null
        };
      } catch (err) {
        return { id: source.id, label: source.label, blurb: source.blurb, ok: false, error: String(err?.message || err), items: [] };
      }
    })
  );
  const seen = new Set();
  const items = [];
  for (const group of results) {
    for (const item of group.items) {
      const key = item.url || item.title;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  const availability = Object.fromEntries(results.map(r => [r.id, { ok: r.ok, count: r.items.length, error: r.error }]));
  return { query: q, groups: results, items, availability, refused: false, sources: results.length };
}
