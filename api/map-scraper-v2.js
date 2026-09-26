/**
 * Map Scraper V2 — Massive scrapping, all business info, railways, roads, spatial index
 * Free, no API key, fully indexable for AI multi-tool
 * 
 * Features:
 * - All business info: not only names, but all OSM tags (opening_hours, phone, website, cuisine, religion, operator, brand, building, levels, wheelchair, etc)
 * - Railways: way["railway"], node["railway"="station"], public_transport
 * - Roads: way["highway"] with full tags: name, highway type, maxspeed, surface, lanes, oneway, bridge, tunnel, nodes, length
 * - Spatial index: geohash6, geohash7, grid01, grid02, grid05, latIdx, lngIdx
 * - Traffic estimate: heuristic based on highway type + time of day + maxspeed + signals
 * - Free storage: GitHub + Vercel static + IndexedDB + search-index
 * - AI indexable: full JSON with all tags, searchable
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

async function fetchWithTimeout(url, opts = {}, timeout = 20000) {
  // Use central rate limiter for Overpass
  try {
    const { makeRateLimitedRequest } = await import('./rate-limiter.js');
    const r = await makeRateLimitedRequest('overpass', url, opts, timeout);
    return r;
  } catch {
    // Fallback to direct fetch with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'User-Agent': 'MegaPLAN-MapScraper-V2/2.0 (https://mega-plan.vercel.app) - Massive directory',
          'Accept-Language': 'en',
          ...(opts.headers || {})
        }
      });
      return r;
    } finally {
      clearTimeout(timer);
    }
  }
}

const CENTER = { lat: 8.524139, lng: 76.936638 };
const STEP_DEG = 0.01;

// Geohash implementation (simple)
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
    if (++bit === 5) {
      hash += base32[idx];
      bit = 0; idx = 0;
    }
  }
  return hash;
}

function spiralToCoords(index) {
  if (index === 0) return { dx: 0, dy: 0 };
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < index; i++) {
    if ((x === y) || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const tmp = dx; dx = -dy; dy = tmp;
    }
    x += dx; y += dy;
  }
  return { dx: x, dy: y };
}

function coordsToLatLng(index, center = CENTER, step = STEP_DEG) {
  const { dx, dy } = spiralToCoords(index);
  return { lat: center.lat + dy * step, lng: center.lng + dx * step, dx, dy, index };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estimateTraffic(highway, maxspeed, hour) {
  // Heuristic traffic estimation
  const baseSpeed = {
    motorway: 100, trunk: 80, primary: 60, secondary: 50, tertiary: 40,
    unclassified: 30, residential: 30, living_street: 20, service: 20,
    footway: 5, path: 5, track: 15, road: 30
  }[highway] || 30;
  
  const speed = maxspeed ? Number(maxspeed) || baseSpeed : baseSpeed;
  
  // Rush hour factor
  let congestion = 1.0;
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    congestion = 0.6; // 40% slower in rush hour
  } else if (hour >= 11 && hour <= 16) {
    congestion = 0.85;
  } else if (hour >= 21 || hour <= 6) {
    congestion = 1.1; // faster at night
  }
  
  return {
    typical_speed: speed,
    current_estimate: Math.round(speed * congestion),
    congestion_factor: Number(congestion.toFixed(2)),
    hour,
    estimated: true,
    note: 'Heuristic based on highway type + time of day, not live traffic. For live, need TomTom/Google API key.'
  };
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

  const body = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries()) : readBody(req);
  
  let lat = Number(body.lat);
  let lng = Number(body.lng);
  let index = Number(body.index || 0);
  const radius = Number(body.radius || 1000);
  const step = Number(body.step || STEP_DEG);
  const includeRailways = body.railways !== 'false';
  const includeRoads = body.roads !== 'false';

  if (!lat || !lng) {
    const pos = coordsToLatLng(index, CENTER, step);
    lat = pos.lat; lng = pos.lng;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json(res, 400, { error: 'Invalid lat/lng' });
  }

  const startTime = Date.now();
  let places = [];
  let roads = [];
  let railways = [];
  let railwayStations = [];
  let errors = [];

  const currentHour = new Date().getHours();

  try {
    // Query 1: All businesses with ALL tags (massive scrapping)
    const placesQuery = `[out:json][timeout:30];
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
  nwr["building"~"^(mosque|church|temple|school|hospital|hotel|retail|commercial|yes)$"](around:${radius},${lat},${lng});
  nwr["name"](around:${radius},${lat},${lng});
);
out center 150;`;

    const placesUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(placesQuery)}`;
    try {
      const r = await fetchWithTimeout(placesUrl, {}, 25000);
      if (!r.ok) throw Error(`Overpass places ${r.status}`);
      const data = await r.json();
      places = (data.elements || []).map(el => {
        const clat = el.lat || el.center?.lat;
        const clng = el.lon || el.center?.lon;
        if (!clat || !clng) return null;
        
        // Full business info - ALL tags
        const tags = el.tags || {};
        return {
          id: `${el.type}/${el.id}`,
          osm_id: el.id,
          osm_type: el.type,
          lat: clat,
          lng: clng,
          // Spatial index
          geohash6: encodeGeohash(clat, clng, 6),
          geohash7: encodeGeohash(clat, clng, 7),
          grid01: `${Math.floor(clat/0.01)}_${Math.floor(clng/0.01)}`,
          grid02: `${Math.floor(clat/0.02)}_${Math.floor(clng/0.02)}`,
          grid05: `${Math.floor(clat/0.05)}_${Math.floor(clng/0.05)}`,
          latIdx: Math.floor(clat/0.01),
          lngIdx: Math.floor(clng/0.01),
          // Basic
          name: tags.name || null,
          name_en: tags['name:en'] || null,
          amenity: tags.amenity || null,
          shop: tags.shop || null,
          tourism: tags.tourism || null,
          leisure: tags.leisure || null,
          office: tags.office || null,
          craft: tags.craft || null,
          // Full address
          road: tags['addr:street'] || null,
          housenumber: tags['addr:housenumber'] || null,
          city: tags['addr:city'] || null,
          postcode: tags['addr:postcode'] || null,
          state: tags['addr:state'] || null,
          country: tags['addr:country'] || null,
          full_address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ') || null,
          // Contact & business details
          phone: tags.phone || tags['contact:phone'] || null,
          email: tags.email || tags['contact:email'] || null,
          website: tags.website || tags['contact:website'] || null,
          facebook: tags['contact:facebook'] || null,
          opening_hours: tags.opening_hours || null,
          cuisine: tags.cuisine || null,
          diet: tags['diet:vegetarian'] ? { vegetarian: tags['diet:vegetarian'], vegan: tags['diet:vegan'] } : null,
          // Religious
          religion: tags.religion || null,
          denomination: tags.denomination || null,
          // Business specifics
          operator: tags.operator || null,
          brand: tags.brand || null,
          building: tags.building || null,
          building_levels: tags['building:levels'] || null,
          // Accessibility & features
          wheelchair: tags.wheelchair || null,
          smoking: tags.smoking || null,
          outdoor_seating: tags.outdoor_seating || null,
          takeaway: tags.takeaway || null,
          delivery: tags.delivery || null,
          internet_access: tags.internet_access || null,
          // All tags for massive scrapping
          tags: tags,
          // Distance
          distance: haversine(lat, lng, clat, clng),
          // For AI indexable
          searchable_text: `${tags.name||''} ${tags.amenity||''} ${tags.shop||''} ${tags.tourism||''} ${tags['addr:street']||''} ${tags['addr:city']||''} ${tags.cuisine||''} ${tags.religion||''} ${tags.operator||''} ${tags.brand||''}`.toLowerCase()
        };
      }).filter(Boolean);
    } catch (e) {
      errors.push(`places: ${e.message}`);
      // Fallback seed
      const distToCenter = haversine(lat, lng, CENTER.lat, CENTER.lng);
      if (distToCenter < 20) {
        try {
          const fs = await import('node:fs');
          const path = await import('node:path');
          const { fileURLToPath } = await import('node:url');
          const here = path.dirname(fileURLToPath(import.meta.url));
          const seedPath = path.join(here, '..', 'data', 'map-directory', 'seed.json');
          if (fs.existsSync(seedPath)) {
            const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
            places = (seed.seedPlaces || []).filter(p => haversine(lat, lng, p.lat, p.lng) < radius/1000 + 2).map(p => ({
              ...p,
              geohash6: encodeGeohash(p.lat, p.lng, 6),
              geohash7: encodeGeohash(p.lat, p.lng, 7),
              grid01: `${Math.floor(p.lat/0.01)}_${Math.floor(p.lng/0.01)}`,
              distance: haversine(lat, lng, p.lat, p.lng),
              searchable_text: `${p.name||''} ${p.amenity||''}`.toLowerCase(),
              tags: p.tags || {}
            }));
          }
        } catch {}
      }
    }

    // Query 2: Roads with full details
    if (includeRoads) {
      const roadsQuery = `[out:json][timeout:20];
(
  way["highway"](around:${radius},${lat},${lng});
);
out geom 100;`;

      const roadsUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(roadsQuery)}`;
      try {
        const r = await fetchWithTimeout(roadsUrl, {}, 20000);
        if (r.ok) {
          const data = await r.json();
          roads = (data.elements || []).map(el => {
            const tags = el.tags || {};
            // Calculate length from geometry
            let length = 0;
            if (el.geometry) {
              for (let i = 1; i < el.geometry.length; i++) {
                length += haversine(el.geometry[i-1].lat, el.geometry[i-1].lon, el.geometry[i].lat, el.geometry[i].lon);
              }
            }
            return {
              id: el.id,
              osm_id: el.id,
              name: tags.name || tags.ref || null,
              highway: tags.highway || null,
              maxspeed: tags.maxspeed || null,
              surface: tags.surface || null,
              lanes: tags.lanes || null,
              oneway: tags.oneway || null,
              bridge: tags.bridge || null,
              tunnel: tags.tunnel || null,
              lit: tags.lit || null,
              sidewalk: tags.sidewalk || null,
              bicycle: tags.bicycle || null,
              foot: tags.foot || null,
              access: tags.access || null,
              ref: tags.ref || null,
              operator: tags.operator || null,
              // Geometry
              nodes: el.nodes?.length || 0,
              geometry: el.geometry ? el.geometry.slice(0, 20).map(g => ({ lat: g.lat, lng: g.lon })) : null, // first 20 points
              length_km: Number(length.toFixed(3)),
              // Spatial
              geohash6: el.geometry && el.geometry[0] ? encodeGeohash(el.geometry[0].lat, el.geometry[0].lon, 6) : null,
              bbox: el.bounds ? { minlat: el.bounds.minlat, minlon: el.bounds.minlon, maxlat: el.bounds.maxlat, maxlon: el.bounds.maxlon } : null,
              // Traffic estimate
              traffic: estimateTraffic(tags.highway, tags.maxspeed, currentHour),
              // All tags
              tags: tags,
              searchable_text: `${tags.name||''} ${tags.highway||''} ${tags.ref||''}`.toLowerCase()
            };
          }).filter(r => r.name || r.highway);
        }
      } catch (e) {
        errors.push(`roads: ${e.message}`);
      }
    }

    // Query 3: Railways
    if (includeRailways) {
      const railwayQuery = `[out:json][timeout:20];
(
  way["railway"](around:${radius},${lat},${lng});
  node["railway"~"^(station|halt|tram_stop|subway_entrance)$"](around:${radius},${lat},${lng});
  node["public_transport"="station"](around:${radius},${lat},${lng});
);
out center 100;`;

      const railwayUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(railwayQuery)}`;
      try {
        const r = await fetchWithTimeout(railwayUrl, {}, 20000);
        if (r.ok) {
          const data = await r.json();
          for (const el of (data.elements || [])) {
            const tags = el.tags || {};
            const clat = el.lat || el.center?.lat;
            const clng = el.lon || el.center?.lon;
            if (el.type === 'way' && tags.railway) {
              railways.push({
                id: el.id,
                osm_id: el.id,
                osm_type: 'way',
                name: tags.name || null,
                railway: tags.railway,
                electrified: tags.electrified || null,
                gauge: tags.gauge || null,
                operator: tags.operator || null,
                usage: tags.usage || null,
                service: tags.service || null,
                maxspeed: tags.maxspeed || null,
                lat: clat,
                lng: clng,
                geohash6: clat && clng ? encodeGeohash(clat, clng, 6) : null,
                length_km: 0, // would need geometry
                tags: tags,
                searchable_text: `${tags.name||''} ${tags.railway||''}`.toLowerCase()
              });
            } else if (tags.railway === 'station' || tags.railway === 'halt' || tags.public_transport === 'station') {
              railwayStations.push({
                id: `${el.type}/${el.id}`,
                osm_id: el.id,
                osm_type: el.type,
                name: tags.name || null,
                railway: tags.railway || null,
                public_transport: tags.public_transport || null,
                operator: tags.operator || null,
                network: tags.network || null,
                lat: clat,
                lng: clng,
                geohash6: clat && clng ? encodeGeohash(clat, clng, 6) : null,
                distance: clat && clng ? haversine(lat, lng, clat, clng) : null,
                tags: tags,
                searchable_text: `${tags.name||''} ${tags.railway||''} station`.toLowerCase()
              });
            }
          }
        }
      } catch (e) {
        errors.push(`railways: ${e.message}`);
      }
    }

    // Classification
    const businessGroups = {};
    const roadGroups = {};
    const religious = { mosque: [], church: [], temple: [], other: [] };
    
    for (const p of places) {
      const btype = p.amenity || p.shop || p.tourism || p.leisure || p.office || 'other';
      if (!businessGroups[btype]) businessGroups[btype] = [];
      businessGroups[btype].push(p.id);
      
      const roadName = p.road || 'Unknown Road';
      if (!roadGroups[roadName]) roadGroups[roadName] = [];
      roadGroups[roadName].push(p.id);

      const name = (p.name || '').toLowerCase();
      const rel = (p.religion || '').toLowerCase();
      const bld = (p.building || '').toLowerCase();
      if (p.tags?.amenity === 'place_of_worship' || bld === 'mosque' || bld === 'church' || bld === 'temple' || p.amenity === 'mosque' || p.amenity === 'church' || p.amenity === 'temple') {
        if (rel === 'muslim' || bld === 'mosque' || name.includes('mosque') || name.includes('masjid') || p.amenity === 'mosque') religious.mosque.push(p.id);
        else if (rel === 'christian' || bld === 'church' || name.includes('church')) religious.church.push(p.id);
        else if (rel === 'hindu' || bld === 'temple' || name.includes('temple') || name.includes('kovil')) religious.temple.push(p.id);
        else religious.other.push(p.id);
      }
    }

    const nextIndex = index + 1;
    const nextPos = coordsToLatLng(nextIndex, CENTER, step);

    return json(res, 200, {
      ok: true,
      version: 2,
      center: CENTER,
      current: { lat, lng, index, dx: spiralToCoords(index).dx, dy: spiralToCoords(index).dy, geohash6: encodeGeohash(lat, lng, 6), grid01: `${Math.floor(lat/0.01)}_${Math.floor(lng/0.01)}` },
      next: { lat: nextPos.lat, lng: nextPos.lng, index: nextIndex, geohash6: encodeGeohash(nextPos.lat, nextPos.lng, 6) },
      stats: {
        scannedAt: new Date().toISOString(),
        placesCount: places.length,
        roadsCount: roads.length,
        railwaysCount: railways.length,
        stationsCount: railwayStations.length,
        businessTypes: Object.keys(businessGroups).length,
        roadTypes: Object.keys(roadGroups).length,
        durationMs: Date.now() - startTime,
        errors,
        radius,
        grid: step
      },
      places,
      roads,
      railways,
      railwayStations,
      classification: {
        roadWise: roadGroups,
        businessWise: businessGroups,
        religious
      },
      spatial: {
        geohash6: encodeGeohash(lat, lng, 6),
        geohash7: encodeGeohash(lat, lng, 7),
        grid01: `${Math.floor(lat/0.01)}_${Math.floor(lng/0.01)}`,
        grid02: `${Math.floor(lat/0.02)}_${Math.floor(lng/0.02)}`,
        grid05: `${Math.floor(lat/0.05)}_${Math.floor(lng/0.05)}`
      },
      freeStorage: {
        github: `data/map-directory/cell_${index}.json`,
        vercelStatic: `public/data/map-directory/cell_${index}.json`,
        indexedDB: `mp-map-directory cells/${index}`,
        searchIndex: `Will be added to search-index.json`,
        note: 'All data free, no API key, fully indexable for AI multi-tool'
      }
    });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Scraper V2 failed', current: { lat, lng, index } });
  }
}
