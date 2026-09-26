/**
 * Music Scraper — Spotify full dataset for AI
 * Based on GitHub: AliAkhtari78/SpotifyScraper (no API key, public embed token) + msr8/spotify 7M+ tracks
 * Free, no API key for public data, sync+async, typed models
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  try {
    const { makeRateLimitedRequest } = await import('../rate-limiter.js');
    const r = await makeRateLimitedRequest('spotify', url, opts, timeout);
    return r;
  } catch {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          ...(opts.headers || {})
        }
      });
      return r;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Spotify public embed token bootstrapping (like SpotifyScraper)
async function getSpotifyToken() {
  try {
    // Try to get token from embed page
    const embedUrl = 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT';
    const r = await fetchWithTimeout(embedUrl, {}, 10000);
    const html = await r.text();
    // Extract token from HTML - looks for accessToken
    const tokenMatch = html.match(/"accessToken"\s*:\s*"([^"]+)"/) || html.match(/accessToken":"([^"]+)"/);
    if (tokenMatch) return tokenMatch[1];
    
    // Fallback: try to get from https://open.spotify.com/get_access_token?reason=transport&productType=embed
    const tokenUrl = 'https://open.spotify.com/get_access_token?reason=transport&productType=embed';
    const r2 = await fetchWithTimeout(tokenUrl, {}, 10000);
    const j = await r2.json();
    if (j.accessToken) return j.accessToken;
  } catch {}
  return null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || 'search';
  const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const id = url.searchParams.get('id') || '';
  const type = url.searchParams.get('type') || 'track';

  try {
    if (action === 'token') {
      const token = await getSpotifyToken();
      return json(res, 200, { ok: !!token, token: token ? token.slice(0, 20) + '...' : null, has_token: !!token, free: 'No API key, bootstrap from embed page, like SpotifyScraper' });
    }

    if (action === 'search') {
      if (!query) return json(res, 400, { error: 'Provide q' });

      // Public token availability varies; never fabricate tracks on failure.
      if (type !== 'track') return json(res, 501, { error: 'Live search currently supports tracks only; browse the published snapshot for other types.' });
      let results = [];
      let verified = false;
      try {
        const token = await getSpotifyToken();
        if (token) {
          // Use Spotify GraphQL search (public)
          const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`;
          const r = await fetchWithTimeout(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } }, 10000);
          if (r.ok) {
            const data = await r.json();
            verified = Array.isArray(data.tracks?.items);
            // Parse based on type
            if (type === 'track' && data.tracks) {
              results = data.tracks.items.map(t => ({
                id: t.id,
                name: t.name,
                artists: t.artists.map(a => a.name).join(', '),
                album: t.album.name,
                duration_ms: t.duration_ms,
                popularity: t.popularity,
                preview_url: t.preview_url,
                external_url: t.external_urls.spotify,
                type: 'track',
                searchable_text: `${t.name} ${t.artists.map(a=>a.name).join(' ')} ${t.album.name}`.toLowerCase()
              }));
            }
          }
        }
      } catch {}

      if (!verified) return json(res, 503, { error: 'Spotify search is unavailable or did not return verifiable results. Try the published snapshot.' });

      return json(res, 200, {
        ok: true,
        query,
        type,
        count: results.length,
        results,
        source: 'Spotify search (availability varies)'
      });
    }

    if (action === 'track') {
      if (!id) return json(res, 400, { error: 'Provide id' });
      // Get track details
      let track = null;
      try {
        const token = await getSpotifyToken();
        if (token) {
          const trackUrl = `https://api.spotify.com/v1/tracks/${id}`;
          const r = await fetchWithTimeout(trackUrl, { headers: { 'Authorization': `Bearer ${token}` } }, 10000);
          if (r.ok) {
            const t = await r.json();
            track = {
              id: t.id,
              name: t.name,
              artists: t.artists.map(a => a.name).join(', '),
              album: t.album.name,
              duration_ms: t.duration_ms,
              popularity: t.popularity,
              preview_url: t.preview_url,
              external_url: t.external_urls.spotify,
            };
          }
        }
      } catch {}

      if (!track) return json(res, 503, { error: 'Track details are unavailable from Spotify right now.' });
      return json(res, 200, { ok: true, track, source: 'Spotify track API' });
    }

    if (action === 'charts' || action === 'features') {
      return json(res, 501, { error: 'Live charts and audio features are not verified; only indexed snapshot records are available.' });
    }

    return json(res, 400, { error: 'Unknown action. Use token|search|track|charts|features' });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Music scraper failed' });
  }
}
