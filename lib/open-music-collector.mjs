// Resumable, metadata-only MusicBrainz sampler. For a *complete* world music
// catalogue use their licensed full dump + external index, NOT API paging.
import fs from 'node:fs';
import path from 'node:path';
export const SEARCHES = [
  'malayalam', 'hindi', 'tamil', 'telugu', 'bengali', 'punjabi', 'marathi',
  'kannada', 'arabic', 'korean', 'japanese', 'mandarin', 'spanish',
  'french', 'portuguese', 'swahili', 'turkish', 'russian', 'english',
  'jazz', 'classical', 'folk', 'hip hop', 'rock', 'pop', 'country',
  'blues', 'reggae', 'electronic', 'afrobeat', 'flamenco'
];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function recording(item, now = new Date().toISOString()) {
  if (!ID.test(item?.id || '') || !String(item.title || '').trim()) return null;
  return { id: item.id.toLowerCase(), name: String(item.title).slice(0, 180),
    artists: (Array.isArray(item['artist-credit']) ? item['artist-credit'] : []).map(x => x.artist?.name || '').filter(Boolean).join(', ').slice(0, 180),
    album: String(item.releases?.[0]?.title || '').slice(0, 180),
    duration_ms: Number.isFinite(item.length) && item.length >= 0 ? item.length : 0,
    external_url: `https://musicbrainz.org/recording/${item.id.toLowerCase()}`,
    source: 'MusicBrainz', license: 'CC0', indexedAt: now };
}
const read = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
function atomicJSON(filename, object) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const tmp = filename + `.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(object, null, 2) + '\n');
  fs.renameSync(tmp, filename);
}
// Retry only temporary HTTP failures, at the SAME page URL. Never advance a
// cursor until a verified response is saved. Long provider pauses fail closed.
export async function fetchMusicPage(url, { fetchImpl = fetch, delay = sleep, clock = Date.now } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'MegaPLAN/1.1 (https://mega-plan.vercel.app/)' }, signal: AbortSignal.timeout(12000) });
    if (response.ok) return response.json();
    const retryable = [429, 500, 502, 503, 504].includes(response.status);
    const header = response.headers?.get('retry-after');
    await response.body?.cancel();
    if (!retryable || attempt === 2) throw Error(`MusicBrainz HTTP ${response.status}`);
    const seconds = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
    const date = seconds === null && header ? Date.parse(header) : NaN;
    const requested = seconds !== null ? seconds * 1000 : Number.isFinite(date) ? date - clock() : 0;
    const wait = Math.max(10000 * (attempt + 1), requested);
    if (wait > 60000) throw Error(`MusicBrainz HTTP ${response.status}: Retry-After exceeds bounded retry budget; try a later run`);
    console.warn(`MusicBrainz HTTP ${response.status}; waiting ${wait / 1000}s before retry ${attempt + 1}/2 of the same page`);
    await delay(wait);
  }
}
export async function collectOpenMusic({ dir, publicDir, fetchImpl = fetch, searches = SEARCHES, pages = 3, delay = sleep, now = () => new Date().toISOString() }) {
  if (!searches.length || !Number.isInteger(pages) || pages < 1 || pages > 8) throw Error('Invalid collection plan (1–8 pages).');
  const indexPath = path.join(dir, 'index.json'), cursorPath = path.join(dir, 'cursor.json');
  let index = read(indexPath, { totalTracks: 0, tracks: [] });
  const cursor = read(cursorPath, { queryIndex: 0, offset: 0, pagesCompleted: 0, lastSuccessAt: null });
  let completed = 0, added = 0;
  for (let i = 0; i < pages; i++) {
    const qi = cursor.queryIndex % searches.length, query = searches[qi], offset = cursor.offset;
    const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=100&offset=${offset}`;
    try {
      const body = await fetchMusicPage(url, { fetchImpl, delay });
      if (!Array.isArray(body.recordings)) throw Error('No verified recordings array');
      const records = body.recordings.map(x => recording(x, now())).filter(Boolean);
      // A page is an independently addressable shard. Git has a HARD preview
      // budget: stop at 50 shards; the full catalogue belongs in an external DB.
      const shardDir = path.join(dir, 'shards'), shardName = `${String(qi).padStart(2, '0')}-${String(offset).padStart(5, '0')}.json`;
      fs.mkdirSync(shardDir, { recursive: true });
      if (!fs.readdirSync(shardDir).some(x => x.endsWith('.json')) && index.tracks?.some(x => x.source === 'MusicBrainz')) {
        atomicJSON(path.join(shardDir, 'seed.json'), { query: 'previously verified sample', offset: 0, source: 'MusicBrainz CC0 recording search', records: index.tracks.filter(x => x.source === 'MusicBrainz') });
      }
      const existing = fs.readdirSync(shardDir).filter(x => x.endsWith('.json')).length;
      if (existing >= 50 && !fs.existsSync(path.join(shardDir, shardName))) throw Error('Git snapshot cap (50 shards) reached; configure a dump-backed external catalog before growing further');
      // A true empty page is a valid end-of-query marker, not fabricated data.
      if (records.length) atomicJSON(path.join(shardDir, shardName), { query, offset, source: 'MusicBrainz CC0 recording search', records });
      if (!records.length || body.recordings.length < 100 || offset >= 9700) { cursor.queryIndex = (qi + 1) % searches.length; cursor.offset = 0; }
      else cursor.offset = offset + 100;
      cursor.pagesCompleted++;
      cursor.lastSuccessAt = now();
      cursor.lastQuery = query;
      // Recount DISTINCT IDs across shards so duplicate search matches never
      // inflate the count. Expose a small sample in the existing browser UI.
      const unique = new Map();
      for (const name of fs.readdirSync(shardDir).filter(x => x.endsWith('.json')).sort()) {
        const shard = read(path.join(shardDir, name), {});
        for (const item of shard.records || []) unique.set(item.id, item);
      }
      index = { ...index, totalTracks: unique.size, tracks: [...unique.values()].slice(-500),
        lastScannedAt: cursor.lastSuccessAt, source: 'MusicBrainz CC0 sampled recording metadata (not Spotify); full dump required for complete coverage',
        coverage: { kind: 'bounded-sample', distinctRecords: unique.size, shards: fs.readdirSync(shardDir).filter(x => x.endsWith('.json')).length, searchQueries: searches.length, pagesCompleted: cursor.pagesCompleted } };
      atomicJSON(indexPath, index);
      atomicJSON(path.join(publicDir, 'index.json'), index);
      atomicJSON(cursorPath, cursor);
      added += records.length;
      completed++;
    } catch (e) {
      if (!completed) throw Error(`No MusicBrainz pages verified; state unchanged: ${e.message}`);
      throw Error(`Incomplete MusicBrainz collection after ${completed} verified pages; partial local state retained, publication prohibited: ${e.message}`);
    }
    if (i + 1 < pages) await delay(1200);
  }
  return { completed, added, distinct: index.totalTracks, cursor: { ...cursor } };
}
