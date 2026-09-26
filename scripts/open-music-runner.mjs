// Scheduled metadata-only collection: song/recording names, artists and links.
// Not audio; not Spotify scraping. Full world catalog: official MusicBrainz dump.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectOpenMusic } from '../lib/open-music-collector.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = Number(process.env.MUSIC_PAGES || 3);
const result = await collectOpenMusic({ dir: path.join(root, 'data/music-directory'), publicDir: path.join(root, 'public/data/music-directory'), pages });
console.log(`Verified ${result.completed} MusicBrainz search pages; ${result.added} returned records; ${result.distinct} distinct metadata records in bounded snapshot. Next query index ${result.cursor.queryIndex}, offset ${result.cursor.offset}. Audio files: 0. Spotify catalogue records: 0.`);
