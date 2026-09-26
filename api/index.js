/**
 * Single Serverless Function Router — Fixes Vercel Hobby 12 functions limit
 * All API routes go through this one file: /api/* -> /api/index.js?__route=xxx
 * Imports handlers from lib/api/ (not counted as functions)
 * 
 * Original files: 26 -> now 1 function, well under 12 limit
 * Frontend still calls /api/ai, /api/inception, /api/kerala-ai etc via vercel.json rewrites
 * But also works directly via /api?route=ai or /api/index?route=ai or parsing pathname
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Lazy map: route -> import path (dynamic to avoid one failing breaking all)
const ROUTE_PATHS = {
  'agent-dispatch': '../lib/api/agent-dispatch.js',
  'agent-health': '../lib/api/agent-health.js',
  'agent-plan': '../lib/api/agent-plan.js',
  'agent-publish': '../lib/api/agent-publish.js',
  'agent-status': '../lib/api/agent-status.js',
  'ai': '../lib/api/ai.js',
  'auto-master': '../lib/api/auto-master.js',
  'github-secret-setup': '../lib/api/github-secret-setup.js',
  'inception': '../lib/api/inception.js',
  'inspect': '../lib/api/inspect.js',
  'kerala-ai': '../lib/api/kerala-ai.js',
  'kerala-expansion': '../lib/api/kerala-expansion.js',
  'map-auto': '../lib/api/map-auto.js',
  'map-directory': '../lib/api/map-directory.js',
  'map-scraper-v2': '../lib/api/map-scraper-v2.js',
  'map-scraper': '../lib/api/map-scraper.js',
  'maps': '../lib/api/maps.js',
  'music-directory': '../lib/api/music-directory.js',
  'music-scraper': '../lib/api/music-scraper.js',
  'osint': '../lib/api/osint.js',
  'product-directory': '../lib/api/product-directory.js',
  'product-scraper': '../lib/api/product-scraper.js',
  'rate-limiter': '../lib/api/rate-limiter.js',
  'split-pdf': '../lib/api/split-pdf.js',
  'youtube-playlist': '../lib/api/youtube-playlist.js',
  'youtube-transcript': '../lib/api/youtube-transcript.js',
  // aliases
  'inception-labs': '../lib/api/inception.js',
  'kerala': '../lib/api/kerala-ai.js',
};

const handlerCache = {};

async function getHandler(route) {
  const importPath = ROUTE_PATHS[route];
  if (!importPath) return null;
  if (handlerCache[route]) return handlerCache[route];
  try {
    const mod = await import(importPath);
    const fn = mod.default;
    if (typeof fn === 'function') {
      handlerCache[route] = fn;
      return fn;
    }
    return null;
  } catch (e) {
    console.error(`[Router] Failed to import ${route} from ${importPath}:`, e.message);
    // Return a handler that reports the error
    return (req, res) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Failed to load handler ${route}: ${e.message}`, route }));
    };
  }
}

function getRouteFromRequest(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Try ?route= param first (from vercel rewrites)
    let route = url.searchParams.get('route') || url.searchParams.get('__route');
    if (route) return route.replace(/^\/+/, '').replace(/\.js$/, '');

    // Parse pathname: /api/ai -> ai, /api/kerala-ai -> kerala-ai, /api/map-scraper-v2 -> map-scraper-v2
    // Also handle /api/index?route=...
    let pathname = url.pathname || '';
    // Remove /api prefix
    if (pathname.startsWith('/api/')) pathname = pathname.slice(5);
    else if (pathname === '/api' || pathname === '/api/index' || pathname === '/api/index.js') pathname = '';
    // Remove trailing slash and .js
    pathname = pathname.replace(/\/$/, '').replace(/\.js$/, '');
    // If pathname contains '/', take first segment
    if (pathname.includes('/')) pathname = pathname.split('/')[0];
    
    // Treat index as empty (list all routes)
    if (pathname === 'index' || pathname === '') return '';
    return pathname;
  } catch {
    return '';
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    res.end();
    return;
  }

  const route = getRouteFromRequest(req);
  
  if (!route) {
    // List all available routes
    return json(res, 200, {
      ok: true,
      message: 'MegaPLAN API Router — Single function to fix Hobby 12 limit',
      routes: Object.keys(ROUTE_PATHS).sort(),
      usage: 'Call /api/<route> e.g. /api/ai, /api/inception?action=test, /api/kerala-ai?q=distance&from=Trivandrum&to=Kochi',
      hobby_fix: '27 functions merged into 1, now under 12 limit (was 27)',
      fully_automatic: true,
      count: Object.keys(ROUTE_PATHS).length,
    });
  }

  const fn = await getHandler(route);
  if (!fn) {
    return json(res, 404, { 
      error: `API route '${route}' not found`,
      available: Object.keys(ROUTE_PATHS).sort(),
      hint: 'Use /api/<route> e.g. /api/ai, /api/maps, /api/kerala-ai, /api/inception, /api/product-scraper, etc',
      requested: route,
      url: req.url,
    });
  }

  try {
    // Call the original handler
    return await fn(req, res);
  } catch (err) {
    console.error(`[Router] Error in ${route}:`, err);
    return json(res, 500, { error: err.message || `Handler ${route} failed`, route });
  }
}
