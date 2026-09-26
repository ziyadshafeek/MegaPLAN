/**
 * Read-only status for published map, product, and music directory snapshots.
 * Workflow definitions are present; this does not verify their last run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
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
  const action = url.searchParams.get('action') || 'status';

  if (action === 'status' && req.method === 'GET') {
    // Check status of all scrapers
    const statuses = {};
    
    try {
      const mapIdxPath = path.join(root, 'data', 'map-directory', 'index.json');
      if (fs.existsSync(mapIdxPath)) {
        const idx = JSON.parse(fs.readFileSync(mapIdxPath, 'utf8'));
        statuses.map = { totalCells: idx.totalCells, totalPlaces: idx.totalPlaces, lastIndex: idx.lastIndex, keralaPercent: Number((idx.totalCells/17000*100).toFixed(1)) };
      }
    } catch {}
    
    try {
      const prodIdxPath = path.join(root, 'data', 'product-directory', 'index.json');
      if (fs.existsSync(prodIdxPath)) {
        const idx = JSON.parse(fs.readFileSync(prodIdxPath, 'utf8'));
        statuses.product = { totalProducts: idx.totalProducts, categories: Object.keys(idx.categories||{}).length };
      }
    } catch {}
    
    try {
      const musicIdxPath = path.join(root, 'data', 'music-directory', 'index.json');
      if (fs.existsSync(musicIdxPath)) {
        const idx = JSON.parse(fs.readFileSync(musicIdxPath, 'utf8'));
        statuses.music = { totalTracks: idx.totalTracks };
      }
    } catch {}

    return json(res, 200, {
      ok: true,
      source: 'repository snapshot; scheduled jobs are not verified by this endpoint',
      status: statuses,
      auto_runners: {
        map: 'Scheduled GitHub workflow (subject to job success and service availability)',
        product: 'Scheduled GitHub workflow (subject to job success and service availability)',
        music: 'Scheduled GitHub workflow (subject to job success and service availability)'
      },
      free_storage: 'GitHub repository data and published public/data snapshot',
      next: 'Read-only website; indexing runs in scheduled repository jobs'
    });
  }

  if (action === 'run') return json(res, 405, { error: 'Website indexing is read-only. Scheduled repository jobs publish updated datasets.' });
  return json(res, 400, { error: 'Unknown action. Use status.' });
}
