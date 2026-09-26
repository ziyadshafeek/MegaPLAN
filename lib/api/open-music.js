// MusicBrainz is a general-world recording search, wholly separate from local
// Trivandrum music places and from Spotify's restricted catalogue.
const cache = new Map();
let lastRequest = 0;
function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); }
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  const q = String(new URL(req.url, 'https://megaplan.invalid').searchParams.get('q') || '').trim().slice(0, 90);
  if (q.length < 2) return json(res, 400, { error: 'Search at least two characters.' });
  const cached = cache.get(q.toLowerCase());
  if (cached && Date.now() - cached.time < 60_000) return json(res, 200, cached.data);
  if (Date.now() - lastRequest < 1100) return json(res, 429, { error: 'MusicBrainz requests are limited to one per second. Please retry.' });
  lastRequest = Date.now();
  try {
    const r = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`, { headers: { Accept: 'application/json', 'User-Agent': 'MegaPLAN/1.0 (https://mega-plan.vercel.app/)' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw Error(`MusicBrainz HTTP ${r.status}`);
    const content = await r.json();
    const results = (content.recordings || []).filter(x => /^[0-9a-f-]{36}$/i.test(x.id || '')).map(x => ({
      id: x.id, name: String(x.title || '').slice(0, 180),
      artists: (x['artist-credit'] || []).map(a => a.artist?.name || '').filter(Boolean).join(', ').slice(0, 180),
      album: String(x.releases?.[0]?.title || '').slice(0, 180), duration_ms: Number(x.length) || 0,
      external_url: `https://musicbrainz.org/recording/${x.id}`,
      spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(`${x.title || ''} ${(x['artist-credit'] || []).map(a => a.artist?.name || '').join(' ')}`)}`
    }));
    const data = { ok: true, results, count: results.length, source: 'MusicBrainz open recording search, not the Spotify catalogue. Spotify links are search URLs, not verified matches; nothing is saved.' };
    if (cache.size > 120) cache.clear();
    cache.set(q.toLowerCase(), { time: Date.now(), data });
    return json(res, 200, data);
  } catch { return json(res, 502, { error: 'MusicBrainz unavailable; no results invented.' }); }
}
