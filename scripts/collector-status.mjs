// Publish only non-sensitive outcomes/counts for the branch control surface.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'data', name, 'index.json'), 'utf8')); }
  catch { return {}; }
};
const allowed = status => status === 'success' ? 'success' : 'failure';
const city = read('city-directory');
const map = read('map-directory');
const product = read('product-directory');
const music = read('music-directory');
let cityError = null;
try { cityError = JSON.parse(fs.readFileSync(path.join(root, 'data/city-directory/last-error.json'), 'utf8')).reason; } catch {}
const status = {
  attemptedAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || 'local',
  runUrl: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  outcomes: {
    city: allowed(process.env.CITY), map: allowed(process.env.MAP),
    product: allowed(process.env.PRODUCT), music: allowed(process.env.MUSIC)
  },
  details: { city: allowed(process.env.CITY) === 'failure' ? cityError : null },
  published: {
    cityShops: city.shops?.length || 0, cityMusicPlaces: city.music?.length || 0,
    mapPlaces: map.totalPlaces || 0, products: product.totalProducts || 0, musicTracks: music.totalTracks || 0
  },
  note: 'Outcome success means an upstream request returned verifiable data. Check counts; existing snapshot data is not proof that this attempt added records.'
};
for (const prefix of ['data', 'public/data']) {
  const dir = path.join(root, prefix, 'city-directory');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
}
console.log(`Collector outcomes: ${JSON.stringify(status.outcomes)}; published counts: ${JSON.stringify(status.published)}`);
