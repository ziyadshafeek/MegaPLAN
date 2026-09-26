/**
 * Map Scraper Runner — for GitHub Actions
 * Scans N cells from Trivandrum origin via Overpass API, saves to data/map-directory/
 * Free, no API key for OSM. Uses NVIDIA AI if key present.
 * Usage: node scripts/map-scraper-runner.mjs --start 0 --batch 10
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dirPath = path.join(root, 'data', 'map-directory');
const pubDirPath = path.join(root, 'public', 'data', 'map-directory');

const CENTER = { lat: 8.524139, lng: 76.936638 };
const STEP_DEG = 0.01;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { start: 0, batch: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start') out.start = Number(args[++i]);
    if (args[i] === '--batch') out.batch = Number(args[++i]);
  }
  return out;
}

function spiralToCoords(index) {
  if (index === 0) return { dx: 0, dy: 0 };
  let x = 0, y = 0;
  let dx = 0, dy = -1;
  for (let i = 0; i < index; i++) {
    if ((x === y) || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
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
  return { lat: center.lat + dy * step, lng: center.lng + dx * step, dx, dy, index };
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function fetchWithTimeout(url, opts = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': 'MegaPLAN-MapScraper-GitHubAction/1.0', ...(opts.headers||{}) } });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

function ensureDir() {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  if (!fs.existsSync(pubDirPath)) fs.mkdirSync(pubDirPath, { recursive: true });
}

function readIndex() {
  ensureDir();
  const f = path.join(dirPath, 'index.json');
  if (!fs.existsSync(f)) return { version: 1, center: { ...CENTER, name: 'Trivandrum' }, totalCells: 0, totalPlaces: 0, totalRoads: 0, lastIndex: -1, lastScannedAt: null, businessTypes: {}, roadWise: {}, religious: { mosque: 0, church: 0, temple: 0, other: 0 }, cells: [] };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { totalCells: 0, totalPlaces: 0, cells: [] }; }
}

function writeIndex(idx) {
  ensureDir();
  fs.writeFileSync(path.join(dirPath, 'index.json'), JSON.stringify(idx, null, 2));
  fs.writeFileSync(path.join(pubDirPath, 'index.json'), JSON.stringify(idx, null, 2));
}

async function scanCell(index) {
  const pos = coordsToLatLng(index);
  const lat = pos.lat, lng = pos.lng;
  const radius = 600;

  console.log(`\n[Cell ${index}] Scanning ${lat.toFixed(5)},${lng.toFixed(5)} dx=${pos.dx} dy=${pos.dy} radius=${radius}m`);

  let places = [];
  let roads = [];

  // Places query
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
);
out center 100;`;

  try {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(placesQuery)}`;
    const r = await fetchWithTimeout(url, {}, 25000);
    if (!r.ok) throw Error(`Overpass places ${r.status}`);
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
        road: el.tags?.['addr:street'] || null,
        distance: clat && clng ? haversine(lat, lng, clat, clng) : null
      };
    }).filter(p => p.lat && p.lng);
    console.log(`  Places: ${places.length}`);
  } catch (e) {
    console.log(`  Places error: ${e.message}`);
  }

  // Roads query
  const roadsQuery = `[out:json][timeout:15];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)$"](around:${radius},${lat},${lng});
);
out 100;`;

  try {
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(roadsQuery)}`;
    const r = await fetchWithTimeout(url, {}, 15000);
    if (r.ok) {
      const data = await r.json();
      roads = (data.elements || []).map(el => ({
        id: el.id,
        name: el.tags?.name || el.tags?.ref || null,
        highway: el.tags?.highway,
        tags: el.tags || {}
      })).filter(r => r.name);
      console.log(`  Roads: ${roads.length}`);
    }
  } catch (e) {
    console.log(`  Roads error: ${e.message}`);
  }

  // Classification
  const businessGroups = {};
  const roadGroups = {};
  const religious = { mosque: [], church: [], temple: [], other: [] };

  for (const p of places) {
    const btype = p.amenity || p.shop || p.tourism || 'other';
    if (!businessGroups[btype]) businessGroups[btype] = [];
    businessGroups[btype].push(p.id);

    const roadName = p.road || 'Unknown Road';
    if (!roadGroups[roadName]) roadGroups[roadName] = [];
    roadGroups[roadName].push(p.id);

    if (p.tags?.amenity === 'place_of_worship' || p.tags?.building === 'mosque' || p.tags?.building === 'church' || p.tags?.building === 'temple' || p.amenity === 'mosque' || p.amenity === 'church') {
      const name = (p.name || '').toLowerCase();
      const rel = (p.tags?.religion || '').toLowerCase();
      const bld = (p.tags?.building || '').toLowerCase();
      if (rel === 'muslim' || bld === 'mosque' || name.includes('mosque') || name.includes('masjid') || p.amenity === 'mosque') religious.mosque.push(p.id);
      else if (rel === 'christian' || bld === 'church' || name.includes('church') || p.amenity === 'church') religious.church.push(p.id);
      else if (rel === 'hindu' || bld === 'temple' || name.includes('temple') || name.includes('kovil')) religious.temple.push(p.id);
      else religious.other.push(p.id);
    }
  }

  const cellData = {
    index,
    lat,
    lng,
    dx: pos.dx,
    dy: pos.dy,
    scannedAt: new Date().toISOString(),
    places,
    roads,
    classification: {
      roadWise: roadGroups,
      businessWise: businessGroups,
      religious
    },
    stats: {
      placesCount: places.length,
      roadsCount: roads.length
    },
    current: { lat, lng, index, dx: pos.dx, dy: pos.dy }
  };

  // Save
  ensureDir();
  fs.writeFileSync(path.join(dirPath, `cell_${index}.json`), JSON.stringify(cellData, null, 2));
  fs.writeFileSync(path.join(pubDirPath, `cell_${index}.json`), JSON.stringify(cellData, null, 2));

  // Update index
  const idx = readIndex();
  if (!idx.cells) idx.cells = [];
  if (!idx.cells.includes(index)) idx.cells.push(index);
  idx.lastIndex = Math.max(idx.lastIndex ?? -1, index);
  idx.lastScannedAt = new Date().toISOString();
  idx.totalCells = idx.cells.length;
  idx.totalPlaces = (idx.totalPlaces || 0) + places.length;
  idx.totalRoads = (idx.totalRoads || 0) + roads.length;

  if (!idx.businessTypes) idx.businessTypes = {};
  for (const [k, v] of Object.entries(businessGroups)) {
    idx.businessTypes[k] = (idx.businessTypes[k] || 0) + v.length;
  }
  if (!idx.roadWise) idx.roadWise = {};
  for (const [k, v] of Object.entries(roadGroups)) {
    idx.roadWise[k] = (idx.roadWise[k] || 0) + v.length;
  }
  if (!idx.religious) idx.religious = { mosque: 0, church: 0, temple: 0, other: 0 };
  for (const [k, v] of Object.entries(religious)) {
    if (idx.religious[k] !== undefined) idx.religious[k] += v.length;
  }

  writeIndex(idx);

  console.log(`  Saved cell ${index}, total cells ${idx.totalCells}, places ${idx.totalPlaces}`);

  // AI classification if key present
  if (process.env.NVIDIA_API_KEY && places.length > 0) {
    try {
      const sample = places.slice(0, 15).map(p => ({ name: p.name, amenity: p.amenity, shop: p.shop, road: p.road, tags: p.tags }));
      const prompt = `Classify these places from Trivandrum cell ${index} into road-wise and business-wise sections. Sample: ${JSON.stringify(sample).slice(0, 3000)}. Return JSON with new sections if any, keep short.`;
      // Call NVIDIA API directly
      const model = process.env.NVIDIA_AGENT_MODEL || 'deepseek-ai/deepseek-v4.1-flash';
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are map directory AI classifier. Classify roads, business types like mosque, restaurant, etc. Create new sections automatically. Return JSON only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      });
      if (res.ok) {
        const j = await res.json();
        const txt = j.choices?.[0]?.message?.content || '';
        console.log(`  AI classification: ${txt.slice(0, 200)}…`);
        // Save AI result
        const aiFile = path.join(dirPath, `cell_${index}_ai.json`);
        fs.writeFileSync(aiFile, JSON.stringify({ index, ai: txt, sample }, null, 2));
      }
    } catch (e) {
      console.log(`  AI error: ${e.message}`);
    }
  }

  return cellData;
}

async function main() {
  const { start, batch } = parseArgs();
  console.log(`Map Scraper Runner — Trivandrum origin ${CENTER.lat},${CENTER.lng} — start ${start} batch ${batch}`);

  ensureDir();

  for (let i = 0; i < batch; i++) {
    const idx = start + i;
    try {
      await scanCell(idx);
    } catch (e) {
      console.log(`Failed cell ${idx}: ${e.message}`);
    }
    if (i < batch - 1) {
      console.log('Waiting 5s to be nice to Overpass…');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\nDone. Index:');
  const idx = readIndex();
  console.log(JSON.stringify({ totalCells: idx.totalCells, totalPlaces: idx.totalPlaces, lastIndex: idx.lastIndex, businessTypes: Object.keys(idx.businessTypes||{}).length, roads: Object.keys(idx.roadWise||{}).length, religious: idx.religious }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
