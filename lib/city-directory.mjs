// Bounded, attributed OpenStreetMap snapshot for Thiruvananthapuram.
// No records are invented or written when either upstream query fails.
export const CITY = Object.freeze({ name: 'Thiruvananthapuram (Trivandrum)', lat: 8.524139, lon: 76.936638, radiusMeters: 6500 });
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export function queryFor(kind) {
  const around = `(around:${CITY.radiusMeters},${CITY.lat},${CITY.lon})`;
  const filters = kind === 'shops'
    ? [`nwr["shop"]${around};`]
    : kind === 'music' ? [
      `nwr["shop"~"^(music|musical_instrument)$"]${around};`,
      `nwr["amenity"="music_venue"]${around};`,
      `nwr["club"="music"]${around};`
    ] : null;
  if (!filters) throw Error('Unknown directory type');
  return `[out:json][timeout:25];(${filters.join('')});out center 300;`;
}

function normalize(element, kind) {
  if (!['node','way','relation'].includes(element?.type) || !Number.isSafeInteger(element.id) || element.id <= 0) return null;
  const tags = element.tags || {};
  if (typeof tags !== 'object' || Array.isArray(tags)) return null;
  if (kind === 'shops' && !tags.shop) return null;
  if (kind === 'music' && !['music', 'musical_instrument'].includes(tags.shop) && tags.amenity !== 'music_venue' && tags.club !== 'music') return null;
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

export async function collectCityDirectory(fetchImpl = fetch, mirrors = MIRRORS) {
  async function collect(kind) {
    const query = queryFor(kind);
    let error;
    for (const mirror of mirrors) {
      try {
        const url = `${mirror}?data=${encodeURIComponent(query)}`;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': 'MegaPLAN-city-directory/1.0 (OpenStreetMap attribution)' } });
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
  return {
    city: CITY.name,
    center: { lat: CITY.lat, lon: CITY.lon },
    radiusMeters: CITY.radiusMeters,
    indexedAt: new Date().toISOString(),
    source: 'OpenStreetMap via Overpass',
    license: 'Open Database License (ODbL)',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    note: 'Bounded OSM sample; missing entries do not imply no businesses or venues exist.',
    shops, music,
    counts: { shops: shops.length, music: music.length }
  };
}
