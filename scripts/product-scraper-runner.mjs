// Scheduled indexing: only persist results extracted from a real upstream response.
// If the upstream cannot be verified, fail without producing invented prices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../lib/api/product-scraper.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const category = value('--category', 'mobiles');
const platform = value('--platform', 'flipkart');
const batch = Math.max(1, Math.min(20, Number(value('--batch', '20')) || 20));
if (platform !== 'flipkart') throw Error('Only Flipkart search is currently attempted; Amazon ingestion is not implemented.');
const url = `/api/product-scraper?action=search&platform=flipkart&term=${encodeURIComponent(category)}`;
let response;
await handler({ method: 'GET', url }, {
  statusCode: 200, setHeader() {}, end(text) { response = { status: this.statusCode, body: JSON.parse(text) }; }
});
if (response?.status !== 200 || !response.body?.products?.length) throw Error(response?.body?.error || 'No verified product results; no data written.');
const dir = path.join(root, 'data/product-directory');
const file = path.join(dir, 'index.json');
const idx = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { totalProducts: 0, products: [] };
const byId = new Map((idx.products || []).map(p => [p.url || p.title, p]));
for (const p of response.body.products.slice(0, batch)) {
  if (typeof p.title !== 'string' || !p.title || !Number.isFinite(Number(p.currentPrice))) continue;
  byId.set(p.url || p.title, { ...p, category, indexedAt: new Date().toISOString() });
}
if (byId.size === (idx.products || []).length) { console.log('No new verified products.'); process.exit(0); }
idx.products = [...byId.values()].slice(-500);
idx.totalProducts = idx.products.length; // number actually retained, never an invented catalogue estimate
idx.categories = Object.fromEntries([...new Set(idx.products.map(p => p.category))].map(c => [c, idx.products.filter(p => p.category === c).length]));
idx.totalCategories = Object.keys(idx.categories).length;
idx.priceRanges = { '<5k': 0, '5k-10k': 0, '10k-20k': 0, '20k-50k': 0, '50k+': 0 };
idx.ratingRanges = { '4.5+': 0, '4.0+': 0, '3.5+': 0, '<3.5': 0 };
for (const p of idx.products) {
  const price = Number(p.currentPrice);
  if (Number.isFinite(price)) idx.priceRanges[price < 5000 ? '<5k' : price < 10000 ? '5k-10k' : price < 20000 ? '10k-20k' : price < 50000 ? '20k-50k' : '50k+']++;
  const rating = Number(p.rating);
  if (Number.isFinite(rating)) idx.ratingRanges[rating >= 4.5 ? '4.5+' : rating >= 4 ? '4.0+' : rating >= 3.5 ? '3.5+' : '<3.5']++;
}
idx.lastScannedAt = new Date().toISOString();
fs.mkdirSync(dir, { recursive: true });
const output = JSON.stringify(idx, null, 2) + '\n';
fs.writeFileSync(file, output);
fs.writeFileSync(path.join(root, 'public/data/product-directory/index.json'), output);
console.log(`Published ${idx.totalProducts} verified, retained products.`);
