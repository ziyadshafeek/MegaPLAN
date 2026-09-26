// Query only verified repository snapshots; never infer completeness from them.
import fs from 'node:fs';
function read(url) { try { return JSON.parse(fs.readFileSync(url)); } catch { return {}; } }
export function snapshotReferences(topic) {
  const q = topic.toLowerCase();
  const items = [];
  if (/\b(trivandrum|thiruvananthapuram)\b/.test(q)) {
    const city = read(new URL('../data/city-directory/index.json', import.meta.url));
    if (/\b(shops?|stores?|retail)\b/.test(q) && city.shops?.length) items.push({ title: 'Trivandrum OSM shops', snippet: `Snapshot of ${city.shops.length} OSM-tagged local shops near Thiruvananthapuram. This is a local map sample, not nationwide product inventory.`, url: 'https://mega-plan.vercel.app/tools/trivandrum-shop-directory', source: 'MegaPLAN OSM snapshot' });
    if (/\b(music|venues?|clubs?)\b/.test(q) && city.music?.length) items.push({ title: 'Trivandrum OSM music places', snippet: `Snapshot of ${city.music.length} local OSM music-related places. These are venues and shops, NOT a recorded music catalogue.`, url: 'https://mega-plan.vercel.app/tools/trivandrum-music-places', source: 'MegaPLAN OSM snapshot' });
  }
  if (/\b(music|songs?|recordings?)\b/.test(q)) {
    const music = read(new URL('../data/music-directory/index.json', import.meta.url));
    if (music.totalTracks > 0 && music.source?.includes('MusicBrainz')) items.push({ title: 'Open music snapshot', snippet: `${music.totalTracks} sampled MusicBrainz recordings indexed; this does not represent all Spotify tracks or all world music.`, url: 'https://mega-plan.vercel.app/tools/music-directory', source: 'MegaPLAN MusicBrainz CC0 snapshot' });
  }
  if (/\b(products?|retail|flipkart|amazon)\b/.test(q)) {
    const products = read(new URL('../data/product-directory/index.json', import.meta.url));
    if (products.totalProducts > 0 && (products.products || []).length) items.push({ title: 'Authorized product snapshot', snippet: `${products.totalProducts} retailer-feed products indexed; prices may have changed and coverage is not nationwide-complete.`, url: 'https://mega-plan.vercel.app/tools/product-directory', source: 'MegaPLAN authorized retailer feed snapshot' });
  }
  return items;
}
