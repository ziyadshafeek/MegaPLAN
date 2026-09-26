/**
 * Map Auto Scraper — scans one grid cell at a time starting from Trivandrum
 * Free, no API key for OSM data. Uses NVIDIA AI for classification when available.
 * 
 * POST /api/map-scraper { lat, lng, radius, index, step }
 * GET /api/map-scraper?lat=8.5241&lng=76.9366&index=0
 * 
 * Spiral scanning from Trivandrum center.
 * Returns places, roads, classification, next cell.
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'MegaPLAN-MapScraper/1.0 (https://mega-plan.vercel.app) - Free OSM directory',
        'Accept-Language': 'en',
        ...(opts.headers || {})
      }
    });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

// Trivandrum center
const CENTER = { lat: 8.524139, lng: 76.936638 };
const STEP_DEG = 0.01; // ~1.1km

// Spiral algorithm: index -> (dx, dy)
function spiralToCoords(index) {
  if (index === 0) return { dx: 0, dy: 0 };
  // Generate spiral outward
  let x = 0, y = 0;
  let dx = 0, dy = -1;
  for (let i = 0; i < index; i++) {
    if ((x === y) || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      // Change direction: rotate 90 deg clockwise? Actually spiral logic
      const tmp = dx;
      dx = -dy;
      dy = tmp;
    }
    x += dx;
    y += dy;
  }
  return { dx: x, dy: y };
}

function coordsToLatLng(index, center = CENTER, step = STEP_DEG) {
  const { dx, dy } = spiralToCoords(index);
  return {
    lat: center.lat + dy * step,
    lng: center.lng + dx * step,
    dx, dy, index
  };
}

// Haversine distance
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const body = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries()) : readBody(req);
  
  let lat = Number(body.lat);
  let lng = Number(body.lng);
  let index = Number(body.index || 0);
  const radius = Number(body.radius || 600); // meters
  const step = Number(body.step || STEP_DEG);

  // If no lat/lng, use spiral from index
  if (!lat || !lng) {
    const pos = coordsToLatLng(index, CENTER, step);
    lat = pos.lat;
    lng = pos.lng;
  }

  // Validate
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json(res, 400, { error: 'Invalid lat/lng' });
  }

  const startTime = Date.now();
  let places = [];
  let roads = [];
  let errors = [];

  try {
    // Query 1: Places (amenity, shop, tourism, leisure, office, craft, building with name, etc)
    const placesQuery = `[out:json][timeout:25];
(
  nwr["amenity"](around:${radius},${lat},${lng});
  nwr["shop"](around:${radius},${lat},${lng});
  nwr["tourism"](around:${radius},${lat},${lng});
  nwr["leisure"](around:${radius},${lat},${lng});
  nwr["office"](around:${radius},${lat},${lng});
  nwr["craft"](around:${radius},${lat},${lng});
  nwr["historic"](around:${radius},${lat},${lng});
  nwr["emergency"](around:${radius},${lat},${lng});
  nwr["healthcare"](around:${radius},${lat},${lng});
  nwr["building"~"^(mosque|church|temple|school|hospital|hotel|retail|commercial)$"](around:${radius},${lat},${lng});
);
out center 100;`;

    const placesUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(placesQuery)}`;
    try {
      const r = await fetchWithTimeout(placesUrl, {}, 20000);
      if (!r.ok) {
        const txt = await r.text();
        throw Error(`Overpass places ${r.status}: ${txt.slice(0,200)}`);
      }
      const data = await r.json();
      places = (data.elements || []).map(el => {
        const clat = el.lat || el.center?.lat;
        const clng = el.lon || el.center?.lon;
        return {
          id: `${el.type}/${el.id}`,
          osm_id: el.id,
          osm_type: el.type,
          lat: clat,
          lng: clng,
          tags: el.tags || {},
          name: el.tags?.name || null,
          amenity: el.tags?.amenity || null,
          shop: el.tags?.shop || null,
          tourism: el.tags?.tourism || null,
          leisure: el.tags?.leisure || null,
          office: el.tags?.office || null,
          road: el.tags?.['addr:street'] || null,
          city: el.tags?.['addr:city'] || null,
          postcode: el.tags?.['addr:postcode'] || null,
          cuisine: el.tags?.cuisine || null,
          religion: el.tags?.religion || null,
          denomination: el.tags?.denomination || null,
          distance: clat && clng ? haversine(lat, lng, clat, clng) : null
        };
      }).filter(p => p.lat && p.lng);
    } catch (e) {
      errors.push(`places: ${e.message}`);
      // Fallback to seed data for Trivandrum area if within 20km of center
      const distToCenter = haversine(lat, lng, CENTER.lat, CENTER.lng);
      if (distToCenter < 20) {
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const { fileURLToPath } = await import('node:url');
          const here = path.dirname(fileURLToPath(import.meta.url));
          const seedPath = path.join(here, '../..', 'data', 'map-directory', 'seed.json');
          if (fs.existsSync(seedPath)) {
            const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
            // Filter seed places within radius
            places = (seed.seedPlaces || []).filter(p => haversine(lat, lng, p.lat, p.lng) < radius/1000 + 2).map(p => ({ ...p, distance: haversine(lat, lng, p.lat, p.lng) }));
            if (places.length) errors.push(`fallback: used seed data ${places.length} places (Overpass offline)`);
          }
        } catch {}
      }
    }

    // Query 2: Roads
    const roadsQuery = `[out:json][timeout:15];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|footway|path|track|road)$"](around:${radius},${lat},${lng});
);
out 100;`;

    const roadsUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(roadsQuery)}`;
    try {
      const r = await fetchWithTimeout(roadsUrl, {}, 15000);
      if (!r.ok) throw Error(`Overpass roads ${r.status}`);
      const data = await r.json();
      roads = (data.elements || []).map(el => ({
        id: el.id,
        tags: el.tags || {},
        name: el.tags?.name || el.tags?.ref || null,
        highway: el.tags?.highway || null,
        surface: el.tags?.surface || null,
        nodes: el.nodes?.length || 0
      })).filter(r => r.name); // only named roads for road-wise classification
    } catch (e) {
      errors.push(`roads: ${e.message}`);
      // Fallback seed roads
      const distToCenter = haversine(lat, lng, CENTER.lat, CENTER.lng);
      if (distToCenter < 20) {
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const { fileURLToPath } = await import('node:url');
          const here = path.dirname(fileURLToPath(import.meta.url));
          const seedPath = path.join(here, '../..', 'data', 'map-directory', 'seed.json');
          if (fs.existsSync(seedPath)) {
            const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
            roads = seed.seedRoads || [];
          }
        } catch {}
      }
    }

    // Classification
    // Business-wise: group by type
    const businessGroups = {};
    const roadGroups = {};
    const religiousGroups = { mosque: [], church: [], temple: [], other: [] };
    
    for (const p of places) {
      // Business type
      let btype = p.amenity || p.shop || p.tourism || p.leisure || p.office || 'other';
      if (!businessGroups[btype]) businessGroups[btype] = [];
      businessGroups[btype].push(p.id);

      // Road-wise
      const roadName = p.road || 'Unknown Road';
      if (!roadGroups[roadName]) roadGroups[roadName] = [];
      roadGroups[roadName].push(p.id);

      // Religious
      if (p.amenity === 'place_of_worship' || p.tags?.amenity === 'place_of_worship' || p.tags?.building === 'mosque' || p.tags?.building === 'church' || p.tags?.building === 'temple') {
        const rel = (p.tags?.religion || '').toLowerCase();
        const bld = (p.tags?.building || '').toLowerCase();
        if (rel === 'muslim' || bld === 'mosque' || p.tags?.amenity === 'mosque' || p.tags?.name?.toLowerCase().includes('mosque') || p.tags?.name?.toLowerCase().includes('masjid')) {
          religiousGroups.mosque.push(p.id);
        } else if (rel === 'christian' || bld === 'church' || p.tags?.name?.toLowerCase().includes('church')) {
          religiousGroups.church.push(p.id);
        } else if (rel === 'hindu' || bld === 'temple' || p.tags?.name?.toLowerCase().includes('temple')) {
          religiousGroups.temple.push(p.id);
        } else {
          religiousGroups.other.push(p.id);
        }
      }
      // Also direct amenity
      if (p.amenity === 'mosque' || p.tags?.building === 'mosque') religiousGroups.mosque.push(p.id);
      if (p.amenity === 'church') religiousGroups.church.push(p.id);
      if (p.amenity === 'temple' || p.tags?.building === 'temple') religiousGroups.temple.push(p.id);
    }

    // Next cell
    const nextIndex = index + 1;
    const nextPos = coordsToLatLng(nextIndex, CENTER, step);

    // Stats
    const stats = {
      scannedAt: new Date().toISOString(),
      center: { lat, lng },
      index,
      radius,
      step,
      placesCount: places.length,
      roadsCount: roads.length,
      businessTypes: Object.keys(businessGroups).length,
      roadTypes: Object.keys(roadGroups).length,
      durationMs: Date.now() - startTime,
      errors
    };

    return json(res, 200, {
      ok: true,
      center: CENTER,
      current: { lat, lng, index, dx: spiralToCoords(index).dx, dy: spiralToCoords(index).dy },
      next: { lat: nextPos.lat, lng: nextPos.lng, index: nextIndex, dx: nextPos.dx, dy: nextPos.dy },
      stats,
      places,
      roads,
      classification: {
        roadWise: roadGroups,
        businessWise: businessGroups,
        religious: religiousGroups
      }
    });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Scraper failed', current: { lat, lng, index } });
  }
}
