// Bounded, attributed OpenStreetMap snapshot for Thiruvananthapuram.
// No records are invented or written when either upstream query fails.
export const CITY = Object.freeze({ name: 'Thiruvananthapuram (Trivandrum)', lat: 8.524139, lon: 76.936638, radiusMeters: 2500, musicRadiusMeters: 6500 });
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export function queryFor(kind) {
  const radius = kind === 'music' ? CITY.musicRadiusMeters : CITY.radiusMeters;
  const around = `(around:${radius},${CITY.lat},${CITY.lon})`;
  const filters = kind === 'shops'
    ? [`node["shop"]${around};`]
    : kind === 'music' ? [
      `node["shop"~"^(music|musical_instrument|hifi)$"]${around};`,
      `node["amenity"="music_venue"]${around};`
    ] : null;
  if (!filters) throw Error('Unknown directory type');
  return `[out:json][timeout:45];(${filters.join('')});out center ${kind === 'shops' ? 100 : 50};`;
}

function normalize(element, kind) {
  if (!['node','way','relation'].includes(element?.type) || !Number.isSafeInteger(element.id) || element.id <= 0) return null;
  const tags = element.tags || {};
  if (typeof tags !== 'object' || Array.isArray(tags)) return null;
  if (kind === 'shops' && !tags.shop) return null;
  if (kind === 'music' && !['music', 'musical_instrument', 'hifi'].includes(tags.shop) && tags.amenity !== 'music_venue') return null;
  const lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: `${element.type}/${element.id}`,
    name: String(tags.name || tags['name:en'] || '').slice(0, 180) || null,
    kind: kind === 'music' ? (tags.amenity === 'music_venue' ? 'music_venue' : tags.shop || 'music_club') : String(tags.shop).slice(0, 80),
    lat, lon,
    address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ').slice(0, 240) || null,
    openingHours: String(tags.opening_hours || '').slice(0, 120) || null,
    website: /^https?:\/\//i.test(tags.website || '') ? String(tags.website).slice(0, 500) : null,
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`
  };
}

function snapshot(shops, music, source, sourceScannedAt = null) {
  return {
    city: CITY.name,
    center: { lat: CITY.lat, lon: CITY.lon },
    radiusMeters: CITY.radiusMeters,
    musicRadiusMeters: CITY.musicRadiusMeters,
    indexedAt: new Date().toISOString(),
    sourceScannedAt,
    source,
    license: 'Open Database License (ODbL)',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    note: 'Bounded OSM node samples (shops within 2.5 km, music-related within 6.5 km); missing entries do not imply none exist.',
    shops, music,
    counts: { shops: shops.length, music: music.length }
  };
}

function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(a.lat - b.lat), dLon = radians(a.lon - b.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function collectCityFromCells(cells) {
  const shops = new Map(), music = new Map();
  const sourceDates = [];
  for (const cell of cells) {
    if (!Array.isArray(cell?.places) || !Number.isFinite(Date.parse(cell.scannedAt))) continue;
    sourceDates.push(cell.scannedAt);
    for (const place of cell.places) {
      const match = /^(node|way|relation)\/(\d+)$/.exec(place.id || '');
      if (!match || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      const element = { type: match[1], id: Number(match[2]), lat: place.lat, lon: place.lng, tags: place.tags };
      const km = distanceKm({ lat: element.lat, lon: element.lon }, { lat: CITY.lat, lon: CITY.lon });
      if (km <= CITY.radiusMeters / 1000) {
        const shop = normalize(element, 'shops');
        if (shop) shops.set(shop.id, shop);
      }
      if (km <= CITY.musicRadiusMeters / 1000) {
        const item = normalize(element, 'music');
        if (item) music.set(item.id, item);
      }
    }
  }
  if (!shops.size || !music.size) throw Error('Verified map cells do not yet contain both shops and music-related places.');
  return snapshot([...shops.values()], [...music.values()], 'OpenStreetMap via verified Overpass map cells', sourceDates.sort().at(-1));
}

export async function collectCityDirectory(fetchImpl = fetch, mirrors = MIRRORS) {
  async function collect(kind) {
    const query = queryFor(kind);
    let error;
    for (const mirror of mirrors) {
      try {
        const url = `${mirror}?data=${encodeURIComponent(query)}`;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(55_000), headers: { Accept: 'application/json', 'User-Agent': 'MegaPLAN-city-directory/1.0 (OpenStreetMap attribution)' } });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw Error('Invalid Overpass response');
        const rows = data.elements.map(e => normalize(e, kind)).filter(Boolean);
        return [...new Map(rows.map(row => [row.id, row])).values()];
      } catch (e) { error = e; }
    }
    throw Error(`Overpass ${kind} lookup failed on all mirrors: ${error?.message || 'unknown error'}`);
  }
  // Only return when both queries completed; a partial snapshot is not published.
  const shops = await collect('shops');
  const music = await collect('music');
  if (!shops.length || !music.length) throw Error('City source returned no shop or music records; empty response not published.');
  return snapshot(shops, music, 'OpenStreetMap via Overpass');
}
