/**
 * MegaPLAN Maps — Google Maps integrated alternative using Leaflet + OpenStreetMap
 * Features:
 * - Search places via Nominatim (OpenStreetMap geocoding, free, no API key)
 * - Display map via Leaflet (tileLayer openstreetmap.org)
 * - Places listing via Overpass API
 * - Directions via OSRM
 * - Current location, distance, markers, etc.
 * Based on GitHub: osmlab/awesome-openstreetmap, leaflet providers, MohitSutharOfficial/IDT-TRAE
 */
import { esc, mountShell, setOut, toast } from './kit.js';

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

export function mountMaps(root, tool) {
  const id = 'maps-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:320px 1fr;gap:0;min-height:70vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Search places</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Uses OpenStreetMap Nominatim (free, no API key). Google Maps alternative.</p>
          <div style="display:flex;gap:6px">
            <input id="${id}-search" class="field" placeholder="Search place, e.g. Trivandrum, Eiffel Tower" style="flex:1">
            <button class="btn primary" id="${id}-go">Go</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button class="btn secondary" id="${id}-loc" style="font-size:12px">📍 My location</button>
            <button class="btn ghost" id="${id}-clear" style="font-size:12px">Clear</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Places nearby</b>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-near="cafe" style="font-size:11px">☕ Cafes</button>
            <button class="btn ghost" data-near="restaurant" style="font-size:11px">🍽 Restaurants</button>
            <button class="btn ghost" data-near="hospital" style="font-size:11px">🏥 Hospitals</button>
            <button class="btn ghost" data-near="school" style="font-size:11px">🏫 Schools</button>
            <button class="btn ghost" data-near="bank" style="font-size:11px">🏦 Banks</button>
            <button class="btn ghost" data-near="park" style="font-size:11px">🌳 Parks</button>
          </div>
          <div id="${id}-places" style="margin-top:8px;max-height:200px;overflow:auto;font-size:12px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Directions</b>
          <div class="field-row" style="margin-top:6px">
            <input id="${id}-from" class="field" placeholder="From (lat,lng or place)">
            <input id="${id}-to" class="field" placeholder="To (lat,lng or place)">
          </div>
          <div class="button-row">
            <button class="btn secondary" id="${id}-route">Get route</button>
            <button class="btn ghost" id="${id}-swap" style="font-size:12px">Swap</button>
          </div>
          <div id="${id}-route-info" style="margin-top:8px;font-size:12px;color:#6e655b"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Distance calculator</b>
          <div class="field-row" style="margin-top:6px">
            <input id="${id}-lat1" class="num" placeholder="Lat 1" value="8.5241">
            <input id="${id}-lng1" class="num" placeholder="Lng 1" value="76.9366">
            <input id="${id}-lat2" class="num" placeholder="Lat 2" value="9.9312">
            <input id="${id}-lng2" class="num" placeholder="Lng 2" value="76.2673">
          </div>
          <button class="btn secondary" id="${id}-dist" style="margin-top:6px;font-size:12px">Calculate distance</button>
          <div id="${id}-dist-out" style="margin-top:6px;font-size:12px"></div>
        </div>

        <div id="${id}-meta" class="note" style="font-size:11px">Map: © OpenStreetMap contributors, Leaflet. Search: Nominatim (free). Places: Overpass API. Routing: OSRM. No Google API key needed, but you can switch to Google Maps tiles if you have key.</div>
      </aside>

      <div style="position:relative;min-height:400px;background:#efe6d8">
        <div id="${id}-map" style="width:100%;height:100%;min-height:70vh"></div>
        <div style="position:absolute;top:10px;right:10px;z-index:400;display:flex;gap:6px">
          <select id="${id}-tiles" class="sel" style="width:auto;font-size:12px;padding:6px 8px"><option value="osm">OSM Standard</option><option value="hot">OSM HOT</option><option value="topo">OpenTopoMap</option><option value="sat">Esri Satellite</option></select>
        </div>
      </div>
    </div>
    <div style="margin-top:10px" class="note">Maps tool: Search any place, list nearby cafes/restaurants/hospitals/schools/banks/parks via Overpass, get directions via OSRM, calculate distance, current location. For Google Maps integration, you can add Google tile layer if you have API key — but OSM is free and private. Based on GitHub awesome-openstreetmap.</div>
    <style>
      @media (max-width: 840px) {
        #${id}-main { grid-template-columns: 1fr !important; }
      }
    </style>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let map = null;
  let markers = [];
  let routeLine = null;
  let currentPos = null;

  async function initMap() {
    const L = await loadLeaflet();
    map = L.map($(`map`)).setView([8.5241, 76.9366], 12);
    
    const tiles = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
      hot: L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM, HOT' }),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' }),
      sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' })
    };
    
    tiles.osm.addTo(map);
    
    $(`tiles`).onchange = () => {
      Object.values(tiles).forEach(t => { if (map.hasLayer(t)) map.removeLayer(t); });
      const sel = $(`tiles`).value;
      tiles[sel].addTo(map);
    };
    
    map.on('click', e => {
      const { lat, lng } = e.latlng;
      addMarker(lat, lng, `Clicked: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    });
  }

  function addMarker(lat, lng, popup) {
    const L = window.L;
    if (!L || !map) return;
    const m = L.marker([lat, lng]).addTo(map);
    if (popup) m.bindPopup(popup).openPopup();
    markers.push(m);
    return m;
  }

  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    $(`places`).innerHTML = '';
    $(`route-info`).innerHTML = '';
  }

  async function searchPlace(query) {
    if (!query) return toast('Enter place');
    $(`meta`).textContent = 'Searching via Nominatim…';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await r.json();
      if (!data.length) {
        $(`meta`).textContent = 'No results for ' + query;
        return;
      }
      
      $(`meta`).innerHTML = `Found ${data.length} results for <b>${esc(query)}</b>`;
      $(`places`).innerHTML = data.map((p,i) => `
        <div style="padding:6px 8px;border-bottom:1px solid #f0e6d6;cursor:pointer" data-idx="${i}">
          <b>${esc(p.display_name.split(',').slice(0,3).join(','))}</b><br>
          <small style="color:#8a7f72">${esc(p.display_name)}<br>Type: ${esc(p.type)} · ${esc(p.class)} · Lat: ${Number(p.lat).toFixed(4)}, Lng: ${Number(p.lon).toFixed(4)}</small>
        </div>
      `).join('');
      
      $(`places`).querySelectorAll('[data-idx]').forEach(el => {
        el.onclick = () => {
          const p = data[Number(el.dataset.idx)];
          const lat = Number(p.lat), lng = Number(p.lon);
          map.setView([lat, lng], 15);
          addMarker(lat, lng, `<b>${esc(p.display_name)}</b><br>${esc(p.type)} · ${esc(p.class)}`);
          $(`from`).value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        };
      });
      
      // Auto go to first result
      const first = data[0];
      map.setView([Number(first.lat), Number(first.lon)], 14);
      addMarker(Number(first.lat), Number(first.lon), `<b>${esc(first.display_name)}</b>`);
      
    } catch (e) {
      $(`meta`).textContent = 'Search failed: ' + e.message + ' — try again, Nominatim has rate limits';
    }
  }

  async function findNearby(type) {
    if (!map) return toast('Map not ready');
    const center = map.getCenter();
    const lat = center.lat, lng = center.lng;
    $(`places`).innerHTML = `<div style="padding:10px;color:#8a7f72">Finding nearby ${esc(type)} via Overpass API…</div>`;
    
    try {
      const query = `[out:json][timeout:15];(node["amenity"="${type}"](around:2000,${lat},${lng});way["amenity"="${type}"](around:2000,${lat},${lng}););out 20;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
      const r = await fetch(url);
      const data = await r.json();
      
      const elements = data.elements || [];
      if (!elements.length) {
        $(`places`).innerHTML = `<div style="padding:10px">No ${esc(type)} found within 2km of map center.</div>`;
        return;
      }
      
      $(`places`).innerHTML = elements.slice(0, 20).map(el => `
        <div style="padding:6px 8px;border-bottom:1px solid #f0e6d6">
          <b>${esc(el.tags?.name || type)}</b> ${el.tags?.name ? '' : '(unnamed)'}<br>
          <small style="color:#8a7f72">${esc(el.tags?.amenity || '')} ${el.tags?.cuisine ? '· ' + esc(el.tags.cuisine) : ''} · ${el.lat ? Number(el.lat).toFixed(4)+','+Number(el.lon).toFixed(4) : ''}</small>
        </div>
      `).join('') + (elements.length > 20 ? `<div class="muted" style="padding:6px">… and ${elements.length - 20} more</div>` : '');
      
      // Add markers
      elements.slice(0, 20).forEach(el => {
        if (el.lat && el.lon) {
          addMarker(el.lat, el.lon, `<b>${esc(el.tags?.name || type)}</b><br>${esc(el.tags?.amenity || '')}`);
        }
      });
      
    } catch (e) {
      $(`places`).innerHTML = `<div style="padding:10px;color:#a33b3b">Nearby search failed: ${esc(e.message)}<br>Overpass API may be rate-limited, try again.</div>`;
    }
  }

  async function getRoute() {
    const from = $(`from`).value.trim();
    const to = $(`to`).value.trim();
    if (!from || !to) return toast('Enter from and to');
    
    // Parse lat,lng or try geocode
    async function parseLocation(input) {
      // Try lat,lng
      const m = input.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (m) return [Number(m[1]), Number(m[2])];
      // Geocode
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=1`;
      const r = await fetch(url);
      const data = await r.json();
      if (!data[0]) throw Error('Could not geocode: ' + input);
      return [Number(data[0].lat), Number(data[0].lon)];
    }
    
    $(`route-info`).textContent = 'Routing via OSRM…';
    
    try {
      const [lat1, lng1] = await parseLocation(from);
      const [lat2, lng2] = await parseLocation(to);
      
      const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
      const r = await fetch(url);
      const data = await r.json();
      
      if (!data.routes || !data.routes[0]) throw Error('No route found');
      
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      
      const L = window.L;
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(coords, { color: '#c45c26', weight: 5, opacity: 0.8 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [20,20] });
      
      $(`route-info`).innerHTML = `
        <b>Route:</b> ${(route.distance/1000).toFixed(1)} km · ${Math.floor(route.duration/60)} min<br>
        <small>From ${lat1.toFixed(4)},${lng1.toFixed(4)} to ${lat2.toFixed(4)},${lng2.toFixed(4)}<br>
        Driving via OSRM (free). For walking/cycling, change profile in URL.</small>
      `;
      
      addMarker(lat1, lng1, `From: ${esc(from)}`);
      addMarker(lat2, lng2, `To: ${esc(to)}`);
      
    } catch (e) {
      $(`route-info`).textContent = 'Route failed: ' + e.message;
    }
  }

  function calcDistance() {
    const lat1 = Number($(`lat1`).value);
    const lng1 = Number($(`lng1`).value);
    const lat2 = Number($(`lat2`).value);
    const lng2 = Number($(`lng2`).value);
    
    if (!lat1 || !lng1 || !lat2 || !lng2) return toast('Enter all lat/lng');
    
    // Haversine
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    
    $(`dist-out`).innerHTML = `
      <b>Straight line:</b> ${dist.toFixed(2)} km · ${(dist*0.621371).toFixed(2)} miles<br>
      <small>Haversine formula. For road distance, use Directions above (OSRM).</small>
    `;
  }

  // Bindings
  $(`go`).onclick = () => searchPlace($(`search`).value.trim());
  $(`search`).addEventListener('keydown', e => { if (e.key === 'Enter') searchPlace($(`search`).value.trim()); });
  $(`loc`).onclick = () => {
    if (!navigator.geolocation) return toast('Geolocation not available');
    $(`meta`).textContent = 'Getting location…';
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      currentPos = [lat, lng];
      map.setView([lat, lng], 15);
      addMarker(lat, lng, `You are here<br>${lat.toFixed(4)}, ${lng.toFixed(4)}<br>Accuracy: ${pos.coords.accuracy.toFixed(0)}m`);
      $(`from`).value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      $(`meta`).textContent = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }, err => {
      $(`meta`).textContent = 'Location failed: ' + err.message;
    });
  };
  $(`clear`).onclick = clearMarkers;
  body.querySelectorAll('[data-near]').forEach(b => b.onclick = () => findNearby(b.dataset.near));
  $(`route`).onclick = getRoute;
  $(`swap`).onclick = () => { const f = $(`from`).value; $(`from`).value = $(`to`).value; $(`to`).value = f; };
  $(`dist`).onclick = calcDistance;

  initMap();
}
