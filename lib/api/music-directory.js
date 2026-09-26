// Legacy read-only snapshot; separate from local OSM music places and from
// worldwide MusicBrainz live search. No Spotify catalogue ingestion.
import fs from 'node:fs';
const file = new URL('../../data/music-directory/index.json', import.meta.url);
function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); }
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Bulk Spotify catalogue ingestion is disabled pending authorized access.' });
  const url = new URL(req.url, 'https://megaplan.invalid');
  let index;
  try { index = JSON.parse(fs.readFileSync(file)); } catch { index = { totalTracks: 0, tracks: [] }; }
  const action = url.searchParams.get('action') || 'stats';
  if (action === 'stats') return json(res, 200, { ok: true, index, source: 'Read-only repository snapshot; not a Spotify catalogue.' });
  const q = String(url.searchParams.get(action === 'artist' ? 'artist' : 'q') || '').toLowerCase().trim().slice(0, 100);
  if (!q) return json(res, 400, { error: 'Provide a query.' });
  const shardsDir = new URL('../../data/music-directory/shards/', import.meta.url);
  const all = new Map((index.tracks || []).map(item => [item.id, item]));
  try {
    for (const shardName of fs.readdirSync(shardsDir).filter(x => /^[a-z0-9-]+\.json$/.test(x)).slice(0, 50)) {
      const shard = JSON.parse(fs.readFileSync(new URL(shardName, shardsDir)));
      for (const item of shard.records || []) all.set(item.id, item);
    }
  } catch { /* Earlier snapshots have no shards. */ }
  const tracks = [...all.values()].filter(t => `${t.name || ''} ${t.artists || ''}`.toLowerCase().includes(q)).slice(0, 50);
  if (action === 'search') return json(res, 200, { ok: true, q, count: tracks.length, results: tracks });
  if (action === 'artist') return json(res, 200, { ok: true, artist: q, count: tracks.length, tracks });
  return json(res, 400, { error: 'Unknown action.' });
}
