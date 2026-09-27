/**
 * AI Mode research backend — open, keyless, attributable sources.
 *
 * Every upstream call is stubbed. These assertions are about parsing, safety
 * filtering, fallback and failure reporting — the parts that break silently.
 */
import assert from 'node:assert/strict';
import {
  research, chooseSources, wikipediaSearch, wikipediaArticle,
  pubmedSearch, formatPubmedItem, arxivSearch, crossrefSearch, openAlexSearch,
  semanticScholarSearch, openLibrarySearch, gutenbergSearch, stackExchangeSearch,
  musicBrainzSearch, openMeteo, stripMarkup, isSensitiveQuery
} from '../lib/ai-mode/research.js';

const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

/* ---------- a stub for every open API AI Mode can reach ---------- */
function stubFetch(routes) {
  const seen = [];
  const impl = async (url) => {
    const key = String(url);
    seen.push(key);
    for (const [pattern, responder] of Object.entries(routes)) {
      if (key.includes(pattern)) {
        const out = typeof responder === 'function' ? await responder(key) : responder;
        if (out instanceof Response) return out;
        if (out && out.__status && out.__status !== 200) return new Response('err', { status: out.__status });
        return json(out);
      }
    }
    return new Response('not stubbed', { status: 404 });
  };
  impl.seen = seen;
  return impl;
}

/* ---------- Wikipedia ---------- */
{
  const f = stubFetch({
    'wikipedia.org': url => (url.includes('list=search')
      ? { query: { search: [{ title: 'Backwaters', pageid: 42, snippet: 'Lagoons &amp; lakes in Kerala' }] } }
      : { query: { pages: [{ pageid: 42, title: 'Backwaters', extract: 'Kerala has a network of interconnected lagoons and lakes.\n\nThey lie parallel to the coast.', canonicalurl: 'https://en.wikipedia.org/wiki/Backwaters', original: { source: 'https://upload.wikimedia.org/x.jpg' } }] } })
  });
  const search = await wikipediaSearch('kerala backwaters', { fetchImpl: f });
  assert.equal(search.items[0].url, 'https://en.wikipedia.org/?curid=42');
  assert.match(search.items[0].snippet, /Lagoons & lakes/, 'HTML entities in snippets are decoded');

  const article = await wikipediaArticle('Kerala Backwaters', { fetchImpl: f });
  assert.equal(article.article.title, 'Backwaters');
  assert.match(article.article.text, /interconnected lagoons/);
  assert.equal(article.items[1].kind, 'image', 'the lead image is offered as a reference, not embedded');
  assert.ok(f.seen.every(u => u.startsWith('https://')), 'no plaintext upstream URLs');
}

/* ---------- PubMed via E-utilities, then Europe PMC ---------- */
{
  const f = stubFetch({
    'esearch.fcgi': { esearchresult: { idlist: ['111', '222'] } },
    'esummary.fcgi': { result: {
      111: { title: 'Vitamin D deficiency and outcomes', authors: [{ name: 'A Rao' }], fulljournalname: 'Lancet', pubdate: '2024', articleids: [{ idtype: 'doi', value: '10.1/abc' }] },
      222: { title: 'A second trial', authors: [], source: 'BMJ', pubdate: '2023' }
    } }
  });
  const out = await pubmedSearch('vitamin D deficiency', { fetchImpl: f });
  assert.equal(out.via, 'PubMed');
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].pmid, '111');
  assert.equal(out.items[0].doi, '10.1/abc');
  assert.equal(out.items[0].url, 'https://pubmed.ncbi.nlm.nih.gov/111/');
  assert.equal(out.items[0].year, '2024');
  assert.match(out.items[0].journal, /Lancet/);
}
{
  // NCBI rate-limited → Europe PMC rescues the same corpus.
  const f = stubFetch({
    'ncbi.nlm.nih.gov': { __status: 429 },
    'europepmc': { resultList: { result: [
      { pmid: '333', title: 'Rescued paper', authorList: { author: [{ name: 'B Iyer' }] }, journalInfo: { journal: { title: 'NEJM' } }, pubYear: '2022', doi: '10.2/xyz', abstractText: 'We studied 900 patients.' }
    ] } }
  });
  const out = await pubmedSearch('anything', { fetchImpl: f });
  assert.equal(out.via, 'Europe PMC', 'Europe PMC rescues an NCBI 429');
  assert.equal(out.items[0].pmid, '333');
  assert.match(out.items[0].abstract, /900 patients/);
}
{
  // Both down → an honest error, never an empty result presented as "none found".
  const f = stubFetch({ 'ncbi.nlm.nih.gov': { __status: 500 }, 'europepmc': { __status: 500 } });
  const out = await pubmedSearch('anything', { fetchImpl: f });
  assert.equal(out.ok, false);
  assert.ok(out.error);
}
assert.equal(formatPubmedItem({ title: '' }), null, 'an untitled record is dropped, not emitted blank');
assert.equal(formatPubmedItem({ title: 'X', url: 'http://insecure.test/x' }), null, 'non-https links are refused');

