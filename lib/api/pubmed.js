/**
 * PubMed / Europe PMC literature API.
 *
 * Dedicated endpoint so AI Mode, the Writing Assistant and any external client
 * can search biomedical literature without going through the orchestrator.
 * No API key. NCBI E-utilities is queried first; Europe PMC covers the same
 * corpus and rescues an NCBI 429 or outage.
 *
 *   GET  /api/pubmed?q=<query>&limit=8
 *   POST /api/pubmed { query, limit, email, sort }
 */
import { pubmedSearch, pubmedViaEuropePmc } from '../ai-mode/research.js';
import { sendJSON, readJSONBody, createLimiter, createCache, isSensitiveQuery } from '../ai-mode/http.js';

const limited = createLimiter({ max: 30, windowMs: 60_000 });
const cache = createCache({ ttlMs: 20 * 60_000, max: 150 });

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'POST') return sendJSON(res, 405, { error: 'GET or POST only.' });
  if (limited(req)) return sendJSON(res, 429, { error: 'Too many literature lookups. Wait a minute.' });

  const url = new URL(req.url || '/api/pubmed', 'https://megaplan.invalid');
  const body = req.method === 'POST' ? readJSONBody(req) : {};
  const query = String(req.method === 'GET' ? url.searchParams.get('q') || url.searchParams.get('query') : body.query || body.q || '').trim();
  const limit = Math.max(1, Math.min(25, Number(req.method === 'GET' ? url.searchParams.get('limit') : body.limit) || 8));
  const email = String((req.method === 'GET' ? url.searchParams.get('email') : body.email) || 'tools@mega-plan.vercel.app').slice(0, 90);

  if (query.length < 2) return sendJSON(res, 400, { error: 'Enter a search term of at least two characters.', example: '/api/pubmed?q=metformin%20cardiovascular' });
  if (isSensitiveQuery(query)) return sendJSON(res, 400, { error: 'That search term is filtered out. AI Mode does not search for explicit material.' });

  const key = `pubmed:${query.toLowerCase()}:${limit}`;
  const cached = cache.get(key);
  if (cached) return sendJSON(res, 200, { ok: true, ...cached, cached: true });

  try {
    const out = await pubmedSearch(query, { limit, email });
    if (!out.ok) {
      const fallback = await pubmedViaEuropePmc(query, { fetchImpl: fetch, limit });
      if (!fallback.ok) {
        return sendJSON(res, 502, {
          error: 'No biomedical literature source is reachable right now.',
          detail: out.error || fallback.error,
          note: 'This is an upstream availability problem, not an empty result set. Try again shortly.'
        });
      }
      cache.set(key, { query, via: 'Europe PMC', items: fallback.items, count: fallback.items.length });
      return sendJSON(res, 200, { ok: true, query, via: 'Europe PMC', items: fallback.items, count: fallback.items.length, cached: false });
    }
    cache.set(key, { query, via: out.via || 'PubMed', items: out.items, count: out.items.length });
    return sendJSON(res, 200, { ok: true, query, via: out.via || 'PubMed', items: out.items, count: out.items.length, cached: false });
  } catch (err) {
    return sendJSON(res, 502, { error: 'The literature search failed.', detail: String(err?.message || err) });
  }
}
