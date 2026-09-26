/**
 * Single Serverless Function Router — Fixes Vercel Hobby 12 functions limit
 * All API routes go through this one file: /api/* -> /api/index.js?__route=xxx
 * Imports handlers from lib/api/ (not counted as functions)
 * 
 * Original files: 26 -> now 1 function, well under 12 limit
 * Frontend still calls /api/ai, /api/inception, /api/kerala-ai etc via vercel.json rewrites
 * But also works directly via /api?route=ai or /api/index?route=ai or parsing pathname
 */

// Literal imports are required for Vercel @vercel/nft to bundle every handler.
const ROUTES = ["agent-dispatch", "agent-health", "agent-plan", "agent-publish", "agent-status", "ai", "auto-master", "github-secret-setup", "inception", "inception-labs", "inspect", "kerala-ai", "kerala", "kerala-expansion", "map-auto", "map-directory", "map-scraper-v2", "map-scraper", "maps", "music-directory", "music-scraper", "open-music", "osint", "product-directory", "product-scraper", "presentation", "rate-limiter", "split-pdf", "source-status", "youtube-playlist", "youtube-transcript"];
const handlerCache = new Map();

async function getHandler(route) {
  if (!ROUTES.includes(route)) return null;
  if (handlerCache.has(route)) return handlerCache.get(route);
  let mod;
  switch (route) {
    case 'agent-dispatch': mod = await import('../lib/api/agent-dispatch.js'); break;
    case 'agent-health': mod = await import('../lib/api/agent-health.js'); break;
    case 'agent-plan': mod = await import('../lib/api/agent-plan.js'); break;
    case 'agent-publish': mod = await import('../lib/api/agent-publish.js'); break;
    case 'agent-status': mod = await import('../lib/api/agent-status.js'); break;
    case 'ai': mod = await import('../lib/api/ai.js'); break;
    case 'auto-master': mod = await import('../lib/api/auto-master.js'); break;
    case 'github-secret-setup': mod = await import('../lib/api/github-secret-setup.js'); break;
    case 'inception': mod = await import('../lib/api/inception.js'); break;
    case 'inception-labs': mod = await import('../lib/api/inception.js'); break;
    case 'inspect': mod = await import('../lib/api/inspect.js'); break;
    case 'kerala-ai': mod = await import('../lib/api/kerala-ai.js'); break;
    case 'kerala': mod = await import('../lib/api/kerala-ai.js'); break;
    case 'kerala-expansion': mod = await import('../lib/api/kerala-expansion.js'); break;
    case 'map-auto': mod = await import('../lib/api/map-auto.js'); break;
    case 'map-directory': mod = await import('../lib/api/map-directory.js'); break;
    case 'map-scraper-v2': mod = await import('../lib/api/map-scraper-v2.js'); break;
    case 'map-scraper': mod = await import('../lib/api/map-scraper.js'); break;
    case 'maps': mod = await import('../lib/api/maps.js'); break;
    case 'music-directory': mod = await import('../lib/api/music-directory.js'); break;
    case 'music-scraper': mod = await import('../lib/api/music-scraper.js'); break;
    case 'open-music': mod = await import('../lib/api/open-music.js'); break;
    case 'osint': mod = await import('../lib/api/osint.js'); break;
    case 'product-directory': mod = await import('../lib/api/product-directory.js'); break;
    case 'product-scraper': mod = await import('../lib/api/product-scraper.js'); break;
    case 'presentation': mod = await import('../lib/api/presentation.js'); break;
    case 'rate-limiter': mod = await import('../lib/api/rate-limiter.js'); break;
    case 'split-pdf': mod = await import('../lib/api/split-pdf.js'); break;
    case 'source-status': mod = await import('../lib/api/source-status.js'); break;
    case 'youtube-playlist': mod = await import('../lib/api/youtube-playlist.js'); break;
    case 'youtube-transcript': mod = await import('../lib/api/youtube-transcript.js'); break;
  }
  if (typeof mod.default !== 'function') throw Error(`Handler unavailable: ${route}`);
  handlerCache.set(route, mod.default);
  return mod.default;
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
      routes: ROUTES,
      usage: 'Call /api/<route> e.g. /api/ai, /api/inception?action=test, /api/kerala-ai?q=distance&from=Trivandrum&to=Kochi',
      hobby_fix: '27 functions merged into 1, now under 12 limit (was 27)',
      fully_automatic: true,
      count: ROUTES.length,
    });
  }

  let fn;
  try { fn = await getHandler(route); }
  catch (err) { console.error(`[Router] Failed to load ${route}`, err); return json(res, 500, { error: `Handler ${route} is unavailable`, route }); }
  if (!fn) {
    return json(res, 404, { 
      error: `API route '${route}' not found`,
      available: ROUTES,
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