/* ---------- arXiv, Crossref, OpenAlex, Semantic Scholar ---------- */
{
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>http://arxiv.org/abs/2401.00001v1</id><title>On quantum  error correction</title>
      <summary>We study  surface codes.</summary><published>2024-01-02T00:00:00Z</published>
      <author><name>A Researcher</name></author></entry></feed>`;
  const f = stubFetch({ 'export.arxiv.org': atom });
  const out = await arxivSearch('quantum error correction', { fetchImpl: f });
  assert.equal(out.items[0].title, 'On quantum error correction');
  assert.equal(out.items[0].year, '2024');
  assert.match(out.items[0].url, /arxiv\.org/);
}
{
  const f = stubFetch({ 'api.crossref.org': { message: { items: [{ DOI: '10.9/z', title: ['Crossref title'], author: [{ given: 'C', family: 'Diaz' }], 'container-title': ['Nature'], issued: { 'date-parts': [[2021]] } }] } } });
  const out = await crossrefSearch('x', { fetchImpl: f });
  assert.equal(out.items[0].doi, '10.9/z');
  assert.equal(out.items[0].year, 2021);
  assert.equal(out.items[0].url, 'https://doi.org/10.9/z');
}
{
  const f = stubFetch({ 'api.openalex.org': { results: [{ id: 'https://openalex.org/W1', title: 'OA title', publication_year: 2020, cited_by_count: 12, doi: 'https://doi.org/10.1/oa', abstract_inverted_index: { deep: [0], learning: [1] } }] } });
  const out = await openAlexSearch('x', { fetchImpl: f });
  assert.equal(out.items[0].citedBy, 12);
  assert.equal(out.items[0].snippet, 'deep learning', 'inverted abstracts are re-inverted');
}
{
  const f = stubFetch({ 'semanticscholar.org': { data: [{ paperId: 'p1', title: 'S2 title', year: 2022, venue: 'ACL', externalIds: { PubMed: '999', DOI: '10.5/s2' }, url: 'https://www.semanticscholar.org/paper/p1' }] } });
  const out = await semanticScholarSearch('x', { fetchImpl: f });
  assert.equal(out.items[0].pmid, '999');
  assert.equal(out.items[0].id, 'pubmed:999');
}

/* ---------- books, archives, discussion, music ---------- */
{
  const f = stubFetch({
    'openlibrary.org': { docs: [{ title: 'A Book', key: '/works/OL1M', author_name: ['An Author'], first_publish_year: 1999, subject: ['Fiction'] }] },
    'gutendex.com': { results: [{ id: 1, title: 'A Classic', authors: [{ name: 'Old Writer' }], subjects: ['Literature'], formats: { 'text/html': 'https://www.gutenberg.org/ebooks/1.html.images' } }] },
    'stackexchange.com': { items: [{ question_id: 7, title: 'Why does this fail', link: 'https://stackoverflow.com/q/7', body: 'Because of X', score: 12, answer_count: 3 }] },
    'musicbrainz.org': { recordings: [{ id: 'mb1', title: 'A Song', 'artist-credit': [{ name: 'A Band' }], 'first-release-date': '1994-01-01' }] }
  });
  assert.equal((await openLibrarySearch('a', { fetchImpl: f })).items[0].url, 'https://openlibrary.org/works/OL1M');
  assert.match((await gutenbergSearch('a', { fetchImpl: f })).items[0].url, /gutenberg\.org/);
  assert.equal((await stackExchangeSearch('a', { fetchImpl: f })).items[0].answers, 3);
  assert.equal((await musicBrainzSearch('a', { fetchImpl: f })).items[0].year, '1994');
}

/* ---------- weather ---------- */
{
  const f = stubFetch({
    'nominatim': [{ lat: '9.93', lon: '76.27', display_name: 'Thiruvananthapuram' }],
    'open-meteo.com': { current: { temperature_2m: 31.2, apparent_temperature: 34, relative_humidity_2m: 78, wind_speed_10m: 11 }, daily: { temperature_2m_max: [33, 32, 31], temperature_2m_min: [26, 26, 25] } }
  });
  const out = await openMeteo('Thiruvananthapuram', { fetchImpl: f });
  assert.equal(out.items[0].latitude, 9.93);
  assert.match(out.items[0].snippet, /31\.2°C/);
}

/* ---------- source selection ---------- */
{
  const pubmed = chooseSources('find pubmed papers on covid');
  assert.ok(pubmed.some(s => s.id === 'pubmed'), 'naming PubMed selects PubMed');
  assert.ok(pubmed.some(s => s.id === 'wikipedia'), 'Wikipedia is always the general fallback');
  const code = chooseSources('fix this regex error in my program');
  assert.ok(code.some(s => s.id === 'stackexchange'));
  const explicit = chooseSources('anything', ['openlibrary', 'gutenberg']);
  assert.deepEqual(explicit.map(s => s.id), ['openlibrary', 'gutenberg'], 'an explicit group list wins');
  assert.equal(chooseSources('x', ['not-a-source']).length > 0, true, 'an unknown group falls back rather than failing');
}

/* ---------- aggregation ---------- */
{
  const f = stubFetch({
    'en.wikipedia.org': url => (url.includes('list=search')
      ? { query: { search: [{ title: 'Backwaters', pageid: 42, snippet: 'Lagoons in Kerala' }] } }
      : { query: { pages: [{ pageid: 42, title: 'Backwaters', extract: 'Kerala backwater text.' }] } }),
    'api.crossref.org': { message: { items: [{ DOI: '10.4/bw', title: ['Backwater hydrology'], 'container-title': ['Journal of Hydrology'], issued: { 'date-parts': [[2020]] } }] } },
    'openlibrary.org': { docs: [{ title: 'Backwaters of Kerala', key: '/works/OL2W', first_publish_year: 2001 }] },
    'eutils.ncbi.nlm.nih.gov': url => (url.includes('esearch')
      ? { esearchresult: { idlist: ['111'] } }
      : { result: { 111: { title: 'Backwater health study', authors: [{ name: 'A Rao' }], fulljournalname: 'Lancet', pubdate: '2024' } } })
  });
  const out = await research('kerala backwaters', { fetchImpl: f, limit: 3 });
  assert.equal(out.refused, false);
  assert.ok(out.items.length >= 2, 'multiple sources contribute');
  assert.deepEqual(out.groups.map(g => g.id), ['wikipedia', 'crossref', 'openlibrary'], 'a plain subject still fans out to real sources');
  const seen = new Set(out.items.map(i => i.url));
  assert.equal(seen.size, out.items.length, 'duplicate URLs across sources are collapsed');
  assert.ok(out.availability.wikipedia.ok);
  for (const item of out.items) assert.ok(item.url.startsWith('https://'), 'every source is an https link');
}

/* ---------- partial failure is reported, never hidden ---------- */
{
  const f = stubFetch({
    'en.wikipedia.org': { __status: 503 },
    'eutils.ncbi.nlm.nih.gov': url => (url.includes('esearch')
      ? { esearchresult: { idlist: ['5'] } }
      : { result: { 5: { title: 'Survivor', pubdate: '2024' } } })
  });
  const out = await research('anything medical', { fetchImpl: f });
  assert.ok(out.items.length >= 1, 'a healthy source still answers');
  assert.equal(out.availability.wikipedia.ok, false);
  assert.ok(out.groups.find(g => g.id === 'wikipedia').error, 'the failed source states why');
}

/* ---------- everything down ---------- */
{
  const f = stubFetch({});
  const out = await research('anything at all', { fetchImpl: f });
  assert.equal(out.items.length, 0);
  assert.ok(out.groups.every(g => !g.ok), 'no group claims success when none did');
}

/* ---------- safety ---------- */
{
  const out = await research('explicit pornographic material', { fetchImpl: stubFetch({}) });
  assert.equal(out.refused, true, 'explicit research is refused before any upstream call');
  assert.equal(out.groups.length, 0, 'a refused query never touches a third party');
  assert.ok(isSensitiveQuery('adult nude content'));
  assert.ok(!isSensitiveQuery('adult education policy'));
  assert.equal(stripMarkup('<b>bold</b> &amp; <i>italic</i>'), 'bold & italic');
}

const short = await research('a', { fetchImpl: stubFetch({}) });
assert.ok(short.error, 'a one-character query is rejected with a reason');

console.log('AI Mode research ok: Wikipedia, PubMed/Europe PMC fallback, arXiv, Crossref, OpenAlex, Semantic Scholar, Open Library, Gutenberg, Stack Exchange, MusicBrainz, Open-Meteo; partial failure, safety and honest reporting verified');
