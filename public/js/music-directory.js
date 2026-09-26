/**
 * Music Directory — published repository snapshot and on-demand public search.
 */

import { esc, mountShell, toast } from './kit.js';

export function mountMusicDirectory(root, tool) {
  const id = 'md-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Music Directory</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Search the independent MusicBrainz recording catalogue on demand. This is worldwide music, unrelated to Trivandrum places and NOT a complete Spotify catalogue. No scraped Spotify snapshot is published.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-scan" style="font-size:12px">About indexing</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="${id}-q" class="field" placeholder="Search music: bohemian, beatles…" style="flex:1">
            <button class="btn secondary" id="${id}-search" style="font-size:12px">Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-type="track" style="font-size:11px">🎵 Tracks</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Published snapshot</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
          <div id="${id}-stats" style="font-size:11px;color:#6e655b;margin-top:6px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Audio Features — For AI Recommendations</b>
          <div id="${id}-features" style="font-size:11px;margin-top:6px">Loading features…</div>
        </div>

        <div id="${id}-log" class="note" style="font-size:11px;max-height:100px;overflow:auto">No mass Spotify indexing. Open music search is on demand and is never published automatically.</div>
      </aside>

      <div style="padding:12px;overflow:auto;background:#fffaf2">
        <b>Tracks in the published snapshot</b>
        <div id="${id}-info" style="margin-top:8px;font-size:12px">Loading…</div>
        <div id="${id}-tracks" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px"></div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">MusicBrainz is an independent open recording search. Spotify search links are not verified Spotify matches; authorized Spotify catalog access requires a separate approved integration. Trivandrum music places are a different map tool.</div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);

  function log(msg) {
    const el = $(`log`);
    el.innerHTML = `${new Date().toLocaleTimeString()} — ${esc(msg)}<br>` + el.innerHTML;
  }

  async function updateProgress() {
    try {
      const r = await fetch('/api/music-directory?action=stats');
      const j = await r.json();
      if (!j.ok) throw Error(j.error);
      const idx = j.index;
      $(`progress`).innerHTML = `Total: <b>${idx.totalTracks||0}</b> tracks · Last: ${idx.lastScannedAt ? new Date(idx.lastScannedAt).toLocaleTimeString() : 'never'}`;
      $(`stats`).textContent = `Currently published: ${idx.totalTracks||0} tracks. Availability depends on successful indexing jobs.`;
      $(`info`).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">
          <div class="panel" style="padding:6px"><b>Total Tracks</b><br>${idx.totalTracks||0}</div>
          <div class="panel" style="padding:6px"><b>Source</b><br>MusicBrainz (on demand)</div>
          <div class="panel" style="padding:6px"><b>Spotify snapshot</b><br>Not collected</div>
        </div>
      `;
    } catch (e) {
      $(`progress`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  function loadFeatures() {
    $(`features`).textContent = 'Audio features are not verified by the live search; fields appear only when present in the published snapshot.';
  }

  async function search(term, type='track') {
    if (!term) return toast('Enter term');
    $(`info`).innerHTML = `Searching worldwide MusicBrainz recordings for "${esc(term)}"…`;
    try {
      if (type !== 'track') throw Error('This live search currently supports recordings only.');
      const local = await fetch(`/api/music-directory?action=search&q=${encodeURIComponent(term)}`);
      const localData = await local.json();
      let tracks = local.ok ? localData.results || [] : [];
      let origin = 'published MusicBrainz snapshot';
      if (!tracks.length) {
        const live = await fetch(`/api/open-music?q=${encodeURIComponent(term)}`);
        const liveData = await live.json();
        if (!live.ok) throw Error(liveData.error || 'Open music search unavailable');
        tracks = liveData.results || [];
        origin = liveData.source || 'MusicBrainz live search';
      }
      $(`info`).textContent = `${tracks.length} recording-name matches from ${origin} · Spotify search links are not verified matches.`;

      $(`tracks`).innerHTML = tracks.slice(0, 20).map(t => `
        <div style="border:1px solid #e0d5c4;border-radius:10px;padding:10px;background:#fff">
          <b style="font-size:13px">${esc(t.name||'Unnamed')}</b><br>
          <div style="font-size:12px;margin-top:4px">
            <div>👤 ${esc(t.artists||'')} · 💿 ${esc(t.album||'')}</div>
            <div>⏱ ${t.duration_ms ? `${Math.floor(t.duration_ms/60000)}:${String(Math.floor(t.duration_ms%60000/1000)).padStart(2,'0')}` : 'duration unknown'} · source: MusicBrainz</div>
            ${t.danceability != null ? `<div>💃 Danceability ${esc(t.danceability)} · ⚡ Energy ${esc(t.energy ?? '—')} · 😊 Valence ${esc(t.valence ?? '—')} · 🎵 Tempo ${esc(t.tempo ?? '—')}</div>` : ''}
            <div style="margin-top:4px"><a href="${esc(t.external_url||'')}" target="_blank" style="font-size:11px">Open MusicBrainz</a> ${t.spotifySearchUrl ? `· <a href="${esc(t.spotifySearchUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px">Search Spotify (unverified)</a>` : ''} ${t.preview_url ? `· <a href="${esc(t.preview_url)}" target="_blank" style="font-size:11px">Preview</a>` : ''}</div>
          </div>
        </div>
      `).join('') || 'No tracks found';

    } catch (e) {
      $(`info`).innerHTML = `Search failed: ${esc(e.message)}`;
    }
  }

  function startScraper() {
    log('Continuous browser scraping is disabled. Unofficial Spotify indexing is disabled. Use MusicBrainz search on demand.');
    toast('Use Search for on-demand results');
  }

  $(`scan`).onclick = startScraper;
  $(`search`).onclick = () => search($(`q`).value.trim(), 'track');
  $(`q`).addEventListener('keydown', e => { if (e.key === 'Enter') search($(`q`).value.trim()); });

  body.querySelectorAll('[data-type]').forEach(b => b.onclick = () => search($(`q`).value.trim() || 'love', b.dataset.type));

  updateProgress();
  loadFeatures();

}
