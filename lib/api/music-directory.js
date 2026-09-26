import { ingestionError } from '../ingest-auth.js';
/**
 * Music Directory API — full dataset for AI for songs in Spotify
 * Free storage GitHub+Vercel+IndexedDB, fully indexable
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const dirPath = path.join(root, 'data', 'music-directory');

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
  const pub = path.join(root, 'public', 'data', 'music-directory');
  if (!fs.existsSync(pub)) fs.mkdirSync(pub, { recursive: true });
}

function readIndex() {
  ensureDir();
  const f = path.join(dirPath, 'index.json');
  if (!fs.existsSync(f)) return { totalTracks: 0, totalArtists: 0, lastScannedAt: null, tracks: [] };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { totalTracks: 0, tracks: [] }; }
}

function writeIndex(idx) {
  ensureDir();
  fs.writeFileSync(path.join(dirPath, 'index.json'), JSON.stringify(idx, null, 2));
  fs.writeFileSync(path.join(root, 'public', 'data', 'music-directory', 'index.json'), JSON.stringify(idx, null, 2));
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
      return json(res, 200, { ok: true, index, source: 'Repository snapshot; counts only cover indexed records' });
    }

    if (action === 'search') {
      if (!q) return json(res, 400, { error: 'Provide q' });
      ensureDir();
      const files = fs.readdirSync(dirPath).filter(f => f.startsWith('tracks_')).slice(-20);
      let results = [];
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
          const matches = (data.tracks || []).filter(t => (t.searchable_text || `${t.name} ${t.artists}`.toLowerCase()).includes(q));
          results.push(...matches.slice(0, 20));
          if (results.length >= 100) break;
        } catch {}
      }
      if (!results.length && index.tracks) {
        results = index.tracks.filter(t => (t.searchable_text || t.name.toLowerCase()).includes(q)).slice(0, 50);
      }
      return json(res, 200, { ok: true, q, count: results.length, results: results.slice(0, 100), ai_usable: true });
    }

    if (action === 'artist') {
      const artist = url.searchParams.get('artist') || '';
      if (!artist) return json(res, 400, { error: 'Provide artist' });
      const all = readIndex().tracks || [];
      const filtered = all.filter(t => (t.artists || '').toLowerCase().includes(artist.toLowerCase())).slice(0, 100);
      return json(res, 200, { ok: true, artist, count: filtered.length, tracks: filtered });
    }

    return json(res, 400, { error: 'Unknown action' });
  }

  if (req.method === 'POST') {
    const denied = ingestionError(req);
    if (denied) return json(res, denied.status, { error: denied.error });
    const body = readBody(req);
    const tracks = body.tracks || body;
    if (!Array.isArray(tracks) && !body.tracks) return json(res, 400, { error: 'Invalid tracks data' });

    ensureDir();
    const toSave = Array.isArray(tracks) ? tracks : body.tracks;
    const batchId = Date.now();
    const file = path.join(dirPath, `tracks_${batchId}.json`);
    fs.writeFileSync(file, JSON.stringify({ batchId, count: toSave.length, tracks: toSave, savedAt: new Date().toISOString() }, null, 2));
    
    const pubFile = path.join(root, 'public', 'data', 'music-directory', `tracks_${batchId}.json`);
    fs.writeFileSync(pubFile, JSON.stringify({ batchId, count: toSave.length, tracks: toSave }, null, 2));

    const index = readIndex();
    index.totalTracks = (index.totalTracks || 0) + toSave.length;
    index.lastScannedAt = new Date().toISOString();
    if (!index.tracks) index.tracks = [];
    index.tracks.push(...toSave.slice(0, 100));
    if (index.tracks.length > 500) index.tracks = index.tracks.slice(-500);

    writeIndex(index);

    return json(res, 200, { ok: true, saved: batchId, count: toSave.length, index: { totalTracks: index.totalTracks } });
  }

  return json(res, 405, { error: 'Method not allowed' });
}
