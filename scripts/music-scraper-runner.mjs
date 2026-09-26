// Scheduled indexing: never create made-up tracks when Spotify is unavailable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../lib/api/music-scraper.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const query = value('--query', 'love');
const batch = Math.max(1, Math.min(20, Number(value('--batch', '20')) || 20));
let response;
await handler({ method: 'GET', url: `/api/music-scraper?action=search&type=track&q=${encodeURIComponent(query)}` }, {
  statusCode: 200, setHeader() {}, end(text) { response = { status: this.statusCode, body: JSON.parse(text) }; }
});
if (response?.status !== 200 || !response.body?.results?.length) throw Error(response?.body?.error || 'No verified track results; no data written.');
const dir = path.join(root, 'data/music-directory');
const file = path.join(dir, 'index.json');
const idx = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { totalTracks: 0, tracks: [] };
const byId = new Map((idx.tracks || []).map(t => [t.id, t]));
for (const t of response.body.results.slice(0, batch)) {
  if (typeof t.id === 'string' && typeof t.name === 'string' && t.name) byId.set(t.id, { ...t, indexedAt: new Date().toISOString() });
}
if (byId.size === (idx.tracks || []).length) { console.log('No new verified tracks.'); process.exit(0); }
idx.tracks = [...byId.values()].slice(-500);
idx.totalTracks = idx.tracks.length;
idx.lastScannedAt = new Date().toISOString();
fs.mkdirSync(dir, { recursive: true });
const output = JSON.stringify(idx, null, 2) + '\n';
fs.writeFileSync(file, output);
fs.writeFileSync(path.join(root, 'public/data/music-directory/index.json'), output);
console.log(`Published ${idx.totalTracks} verified, retained tracks.`);
