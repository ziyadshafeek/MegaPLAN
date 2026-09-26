// Import an operator-supplied retailer/affiliate feed, never scrape storefronts.
// Format documented in docs/DATA-SOURCES.md. No feed or credentials are bundled.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateProductFeed(input) {
  if (input?.authorization !== 'operator-confirmed-licensed-feed' || !/^https:\/\//.test(input.permissionEvidence || '')) throw Error('Missing operator confirmation and evidence of retailer feed rights.');
  if (!Array.isArray(input.products) || input.products.length < 1 || input.products.length > 1000) throw Error('Expect 1–1000 product records per authorized feed batch.');
  const domain = String(input.retailerDomain || '').toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw Error('Invalid retailer domain.');
  const now = new Date().toISOString();
  return input.products.map(p => {
    const url = new URL(p.productUrl);
    if (url.protocol !== 'https:' || ![domain, `www.${domain}`].includes(url.hostname)) throw Error('Product URL must use the authorized retailer domain.');
    if (!String(p.id || '').trim() || !String(p.title || '').trim() || !String(p.seller || '').trim() || !String(p.category || '').trim()) throw Error('Product ID, title, seller and category required.');
    if (p.currency !== 'INR' || !Number.isFinite(Number(p.price)) || Number(p.price) <= 0) throw Error('Positive INR price required.');
    if (!Number.isFinite(Date.parse(p.verifiedAt)) || Math.abs(Date.now() - Date.parse(p.verifiedAt)) > 7 * 86400_000) throw Error('Verified timestamp must be within seven days.');
    return { id: String(p.id).slice(0, 100), title: String(p.title).slice(0, 250), seller: String(p.seller).slice(0, 160), category: String(p.category).slice(0, 100), brand: String(p.brand || '').slice(0, 100), price: Number(p.price), currency: 'INR', rating: Number(p.rating) || null, external_url: url.href, source: domain, verifiedAt: p.verifiedAt, indexedAt: now, permissionEvidence: input.permissionEvidence };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.env.AUTHORIZED_PRODUCT_FEED !== '1' || !process.argv[2]) throw Error('Set AUTHORIZED_PRODUCT_FEED=1 after verifying retailer permission; provide the local feed JSON path.');
  const products = validateProductFeed(JSON.parse(fs.readFileSync(process.argv[2])));
  const file = new URL('../data/product-directory/index.json', import.meta.url);
  const old = JSON.parse(fs.readFileSync(file));
  const byId = new Map((old.products || []).map(p => [`${p.source}:${p.id}`, p]));
  for (const p of products) byId.set(`${p.source}:${p.id}`, p);
  const merged = [...byId.values()].slice(-5000);
  const categories = {};
  for (const p of merged) categories[p.category] = (categories[p.category] || 0) + 1;
  const updated = { ...old, products: merged, totalProducts: merged.length, totalCategories: Object.keys(categories).length, categories, lastScannedAt: new Date().toISOString(), source: 'Operator-supplied authorized feed; permission evidence recorded per record. Price may change.' };
  const text = JSON.stringify(updated, null, 2) + '\n';
  fs.writeFileSync(file, text);
  fs.writeFileSync(new URL('../public/data/product-directory/index.json', import.meta.url), text);
  console.log(`Imported ${products.length} authorized products; ${merged.length} total. No storefront scraping.`);
}
