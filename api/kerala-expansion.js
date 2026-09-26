/**
 * Kerala Expansion API — tracks 10-day sprint to finish Kerala
 * GET /api/kerala-expansion?action=plan|progress|phase|districts
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

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
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
  const action = url.searchParams.get('action') || 'progress';

  const planPath = path.join(root, 'data', 'map-directory', 'expansion-plan.json');
  const indexPath = path.join(root, 'data', 'map-directory', 'index.json');
  
  const plan = readJson(planPath);
  const index = readJson(indexPath) || { totalCells: 0, totalPlaces: 0, lastIndex: -1, cells: [] };

  if (action === 'plan') {
    return json(res, 200, { ok: true, plan });
  }

  if (action === 'progress') {
    const totalCells = index.totalCells || 0;
    const keralaTarget = 17000; // 0.02° + 0.05° adaptive
    const trivandrumTarget = 2000;
    
    // Determine current phase
    let currentPhase = 1;
    let cumulative = 0;
    let phaseProgress = 0;
    if (plan) {
      for (const p of plan.phases) {
        cumulative += p.estimatedCells;
        if (totalCells < cumulative) {
          currentPhase = p.phase;
          phaseProgress = totalCells - (cumulative - p.estimatedCells);
          break;
        }
      }
      if (totalCells >= cumulative) currentPhase = 8;
    }

    const keralaPercent = Math.min(100, (totalCells / keralaTarget) * 100);
    const trivandrumPercent = Math.min(100, (totalCells / trivandrumTarget) * 100);

    // Days calculation: 10 days for Kerala
    const startDate = plan?.createdAt ? new Date(plan.createdAt) : new Date();
    const now = new Date();
    const daysElapsed = Math.max(0, (now - startDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 10 - daysElapsed);
    const estimatedDaysToFinish = totalCells > 0 ? (keralaTarget - totalCells) / (totalCells / Math.max(1, daysElapsed)) : 10;

    return json(res, 200, {
      ok: true,
      progress: {
        totalCells,
        totalPlaces: index.totalPlaces || 0,
        lastIndex: index.lastIndex || -1,
        keralaTarget,
        trivandrumTarget,
        keralaPercent: Number(keralaPercent.toFixed(1)),
        trivandrumPercent: Number(trivandrumPercent.toFixed(1)),
        currentPhase,
        phaseProgress,
        daysElapsed: Number(daysElapsed.toFixed(1)),
        daysRemaining: Number(daysRemaining.toFixed(1)),
        estimatedDaysToFinish: Number(estimatedDaysToFinish.toFixed(1)),
        businessTypes: Object.keys(index.businessTypes || {}).length,
        roads: Object.keys(index.roadWise || {}).length,
        religious: index.religious || {}
      },
      index: {
        totalCells: index.totalCells,
        totalPlaces: index.totalPlaces,
        lastScannedAt: index.lastScannedAt,
        businessTypes: index.businessTypes,
        roadWise: Object.keys(index.roadWise || {}).slice(0, 20),
        religious: index.religious
      },
      nextPhase: plan?.phases?.find(p => p.phase === currentPhase) || null
    });
  }

  if (action === 'phase') {
    const phaseNum = Number(url.searchParams.get('phase') || 1);
    const phase = plan?.phases?.find(p => p.phase === phaseNum);
    if (!phase) return json(res, 404, { error: 'Phase not found' });
    return json(res, 200, { ok: true, phase });
  }

  if (action === 'districts') {
    const districts = plan?.kerala?.districts || [];
    // Add progress per district based on cells near district center
    const districtProgress = districts.map(d => {
      // Estimate progress by checking if district area has been scanned
      // For now, simple heuristic: if totalCells > priority*1000, district started
      const started = (index.totalCells || 0) > d.priority * 500;
      return { ...d, started, estimatedCells: 1000 };
    });
    return json(res, 200, { ok: true, districts: districtProgress, total: districts.length });
  }

  if (action === 'roadwise') {
    return json(res, 200, { ok: true, roadWise: index.roadWise || {}, count: Object.keys(index.roadWise || {}).length });
  }

  if (action === 'businesswise') {
    return json(res, 200, { ok: true, businessTypes: index.businessTypes || {}, count: Object.keys(index.businessTypes || {}).length });
  }

  return json(res, 400, { error: 'Unknown action. Use plan|progress|phase|districts|roadwise|businesswise' });
}
