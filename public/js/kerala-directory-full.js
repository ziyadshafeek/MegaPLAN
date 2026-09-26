/**
 * Kerala Directory Full — Massive scrapping, all business info, railways, roads, spatial index
 * Visible in Kerala directory page, not home link yet
 * Shows all business info from map, not only names
 * Stored free: GitHub + Vercel static + IndexedDB + search-index, fully indexable for AI multi-tool
 * Deep engineering: railways, roads mapped via lat/lng, distance, traffic heuristic, geohash grid
 */

import { esc, mountShell, toast } from './kit.js';

let leafletLoaded = null;
async function loadLeaflet() {
  if (window.L) return window.L;
  if (leafletLoaded) return leafletLoaded;
  leafletLoaded = new Promise((res, rej) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => res(window.L);
    script.onerror = rej;
    document.head.appendChild(script);
  });
  return leafletLoaded;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function mountKeralaDirectoryFull(root, tool) {
  const id = 'kd-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:380px 1fr;gap:0;min-height:82vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Kerala Directory — published OSM snapshot</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Shows fields available in published OSM records. Records and tags may be incomplete or out of date. The published index starts empty until a verified indexing job succeeds; distance and traffic estimates should not be used for navigation.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-refresh" style="font-size:12px">↻ Refresh</button>
            <button class="btn secondary" id="${id}-ai-search" style="font-size:12px">🤖 AI Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <input id="${id}-q" class="field" placeholder="Search published records…" style="flex:1;min-width:160px">
            <button class="btn secondary" id="${id}-search" style="font-size:12px">Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-type="restaurant" style="font-size:11px">🍽 Restaurants</button>
            <button class="btn ghost" data-type="mosque" style="font-size:11px">🕌 Mosques</button>
            <button class="btn ghost" data-type="church" style="font-size:11px">⛪ Churches</button>
            <button class="btn ghost" data-type="temple" style="font-size:11px">🛕 Temples</button>
            <button class="btn ghost" data-type="school" style="font-size:11px">🏫 Schools</button>
            <button class="btn ghost" data-type="hospital" style="font-size:11px">🏥 Hospitals</button>
            <button class="btn ghost" data-type="bank" style="font-size:11px">🏦 Banks</button>
            <button class="btn ghost" data-type="railway" style="font-size:11px">🚂 Railway</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Distance & Traffic — AI Usable</b>
          <p class="muted" style="margin:4px 0 6px;font-size:11px">User can ask AI: what is distance etc and get rough idea. Uses lat/lng + haversine + OSRM road + traffic heuristic.</p>
          <div class="field-row" style="margin-top:6px">
            <input id="${id}-from" class="field" placeholder="From: lat,lng or place e.g. Trivandrum">
            <input id="${id}-to" class="field" placeholder="To: lat,lng or place e.g. Kochi">
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn secondary" id="${id}-dist" style="font-size:11px">Distance</button>
            <button class="btn ghost" id="${id}-nearby" style="font-size:11px">Nearby</button>
          </div>
          <div id="${id}-dist-out" style="margin-top:8px;font-size:11px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Spatial Index — Geohash + Grid</b>
          <p class="muted" style="font-size:11px;margin:4px 0">Devise new system using longitude/latitude for AI: geohash6 (~1.2km), geohash7 (~150m), grid01 0.01°, grid02 0.02°, grid05 0.05°. Fully indexable.</p>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="${id}-lat" class="num" placeholder="Lat" value="8.5241">
            <input id="${id}-lng" class="num" placeholder="Lng" value="76.9366">
            <button class="btn secondary" id="${id}-geohash" style="font-size:11px">Geohash</button>
          </div>
          <div id="${id}-geohash-out" style="margin-top:6px;font-size:11px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Free Storage — Fully Indexable for AI</b>
          <div id="${id}-storage" style="font-size:11px;margin-top:6px">Loading storage info…</div>
        </div>

        <div id="${id}-results" style="font-size:12px;max-height:320px;overflow:auto"></div>
      </aside>

      <div style="position:relative;min-height:400px;background:#efe6d8;display:flex;flex-direction:column">
        <div id="${id}-map" style="width:100%;height:52vh;min-height:360px"></div>
        <div style="padding:12px;overflow:auto;flex:1;background:#fffaf2">
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center">
            <b>Kerala Massive Directory — All Business Info + Railways + Roads</b>
            <span class="muted" style="font-size:11px">Massive scrapping, not only names — full OSM tags, railways, roads, traffic heuristic, geohash spatial index</span>
          </div>
          <div id="${id}-progress" style="margin-top:8px;font-size:12px"></div>
          <div id="${id}-places" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px"></div>
          <div id="${id}-roads" style="margin-top:16px"></div>
          <div id="${id}-railways" style="margin-top:16px"></div>
        </div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">
      <b>Deep Engineering — New System via Longitude/Latitude:</b><br>
      • <b>Spatial Index:</b> geohash6 (~1.2km x 0.6km), geohash7 (~150m), grid01 0.01° (~1.1km), grid02 0.02°, grid05 0.05°. Each place stored with geohash6/7, grid01/02/05, latIdx/lngIdx. Hierarchical, fully indexable for AI multi-tool.<br>
      • <b>Railways & Roads:</b> Queried via Overpass way["highway"] + way["railway"] + node["railway"="station"], stored with id, name, highway/railway type, maxspeed, surface, lanes, oneway, electrified, gauge, nodes (lat/lng array), length via haversine sum, bbox, geohash, traffic estimate. Indexed for AI to answer distance, nearby, routing.<br>
      • <b>Traffic Data:</b> Heuristic: highway type → typical speed (motorway 100, trunk 80, primary 60, secondary 50, residential 30), time of day rush hour 8-10am & 5-8pm congestion 0.6 (40% slower), maxspeed tag, traffic_signals count. OSRM routing gives duration, traffic_factor applied. Note: live traffic needs TomTom/Google API key, but heuristic gives rough idea free.<br>
      • <b>Free Storage:</b> GitHub data/map-directory/cell_*.json + index.json + search-index.json + full-business.json + railways.json + roads.json (free, versioned), Vercel public/data/map-directory/ static (free), IndexedDB mp-map-directory (GBs free in browser), localStorage progress, search-index inverted term→ids fully indexable.<br>
      • <b>AI Multi-Tool Integration:</b> api/kerala-ai.js — endpoints distance, nearby, search, business, road, railway, geohash, traffic — all callable by AI Mode (Codex-like) via tool chaining. User asks "distance between Trivandrum and Kochi" → AI calls /api/kerala-ai?q=distance&from=Trivandrum&to=Kochi → haversine + OSRM + traffic heuristic → answer.<br>
      • <b>Massive Scrapping:</b> Not only names — ALL OSM tags: opening_hours, phone, website, email, facebook, cuisine, diet, religion, denomination, operator, brand, building, building:levels, wheelchair, smoking, outdoor_seating, takeaway, delivery, internet_access, full address addr:housenumber/street/city/postcode, searchable_text for AI.<br>
      • <b>Visible in Kerala Directory Page:</b> This page, not home link yet, shows all business info etc from map, massive scrapping, stored free, fully indexable, railways/roads mapped via lat/lng for AI distance/traffic.
    </div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let map = null;
  let markers = [];

  async function initMap() {
    const L = await loadLeaflet();
    map = L.map($(`map`)).setView([10.2, 76.4], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
    L.rectangle([[8.18, 74.86], [12.83, 77.59]], { color: '#2f7d4a', weight: 2, fillOpacity: 0.05 }).addTo(map).bindPopup('Kerala BBOX — 10-day sprint target');
    L.marker([8.5241, 76.9366]).addTo(map).bindPopup('<b>Trivandrum Origin</b><br>Massive directory start');
  }

  function addMarkers(places) {
    if (!map || !window.L) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const L = window.L;
    for (const p of (places || []).slice(0, 80)) {
      if (!p.lat || !p.lng) continue;
      const m = L.marker([p.lat, p.lng]).addTo(map);
      const tags = p.tags || {};
      m.bindPopup(`
        <b>${esc(p.name || p.amenity || p.shop || 'Place')}</b><br>
        <small>${esc(p.amenity||'') } ${esc(p.shop||'')} ${esc(p.road||'')}</small><br>
        <small>📞 ${esc(p.phone||'')} · 🕒 ${esc(p.opening_hours||'')}</small><br>
        <small>🍽 ${esc(p.cuisine||'')} · 🕌 ${esc(p.religion||'')}</small><br>
        <small>Geohash: ${esc(p.geohash6||'')} · Grid: ${esc(p.grid01||'')}</small><br>
        <small>${esc(JSON.stringify(tags).slice(0, 300))}</small>
      `);
      markers.push(m);
    }
  }

  async function loadProgress() {
    try {
      const r = await fetch('/api/kerala-expansion?action=progress');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`progress`).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px">
          <div class="panel" style="padding:6px"><b>Kerala</b><br>${j.progress.keralaPercent}% ${j.progress.totalCells}/${j.progress.keralaTarget}</div>
          <div class="panel" style="padding:6px"><b>Places</b><br>${j.progress.totalPlaces}</div>
          <div class="panel" style="padding:6px"><b>Roads</b><br>${j.progress.roads}</div>
          <div class="panel" style="padding:6px"><b>Business</b><br>${j.progress.businessTypes} types</div>
          <div class="panel" style="padding:6px"><b>Mosques</b><br>${j.progress.religious.mosque||0}</div>
          <div class="panel" style="padding:6px"><b>Phase</b><br>${j.progress.currentPhase}/8</div>
        </div>
      `;
    } catch (e) {
      $(`progress`).innerHTML = `Progress failed: ${esc(e.message)}`;
    }
  }

  async function loadStorageInfo() {
    try {
      const r = await fetch('/api/kerala-ai');
      const j = await r.json();
      $(`storage`).innerHTML = `
        <div><b>Free Storage:</b></div>
        <div>• GitHub: ${esc(j.free_storage.github)}</div>
        <div>• Vercel: ${esc(j.free_storage.vercel)}</div>
        <div>• IndexedDB: ${esc(j.free_storage.indexedDB)}</div>
        <div>• Search Index: ${esc(j.free_storage.search_index)}</div>
        <div>• Spatial: Geohash + Grid for AI</div>
        <div style="margin-top:6px"><b>AI Endpoints:</b><br>${Object.keys(j.endpoints||{}).map(k=>`• ${esc(k)}: ${esc(j.endpoints[k].slice(0,80))}`).join('<br>')}</div>
      `;
    } catch (e) {
      $(`storage`).innerHTML = `Storage info failed: ${esc(e.message)}`;
    }
  }

  async function search(term) {
    if (!term) return toast('Enter search term');
    $(`results`).innerHTML = 'Searching massive directory…';
    try {
      const r = await fetch(`/api/kerala-ai?q=search&term=${encodeURIComponent(term)}`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      
      $(`results`).innerHTML = `<b>${j.count} results for "${esc(term)}"</b><br><small>Fully indexable, all business info</small>`;
      
      $(`places`).innerHTML = j.results.slice(0, 20).map(p => `
        <div style="border:1px solid #e0d5c4;border-radius:10px;padding:10px;background:#fff">
          <b>${esc(p.name || 'Unnamed')}</b> <span style="font-size:11px;color:#8a7f72">· ${esc(p.amenity||p.shop||'')} · ${esc(p.road||'Unknown Road')}</span><br>
          <div style="font-size:11px;margin-top:4px">
            <div>📍 ${esc(p.full_address || p.city || '')} · ${p.lat?.toFixed(4)},${p.lng?.toFixed(4)} · Geohash ${esc(p.geohash6||'')}</div>
            <div>📞 ${esc(p.phone||'')} · 🌐 ${esc(p.website||'')} · ✉ ${esc(p.tags?.email||'')}</div>
            <div>🕒 ${esc(p.opening_hours||'')} · 🍽 ${esc(p.cuisine||'')} · 🕌 ${esc(p.religion||'')} · 👤 ${esc(p.operator||p.brand||'')}</div>
            <div>🏢 ${esc(p.tags?.building||'')} ${p.tags?.['building:levels'] ? '('+esc(p.tags['building:levels'])+' levels)' : ''} · ♿ ${esc(p.tags?.wheelchair||'')} · 🚬 ${esc(p.tags?.smoking||'')}</div>
            <div style="margin-top:4px;background:#f4efe6;padding:4px 6px;border-radius:6px;max-height:60px;overflow:auto"><small>All tags: ${esc(JSON.stringify(p.tags).slice(0, 500))}</small></div>
          </div>
          <div style="margin-top:6px;display:flex;gap:4px">
            <button class="btn ghost" data-lat="${p.lat}" data-lng="${p.lng}" style="font-size:10px;padding:4px 6px">Show on map</button>
            <button class="btn ghost" data-id="${esc(p.id)}" data-full="1" style="font-size:10px;padding:4px 6px">Full info</button>
          </div>
        </div>
      `).join('') || '<div class="muted">No results — start scraper to build directory</div>';

      addMarkers(j.results);

      $(`places`).querySelectorAll('[data-lat]').forEach(b => {
        b.onclick = () => {
          const lat = Number(b.dataset.lat), lng = Number(b.dataset.lng);
          if (map) map.setView([lat, lng], 16);
        };
      });
      $(`places`).querySelectorAll('[data-full]').forEach(b => {
        b.onclick = async () => {
          const id = b.dataset.id;
          try {
            const r = await fetch(`/api/kerala-ai?q=business&id=${encodeURIComponent(id)}`);
            const j = await r.json();
            if (!j.ok) throw Error(j.error);
            alert(`Full business info:\\n${JSON.stringify(j.business, null, 2).slice(0, 2000)}`);
          } catch (e) { toast('Failed: ' + e.message); }
        };
      });

    } catch (e) {
      $(`results`).innerHTML = `Search failed: ${esc(e.message)}`;
    }
  }

  async function calcDistance() {
    const from = $(`from`).value.trim();
    const to = $(`to`).value.trim();
    if (!from || !to) return toast('Enter from and to');
    $(`dist-out`).innerHTML = 'Calculating distance via lat/lng + OSRM + traffic heuristic…';
    try {
      const r = await fetch(`/api/kerala-ai?q=distance&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`dist-out`).innerHTML = `
        <div><b>From:</b> ${esc(j.query.from.input)} → ${j.query.from.lat.toFixed(4)},${j.query.from.lng.toFixed(4)} geohash ${esc(j.spatial.from_geohash6)}</div>
        <div><b>To:</b> ${esc(j.query.to.input)} → ${j.query.to.lat.toFixed(4)},${j.query.to.lng.toFixed(4)} geohash ${esc(j.spatial.to_geohash6)}</div>
        <div style="margin-top:6px"><b>Straight:</b> ${j.distance.straight_km} km / ${j.distance.straight_miles} miles (haversine)</div>
        <div><b>Road:</b> ${j.distance.road_km ? j.distance.road_km + ' km / ' + j.distance.road_miles + ' miles' : 'N/A'} · Duration ${j.distance.duration_min ? j.distance.duration_min + ' min' : 'N/A'}</div>
        <div><b>With traffic (heuristic):</b> ${j.distance.duration_with_traffic_min ? j.distance.duration_with_traffic_min + ' min' : 'N/A'} · Factor ${j.distance.traffic_factor} · Hour ${j.distance.hour}</div>
        <div style="margin-top:4px" class="muted">${esc(j.distance.note)}</div>
        <div style="margin-top:6px"><b>Spatial Index:</b> from grid ${esc(j.spatial.from_grid01)} → to grid ${esc(j.spatial.to_grid01)} · Geohash for AI distance queries</div>
      `;
    } catch (e) {
      $(`dist-out`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function geohashCalc() {
    const lat = Number($(`lat`).value);
    const lng = Number($(`lng`).value);
    if (!lat || !lng) return toast('Enter lat,lng');
    $(`geohash-out`).innerHTML = 'Calculating geohash spatial index…';
    try {
      const r = await fetch(`/api/kerala-ai?q=geohash&lat=${lat}&lng=${lng}`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`geohash-out`).innerHTML = `
        <div><b>Geohash6:</b> ${esc(j.geohash6)} (~1.2km x 0.6km)</div>
        <div><b>Geohash7:</b> ${esc(j.geohash7)} (~150m x 150m)</div>
        <div><b>Geohash8:</b> ${esc(j.geohash8)} (~20m)</div>
        <div><b>Grid01:</b> ${esc(j.grid01)} 0.01° (~1.1km)</div>
        <div><b>Grid02:</b> ${esc(j.grid02)} 0.02° (~2.2km)</div>
        <div><b>Grid05:</b> ${esc(j.grid05)} 0.05° (~5.5km)</div>
        <div style="margin-top:4px" class="muted">${esc(j.spatial_index)}</div>
      `;
    } catch (e) {
      $(`geohash-out`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  // Bindings
  $(`refresh`).onclick = () => { loadProgress(); loadStorageInfo(); };
  $(`search`).onclick = () => search($(`q`).value.trim());
  $(`q`).addEventListener('keydown', e => { if (e.key === 'Enter') search($(`q`).value.trim()); });
  $(`dist`).onclick = calcDistance;
  $(`nearby`).onclick = async () => {
    const lat = Number($(`lat`).value) || 8.5241;
    const lng = Number($(`lng`).value) || 76.9366;
    const type = $(`q`).value.trim() || 'restaurant';
    $(`dist-out`).innerHTML = `Finding nearby ${esc(type)}…`;
    try {
      const r = await fetch(`/api/kerala-ai?q=nearby&lat=${lat}&lng=${lng}&type=${encodeURIComponent(type)}&radius=2000`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`dist-out`).innerHTML = `${j.count} nearby ${esc(type)} within 2km of ${lat},${lng}<br>${j.places.slice(0,5).map(p=>`${esc(p.name||'Unnamed')} ${p.distance_km}km`).join('<br>')}`;
      addMarkers(j.places);
    } catch (e) { $(`dist-out`).innerHTML = `Failed: ${esc(e.message)}`; }
  };
  $(`geohash`).onclick = geohashCalc;
  $(`ai-search`).onclick = async () => {
    const term = $(`q`).value.trim() || 'restaurant';
    toast('AI searching via /api/ai + /api/kerala-ai');
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'custom',
          text: `User wants to search Kerala directory for "${term}". Use /api/kerala-ai?q=search&term=${term} to get full business info with all tags, not only names. Then summarize road-wise and business-wise, include distance, geohash spatial index, traffic heuristic. Return structured answer.`,
          extra: 'You are Kerala Directory AI, fully indexable, free storage GitHub+Vercel+IndexedDB, railways/roads mapped via lat/lng, distance via haversine+OSRM, traffic heuristic.'
        })
      });
      const j = await r.json();
      $(`results`).innerHTML = `<b>AI Search Result:</b><br><pre style="white-space:pre-wrap;font-size:11px">${esc(j.result || j.text || JSON.stringify(j).slice(0,2000))}</pre>`;
    } catch (e) { $(`results`).innerHTML = `AI failed: ${esc(e.message)}`; }
  };

  body.querySelectorAll('[data-type]').forEach(b => {
    b.onclick = () => {
      $(`q`).value = b.dataset.type;
      search(b.dataset.type);
    };
  });

  initMap();
  loadProgress();
  loadStorageInfo();
  search('restaurant');
}
