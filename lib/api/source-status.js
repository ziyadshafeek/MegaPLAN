// Public, non-sensitive coverage ledger. A configured job is NOT full coverage.
import fs from 'node:fs';
const read = url => { try { return JSON.parse(fs.readFileSync(url)); } catch { return {}; } };
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'GET only' })); }
  const music = read(new URL('../../data/music-directory/index.json', import.meta.url)), map = read(new URL('../../data/map-directory/index.json', import.meta.url));
  const city = read(new URL('../../data/city-directory/index.json', import.meta.url)), product = read(new URL('../../data/product-directory/index.json', import.meta.url));
  const images = read(new URL('../../data/image-links/index.json', import.meta.url)), candidates = read(new URL('../../data/image-links/candidates.json', import.meta.url));
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, complete: false, sources: {
    worldwideSongNames: { provider: 'MusicBrainz', license: 'CC0 core metadata only', indexed: music.totalTracks || 0, lastSuccessAt: music.lastScannedAt || null, coverage: music.coverage?.kind || 'bounded-sample', audioStored: false, spotifyCatalogue: false, fullDumpConfigured: Boolean(process.env.MUSIC_CATALOG_SEARCH_URL && process.env.MUSIC_CATALOG_TOKEN) },
    localMap: { provider: 'OpenStreetMap', license: 'ODbL', cells: map.totalCells || 0, placeOccurrences: map.totalPlaces || 0, lastSuccessAt: map.lastScannedAt || null, complete: false },
    trivandrumPlaces: { provider: 'OpenStreetMap', localShops: city.shops?.length || 0, localMusicPlaces: city.music?.length || 0, notSongCatalogue: true },
    retailerProducts: { provider: 'Authorized operator feed only', indexed: product.totalProducts || 0, lastSuccessAt: product.lastScannedAt || null, complete: false },
    imageLinks: { provider: 'Wikimedia via Openverse', candidateLinks: candidates.count || 0, publicReviewedLinks: images.items?.length || 0, bytesStored: 0, requiresHumanAgeAndLicenseReview: true },
    research: { wikipedia: 'on-demand', braveSearch: process.env.BRAVE_SEARCH_API_KEY ? 'configured' : 'not configured', openverse: 'candidate discovery; manual review' }
  }, note: 'Schedules execute on GitHub’s default branch after merge. Job success is not worldwide coverage; upstream access, licensing and storage determine actual counts.' }));
}
