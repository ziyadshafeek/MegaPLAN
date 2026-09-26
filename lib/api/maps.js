/**
 * Maps API — geocoding via Nominatim, places via Overpass, routing via OSRM
 * Free, no API key, OSM based. Google Maps alternative.
 * POST /api/maps { action: 'geocode'|'reverse'|'nearby'|'route', q, lat, lng, type }
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

async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'MegaPLAN-Maps/1.0 (https://mega-plan.vercel.app)',
        'Accept-Language': 'en',
        ...(opts.headers || {})
      }
    });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  
  const body = readBody(req);
  const action = String(body.action || 'geocode');
  
  try {
    if (action === 'geocode') {
      const q = String(body.q || '').trim();
      if (!q) return json(res, 400, { error: 'Enter place to search' });
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
      const r = await fetchWithTimeout(url);
      const data = await r.json();
      return json(res, 200, { ok: true, query: q, results: data });
    }
    
    if (action === 'reverse') {
      const lat = Number(body.lat);
      const lng = Number(body.lng || body.lon);
      if (!lat || !lng) return json(res, 400, { error: 'Enter lat and lng' });
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
      const r = await fetchWithTimeout(url);
      const data = await r.json();
      return json(res, 200, { ok: true, lat, lng, result: data });
    }
    
    if (action === 'nearby') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const type = String(body.type || 'cafe').toLowerCase();
      if (!lat || !lng) return json(res, 400, { error: 'Enter lat and lng' });
      const query = `[out:json][timeout:15];(node["amenity"="${type}"](around:2000,${lat},${lng});way["amenity"="${type}"](around:2000,${lat},${lng}););out 20;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const r = await fetchWithTimeout(url, {}, 15000);
      const data = await r.json();
      return json(res, 200, { ok: true, lat, lng, type, elements: data.elements || [] });
    }
    
    if (action === 'route') {
      const from = body.from; // [lat,lng] or string
      const to = body.to;
      
      async function parseLoc(input) {
        if (Array.isArray(input) && input.length === 2) return [Number(input[0]), Number(input[1])];
        if (typeof input === 'string') {
          const m = input.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
          if (m) return [Number(m[1]), Number(m[2])];
          // Geocode
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=1`;
          const r = await fetchWithTimeout(url);
          const data = await r.json();
          if (!data[0]) throw Error('Could not geocode: ' + input);
          return [Number(data[0].lat), Number(data[0].lon)];
        }
        throw Error('Invalid location');
      }
      
      const [lat1, lng1] = await parseLoc(from);
      const [lat2, lng2] = await parseLoc(to);
      
      const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
      const r = await fetchWithTimeout(url);
      const data = await r.json();
      
      if (!data.routes || !data.routes[0]) return json(res, 404, { error: 'No route found' });
      
      return json(res, 200, { ok: true, from: [lat1, lng1], to: [lat2, lng2], route: data.routes[0] });
    }
    
    return json(res, 400, { error: 'Unknown action. Use geocode, reverse, nearby, route' });
    
  } catch (err) {
    return json(res, 500, { error: err.message || 'Maps API failed' });
  }
}
