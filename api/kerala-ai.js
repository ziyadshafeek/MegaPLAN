/**
 * Kerala AI — AI-friendly API for map directory, fully indexable for AI multi-tool
 * This is the bridge between massive directory map and AI Mode (Codex-like)
 * 
 * GET /api/kerala-ai?q=search&term=mosque
 * GET /api/kerala-ai?q=distance&from=8.5241,76.9366&to=9.9312,76.2673
 * GET /api/kerala-ai?q=nearby&lat=8.5241&lng=76.9366&type=restaurant&radius=1000
 * GET /api/kerala-ai?q=business&id=node/123
 * GET /api/kerala-ai?q=road&name=M.G. Road
 * GET /api/kerala-ai?q=railway&lat=8.5241&lng=76.9366
 * GET /api/kerala-ai?q=geohash&hash=... or ?q=geohash&lat=...&lng=...
 * GET /api/kerala-ai?q=traffic&road=M.G. Road
 * POST with natural language: { query: "distance between Trivandrum and Kochi" }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

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

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function encodeGeohash(lat, lng, precision = 6) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0, bit = 0, even = true;
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '';
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += base32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

function readIndex() {
  const p = path.join(root, 'data', 'map-directory', 'index.json');
  if (!fs.existsSync(p)) return { totalCells: 0, totalPlaces: 0, cells: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { totalCells: 0, cells: [] }; }
}

function readAllCells(limit = 50) {
  const dir = path.join(root, 'data', 'map-directory');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.startsWith('cell_') && f.endsWith('.json')).slice(-limit);
  let places = [];
  for (const f of files) {
    try {
      const cell = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      places.push(...(cell.places || []));
    } catch {}
  }
  return places;
}

function readAllRoads(limit = 50) {
  const dir = path.join(root, 'data', 'map-directory');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.startsWith('cell_') && f.endsWith('.json')).slice(-limit);
  let roads = [];
  for (const f of files) {
    try {
      const cell = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      roads.push(...(cell.roads || []));
    } catch {}
  }
  return roads;
}

async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': 'MegaPLAN-Kerala-AI/1.0', ...(opts.headers||{}) } });
    return r;
  } finally {
    clearTimeout(timer);
  }
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
  const q = url.searchParams.get('q') || 'search';
  const body = req.method === 'POST' ? readBody(req) : {};

  try {
    // Distance query — user can ask "what is distance etc and get rough idea"
    if (q === 'distance') {
      let fromLat, fromLng, toLat, toLng;
      
      const fromParam = url.searchParams.get('from') || body.from;
      const toParam = url.searchParams.get('to') || body.to;

      function parseLatLng(input) {
        if (!input) return null;
        if (Array.isArray(input)) return [Number(input[0]), Number(input[1])];
        if (typeof input === 'string') {
          const m = input.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
          if (m) return [Number(m[1]), Number(m[2])];
          // Try geocode via Nominatim
          return null;
        }
        if (input.lat && input.lng) return [Number(input.lat), Number(input.lng)];
        return null;
      }

      let from = parseLatLng(fromParam);
      let to = parseLatLng(toParam);

      // If not lat/lng, try geocoding via Nominatim (free)
      if (!from && fromParam) {
        try {
          const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fromParam)}&limit=1`;
          const r = await fetchWithTimeout(geoUrl, {}, 10000);
          const data = await r.json();
          if (data[0]) from = [Number(data[0].lat), Number(data[0].lon)];
        } catch {}
      }
      if (!to && toParam) {
        try {
          const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(toParam)}&limit=1`;
          const r = await fetchWithTimeout(geoUrl, {}, 10000);
          const data = await r.json();
          if (data[0]) to = [Number(data[0].lat), Number(data[0].lon)];
        } catch {}
      }

      if (!from || !to) {
        return json(res, 400, { error: 'Provide from and to as lat,lng or place names. Example: ?q=distance&from=8.5241,76.9366&to=9.9312,76.2673 or from=Trivandrum&to=Kochi' });
      }

      [fromLat, fromLng] = from;
      [toLat, toLng] = to;

      const straightKm = haversine(fromLat, fromLng, toLat, toLng);
      
      // Try OSRM routing for road distance
      let roadDistance = null;
      let duration = null;
      let route = null;
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
        const r = await fetchWithTimeout(osrmUrl, {}, 10000);
        const data = await r.json();
        if (data.routes && data.routes[0]) {
          roadDistance = data.routes[0].distance / 1000; // km
          duration = data.routes[0].duration / 60; // minutes
          route = { distance_km: roadDistance, duration_min: duration };
        }
      } catch {}

      // Traffic estimate heuristic
      const hour = new Date().getHours();
      let trafficFactor = 1.0;
      if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) trafficFactor = 1.4;
      else if (hour >= 11 && hour <= 16) trafficFactor = 1.15;

      return json(res, 200, {
        ok: true,
        query: { from: { lat: fromLat, lng: fromLng, input: fromParam }, to: { lat: toLat, lng: toLng, input: toParam } },
        distance: {
          straight_km: Number(straightKm.toFixed(2)),
          straight_miles: Number((straightKm * 0.621371).toFixed(2)),
          road_km: roadDistance ? Number(roadDistance.toFixed(2)) : null,
          road_miles: roadDistance ? Number((roadDistance * 0.621371).toFixed(2)) : null,
          duration_min: duration ? Number(duration.toFixed(1)) : null,
          duration_with_traffic_min: duration ? Number((duration * trafficFactor).toFixed(1)) : null,
          traffic_factor: trafficFactor,
          hour,
          note: 'Straight via haversine, road via OSRM (free, no key, no live traffic, heuristic traffic factor based on time of day). For rough idea.'
        },
        spatial: {
          from_geohash6: encodeGeohash(fromLat, fromLng, 6),
          to_geohash6: encodeGeohash(toLat, toLng, 6),
          from_grid01: `${Math.floor(fromLat/0.01)}_${Math.floor(fromLng/0.01)}`,
          to_grid01: `${Math.floor(toLat/0.01)}_${Math.floor(toLng/0.01)}`
        },
        ai_usable: true,
        free_storage: 'OSM + OSRM free, no API key, fully indexable'
      });
    }

    // Nearby query
    if (q === 'nearby') {
      const lat = Number(url.searchParams.get('lat') || body.lat);
      const lng = Number(url.searchParams.get('lng') || body.lng);
      const type = (url.searchParams.get('type') || body.type || '').toLowerCase();
      const radius = Number(url.searchParams.get('radius') || body.radius || 1000);
      
      if (!lat || !lng) return json(res, 400, { error: 'Provide lat and lng' });

      const allPlaces = readAllCells(100);
      let filtered = allPlaces.filter(p => {
        if (!p.lat || !p.lng) return false;
        const dist = haversine(lat, lng, p.lat, p.lng);
        if (dist * 1000 > radius) return false;
        if (type) {
          const btype = (p.amenity || p.shop || p.tourism || '').toLowerCase();
          const name = (p.name || '').toLowerCase();
          const tags = JSON.stringify(p.tags || {}).toLowerCase();
          return btype.includes(type) || name.includes(type) || tags.includes(type);
        }
        return true;
      }).sort((a,b) => (a.distance||0) - (b.distance||0)).slice(0, 50);

      return json(res, 200, {
        ok: true,
        center: { lat, lng, geohash6: encodeGeohash(lat, lng, 6) },
        type: type || 'all',
        radius,
        count: filtered.length,
        places: filtered.map(p => ({
          id: p.id,
          name: p.name,
          amenity: p.amenity,
          shop: p.shop,
          road: p.road,
          lat: p.lat,
          lng: p.lng,
          distance_km: p.distance ? Number(p.distance.toFixed(2)) : Number(haversine(lat, lng, p.lat, p.lng).toFixed(2)),
          geohash6: p.geohash6 || encodeGeohash(p.lat, p.lng, 6),
          phone: p.phone,
          opening_hours: p.opening_hours,
          cuisine: p.cuisine,
          website: p.website,
          tags: p.tags // full tags for massive scrapping
        })),
        ai_usable: true
      });
    }

    // Search
    if (q === 'search') {
      const term = (url.searchParams.get('term') || url.searchParams.get('q') || body.term || body.query || '').toLowerCase();
      if (!term) return json(res, 400, { error: 'Provide term' });
      
      const allPlaces = readAllCells(200);
      const results = allPlaces.filter(p => {
        const searchable = (p.searchable_text || `${p.name||''} ${p.amenity||''} ${p.shop||''} ${p.road||''}`.toLowerCase());
        return searchable.includes(term);
      }).slice(0, 100);

      return json(res, 200, {
        ok: true,
        term,
        count: results.length,
        results: results.map(p => ({
          id: p.id,
          name: p.name,
          amenity: p.amenity,
          shop: p.shop,
          road: p.road,
          city: p.city,
          lat: p.lat,
          lng: p.lng,
          geohash6: p.geohash6,
          phone: p.phone,
          opening_hours: p.opening_hours,
          cuisine: p.cuisine,
          religion: p.religion,
          operator: p.operator,
          brand: p.brand,
          full_address: p.full_address,
          tags: p.tags,
          distance: p.distance
        })),
        ai_usable: true,
        free_storage: 'Search index from GitHub + IndexedDB, fully indexable'
      });
    }

    // Business full info
    if (q === 'business') {
      const id = url.searchParams.get('id') || body.id;
      if (!id) return json(res, 400, { error: 'Provide id like node/123' });
      
      const allPlaces = readAllCells(200);
      const place = allPlaces.find(p => p.id === id || String(p.osm_id) === String(id));
      if (!place) return json(res, 404, { error: 'Business not found' });

      return json(res, 200, {
        ok: true,
        business: {
          ...place,
          all_tags: place.tags,
          spatial: {
            geohash6: place.geohash6,
            geohash7: place.geohash7,
            grid01: place.grid01,
            grid02: place.grid02
          },
          contact: {
            phone: place.phone,
            email: place.email,
            website: place.website,
            facebook: place.facebook
          },
          hours: place.opening_hours,
          features: {
            wheelchair: place.wheelchair,
            smoking: place.smoking,
            outdoor_seating: place.outdoor_seating,
            takeaway: place.takeaway,
            delivery: place.delivery
          }
        },
        ai_usable: true
      });
    }

    // Road info
    if (q === 'road') {
      const name = url.searchParams.get('name') || body.name;
      const lat = Number(url.searchParams.get('lat') || body.lat);
      const lng = Number(url.searchParams.get('lng') || body.lng);
      
      const allRoads = readAllRoads(100);
      let filtered = allRoads;
      if (name) {
        filtered = allRoads.filter(r => (r.name || '').toLowerCase().includes(name.toLowerCase()) || (r.tags?.ref || '').toLowerCase().includes(name.toLowerCase()));
      } else if (lat && lng) {
        // Nearby roads
        filtered = allRoads.filter(r => {
          if (!r.bbox) return false;
          return lat >= r.bbox.minlat && lat <= r.bbox.maxlat && lng >= r.bbox.minlon && lng <= r.bbox.maxlon;
        });
      }
      
      filtered = filtered.slice(0, 20);

      return json(res, 200, {
        ok: true,
        count: filtered.length,
        roads: filtered.map(r => ({
          id: r.id,
          name: r.name,
          highway: r.highway,
          maxspeed: r.maxspeed,
          surface: r.surface,
          lanes: r.lanes,
          oneway: r.oneway,
          length_km: r.length_km,
          geohash6: r.geohash6,
          bbox: r.bbox,
          traffic: r.traffic,
          tags: r.tags
        })),
        ai_usable: true
      });
    }

    // Railway
    if (q === 'railway') {
      const lat = Number(url.searchParams.get('lat') || body.lat);
      const lng = Number(url.searchParams.get('lng') || body.lng);
      const radius = Number(url.searchParams.get('radius') || 5000);
      
      if (!lat || !lng) return json(res, 400, { error: 'Provide lat,lng for railway search' });

      const dir = path.join(root, 'data', 'map-directory');
      let stations = [];
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.startsWith('cell_') && f.endsWith('.json')).slice(-50);
        for (const f of files) {
          try {
            const cell = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            stations.push(...(cell.railwayStations || []));
          } catch {}
        }
      }

      const nearby = stations.filter(s => {
        if (!s.lat || !s.lng) return false;
        return haversine(lat, lng, s.lat, s.lng) * 1000 <= radius;
      }).sort((a,b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng)).slice(0, 20);

      return json(res, 200, {
        ok: true,
        center: { lat, lng, geohash6: encodeGeohash(lat, lng, 6) },
        radius,
        count: nearby.length,
        stations: nearby,
        ai_usable: true
      });
    }

    // Geohash
    if (q === 'geohash') {
      const hash = url.searchParams.get('hash') || body.hash;
      const lat = Number(url.searchParams.get('lat') || body.lat);
      const lng = Number(url.searchParams.get('lng') || body.lng);
      
      if (hash) {
        // Decode not implemented, just return info
        return json(res, 200, { ok: true, geohash: hash, note: 'Geohash decode: use encode to get nearby cells' });
      }
      if (lat && lng) {
        return json(res, 200, {
          ok: true,
          lat, lng,
          geohash6: encodeGeohash(lat, lng, 6),
          geohash7: encodeGeohash(lat, lng, 7),
          geohash8: encodeGeohash(lat, lng, 8),
          grid01: `${Math.floor(lat/0.01)}_${Math.floor(lng/0.01)}`,
          grid02: `${Math.floor(lat/0.02)}_${Math.floor(lng/0.02)}`,
          grid05: `${Math.floor(lat/0.05)}_${Math.floor(lng/0.05)}`,
          spatial_index: 'Geohash + grid for AI to use for distance, nearby, road, railway queries',
          ai_usable: true
        });
      }
      return json(res, 400, { error: 'Provide hash or lat,lng' });
    }

    // Traffic estimate
    if (q === 'traffic') {
      const roadName = url.searchParams.get('road') || body.road;
      const lat = Number(url.searchParams.get('lat') || body.lat);
      const lng = Number(url.searchParams.get('lng') || body.lng);
      
      const allRoads = readAllRoads(100);
      let road = null;
      if (roadName) {
        road = allRoads.find(r => (r.name || '').toLowerCase().includes(roadName.toLowerCase()));
      } else if (lat && lng) {
        road = allRoads.find(r => r.bbox && lat >= r.bbox.minlat && lat <= r.bbox.maxlat && lng >= r.bbox.minlon && lng <= r.bbox.maxlon);
      }

      if (!road) {
        return json(res, 200, {
          ok: true,
          traffic: {
            typical_speed: 40,
            current_estimate: 30,
            congestion_factor: 1.3,
            hour: new Date().getHours(),
            estimated: true,
            note: 'No specific road found, heuristic for Kerala: 40km/h typical, rush hour 8-10am & 5-8pm slower. For live traffic need TomTom/Google API key (not free).'
          },
          ai_usable: true
        });
      }

      return json(res, 200, {
        ok: true,
        road: { name: road.name, highway: road.highway, maxspeed: road.maxspeed, length_km: road.length_km },
        traffic: road.traffic || {
          typical_speed: 40,
          current_estimate: 30,
          congestion_factor: 1.2,
          hour: new Date().getHours(),
          estimated: true
        },
        ai_usable: true,
        note: 'Traffic heuristic, not live. For live, integrate TomTom Traffic API (free tier 2500 req/day) or Google.'
      });
    }

    // Default: stats
    const index = readIndex();
    return json(res, 200, {
      ok: true,
      message: 'Kerala AI — AI-friendly API for massive directory map, fully indexable, free storage',
      endpoints: {
        'distance': '?q=distance&from=lat,lng|place&to=lat,lng|place — haversine + OSRM road + traffic heuristic',
        'nearby': '?q=nearby&lat=...&lng=...&type=restaurant&radius=1000 — nearby businesses with full tags',
        'search': '?q=search&term=mosque — search all businesses with full info',
        'business': '?q=business&id=node/123 — full business info with all tags, contact, hours, features',
        'road': '?q=road&name=M.G. Road or ?q=road&lat=...&lng=... — road with length, maxspeed, traffic',
        'railway': '?q=railway&lat=...&lng=...&radius=5000 — railway stations nearby',
        'geohash': '?q=geohash&lat=...&lng=... — spatial index geohash6/7/8 + grid01/02/05 for AI',
        'traffic': '?q=traffic&road=M.G. Road — traffic estimate heuristic'
      },
      stats: {
        totalCells: index.totalCells || 0,
        totalPlaces: index.totalPlaces || 0,
        businessTypes: Object.keys(index.businessTypes || {}).length,
        roads: Object.keys(index.roadWise || {}).length
      },
      free_storage: {
        github: 'data/map-directory/cell_*.json + index.json + search-index.json',
        vercel: 'public/data/map-directory/',
        indexedDB: 'mp-map-directory',
        search_index: 'Inverted index term -> place ids, fully indexable for AI',
        note: 'All free, no API key, OSRM+Nominatim+Overpass free'
      },
      spatial_system: {
        geohash: 'Precision 6 ~1.2km x 0.6km, 7 ~150m x 150m, hierarchical for AI distance queries',
        grid: '0.01° ~1.1km, 0.02° ~2.2km, 0.05° ~5.5km, latIdx_lngIdx key',
        lat_lng: 'WGS84, haversine for distance, OSRM for road distance',
        ai_usable: 'AI Mode can call this API via tool chaining, e.g., user asks distance, AI calls /api/kerala-ai?q=distance'
      },
      ai_integration: 'AI Mode (Codex-like) knows 577+ tools, can chain: search place -> get lat/lng -> distance -> nearby -> road -> traffic -> answer'
    });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Kerala AI failed' });
  }
}
