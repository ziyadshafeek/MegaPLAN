/**
 * OSINT Advanced API — public username checker, safe
 * Only public URL existence, no private data, no bypass
 * POST /api/osint { username, platforms: [...] } or { url }
 */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

const PLATFORMS = {
  instagram: 'https://www.instagram.com/{username}/',
  youtube: 'https://www.youtube.com/@{username}',
  twitter: 'https://x.com/{username}',
  github: 'https://github.com/{username}',
  reddit: 'https://www.reddit.com/user/{username}/',
  tiktok: 'https://www.tiktok.com/@{username}',
  medium: 'https://medium.com/@{username}',
  pinterest: 'https://www.pinterest.com/{username}/',
  twitch: 'https://www.twitch.tv/{username}',
  vimeo: 'https://vimeo.com/{username}'
};

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    const text = await r.text().catch(() => '');
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), text: text.slice(0, 2000), location: r.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  
  const body = readBody(req);
  const username = String(body.username || '').trim().replace(/^@/, '');
  const url = body.url ? String(body.url).trim() : null;
  
  if (url) {
    // Single URL check
    try {
      const r = await fetchWithTimeout(url);
      return json(res, 200, { ok: true, url, status: r.status, exists: r.status === 200, title: (r.text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || null });
    } catch (e) {
      return json(res, 200, { ok: true, url, status: 'error', error: e.message });
    }
  }
  
  if (!username) return json(res, 400, { error: 'Enter username' });
  if (!/^[a-zA-Z0-9._-]{1,30}$/.test(username)) return json(res, 400, { error: 'Invalid username format (alphanumeric, ., _, -)' });
  
  const requestedPlatforms = Array.isArray(body.platforms) ? body.platforms : Object.keys(PLATFORMS);
  const results = [];
  
  for (const plat of requestedPlatforms.slice(0, 15)) {
    const template = PLATFORMS[plat];
    if (!template) continue;
    const checkUrl = template.replace('{username}', encodeURIComponent(username));
    try {
      const r = await fetchWithTimeout(checkUrl);
      // Heuristic: 200 likely exists, 404 not, 302 may be redirect to login (exists but blocked)
      let exists = null;
      if (r.status === 200) exists = true;
      else if (r.status === 404) exists = false;
      else if (r.status === 302 && r.location && r.location.includes('login')) exists = true; // likely exists but requires login
      
      results.push({ platform: plat, url: checkUrl, status: r.status, exists, location: r.location || null });
    } catch (e) {
      results.push({ platform: plat, url: checkUrl, status: 'error', error: e.message, exists: null });
    }
    // Small delay to be nice
    await new Promise(r => setTimeout(r, 150));
  }
  
  return json(res, 200, {
    ok: true,
    username,
    checked: results.length,
    found: results.filter(r => r.exists).length,
    results,
    note: 'Public OSINT only — checks if public profile URL exists, no login, no private data, no bypass. Some platforms block scraping or show login wall even for public profiles. Open URLs manually to verify.'
  });
}
