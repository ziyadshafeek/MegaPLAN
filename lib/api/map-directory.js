import { ingestionError } from '../ingest-auth.js';
/**
 * Map Directory API — aggregated view of massive directory map
 * GET /api/map-directory?action=stats|search|road|business|religious|grid
 * POST to add scanned data (for GitHub Action or client)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const dirPath = path.join(root, 'data', 'map-directory');

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

function ensureDir() {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readIndex() {
  ensureDir();
  const idxFile = path.join(dirPath, 'index.json');
  if (!fs.existsSync(idxFile)) {
    return {
      version: 1,
      center: { lat: 8.524139, lng: 76.936638, name: 'Trivandrum' },
      totalCells: 0,
      totalPlaces: 0,
      totalRoads: 0,
      lastIndex: -1,
      lastScannedAt: null,
      businessTypes: {},
      roadWise: {},
      religious: { mosque: 0, church: 0, temple: 0, other: 0 },
      cells: []
    };
  }
  try {
    return JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  } catch {
    return { totalCells: 0, totalPlaces: 0, cells: [] };
  }
}

function writeIndex(idx) {
  ensureDir();
  fs.writeFileSync(path.join(dirPath, 'index.json'), JSON.stringify(idx, null, 2));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || 'stats';
  const q = (url.searchParams.get('q') || '').toLowerCase();

  if (req.method === 'GET') {
    const index = readIndex();

    if (action === 'stats') {
      return json(res, 200, { ok: true, index });
    }

    if (action === 'grid') {
      const idx = Number(url.searchParams.get('index') || 0);
      const file = path.join(dirPath, `cell_${idx}.json`);
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Cell not found', index: idx });
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return json(res, 200, { ok: true, cell: data });
    }

    if (action === 'search') {
      if (!q) return json(res, 400, { error: 'Enter q' });
      // Search across all cell files (limited)
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('cell_')).slice(-100); // last 100 cells
      let results = [];
      for (const f of files) {
        try {
          const cell = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (cell.places || []).filter(p => {
            const name = (p.name || '').toLowerCase();
            const tags = JSON.stringify(p.tags || {}).toLowerCase();
            return name.includes(q) || tags.includes(q);
          });
          results.push(...matches.slice(0, 20));
          if (results.length >= 100) break;
        } catch {}
      }
      return json(res, 200, { ok: true, q, count: results.length, results: results.slice(0, 100) });
    }

    if (action === 'road') {
      const roadName = url.searchParams.get('road') || '';
      if (!roadName) {
        // Return all roads summary
        return json(res, 200, { ok: true, roads: index.roadWise || {} });
      }
      // Search for road
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('cell_')).slice(-200);
      let places = [];
      for (const f of files) {
        try {
          const cell = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (cell.places || []).filter(p => (p.road || '').toLowerCase().includes(roadName.toLowerCase()));
          places.push(...matches);
          if (places.length >= 200) break;
        } catch {}
      }
      return json(res, 200, { ok: true, road: roadName, count: places.length, places: places.slice(0, 200) });
    }

    if (action === 'business') {
      const type = url.searchParams.get('type') || '';
      if (!type) {
        return json(res, 200, { ok: true, businessTypes: index.businessTypes || {} });
      }
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('cell_')).slice(-200);
      let places = [];
      for (const f of files) {
        try {
          const cell = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (cell.places || []).filter(p => {
            const btype = (p.amenity || p.shop || p.tourism || p.leisure || p.office || 'other').toLowerCase();
            return btype.includes(type.toLowerCase());
          });
          places.push(...matches);
          if (places.length >= 200) break;
        } catch {}
      }
      return json(res, 200, { ok: true, type, count: places.length, places: places.slice(0, 200) });
    }

    if (action === 'religious') {
      return json(res, 200, { ok: true, religious: index.religious || {} });
    }

    return json(res, 400, { error: 'Unknown action' });
  }

  // POST — add scanned cell
  if (req.method === 'POST') {
    const denied = ingestionError(req);
    if (denied) return json(res, denied.status, { error: denied.error });
    const body = readBody(req);
    const cell = body.cell || body;
    if (!cell || typeof cell.current === 'undefined') {
      // Allow direct cell data from scraper
      if (!body.places) return json(res, 400, { error: 'Invalid cell data' });
    }

    ensureDir();
    const idx = cell.current?.index ?? cell.index ?? 0;
    const file = path.join(dirPath, `cell_${idx}.json`);
    
    // Merge or write
    const toSave = {
      index: idx,
      lat: cell.current?.lat ?? cell.lat,
      lng: cell.current?.lng ?? cell.lng,
      scannedAt: new Date().toISOString(),
      places: cell.places || [],
      roads: cell.roads || [],
      classification: cell.classification || {},
      stats: cell.stats || {}
    };

    fs.writeFileSync(file, JSON.stringify(toSave, null, 2));

    // Update index
    const index = readIndex();
    index.totalCells = (index.cells?.length || 0) + 1;
    if (!index.cells) index.cells = [];
    if (!index.cells.includes(idx)) index.cells.push(idx);
    index.lastIndex = Math.max(index.lastIndex || -1, idx);
    index.lastScannedAt = new Date().toISOString();
    index.totalPlaces = (index.totalPlaces || 0) + (toSave.places.length || 0);
    index.totalRoads = (index.totalRoads || 0) + (toSave.roads.length || 0);

    // Merge business types
    if (!index.businessTypes) index.businessTypes = {};
    for (const [k, v] of Object.entries(toSave.classification?.businessWise || {})) {
      index.businessTypes[k] = (index.businessTypes[k] || 0) + (Array.isArray(v) ? v.length : 0);
    }

    // Merge roadWise
    if (!index.roadWise) index.roadWise = {};
    for (const [k, v] of Object.entries(toSave.classification?.roadWise || {})) {
      index.roadWise[k] = (index.roadWise[k] || 0) + (Array.isArray(v) ? v.length : 0);
    }

    // Religious
    if (!index.religious) index.religious = { mosque: 0, church: 0, temple: 0, other: 0 };
    for (const [k, v] of Object.entries(toSave.classification?.religious || {})) {
      if (index.religious[k] !== undefined) {
        index.religious[k] += Array.isArray(v) ? v.length : 0;
      }
    }

    writeIndex(index);

    // Also mirror to public/data for frontend
    try {
      const pubDir = path.join(root, 'public', 'data', 'map-directory');
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      fs.writeFileSync(path.join(pubDir, `cell_${idx}.json`), JSON.stringify(toSave, null, 2));
      fs.writeFileSync(path.join(pubDir, 'index.json'), JSON.stringify(index, null, 2));
    } catch (e) {
      // ignore
    }

    return json(res, 200, { ok: true, saved: idx, index });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
