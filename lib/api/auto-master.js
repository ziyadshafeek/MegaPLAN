/**
 * Auto Master — Fully automatic runner for all massive datasets
 * Runs map (Kerala 10-day), product (Amazon/Flipkart), music (Spotify), inception
 * Fully automatic: no manual start needed, runs via GitHub Actions + Vercel cron + frontend SW
 * Free storage: GitHub + Vercel + IndexedDB
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

async function fetchWithTimeout(url, opts = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': 'MegaPLAN-AutoMaster/1.0', ...(opts.headers||{}) } });
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
  const action = url.searchParams.get('action') || 'run';
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const base = `${protocol}://${host}`;

  if (action === 'status') {
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
      fully_automatic: true,
      status: statuses,
      auto_runners: {
        map: 'GitHub Action every 30min batch 20 workers 4 + frontend poller 35s + SW background sync + app.js poller 40s',
        product: 'GitHub Action every 3h batch 50 + frontend poller 5s',
        music: 'GitHub Action every 4h batch 100 + frontend poller 5s',
        inception: 'Token rotation every 6h via Playwright, proxy rotation every request'
      },
      free_storage: 'GitHub data/* + Vercel public/data/* + IndexedDB + search-index, fully indexable for AI',
      next: 'All run fully automatically, no manual start needed after initial enable'
    });
  }

  if (action === 'run') {
    const results = {};
    
    try {
      // Run map scraper — 5 cells
      console.log('[AutoMaster] Running map scraper 5 cells');
      const mapRes = await fetchWithTimeout(`${base}/api/map-auto?batch=5&workers=2`, {}, 60000);
      const mapData = await mapRes.json();
      results.map = { ok: mapRes.ok, scanned: mapData.scanned || 0, total: mapData.kerala?.total || 0, percent: mapData.kerala?.percent || 0 };
    } catch (e) {
      results.map = { ok: false, error: e.message };
    }

    // Small delay to be nice to Overpass
    await new Promise(r => setTimeout(r, 5000));

    try {
      // Run product scraper — 10 products
      console.log('[AutoMaster] Running product scraper 10 products');
      const prodRes = await fetchWithTimeout(`${base}/api/product-scraper?action=search&term=mobiles&platform=flipkart`, {}, 15000);
      const prodData = await prodRes.json();
      if (prodData.products) {
        const saveRes = await fetchWithTimeout(`${base}/api/product-directory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: prodData.products.slice(0, 10) })
        }, 10000);
        results.product = { ok: saveRes.ok, count: prodData.products.length };
      } else {
        results.product = { ok: false, error: 'No products' };
      }
    } catch (e) {
      results.product = { ok: false, error: e.message };
    }

    await new Promise(r => setTimeout(r, 2000));

    try {
      // Run music scraper — 10 tracks
      console.log('[AutoMaster] Running music scraper 10 tracks');
      const musicRes = await fetchWithTimeout(`${base}/api/music-scraper?action=search&q=love&type=track`, {}, 15000);
      const musicData = await musicRes.json();
      if (musicData.results) {
        const saveRes = await fetchWithTimeout(`${base}/api/music-directory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: musicData.results.slice(0, 10) })
        }, 10000);
        results.music = { ok: saveRes.ok, count: musicData.results.length };
      } else {
        results.music = { ok: false, error: 'No tracks' };
      }
    } catch (e) {
      results.music = { ok: false, error: e.message };
    }

    // Inception test
    try {
      const incRes = await fetchWithTimeout(`${base}/api/inception?action=test`, {}, 10000);
      const incData = await incRes.json();
      results.inception = { ok: incRes.ok, passed: incData.passed };
    } catch (e) {
      results.inception = { ok: false, error: e.message };
    }

    return json(res, 200, {
      ok: true,
      fully_automatic: true,
      results,
      message: 'Auto master ran all scrapers: map 5 cells, product 10, music 10, inception test. Fully automatic via GitHub Actions + frontend pollers + SW.',
      free_storage: 'All data free GitHub + Vercel + IndexedDB, fully indexable for AI multi-tool',
      next_run: 'GitHub Actions will continue every 30min map, 3h product, 4h music automatically'
    });
  }

  return json(res, 400, { error: 'Unknown action. Use status|run' });
}
