/**
 * Music Directory — Spotify full dataset for AI
 * Based on GitHub AliAkhtari78/SpotifyScraper (no API key) + msr8/spotify 7M+ tracks
 * Free storage GitHub+Vercel+IndexedDB, fully indexable for AI
 */

import { esc, mountShell, toast } from './kit.js';

export function mountMusicDirectory(root, tool) {
  const id = 'md-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:340px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Music Directory — Spotify Full Dataset for AI</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Full dataset for AI for songs in Spotify — based on GitHub AliAkhtari78/SpotifyScraper (no API key, public embed token) + msr8/spotify 7M+ tracks. Extract tracks, albums, artists, playlists, podcasts, lyrics, audio features (danceability, energy, valence etc). Free storage GitHub+Vercel+IndexedDB, fully indexable.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-scan" style="font-size:12px">▶ Start Scraper</button>
            <button class="btn secondary" id="${id}-stop" style="font-size:12px">⏸ Stop</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="${id}-q" class="field" placeholder="Search music: bohemian, beatles…" style="flex:1">
            <button class="btn secondary" id="${id}-search" style="font-size:12px">Search</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <button class="btn ghost" data-type="track" style="font-size:11px">🎵 Tracks</button>
            <button class="btn ghost" data-type="artist" style="font-size:11px">👤 Artists</button>
            <button class="btn ghost" data-type="album" style="font-size:11px">💿 Albums</button>
            <button class="btn ghost" data-type="playlist" style="font-size:11px">📋 Playlists</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Progress — 7M+ Tracks</b>
          <div id="${id}-progress" style="font-size:12px;margin-top:6px">Loading…</div>
          <div style="margin-top:8px;background:#e0d5c4;border-radius:8px;height:10px;overflow:hidden"><div id="${id}-bar" style="height:100%;width:0%;background:#7a4bb5;transition:width 0.3s"></div></div>
          <div id="${id}-stats" style="font-size:11px;color:#6e655b;margin-top:6px"></div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Audio Features — For AI Recommendations</b>
          <div id="${id}-features" style="font-size:11px;margin-top:6px">Loading features…</div>
        </div>

        <div id="${id}-log" class="note" style="font-size:11px;max-height:100px;overflow:auto">Music scraper log…<br>• SpotifyScraper no API key, public embed token<br>• 7M+ tracks like msr8/spotify<br>• 4 workers, anti-ban built in<br>• Free storage GitHub+Vercel+IndexedDB</div>
      </aside>

      <div style="padding:12px;overflow:auto;background:#fffaf2">
        <b>Spotify Full Dataset — 7M+ Tracks for AI</b>
        <div id="${id}-info" style="margin-top:8px;font-size:12px">Loading…</div>
        <div id="${id}-tracks" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px"></div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">Music Directory: Based on GitHub AliAkhtari78/SpotifyScraper — extract public Spotify data without official API, no key, sync+async, typed models, one dependency (httpx), bootstraps anonymous token from public embed pages. Features: all core entities + podcasts, search, charts & discovery, cover colors & Canvas, credits & concerts, two-tier resilience GraphQL + embed fallback, anti-ban built in (per-host rate limiting, retries with backoff, UA rotation, proxies). Plus msr8/spotify — 7,458,293 tracks scraped via 4 phases: followers of followers (unofficial API), playlists of users, track IDs of playlists, audio features (official API). Audio features: danceability, energy, liveness, valence, tempo, loudness, speechiness, acousticness, instrumentalness. Free storage GitHub data/music-directory/ + Vercel public + IndexedDB + search-index fully indexable for AI. AI can recommend via k-nearest-neighbours like msr8.</div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let autoInterval = null;

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
      const pct = Math.min(100, (idx.totalTracks||0) / 10000 * 100);
      $(`bar`).style.width = pct.toFixed(1) + '%';
      $(`stats`).innerHTML = `7M+ target like msr8/spotify · Current ${idx.totalTracks||0}<br>Free: SpotifyScraper no key, no quota, public data`;
      $(`info`).innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">
          <div class="panel" style="padding:6px"><b>Total Tracks</b><br>${idx.totalTracks||0} / 7M+</div>
          <div class="panel" style="padding:6px"><b>GitHub</b><br>AliAkhtari78/SpotifyScraper</div>
          <div class="panel" style="padding:6px"><b>Dataset</b><br>msr8/spotify 7.4M</div>
        </div>
      `;
    } catch (e) {
      $(`progress`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function loadFeatures() {
    try {
      const r = await fetch('/api/music-scraper?action=features');
      const j = await r.json();
      $(`features`).innerHTML = `
        <div><b>Audio Features for AI:</b></div>
        <div>${(j.features||[]).map(f=>`• ${esc(f)}`).join('<br>')}</div>
        <div style="margin-top:6px"><b>Example:</b><br>${Object.entries(j.example||{}).map(([k,v])=>`${esc(k)}: ${v}`).join('<br>')}</div>
        <div style="margin-top:6px">Total records: ${esc(j.total_records||'7M+')}</div>
      `;
    } catch (e) {
      $(`features`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  }

  async function search(term, type='track') {
    if (!term) return toast('Enter term');
    $(`info`).innerHTML = `Searching Spotify for "${esc(term)}" (${esc(type)})… via public embed token, no key`;
    try {
      let r = await fetch(`/api/music-directory?action=search&q=${encodeURIComponent(term)}`);
      let j = await r.json();
      let tracks = j.results || [];
      
      if (!tracks.length) {
        r = await fetch(`/api/music-scraper?action=search&q=${encodeURIComponent(term)}&type=${type}`);
        j = await r.json();
        tracks = j.results || [];
        if (tracks.length) {
          fetch('/api/music-directory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tracks }) }).catch(()=>{});
        }
      }

      $(`tracks`).innerHTML = tracks.slice(0, 20).map(t => `
        <div style="border:1px solid #e0d5c4;border-radius:10px;padding:10px;background:#fff">
          <b style="font-size:13px">${esc(t.name||'Unnamed')}</b><br>
          <div style="font-size:12px;margin-top:4px">
            <div>👤 ${esc(t.artists||'')} · 💿 ${esc(t.album||'')}</div>
            <div>⏱ ${Math.floor((t.duration_ms||0)/60000)}:${String(Math.floor((t.duration_ms||0)%60000/1000)).padStart(2,'0')} · ⭐ ${t.popularity||0}</div>
            <div>💃 Danceability ${t.danceability||0} · ⚡ Energy ${t.energy||0} · 😊 Valence ${t.valence||0} · 🎵 Tempo ${t.tempo||0}</div>
            <div style="margin-top:4px"><a href="${esc(t.external_url||'')}" target="_blank" style="font-size:11px">Open Spotify</a> ${t.preview_url ? `· <a href="${esc(t.preview_url)}" target="_blank" style="font-size:11px">Preview</a>` : ''}</div>
          </div>
        </div>
      `).join('') || 'No tracks found';

    } catch (e) {
      $(`info`).innerHTML = `Search failed: ${esc(e.message)}`;
    }
  }

  function startScraper() {
    if (autoInterval) return;
    localStorage.setItem('mp-music-auto', '1');
    log('Music scraper started — SpotifyScraper no key, public embed token, 7M+ target, fully automatic');
    autoInterval = setInterval(async () => {
      try {
        const terms = ['love', 'party', 'chill', 'rock', 'pop', 'hip hop', 'edm', 'malayalam', 'hindi', 'tamil'];
        const term = terms[Math.floor(Math.random()*terms.length)];
        const r = await fetch(`/api/music-scraper?action=search&q=${encodeURIComponent(term)}&type=track`);
        const j = await r.json();
        if (j.results && j.results.length) {
          await fetch('/api/music-directory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ tracks: j.results }) });
          log(`Scraped ${j.results.length} tracks for "${term}", total growing, free storage GitHub+Vercel+IndexedDB`);
          updateProgress();
        }
      } catch (e) { log(`Scraper error: ${e.message}`); }
    }, 8000);
    $(`scan`).textContent = '● Running — Fully Automatic';
    toast('Music scraper started — fully automatic');
  }

  function stopScraper() {
    if (autoInterval) clearInterval(autoInterval);
    autoInterval = null;
    localStorage.setItem('mp-music-auto', '0');
    $(`scan`).textContent = '▶ Start Scraper';
    log('Scraper paused');
  }

  function ensureAuto() {
    if (localStorage.getItem('mp-music-auto') === null) {
      localStorage.setItem('mp-music-auto', '1');
      return true;
    }
    return localStorage.getItem('mp-music-auto') === '1';
  }

  $(`scan`).onclick = startScraper;
  $(`stop`).onclick = stopScraper;
  $(`search`).onclick = () => search($(`q`).value.trim(), 'track');
  $(`q`).addEventListener('keydown', e => { if (e.key === 'Enter') search($(`q`).value.trim()); });

  body.querySelectorAll('[data-type]').forEach(b => b.onclick = () => search($(`q`).value.trim() || 'love', b.dataset.type));

  updateProgress();
  loadFeatures();
  search('love', 'track');
  if (ensureAuto()) startScraper();
}
