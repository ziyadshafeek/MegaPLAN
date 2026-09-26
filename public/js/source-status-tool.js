import { esc, mountShell } from './kit.js';
export function mountSourceStatus(root, tool) {
  const body = mountShell(root, tool, `<p>Only verified indexed records count. Songs are metadata, not audio. Regional map places, worldwide recordings, retailer listings and image links are separate datasets.</p><button id="status-refresh" class="btn secondary">Refresh coverage</button><div id="status-grid" aria-live="polite" style="margin-top:16px"></div>`);
  const out = body.querySelector('#status-grid');
  async function refresh() {
    out.textContent = 'Reading source status…';
    try {
      const response = await fetch('/api/source-status'); const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Status unavailable');
      const s = data.sources;
      const rows = [
        ['Worldwide recording names', `${s.worldwideSongNames.indexed} MusicBrainz CC0 names · ${s.worldwideSongNames.coverage}. Not Spotify’s full catalogue.`, s.worldwideSongNames.lastSuccessAt],
        ['Map places', `${s.localMap.cells} OSM cells · ${s.localMap.placeOccurrences} overlapping place occurrences. Not all places.`, s.localMap.lastSuccessAt],
        ['Trivandrum shops / music places', `${s.trivandrumPlaces.localShops} shops · ${s.trivandrumPlaces.localMusicPlaces} local music places. Not songs.`, null],
        ['Nationwide product listings', `${s.retailerProducts.indexed} verified products. Only authorized retailer feeds may populate this.`, s.retailerProducts.lastSuccessAt],
        ['Image links', `${s.imageLinks.candidateLinks} unreviewed candidates · ${s.imageLinks.publicReviewedLinks} public approved links. No images stored.`, null],
        ['Research', `Wikipedia ${s.research.wikipedia}; broad web ${s.research.braveSearch}; Openverse ${s.research.openverse}.`, null]
      ];
      out.innerHTML = rows.map(([name,detail,last]) => `<div class="panel" style="padding:12px;margin:8px 0"><b>${esc(name)}</b><p style="margin:6px 0">${esc(detail)}</p><small>${last ? `Last verified: ${esc(last)}` : 'Coverage is limited or no successful refresh yet.'}</small></div>`).join('') + `<p class="muted">${esc(data.note)}</p>`;
    } catch (error) { out.textContent = error.message; }
  }
  body.querySelector('#status-refresh').onclick = refresh;
  refresh();
}
