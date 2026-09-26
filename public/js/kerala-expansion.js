/**
 * Kerala Expansion Viewer — 10 days to finish Kerala from Trivandrum
 * Shows phases, districts, progress, road-wise, business-wise
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

export function mountKeralaExpansion(root, tool) {
  const id = 'ke-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:360px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Kerala 10-Day Expansion — Trivandrum → All Kerala</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Adaptive multi-resolution: 0.01° Trivandrum district (2000 cells) + 0.02° rest Kerala (10000) + 0.05° gaps (5000) = 17000 cells in 10 days. 4 parallel workers, 3 Overpass mirrors, 35s interval, flawless.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-refresh" style="font-size:12px">↻ Refresh Progress</button>
            <button class="btn secondary" id="${id}-start" style="font-size:12px">▶ Start Kerala Sprint</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Progress</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
          <div style="margin-top:8px;background:#e0d5c4;border-radius:8px;height:12px;overflow:hidden"><div id="${id}-bar" style="height:100%;width:0%;background:#2f7d4a;transition:width 0.3s"></div></div>
          <div id="${id}-stats" style="font-size:11px;color:#6e655b;margin-top:6px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Phases (8 phases, 10 days)</b>
          <div id="${id}-phases" style="margin-top:8px;max-height:300px;overflow:auto;font-size:11px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>14 Districts</b>
          <div id="${id}-districts" style="margin-top:8px;max-height:240px;overflow:auto;font-size:11px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Road-wise & Business-wise</b>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn secondary" id="${id}-roadwise" style="font-size:11px">Roads</button>
            <button class="btn secondary" id="${id}-bizwise" style="font-size:11px">Business</button>
          </div>
          <div id="${id}-class" style="margin-top:8px;max-height:200px;overflow:auto;font-size:11px"></div>
        </div>
      </aside>

      <div style="position:relative;min-height:400px;background:#efe6d8;display:flex;flex-direction:column">
        <div id="${id}-map" style="width:100%;height:55vh;min-height:380px"></div>
        <div style="padding:12px;overflow:auto;flex:1;background:#fffaf2">
          <b>Kerala Map — Expansion from Trivandrum</b>
          <div id="${id}-info" style="margin-top:8px;font-size:12px">Loading expansion plan…</div>
          <div id="${id}-next" style="margin-top:12px"></div>
        </div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">Kerala 10-day sprint: Starts Trivandrum 8.5241,76.9366, spiral 0.01° grid, expands to Kollam, Pathanamthitta, Alappuzha, Kottayam, Idukki, Ernakulam, Thrissur, Palakkad, Malappuram, Kozhikode, Wayanad, Kannur, Kasaragod. Adaptive: 0.01° for cities, 0.02° for districts, 0.05° for gaps. 4 workers, 3 Overpass mirrors, 35s interval, NVIDIA AI classification road-wise & business-wise (mosques, restaurants etc), new sections auto-created. GitHub Action every 30min batch 20 cells. After Kerala, South India 11-20 days, India 21-60 days, World 61-365 days. Flawless engineering.</div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let map = null;
  let markers = [];
  let districtMarkers = [];

  async function initMap() {
    const L = await loadLeaflet();
    map = L.map($(`map`)).setView([10.5, 76.5], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map);
    
    // Kerala bbox
    const keralaBbox = [[8.18, 74.86], [12.83, 77.59]];
    L.rectangle(keralaBbox, { color: '#2f7d4a', weight: 2, fillOpacity: 0.05 }).addTo(map);
    
    // Trivandrum marker
    L.marker([8.5241, 76.9366]).addTo(map).bindPopup('<b>Trivandrum Origin</b><br>Start point for massive directory');
  }

  async function loadProgress() {
    try {
      const r = await fetch('/api/kerala-expansion?action=progress');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      
      const p = j.progress;
      $(`progress`).innerHTML = `
        <div><b>Phase ${p.currentPhase}</b> — ${p.phaseProgress} cells in phase</div>
        <div>Total: <b>${p.totalCells}</b> / ${p.keralaTarget} Kerala target (${p.keralaPercent}%)</div>
        <div>Places: <b>${p.totalPlaces}</b> · Business: ${p.businessTypes} types · Roads: ${p.roads}</div>
        <div>Days: ${p.daysElapsed}d elapsed, ${p.daysRemaining}d remaining, est finish ${p.estimatedDaysToFinish}d</div>
        <div>Religious: 🕌${p.religious.mosque||0} ⛪${p.religious.church||0} 🛕${p.religious.temple||0}</div>
      `;
      $(`bar`).style.width = p.keralaPercent + '%';
      $(`stats`).innerHTML = `
        Trivandrum ${p.trivandrumPercent}% · Kerala ${p.keralaPercent}%<br>
        Next: Phase ${p.currentPhase} — ${j.nextPhase?.name || ''}<br>
        BBOX: ${j.nextPhase?.bbox ? `${j.nextPhase.bbox.latMin.toFixed(1)}-${j.nextPhase.bbox.latMax.toFixed(1)}, ${j.nextPhase.bbox.lngMin.toFixed(1)}-${j.nextPhase.bbox.lngMax.toFixed(1)} grid ${j.nextPhase.grid}` : ''}
      `;
      $(`info`).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
          <div class="panel" style="padding:8px"><b>Kerala Progress</b><br>${p.keralaPercent}% (${p.totalCells}/${p.keralaTarget})</div>
          <div class="panel" style="padding:8px"><b>Phase</b><br>${p.currentPhase}/8 — ${j.nextPhase?.name||''}</div>
          <div class="panel" style="padding:8px"><b>Places</b><br>${p.totalPlaces}</div>
          <div class="panel" style="padding:8px"><b>Days Left</b><br>${p.daysRemaining}d / 10d</div>
        </div>
        <div style="margin-top:12px"><b>Current Phase Details:</b><br>${esc(JSON.stringify(j.nextPhase, null, 2).slice(0, 800))}</div>
      `;

      // Add district markers if map ready
      if (map && window.L) {
        districtMarkers.forEach(m => map.removeLayer(m));
        districtMarkers = [];
        const L = window.L;
        try {
          const dr = await fetch('/api/kerala-expansion?action=districts');
          const dj = await dr.json();
          if (dj.ok) {
            for (const d of dj.districts) {
              const m = L.marker([d.lat, d.lng]).addTo(map);
              m.bindPopup(`<b>${esc(d.name)}</b><br>Priority ${d.priority}<br>${d.started ? '● Started' : '○ Pending'}`);
              districtMarkers.push(m);
            }
          }
        } catch {}
      }

    } catch (e) {
      $(`progress`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function loadPhases() {
    try {
      const r = await fetch('/api/kerala-expansion?action=plan');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`phases`).innerHTML = (j.plan.phases||[]).map(p => `
        <div style="padding:6px 8px;border-bottom:1px solid #f0e6d6;border-left:4px solid ${p.phase<=2 ? '#2f7d4a' : p.phase<=6 ? '#c45c26' : '#3d4ea8'};margin-bottom:4px;background:#fff">
          <b>Phase ${p.phase} (${esc(p.days)}): ${esc(p.name)}</b><br>
          <small>BBOX ${p.bbox.latMin.toFixed(1)}-${p.bbox.latMax.toFixed(1)}, ${p.bbox.lngMin.toFixed(1)}-${p.bbox.lngMax.toFixed(1)} · Grid ${p.grid} · ${p.estimatedCells} cells<br>${esc(p.description||'')}</small>
        </div>
      `).join('');
    } catch (e) {
      $(`phases`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function loadDistricts() {
    try {
      const r = await fetch('/api/kerala-expansion?action=districts');
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      $(`districts`).innerHTML = j.districts.map(d => `
        <div style="padding:4px 6px;border-bottom:1px solid #f0e6d6;display:flex;justify-content:space-between;align-items:center">
          <span><b>${esc(d.name)}</b> P${d.priority}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:10px;background:${d.started ? '#2f7d4a' : '#e0d5c4'};color:${d.started ? '#fff' : '#6e655b'}">${d.started ? 'Started' : 'Pending'}</span>
        </div>
      `).join('');
    } catch (e) {
      $(`districts`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  $(`refresh`).onclick = () => { loadProgress(); loadDistricts(); };
  $(`start`).onclick = async () => {
    toast('Starting Kerala sprint — 20 cells batch');
    try {
      const r = await fetch('/api/map-auto?batch=20');
      const j = await r.json();
      toast(`Scanned ${j.scanned||0} cells, next ${j.nextIndex||''}`);
      loadProgress();
    } catch (e) { toast('Failed: ' + e.message); }
  };

  $(`roadwise`).onclick = async () => {
    $(`class`).innerHTML = 'Loading road-wise…';
    try {
      const r = await fetch('/api/kerala-expansion?action=roadwise');
      const j = await r.json();
      const roads = Object.entries(j.roadWise||{}).sort((a,b)=>b[1]-a[1]).slice(0,20);
      $(`class`).innerHTML = roads.map(([road,count]) => `<div style="padding:3px 6px;display:flex;justify-content:space-between"><span>${esc(road)}</span><b>${count}</b></div>`).join('') || 'No roads yet';
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };

  $(`bizwise`).onclick = async () => {
    $(`class`).innerHTML = 'Loading business-wise…';
    try {
      const r = await fetch('/api/kerala-expansion?action=businesswise');
      const j = await r.json();
      const biz = Object.entries(j.businessTypes||{}).sort((a,b)=>b[1]-a[1]).slice(0,20);
      $(`class`).innerHTML = biz.map(([type,count]) => `<div style="padding:3px 6px;display:flex;justify-content:space-between"><span>${esc(type)}</span><b>${count}</b></div>`).join('') || 'No business yet';
    } catch (e) { $(`class`).innerHTML = `Failed: ${esc(e.message)}`; }
  };

  initMap();
  loadProgress();
  loadPhases();
  loadDistricts();
}
