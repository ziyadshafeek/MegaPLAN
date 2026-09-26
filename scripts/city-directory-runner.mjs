// Run in a trusted checkout (GitHub Actions or an operator machine).
// Failure is nonzero and does not replace the last verified snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCityDirectory } from '../lib/city-directory.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = await collectCityDirectory();
const output = JSON.stringify(snapshot, null, 2) + '\n';
for (const prefix of ['data', 'public/data']) {
  const dir = path.join(root, prefix, 'city-directory');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.json');
  const temp = file + '.tmp';
  fs.writeFileSync(temp, output);
  fs.renameSync(temp, file);
}
console.log(`Indexed ${snapshot.counts.shops} OSM shops and ${snapshot.counts.music} music-related locations; ${snapshot.indexedAt}.`);
