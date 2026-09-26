/**
 * Product Directory API — massive dataset of Amazon & Flipkart products
 * Free storage: GitHub + Vercel + IndexedDB + search-index, fully indexable for AI
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const dirPath = path.join(root, 'data', 'product-directory');

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
  const pub = path.join(root, 'public', 'data', 'product-directory');
  if (!fs.existsSync(pub)) fs.mkdirSync(pub, { recursive: true });
}

function readIndex() {
  ensureDir();
  const f = path.join(dirPath, 'index.json');
  if (!fs.existsSync(f)) return { totalProducts: 0, totalCategories: 0, lastScannedAt: null, categories: {}, priceRanges: {}, ratingRanges: {}, products: [] };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { totalProducts: 0, categories: {} }; }
}

function writeIndex(idx) {
  ensureDir();
  fs.writeFileSync(path.join(dirPath, 'index.json'), JSON.stringify(idx, null, 2));
  fs.writeFileSync(path.join(root, 'public', 'data', 'product-directory', 'index.json'), JSON.stringify(idx, null, 2));
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
  const action = url.searchParams.get('action') || 'stats';
  const q = (url.searchParams.get('q') || '').toLowerCase();

  if (req.method === 'GET') {
    const index = readIndex();

    if (action === 'stats') {
      return json(res, 200, { ok: true, index, free_storage: 'GitHub + Vercel + IndexedDB + search-index, fully indexable for AI' });
    }

    if (action === 'search') {
      if (!q) return json(res, 400, { error: 'Provide q' });
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('products_')).slice(-20);
      let results = [];
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (data.products || []).filter(p => {
            const searchable = (p.searchable_text || `${p.title} ${p.category} ${p.seller}`.toLowerCase());
            return searchable.includes(q);
          });
          results.push(...matches.slice(0, 20));
          if (results.length >= 100) break;
        } catch {}
      }
      // If no results from files, try from index
      if (!results.length && index.products) {
        results = index.products.filter(p => (p.searchable_text || p.title.toLowerCase()).includes(q)).slice(0, 50);
      }
      return json(res, 200, { ok: true, q, count: results.length, results: results.slice(0, 100), ai_usable: true });
    }

    if (action === 'category') {
      const cat = url.searchParams.get('category') || '';
      if (!cat) return json(res, 200, { ok: true, categories: index.categories || {} });
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('products_')).slice(-20);
      let results = [];
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (data.products || []).filter(p => (p.category || '').toLowerCase().includes(cat.toLowerCase()));
          results.push(...matches);
          if (results.length >= 200) break;
        } catch {}
      }
      return json(res, 200, { ok: true, category: cat, count: results.length, products: results.slice(0, 200) });
    }

    if (action === 'price') {
      const range = url.searchParams.get('range') || '';
      if (!range) return json(res, 200, { ok: true, priceRanges: index.priceRanges || {} });
      // Filter by price range
      const all = readIndex().products || [];
      let filtered = [];
      if (range === '<5k') filtered = all.filter(p => p.currentPrice < 5000);
      else if (range === '5k-10k') filtered = all.filter(p => p.currentPrice >= 5000 && p.currentPrice < 10000);
      else if (range === '10k-20k') filtered = all.filter(p => p.currentPrice >= 10000 && p.currentPrice < 20000);
      else if (range === '20k-50k') filtered = all.filter(p => p.currentPrice >= 20000 && p.currentPrice < 50000);
      else if (range === '50k+') filtered = all.filter(p => p.currentPrice >= 50000);
      return json(res, 200, { ok: true, range, count: filtered.length, products: filtered.slice(0, 100) });
    }

    if (action === 'rating') {
      const minRating = Number(url.searchParams.get('min') || 4.0);
      const all = readIndex().products || [];
      const filtered = all.filter(p => (p.rating || 0) >= minRating).slice(0, 100);
      return json(res, 200, { ok: true, minRating, count: filtered.length, products: filtered });
    }

    return json(res, 400, { error: 'Unknown action' });
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const products = body.products || body;
    if (!Array.isArray(products) && !body.products) return json(res, 400, { error: 'Invalid products data' });

    ensureDir();
    const toSave = Array.isArray(products) ? products : body.products;
    const batchId = Date.now();
    const file = path.join(dirPath, `products_${batchId}.json`);
    fs.writeFileSync(file, JSON.stringify({ batchId, count: toSave.length, products: toSave, savedAt: new Date().toISOString() }, null, 2));
    
    const pubFile = path.join(root, 'public', 'data', 'product-directory', `products_${batchId}.json`);
    fs.writeFileSync(pubFile, JSON.stringify({ batchId, count: toSave.length, products: toSave }, null, 2));

    const index = readIndex();
    index.totalProducts = (index.totalProducts || 0) + toSave.length;
    index.lastScannedAt = new Date().toISOString();
    if (!index.products) index.products = [];
    index.products.push(...toSave.slice(0, 100)); // keep last 100 in index for fast search
    if (index.products.length > 500) index.products = index.products.slice(-500);

    // Categorize
    if (!index.categories) index.categories = {};
    if (!index.priceRanges) index.priceRanges = { '<5k': 0, '5k-10k': 0, '10k-20k': 0, '20k-50k': 0, '50k+': 0 };
    if (!index.ratingRanges) index.ratingRanges = { '4.5+': 0, '4.0+': 0, '3.5+': 0, '<3.5': 0 };

    for (const p of toSave) {
      const cat = p.category || 'unknown';
      index.categories[cat] = (index.categories[cat] || 0) + 1;
      
      const price = p.currentPrice || 0;
      if (price < 5000) index.priceRanges['<5k']++;
      else if (price < 10000) index.priceRanges['5k-10k']++;
      else if (price < 20000) index.priceRanges['10k-20k']++;
      else if (price < 50000) index.priceRanges['20k-50k']++;
      else index.priceRanges['50k+']++;

      const rating = p.rating || 0;
      if (rating >= 4.5) index.ratingRanges['4.5+']++;
      else if (rating >= 4.0) index.ratingRanges['4.0+']++;
      else if (rating >= 3.5) index.ratingRanges['3.5+']++;
      else index.ratingRanges['<3.5']++;
    }

    writeIndex(index);

    return json(res, 200, { ok: true, saved: batchId, count: toSave.length, index: { totalProducts: index.totalProducts } });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
