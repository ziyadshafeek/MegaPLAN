/**
 * Kerala Expansion Runner — finishes entire Kerala in 10 days from Trivandrum origin
 * Adaptive multi-resolution grid, parallel workers, multiple Overpass mirrors
 * 
 * Usage:
 * node scripts/kerala-expansion-runner.mjs --phase 1 --batch 20
 * node scripts/kerala-expansion-runner.mjs --kerala --batch 100 --workers 4
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phaseTasks } from '../lib/map-phase-grid.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { phase: null, batch: 20, workers: 2, kerala: false, start: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase') out.phase = Number(args[++i]);
    if (args[i] === '--batch') out.batch = Number(args[++i]);
    if (args[i] === '--workers') out.workers = Number(args[++i]);
    if (args[i] === '--kerala') out.kerala = true;
    if (args[i] === '--start') out.start = Number(args[++i]);
  }
  return out;
}

function loadExpansionPlan() {
  const p = path.join(root, 'data', 'map-directory', 'expansion-plan.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function fetchWithTimeout(url, opts = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': 'MegaPLAN-Kerala-Expansion/2.0', ...(opts.headers||{}) } });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

function ensureDir() {
  const dir = path.join(root, 'data', 'map-directory');
  const pub = path.join(root, 'public', 'data', 'map-directory');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(pub)) fs.mkdirSync(pub, { recursive: true });
}

function readIndex() {
  ensureDir();
  const f = path.join(root, 'data', 'map-directory', 'index.json');
  if (!fs.existsSync(f)) return { totalCells: 0, totalPlaces: 0, lastIndex: -1, cells: [] };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { totalCells: 0, cells: [] }; }
}

function writeIndex(idx) {
  ensureDir();
  fs.writeFileSync(path.join(root, 'data', 'map-directory', 'index.json'), JSON.stringify(idx, null, 2));
  fs.writeFileSync(path.join(root, 'public', 'data', 'map-directory', 'index.json'), JSON.stringify(idx, null, 2));
}

async function scanCellWithMirrors(index, grid, radius, center, mirrorIndex = 0) {
  // The queue already calculated the exact point. Never apply the spiral twice.
  const { lat, lng, dx = 0, dy = 0 } = center;

  const query = `[out:json][timeout:25];
(
  nwr["amenity"](around:${radius},${lat},${lng});
  nwr["shop"](around:${radius},${lat},${lng});
  nwr["tourism"](around:${radius},${lat},${lng});
  nwr["leisure"](around:${radius},${lat},${lng});
  nwr["office"](around:${radius},${lat},${lng});
  nwr["craft"](around:${radius},${lat},${lng});
);
out center 100;`;

  // Try mirrors in rotation for load balancing
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length; attempt++) {
    const mirror = OVERPASS_MIRRORS[(mirrorIndex + attempt) % OVERPASS_MIRRORS.length];
    try {
      const url = `${mirror}?data=${encodeURIComponent(query)}`;
      const r = await fetchWithTimeout(url, {}, 25000);
      if (!r.ok) throw Error(`Overpass ${mirror} ${r.status}`);
      const data = await r.json();
      const places = (data.elements || []).map(el => ({
        id: `${el.type}/${el.id}`,
        lat: el.lat || el.center?.lat,
        lng: el.lon || el.center?.lon,
        tags: el.tags || {},
        name: el.tags?.name || null,
        amenity: el.tags?.amenity || null,
        shop: el.tags?.shop || null,
        road: el.tags?.['addr:street'] || null
      })).filter(p => p.lat && p.lng);
      
      return { index, lat, lng, dx, dy, grid, radius, places, roads: [], mirror };
    } catch (e) {
      console.log(`  Mirror ${mirror} failed for cell ${index}: ${e.message}, trying next...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw Error(`All mirrors failed for cell ${index}`);
}

async function saveCell(cellData) {
  ensureDir();
  const dir = path.join(root, 'data', 'map-directory');
  const pub = path.join(root, 'public', 'data', 'map-directory');
  
  // Classification
  const businessGroups = {};
  const roadGroups = {};
  const religious = { mosque: [], church: [], temple: [], other: [] };
  
  for (const p of cellData.places) {
    const btype = p.amenity || p.shop || p.tourism || 'other';
    if (!businessGroups[btype]) businessGroups[btype] = [];
    businessGroups[btype].push(p.id);
    
    const road = p.road || 'Unknown Road';
    if (!roadGroups[road]) roadGroups[road] = [];
    roadGroups[road].push(p.id);
    
    const name = (p.name || '').toLowerCase();
    const rel = (p.tags?.religion || '').toLowerCase();
    const bld = (p.tags?.building || '').toLowerCase();
    if (p.amenity === 'place_of_worship' || bld === 'mosque' || bld === 'church' || bld === 'temple' || p.amenity === 'mosque' || p.amenity === 'church') {
      if (rel === 'muslim' || bld === 'mosque' || name.includes('mosque') || name.includes('masjid') || p.amenity === 'mosque') religious.mosque.push(p.id);
      else if (rel === 'christian' || bld === 'church' || name.includes('church')) religious.church.push(p.id);
      else if (rel === 'hindu' || bld === 'temple' || name.includes('temple')) religious.temple.push(p.id);
      else religious.other.push(p.id);
    }
  }

  const fullCell = {
    index: cellData.index,
    lat: cellData.lat,
    lng: cellData.lng,
    dx: cellData.dx,
    dy: cellData.dy,
    grid: cellData.grid,
    scannedAt: new Date().toISOString(),
    places: cellData.places,
    roads: cellData.roads || [],
    classification: { roadWise: roadGroups, businessWise: businessGroups, religious },
    stats: { placesCount: cellData.places.length, roadsCount: 0 },
    current: { lat: cellData.lat, lng: cellData.lng, index: cellData.index, dx: cellData.dx, dy: cellData.dy }
  };

  fs.writeFileSync(path.join(dir, `cell_${cellData.index}.json`), JSON.stringify(fullCell, null, 2));
  fs.writeFileSync(path.join(pub, `cell_${cellData.index}.json`), JSON.stringify(fullCell, null, 2));

  const idx = readIndex();
  if (!idx.cells) idx.cells = [];
  if (!idx.cells.includes(cellData.index)) idx.cells.push(cellData.index);
  idx.lastIndex = Math.max(idx.lastIndex ?? -1, cellData.index);
  idx.lastScannedAt = new Date().toISOString();
  idx.totalCells = idx.cells.length;
  idx.totalPlaces = (idx.totalPlaces || 0) + cellData.places.length;
  
  if (!idx.businessTypes) idx.businessTypes = {};
  for (const [k,v] of Object.entries(businessGroups)) idx.businessTypes[k] = (idx.businessTypes[k]||0)+v.length;
  if (!idx.roadWise) idx.roadWise = {};
  for (const [k,v] of Object.entries(roadGroups)) idx.roadWise[k] = (idx.roadWise[k]||0)+v.length;
  if (!idx.religious) idx.religious = { mosque:0, church:0, temple:0, other:0 };
  for (const [k,v] of Object.entries(religious)) if (idx.religious[k]!==undefined) idx.religious[k]+=v.length;

  writeIndex(idx);
  return fullCell;
}

async function runPhase(phase, batch, workers) {
  console.log(`\n=== Phase ${phase.phase}: ${phase.name} ===`);
  console.log(`BBOX: ${phase.bbox.latMin}-${phase.bbox.latMax}, ${phase.bbox.lngMin}-${phase.bbox.lngMax}, grid ${phase.grid}, radius ${phase.radius}, estimated ${phase.estimatedCells} cells`);

  const idx = readIndex();
  const previousPhases = (loadExpansionPlan()?.phases || []).filter(p => p.phase < phase.phase);
  const queue = phaseTasks(phase, previousPhases, idx.lastIndex, batch);
  console.log(`Phase queue: ${queue.length} cells, next index ${queue[0]?.index ?? 'none'}; workers ${workers}`);

  console.log(`Queue: ${queue.length} cells`);
  if (!queue.length) { console.log('No unscanned grid positions remain in this phase.'); return { completed: 0, totalPlaces: 0 }; }

  // Parallel workers
  let completed = 0;
  let totalPlaces = 0;

  async function worker(workerId) {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        console.log(`[Worker ${workerId}] Scanning cell ${task.index} at ${task.lat.toFixed(4)},${task.lng.toFixed(4)} grid ${task.grid}`);
        const result = await scanCellWithMirrors(task.index, task.grid, task.radius, task.center, workerId);
        await saveCell(result);
        completed++;
        totalPlaces += result.places.length;
        console.log(`[Worker ${workerId}] Cell ${task.index} done: ${result.places.length} places, total ${completed}/${batch}`);
      } catch (e) {
        console.log(`[Worker ${workerId}] Cell ${task.index} failed: ${e.message}`);
      }
      // Be nice to Overpass
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  const workerPromises = [];
  for (let w = 0; w < workers; w++) {
    workerPromises.push(worker(w));
  }
  await Promise.all(workerPromises);

  console.log(`\nPhase ${phase.phase} done: ${completed} cells, ${totalPlaces} places`);
  if (!completed) throw Error(`No verified cells in phase ${phase.phase}; all Overpass mirrors failed.`);
  return { completed, totalPlaces };
}

async function main() {
  const args = parseArgs();
  const plan = loadExpansionPlan();
  if (!plan) {
    console.log('No expansion plan found');
    return;
  }

  console.log('Kerala Expansion Runner — 10 days to finish Kerala from Trivandrum');
  console.log(`Args: phase=${args.phase}, batch=${args.batch}, workers=${args.workers}, kerala=${args.kerala}`);

  ensureDir();

  if (args.phase) {
    const phase = plan.phases.find(p => p.phase === args.phase);
    if (!phase) {
      console.log(`Phase ${args.phase} not found`);
      return;
    }
    await runPhase(phase, args.batch, args.workers);
  } else if (args.kerala) {
    // Run all Kerala phases up to 10 days
    for (const phase of plan.phases) {
      if (phase.phase <= 8) {
        await runPhase(phase, args.batch, args.workers);
        console.log('Waiting 10s between phases...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  } else {
    // Default: run next phase based on current progress
    const idx = readIndex();
    const totalCells = idx.totalCells || 0;
    // Determine phase by total cells
    let currentPhase = 1;
    let cumulative = 0;
    for (const phase of plan.phases) {
      cumulative += phase.estimatedCells;
      if (totalCells < cumulative) {
        currentPhase = phase.phase;
        break;
      }
    }
    console.log(`Current total cells: ${totalCells}, determined phase: ${currentPhase}`);
    const phase = plan.phases.find(p => p.phase === currentPhase);
    if (phase) await runPhase(phase, args.batch, args.workers);
  }

  const finalIdx = readIndex();
  console.log('\n=== Final Stats ===');
  console.log(JSON.stringify({ totalCells: finalIdx.totalCells, totalPlaces: finalIdx.totalPlaces, lastIndex: finalIdx.lastIndex, businessTypes: Object.keys(finalIdx.businessTypes||{}).length, roads: Object.keys(finalIdx.roadWise||{}).length, religious: finalIdx.religious }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
