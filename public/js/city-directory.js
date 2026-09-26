import { esc, mountShell } from './kit.js';

function mountCityDirectory(root, tool, type) {
  const prefix = `city-${Math.random().toString(36).slice(2, 8)}`;
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div class="panel" style="padding:18px;max-width:1000px;margin:0 auto">
      <h2>${type === 'music' ? 'Music places' : 'Shops'} in Thiruvananthapuram</h2>
      <p class="muted">A bounded OpenStreetMap sample within 6.5 km of central Trivandrum. These are ${type === 'music' ? 'music-related venues, clubs and stores—not Spotify songs' : 'mapped shops—not an inventory, product listing or endorsement'}. Only verified published records appear here; coverage and details may be incomplete.</p>
      <div id="${prefix}-status" class="note" aria-live="polite">Loading published snapshot…</div>
      <div class="field-row" style="margin:12px 0"><input id="${prefix}-search" class="field" type="search" placeholder="Filter published ${type === 'music' ? 'music places' : 'shops'}" aria-label="Filter published listings"><button id="${prefix}-refresh" class="btn secondary">Refresh</button></div>
      <div id="${prefix}-results" aria-live="polite"></div>
      <p class="muted" style="margin-top:14px">© OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">ODbL and attribution</a>. Report corrections to OpenStreetMap. Refreshed data is published by a repository job, not by your browser.</p>
    </div>
  `);
  const $ = id => body.querySelector(`#${prefix}-${id}`);
  let snapshot = null;
  function render() {
    const rows = snapshot?.[type] || [];
    const query = $(`search`).value.trim().toLocaleLowerCase();
    const matches = rows.filter(row => `${row.name || ''} ${row.kind || ''} ${row.address || ''}`.toLocaleLowerCase().includes(query));
    $(`results`).innerHTML = matches.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">${matches.slice(0, 300).map(row => {
      const id = /^((node|way|relation)\/\d+)$/.test(row.id || '') ? row.id : null;
      return `<article class="panel" style="padding:12px">
        <b>${esc(row.name || `Unnamed ${type === 'shops' ? 'shop' : 'music place'}`)}</b>
        <div class="muted">${esc(row.kind || '')}${row.address ? ` · ${esc(row.address)}` : ''}</div>
        ${row.openingHours ? `<div>Hours (OSM): ${esc(row.openingHours)}</div>` : ''}
        ${id ? `<a href="https://www.openstreetmap.org/${id}" target="_blank" rel="noopener noreferrer">See on OpenStreetMap</a>` : ''}
      </article>`;
    }).join('')}</div>` : `<p class="muted">${snapshot?.indexedAt ? 'No matching indexed records. This does not establish that none exist.' : 'No verified snapshot yet. A successful indexing job is required.'}</p>`;
  }
  async function load() {
    $(`status`).textContent = 'Loading published snapshot…';
    try {
      const response = await fetch('/data/city-directory/index.json', { cache: 'no-store' });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.shops) || !Array.isArray(data.music)) throw Error('Invalid snapshot format');
      snapshot = data;
      $(`status`).textContent = data.indexedAt
        ? `${data[type].length} ${type === 'music' ? 'music places' : 'shops'} in this sample · last indexed ${new Date(data.indexedAt).toLocaleString()}. Source: OpenStreetMap (ODbL).`
        : 'Indexing has not produced a verified city snapshot yet. The list is intentionally empty.';
      render();
    } catch (e) {
      $(`status`).textContent = `Unable to load published data: ${e.message}`;
      $(`results`).replaceChildren();
    }
  }
  $(`refresh`).onclick = load;
  $(`search`).oninput = render;
  load();
}

export const mountCityMusicDirectory = (root, tool) => mountCityDirectory(root, tool, 'music');
export const mountCityShopDirectory = (root, tool) => mountCityDirectory(root, tool, 'shops');
