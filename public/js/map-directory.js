/**
 * Map Directory — Massive directory map starting from Trivandrum
 * Features:
 * - View directory stats, road-wise, business-wise, religious
 * - Search places
 * - Map view with Leaflet
 * - Auto scraper that runs continuously in background
 * - Uses localStorage + IndexedDB for massive storage
 * - Polls /api/map-scraper and /api/map-directory
 * - AI classification via /api/ai (NVIDIA)
 */

import { esc, mountShell, toast } from './kit.js';

const LS_PROGRESS = 'mp-map-dir-progress';
const LS_DIRECTORY = 'mp-map-directory';

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

// IndexedDB for massive storage
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mp-map-directory', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cells')) db.createObjectStore('cells', { keyPath: 'index' });
      if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCellToIDB(cell) {
  try {
    const db = await openDB();
    const tx = db.transaction(['cells', 'places'], 'readwrite');
    tx.objectStore('cells').put({ index: cell.current?.index ?? cell.index, lat: cell.current?.lat, lng: cell.current?.lng, places: cell.places?.length || 0, roads: cell.roads?.length || 0, scannedAt: new Date().toISOString(), data: cell });
    for (const p of (cell.places || []).slice(0, 100)) {
      try { tx.objectStore('places').put(p); } catch {}
    }
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch {}
}

async function getIDBStats() {
  try {
    const db = await openDB();
    const tx = db.transaction(['cells', 'places'], 'readonly');
    const cellsCount = await new Promise(res => { const r = tx.objectStore('cells').count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); });
    const placesCount = await new Promise(res => { const r = tx.objectStore('places').count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); });
    db.close();
    return { cellsCount, placesCount };
  } catch { return { cellsCount: 0, placesCount: 0 }; }
}

function getProgress() {
  try { return JSON.parse(localStorage.getItem(LS_PROGRESS) || '{"lastIndex":-1,"totalPlaces":0,"totalCells":0}'); } catch { return { lastIndex: -1, totalPlaces: 0, totalCells: 0 }; }
}
function setProgress(p) { localStorage.setItem(LS_PROGRESS, JSON.stringify(p)); }

