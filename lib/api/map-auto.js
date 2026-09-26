/**
 * Map Auto Runner — continuously polls map-scraper and builds directory
 * This endpoint is designed to be called repeatedly by:
 * - Frontend auto-scraper (every 30-60s)
 * - GitHub Actions cron (every hour)
 * - Vercel Cron
 * 
 * It reads last index from data/map-directory/index.json, scans next cell, saves, returns next.
 * Uses NVIDIA AI for classification when available.
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

async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': 'MegaPLAN-Auto/1.0', ...(opts.headers||{}) } });
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

  try {
    const url = new URL(req.url, 'http://localhost');
    const batch = Number(url.searchParams.get('batch') || 1); // how many cells to scan in one call
    const useAI = url.searchParams.get('ai') !== 'false';
    const keralaMode = url.searchParams.get('kerala') === 'true' || url.searchParams.get('phase');
    const phase = Number(url.searchParams.get('phase') || 0);
    const workers = Number(url.searchParams.get('workers') || 1);

    // Read last index
    const idxPath = path.join(root, 'data', 'map-directory', 'index.json');
    let lastIndex = -1;
    if (fs.existsSync(idxPath)) {
      try {
        const idxData = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        lastIndex = idxData.lastIndex ?? -1;
      } catch {}
    }

    let results = [];
    let currentIndex = lastIndex + 1;

    for (let b = 0; b < batch; b++) {
      // Call map-scraper internally (we replicate logic to avoid self-fetch in serverless)
      // Instead, we fetch from same host? For simplicity, we directly call Overpass here
      // But to reuse logic, we import map-scraper handler? Simpler: call fetch to /api/map-scraper via internal
      // We'll do direct scan here using same logic as map-scraper but also AI classification

      // For Vercel, self-fetch may not work, so we replicate minimal scan
      const scanUrl = `https://overpass-api.de/api/interpreter`;
      
      // Use the map-scraper API if we can fetch via absolute URL from request host
      const host = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const scraperUrl = `${protocol}://${host}/api/map-scraper?index=${currentIndex}`;
      
      let scanData;
      try {
        const r = await fetchWithTimeout(scraperUrl, {}, 30000);
        if (!r.ok) throw Error(`scraper ${r.status}`);
        scanData = await r.json();
      } catch (e) {
        // Fallback: return error but continue
        results.push({ index: currentIndex, error: e.message, ok: false });
        currentIndex++;
        continue;
      }

      // AI classification if enabled and we have places
      let aiClassification = null;
      if (useAI && scanData.places && scanData.places.length > 0) {
        try {
          // Call /api/ai for classification
          const aiUrl = `${protocol}://${host}/api/ai`;
          const sample = scanData.places.slice(0, 20).map(p => ({
            name: p.name,
            amenity: p.amenity,
            shop: p.shop,
            tags: p.tags
          }));
          const aiBody = {
            task: 'custom',
            text: `Classify these ${sample.length} places from Trivandrum area into business sections. Places: ${JSON.stringify(sample).slice(0, 4000)}. Return JSON with sections: { roadWise: {road: count}, businessWise: {type: count}, newSections: [{name, reason, examples}] }. Keep short.`,
            extra: 'You are map directory AI classifier. Classify roads, business types like mosque, restaurant, etc. Create new sections if needed.'
          };
          const aiRes = await fetchWithTimeout(aiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(aiBody)
          }, 20000);
          if (aiRes.ok) {
            const aiJson = await aiRes.json();
            aiClassification = aiJson.result || aiJson.text || null;
          }
        } catch (e) {
          // AI optional, ignore errors
        }
      }

      // Save via map-directory API
      try {
        const dirUrl = `${protocol}://${host}/api/map-directory`;
        const saveRes = await fetchWithTimeout(dirUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...scanData, aiClassification })
        }, 15000);
        if (!saveRes.ok) {
          const txt = await saveRes.text();
          throw Error(`save ${saveRes.status}: ${txt.slice(0,200)}`);
        }
        const saved = await saveRes.json();
        results.push({ index: currentIndex, ok: true, places: scanData.places?.length || 0, roads: scanData.roads?.length || 0, ai: !!aiClassification, saved: saved.index });
      } catch (e) {
        results.push({ index: currentIndex, ok: false, error: e.message, places: scanData.places?.length || 0 });
      }

      currentIndex++;
      // Small delay between batches to be nice to Overpass
      if (b < batch - 1) await new Promise(r => setTimeout(r, 2000));
    }

    // Kerala progress
    let keralaInfo = null;
    try {
      const planPath = path.join(root, 'data', 'map-directory', 'expansion-plan.json');
      if (fs.existsSync(planPath)) {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
        const idxPath = path.join(root, 'data', 'map-directory', 'index.json');
        if (fs.existsSync(idxPath)) {
          const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
          const total = idx.totalCells || 0;
          const keralaTarget = 17000;
          keralaInfo = {
            total,
            keralaTarget,
            percent: Number(((total / keralaTarget) * 100).toFixed(1)),
            phase: phase || 0,
            estimatedDaysLeft: total > 0 ? Number(((keralaTarget - total) / (total / Math.max(1, 1))).toFixed(1)) : 10
          };
        }
      }
    } catch {}

    return json(res, 200, {
      ok: true,
      scanned: results.length,
      lastIndexBefore: lastIndex,
      nextIndex: currentIndex,
      results,
      kerala: keralaInfo,
      message: `Scanned ${results.length} cells starting from Trivandrum. Total places: ${results.reduce((a,b)=>a+(b.places||0),0)}. Kerala: ${keralaInfo ? keralaInfo.percent + '% (' + keralaInfo.total + '/' + keralaInfo.keralaTarget + ')' : 'N/A'}. Use ?batch=20&workers=4 for Kerala 10-day sprint. Auto runner continues via GitHub Actions every 30min + frontend poller.`
    });

  } catch (err) {
    return json(res, 500, { error: err.message || 'Auto runner failed' });
  }
}
