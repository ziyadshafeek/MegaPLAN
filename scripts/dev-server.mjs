/**
 * Local MegaPLAN server: static files from public/ plus Vercel-style /api/*.
 *   node scripts/dev-server.mjs
 * Bind 0.0.0.0 so the Arena preview proxy can reach it.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pub = path.join(root, 'public');
const PORT = Number(process.env.PORT || 4173);
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8'
};

const SPA = [/^\/tools\//, /^\/folder\//, /^\/wiki\//, /^\/self$/, /^\/desk\//];

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function serveStatic(urlPath, res) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  if (SPA.some(r => r.test(rel))) rel = '/index.html';
  const file = path.normalize(path.join(pub, rel));
  if (!file.startsWith(pub)) return send(res, 403, 'Forbidden');
  let target = file;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target)) return send(res, 404, 'Not found');
  const ext = path.extname(target);
  send(res, 200, fs.readFileSync(target), { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
}

async function serveApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const file = path.join(root, 'api', name + '.js');
  if (!fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'No such API' }), { 'Content-Type': 'application/json' });
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw) {
    try { req.body = JSON.parse(raw); } catch { req.body = raw; }
  } else req.body = {};
  if (typeof mod.default === 'function') return mod.default(req, res);
  const method = (req.method || 'GET').toUpperCase();
  if (typeof mod[method] === 'function') {
    const request = new Request('http://127.0.0.1' + url.pathname, { method, headers: req.headers, body: method === 'GET' || method === 'HEAD' ? undefined : raw });
    const out = await mod[method](request);
    const buf = Buffer.from(await out.arrayBuffer());
    const headers = {}; out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers); res.end(buf); return;
  }
  send(res, 405, JSON.stringify({ error: 'Method not allowed' }), { 'Content-Type': 'application/json' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return serveApi(req, res, url);
    return serveStatic(url.pathname, res);
  } catch (err) {
    send(res, 500, String(err.message || err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MegaPLAN local desk http://127.0.0.1:${PORT}`);
});