export function mountMapDirectory(root, tool) {
  const id = 'md-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Massive Directory Map — Trivandrum origin</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Browse published map data or scan a cell into your browser. Scheduled repository jobs, not visitor devices, update the published directory.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-start" style="font-size:12px">About indexing</button>
            <button class="btn secondary" id="${id}-stop" style="font-size:12px">⏸ Stop</button>
            <button class="btn ghost" id="${id}-scan1" style="font-size:12px">Scan 1 cell now</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" id="${id}-scan5" style="font-size:11px">Scan 5 cells</button>
            <button class="btn ghost" id="${id}-export" style="font-size:11px">Export JSON</button>
            <button class="btn ghost" id="${id}-clear" style="font-size:11px">Clear local</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Progress</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
          <div style="margin-top:8px;background:#e0d5c4;border-radius:8px;height:10px;overflow:hidden"><div id="${id}-bar" style="height:100%;width:0%;background:#c45c26;transition:width 0.3s"></div></div>
          <div id="${id}-stats" style="font-size:11px;color:#6e655b;margin-top:6px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Search directory</b>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="${id}-q" class="field" placeholder="Search place, road, business…" style="flex:1">
            <button class="btn secondary" id="${id}-search" style="font-size:12px">Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-btype="restaurant" style="font-size:11px">🍽 Restaurants</button>
            <button class="btn ghost" data-btype="cafe" style="font-size:11px">☕ Cafes</button>
            <button class="btn ghost" data-btype="mosque" style="font-size:11px">🕌 Mosques</button>
            <button class="btn ghost" data-btype="church" style="font-size:11px">⛪ Churches</button>
            <button class="btn ghost" data-btype="temple" style="font-size:11px">🛕 Temples</button>
            <button class="btn ghost" data-btype="school" style="font-size:11px">🏫 Schools</button>
            <button class="btn ghost" data-btype="hospital" style="font-size:11px">🏥 Hospitals</button>
            <button class="btn ghost" data-btype="bank" style="font-size:11px">🏦 Banks</button>
          </div>
          <div id="${id}-results" style="margin-top:8px;max-height:240px;overflow:auto;font-size:12px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Classification</b>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn secondary" id="${id}-roadwise" style="font-size:11px">Road-wise</button>
            <button class="btn secondary" id="${id}-bizwise" style="font-size:11px">Business-wise</button>
            <button class="btn ghost" id="${id}-religious" style="font-size:11px">Religious</button>
          </div>
          <div id="${id}-class" style="margin-top:8px;max-height:200px;overflow:auto;font-size:11px"></div>
        </div>

        <div id="${id}-log" class="note" style="font-size:11px;max-height:120px;overflow:auto">Manual scans query public map data and save locally. Site indexing runs separately.</div>
      </aside>

      <div style="position:relative;min-height:400px;background:#efe6d8;display:flex;flex-direction:column">
        <div id="${id}-map" style="width:100%;height:50vh;min-height:320px"></div>
        <div style="padding:12px;overflow:auto;flex:1;background:#fffaf2">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between">
            <b>Directory — Trivandrum & beyond</b>
            <span class="muted" style="font-size:11px">Published directory snapshot · local manual scanning</span>
          </div>
          <div id="${id}-dir" style="margin-top:8px;font-size:12px">Loading directory…</div>
          <div id="${id}-places" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px"></div>
        </div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">Published directory data is a snapshot from scheduled repository jobs. Scan a cell on demand to keep an IndexedDB copy on this device; it does not publish to the site. Coverage depends on completed jobs and public Overpass availability.</div>
    <style>
      @media (max-width: 900px) { #${id}-main { grid-template-columns: 1fr !important; } }
    </style>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let map = null;
  let markers = [];

  function log(msg) {
    const el = $(`log`);
    el.innerHTML = `${new Date().toLocaleTimeString()} — ${esc(msg)}<br>` + el.innerHTML;
  }

  async function initMap() {
    const L = await loadLeaflet();
    map = L.map($(`map`)).setView([8.5241, 76.9366], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
    // Show progress cells
    const prog = getProgress();
    if (prog.lastLat && prog.lastLng) map.setView([prog.lastLat, prog.lastLng], 14);
  }

  function addMarkers(places) {
    if (!map || !window.L) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const L = window.L;
    for (const p of (places || []).slice(0, 100)) {
      if (!p.lat || !p.lng) continue;
      const m = L.marker([p.lat, p.lng]).addTo(map);
      m.bindPopup(`<b>${esc(p.name || p.amenity || p.shop || 'Place')}</b><br>${esc(p.amenity || '')} ${esc(p.shop || '')}<br><small>${esc(p.road || '')} · ${p.distance ? p.distance.toFixed(2)+'km' : ''}</small><br><small>${esc(JSON.stringify(p.tags).slice(0,200))}</small>`);
      markers.push(m);
    }
  }

  async function updateProgressUI() {
    const prog = getProgress();
    const idb = await getIDBStats();
    // Fetch server index and Kerala expansion progress
    let serverIdx = null;
    let keralaProgress = null;
    try {
      const r = await fetch('/api/map-directory?action=stats');
      const j = await r.json();
      if (j.ok) serverIdx = j.index;
    } catch {}
    try {
      const r = await fetch('/api/kerala-expansion?action=progress');
      const j = await r.json();
      if (j.ok) keralaProgress = j.progress;
    } catch {}

    const total = serverIdx ? serverIdx.totalCells : prog.totalCells;
    const places = serverIdx ? serverIdx.totalPlaces : prog.totalPlaces;
    const lastIdx = serverIdx ? serverIdx.lastIndex : prog.lastIndex;

    $(`progress`).innerHTML = `
      <div>Last index: <b>${lastIdx}</b> · Cells: <b>${total}</b> · Places: <b>${places}</b></div>
      <div>Local IDB: ${idb.cellsCount} cells, ${idb.placesCount} places</div>
      <div>Next: ${lastIdx+1} → lat ${(8.524139 + (Math.floor((lastIdx+1)/5)-2)*0.01).toFixed(4)} (spiral)</div>
      <div style="margin-top:4px">Status: Published snapshot; manual scans stay on this device</div>
      ${keralaProgress ? `<div style="margin-top:6px;padding:6px;background:#f7ead3;border-radius:6px"><b>Kerala 10-day:</b> ${keralaProgress.keralaPercent}% (${total}/${keralaProgress.keralaTarget} cells) · Phase ${keralaProgress.currentPhase} · ${keralaProgress.daysElapsed}d elapsed, ${keralaProgress.daysRemaining}d remaining · Est finish ${keralaProgress.estimatedDaysToFinish}d</div>` : ''}
    `;
    const pct = keralaProgress ? keralaProgress.keralaPercent : Math.min(100, ((lastIdx+1) / 2000) * 100);
    $(`bar`).style.width = pct.toFixed(1) + '%';
    $(`stats`).innerHTML = `
      <b>Kerala 10-day plan:</b> 17000 cells adaptive (0.01° Trivandrum 2000 + 0.02° rest Kerala 10000 + 0.05° gaps 5000)<br>
      Trivandrum district ~2000 cells (0.01°). Kerala ~126k at 0.01°, but adaptive 17k for 10 days feasible with 4 parallel workers + 3 Overpass mirrors.<br>
      Server: ${serverIdx ? `${serverIdx.totalCells} cells, ${serverIdx.totalPlaces} places, last ${serverIdx.lastIndex}` : 'no data yet'}<br>
      Business types: ${serverIdx ? Object.keys(serverIdx.businessTypes||{}).length : 0} · Roads: ${serverIdx ? Object.keys(serverIdx.roadWise||{}).length : 0}<br>
      ${keralaProgress ? `Phase ${keralaProgress.currentPhase}: ${keralaProgress.nextPhase?.name || ''} — ${keralaProgress.phaseProgress} cells in phase` : ''}
    `;
    $(`dir`).innerHTML = serverIdx ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
        <div class="panel" style="padding:8px"><b>Total cells</b><br>${serverIdx.totalCells} / 17000 Kerala target</div>
        <div class="panel" style="padding:8px"><b>Total places</b><br>${serverIdx.totalPlaces}</div>
        <div class="panel" style="padding:8px"><b>Business types</b><br>${Object.keys(serverIdx.businessTypes||{}).length}</div>
        <div class="panel" style="padding:8px"><b>Roads</b><br>${Object.keys(serverIdx.roadWise||{}).length}</div>
        <div class="panel" style="padding:8px"><b>Mosques</b><br>${serverIdx.religious?.mosque||0}</div>
        <div class="panel" style="padding:8px"><b>Churches</b><br>${serverIdx.religious?.church||0}</div>
        <div class="panel" style="padding:8px"><b>Temples</b><br>${serverIdx.religious?.temple||0}</div>
        <div class="panel" style="padding:8px"><b>Last scanned</b><br>${serverIdx.lastScannedAt ? new Date(serverIdx.lastScannedAt).toLocaleString() : 'never'}</div>
      </div>
      ${keralaProgress ? `<div style="margin-top:12px"><b>Kerala Districts Progress (14 districts):</b><br><small>Trivandrum → Kollam → Pathanamthitta → Alappuzha → Kottayam → Idukki → Ernakulam → Thrissur → Palakkad → Malappuram → Kozhikode → Wayanad → Kannur → Kasaragod — 10 days</small></div>` : ''}
    ` : 'No published map data yet. Try a manual local scan.';
  }

  async function scanOne(index = null) {
    const prog = getProgress();
    const targetIndex = index !== null ? index : (prog.lastIndex + 1);
    log(`Scanning cell ${targetIndex} from Trivandrum origin… massive scrapping all business info + railways + roads + spatial index geohash`);
    $(`dir`).innerHTML = `Scanning cell ${targetIndex}… querying Overpass V2 (free, no key)… massive scrapping all tags, railways, roads, geohash`;

    try {
      // Use V2 scraper for full business info, railways, roads, spatial index
      const r = await fetch(`/api/map-scraper-v2?index=${targetIndex}&radius=1000`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error || 'Scraper failed');

      log(`Cell ${targetIndex} scanned: ${j.places?.length||0} places, ${j.roads?.length||0} roads, ${j.stats?.durationMs||0}ms`);

      // Save to IDB
      await saveCellToIDB(j);

      log('Saved locally in this browser. Published directories update from scheduled jobs, not visitor scans.');

      // Update progress
      const newProg = {
        lastIndex: j.current.index,
        lastLat: j.current.lat,
        lastLng: j.current.lng,
        totalCells: (prog.totalCells||0)+1,
        totalPlaces: (prog.totalPlaces||0)+(j.places?.length||0),
        lastScannedAt: new Date().toISOString()
      };
      setProgress(newProg);

      // Show places
      $(`places`).innerHTML = (j.places||[]).slice(0, 30).map(p => `
        <div style="border:1px solid #e0d5c4;border-radius:8px;padding:8px;background:#fff">
          <b>${esc(p.name || p.amenity || p.shop || 'Unnamed')}</b><br>
          <small style="color:#8a7f72">${esc(p.amenity||'')} ${esc(p.shop||'')} ${esc(p.tourism||'')} · ${esc(p.road||'Unknown Road')} · ${p.distance? p.distance.toFixed(2)+'km':''}</small><br>
          <small>${esc((p.tags?.cuisine||'') + ' ' + (p.tags?.religion||''))}</small>
        </div>
      `).join('') || '<div class="muted">No places in this cell — moving to next.</div>';

      addMarkers(j.places);

      await updateProgressUI();
      return j;

    } catch (e) {
      log(`Scan failed cell ${targetIndex}: ${e.message}`);
      $(`dir`).innerHTML = `Scan failed: ${esc(e.message)}. Check the API response and retry manually.`;
      // Retry with backoff
      throw e;
    }
  }

  async function scanBatch(n) {
    for (let i=0;i<n;i++) {
      try {
        await scanOne();
        // Be nice to Overpass: 2s delay
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  function startAuto() {
    log('Continuous browser scraping is disabled. The published directory is updated by scheduled repository jobs. Scan one cell to keep a local copy.');
    toast('Use Scan 1 cell for a local scan');
  }

  function stopAuto() { log('No browser background scan is running.'); }

  // Bindings
  $(`start`).onclick = startAuto;
  $(`stop`).onclick = stopAuto;
  $(`scan1`).onclick = () => scanOne();
  $(`scan5`).onclick = () => scanBatch(5);
  $(`export`).onclick = async () => {
    const prog = getProgress();
    const db = await openDB();
    const tx = db.transaction(['cells'], 'readonly');
    const req = tx.objectStore('cells').getAll();
    req.onsuccess = () => {
      const data = req.result;
      const blob = new Blob([JSON.stringify({ progress: prog, cells: data, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trivandrum-directory-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      log(`Exported ${data.length} cells`);
    };
    db.close();
  };
  $(`clear`).onclick = async () => {
    if (!confirm('Clear local directory? Server data remains.')) return;
    localStorage.removeItem(LS_PROGRESS);
    localStorage.removeItem(LS_DIRECTORY);
    const db = await openDB();
    db.transaction(['cells','places'], 'readwrite').objectStore('cells').clear();
    db.transaction(['cells','places'], 'readwrite').objectStore('places').clear();
    db.close();
    // Also clear IDB via delete
    indexedDB.deleteDatabase('mp-map-directory');
    log('Local directory cleared');
    updateProgressUI();
  };

  $(`search`).onclick = async () => {
    const q = $(`q`).value.trim();
    if (!q) return toast('Enter search');
    $(`results`).innerHTML = 'Searching…';
    try {
      const r = await fetch(`/api/map-directory?action=search&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`results`).innerHTML = j.results.slice(0, 20).map(p => `
        <div style="padding:6px 8px;border-bottom:1px solid #f0e6d6;cursor:pointer" data-lat="${p.lat}" data-lng="${p.lng}">
          <b>${esc(p.name||'Unnamed')}</b> · ${esc(p.amenity||p.shop||'')}<br><small>${esc(p.road||'')} · ${esc(p.city||'')}</small>
        </div>
      `).join('') || 'No results';
      $(`results`).querySelectorAll('[data-lat]').forEach(el => {
        el.onclick = () => {
          const lat = Number(el.dataset.lat), lng = Number(el.dataset.lng);
          if (map) map.setView([lat,lng], 16);
        };
      });
    } catch (e) {
      $(`results`).innerHTML = `Search failed: ${esc(e.message)}`;
    }
  };

  body.querySelectorAll('[data-btype]').forEach(b => {
    b.onclick = async () => {
      const type = b.dataset.btype;
      $(`q`).value = type;
      $(`search`).click();
    };
  });

  $(`roadwise`).onclick = async () => {
    $(`class`).innerHTML = 'Loading road-wise…';
    try {
      const r = await fetch('/api/map-directory?action=road');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      const roads = Object.entries(j.roads||{}).sort((a,b)=>b[1]-a[1]).slice(0,30);
      $(`class`).innerHTML = roads.map(([road,count]) => `<div style="padding:4px 6px;border-bottom:1px solid #f0e6d6;display:flex;justify-content:space-between"><span>${esc(road)}</span><b>${count}</b></div>`).join('') || 'No roads yet — start scraper';
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };

  $(`bizwise`).onclick = async () => {
    $(`class`).innerHTML = 'Loading business-wise…';
    try {
      const r = await fetch('/api/map-directory?action=business');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      const biz = Object.entries(j.businessTypes||{}).sort((a,b)=>b[1]-a[1]).slice(0,30);
      $(`class`).innerHTML = biz.map(([type,count]) => `<div style="padding:4px 6px;border-bottom:1px solid #f0e6d6;display:flex;justify-content:space-between"><span>${esc(type)}</span><b>${count}</b></div>`).join('') || 'No business types yet';
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };

  $(`religious`).onclick = async () => {
    $(`class`).innerHTML = 'Loading religious…';
    try {
      const r = await fetch('/api/map-directory?action=religious');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`class`).innerHTML = `
        <div>🕌 Mosques: <b>${j.religious?.mosque||0}</b></div>
        <div>⛪ Churches: <b>${j.religious?.church||0}</b></div>
        <div>🛕 Temples: <b>${j.religious?.temple||0}</b></div>
        <div>Other: <b>${j.religious?.other||0}</b></div>
      `;
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };

  // Dataset ingestion runs in scheduled jobs. Browser scans are explicitly initiated
  // with Scan 1 / Scan 5 and remain in IndexedDB on this device.
  initMap().catch(e => log(`Map unavailable: ${e.message}`));
  updateProgressUI();
  log('Published data comes from scheduled repository jobs; manual scans stay on this device.');
}

export function mountMapAutoScraper(root, tool) {
  mountMapDirectory(root, tool);
}
