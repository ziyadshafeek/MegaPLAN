// Bounded MusicBrainz CC0 recording snapshot. No Spotify endpoints or IDs.
import fs from 'node:fs';
const file = new URL('../data/music-directory/index.json', import.meta.url);
const publicFile = new URL('../public/data/music-directory/index.json', import.meta.url);
const queries = ['malayalam', 'jazz', 'classical'];
const old = JSON.parse(fs.readFileSync(file));
const byId = new Map((old.tracks || []).filter(x => x.source === 'MusicBrainz').map(x => [x.id, x]));
let successes = 0;
for (const q of queries) {
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=12`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'MegaPLAN/1.0 (https://mega-plan.vercel.app/)' }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.recordings)) throw Error('Missing recordings');
    successes++;
    for (const r of data.recordings) {
      if (!/^[0-9a-f-]{36}$/i.test(r.id || '') || !r.title) continue;
      byId.set(r.id, { id: r.id, name: String(r.title).slice(0, 180), artists: (r['artist-credit'] || []).map(a => a.artist?.name || '').filter(Boolean).join(', ').slice(0, 180), album: String(r.releases?.[0]?.title || '').slice(0, 180), duration_ms: Number(r.length) || 0, external_url: `https://musicbrainz.org/recording/${r.id}`, source: 'MusicBrainz', license: 'CC0', indexedAt: new Date().toISOString() });
    }
  } catch (e) { console.warn(`MusicBrainz ${q} unavailable: ${e.message}`); }
  await new Promise(resolve => setTimeout(resolve, 1200));
}
if (!successes || !byId.size) throw Error('No verified open music records; no files modified.');
const tracks = [...byId.values()].slice(-500);
const output = JSON.stringify({ totalTracks: tracks.length, lastScannedAt: new Date().toISOString(), source: 'MusicBrainz CC0; independent of Spotify and local music places', tracks }, null, 2) + '\n';
fs.writeFileSync(file, output);
fs.writeFileSync(publicFile, output);
console.log(`Saved ${tracks.length} MusicBrainz CC0 recordings from ${successes}/${queries.length} queries. Spotify catalogue records: 0.`);
