/**
 * MegaPLAN desktop file-desk (large screens) + Android Files home (phones).
 * Wiki Agent and Self Agent are first-class apps on the home screen.
 * Local-model shelves are intentionally absent from customer UI.
 */
import { mountTool } from './js/engines.js';
import './js/engines-rest.js';
import { mountWikiAgent } from './agent/agent.js';
import { esc } from './js/kit.js';

const FOLDER_META = {
  PDF: { color: '#c4473a', glyph: 'pdf' },
  Images: { color: '#c45c26', glyph: 'img' },
  Audio: { color: '#7a4bb5', glyph: 'aud' },
  Video: { color: '#b13a6b', glyph: 'vid' },
  'OCR & AI': { color: '#3d4ea8', glyph: 'ai' },
  Text: { color: '#2b6cb0', glyph: 'txt' },
  Developer: { color: '#1f7a6b', glyph: 'dev' },
  Calculators: { color: '#2c9b6a', glyph: 'calc' },
  Business: { color: '#8a5a2b', glyph: 'biz' },
  Education: { color: '#3b7d3a', glyph: 'edu' },
  India: { color: '#c45c26', glyph: 'in' },
  'Privacy & Security': { color: '#5c574f', glyph: 'lock' },
  'OSINT / Public Data': { color: '#4a3f8a', glyph: 'pub' },
  'Files & Data': { color: '#e8b44c', glyph: 'data' },
  Productivity: { color: '#3c8f6e', glyph: 'prod' },
  'Design & Web': { color: '#c45c7a', glyph: 'des' },
  Finance: { color: '#2f7d4a', glyph: 'fin' },
  'Media / Downloads': { color: '#a33b3b', glyph: 'med' },
  'Health & Medical': { color: '#a3455c', glyph: 'medx' },
  Games: { color: '#8a5a2b', glyph: 'game' },
  Miscellaneous: { color: '#6e655b', glyph: 'misc' }
};

const APPS = [
  { id: 'wiki-agent', title: 'Wiki Agent', blurb: 'Describe a page. The agent drafts, tests, and can publish it.', kind: 'wiki-agent' },
  { id: 'self-agent', title: 'Self Agent', blurb: 'Use your own OpenAI-compatible key. It never leaves this browser.', kind: 'self-agent' },
  { id: 'ai-mode', title: 'AI Mode', blurb: 'Combine tools, upload files, 4-digit session. Future paid, free now.', kind: 'tool', slug: 'ai-mode' },
  { id: 'audio-studio', title: 'Audio Studio', blurb: 'Audacity-like multi-track, waveform, MP3/WAV, autosave.', kind: 'tool', slug: 'audio-studio' },
  { id: 'my-wiki', title: 'My Wiki', blurb: 'Pages saved on this device.', kind: 'my-wiki' }
];

const state = {
  tools: [],
  pages: [],
  localPages: [],
  folder: null,
  query: '',
  view: localStorage.getItem('mp-view') || 'icons',
  recents: JSON.parse(localStorage.getItem('mp-recents') || '[]'),
  tabs: [{ id: 'home', kind: 'home', title: 'Files', path: 'megaplan://home' }],
  active: 'home',
  mobileTab: 'home'
};

function folderSvg(color) {
  return `<svg class="glyph" viewBox="0 0 52 44" aria-hidden="true"><path d="M2 10h16l4 6h28v24H2z" fill="${color}"/><path d="M2 8h14l4 8H2z" fill="#f3d27a"/></svg>`;
}
function fileSvg() {
  return `<svg class="glyph" viewBox="0 0 44 52" aria-hidden="true"><path d="M8 2h20l10 10v38H8z" fill="#fffaf2" stroke="#cbbba8"/><path d="M28 2v10h10" fill="#eadfce"/></svg>`;
}
function appSvg(kind) {
  const fills = {
    'self-agent': '#1f7a6b',
    'my-wiki': '#3d4ea8',
    'ai-mode': '#7a4bb5',
    'audio-studio': '#c45c26',
    'tool': '#c4473a'
  };
  const fill = fills[kind] || '#1c1916';
  return `<svg class="glyph" viewBox="0 0 52 44"><rect x="6" y="6" width="40" height="32" rx="8" fill="${fill}"/><circle cx="18" cy="22" r="4" fill="#e8b44c"/><rect x="26" y="18" width="14" height="3" rx="1" fill="#f4efe6"/><rect x="26" y="24" width="10" height="3" rx="1" fill="#cbbba8"/></svg>`;
}

async function load() {
  const [tools, pages] = await Promise.all([
    fetch('/data/tools.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('Tool library failed to load'); return r.json(); }),
    fetch('/data/agent-pages.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
  ]);
  state.tools = tools;
  state.pages = Array.isArray(pages) ? pages : [];
  try { state.localPages = JSON.parse(localStorage.getItem('mp-wiki-pages') || '[]'); } catch { state.localPages = []; }
  routeFromLocation();
  render();
  window.addEventListener('popstate', () => { routeFromLocation(); render(); });
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') document.getElementById('palette')?.classList.add('hidden');
  });

  // Background Map Auto Scraper — runs continuously if enabled, starting from Trivandrum
  // Flawless engineering: checks localStorage flag, uses SW + interval fallback
  try {
    const autoEnabled = localStorage.getItem('mp-map-auto-enabled');
    if (autoEnabled === '1') {
      console.log('[MegaPLAN] Map auto scraper background enabled — starting from Trivandrum');
      // Register SW if not already
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw-map-scraper.js').catch(()=>{});
      }
      // Fallback interval poller that runs even without opening map tool
      // Only runs if user has visited map-directory before (has progress)
      const prog = localStorage.getItem('mp-map-dir-progress');
      if (prog) {
        let lastRun = 0;
        setInterval(async () => {
          const now = Date.now();
          if (now - lastRun < 35000) return; // 35s min interval to respect Overpass fair use
          lastRun = now;
          try {
            const p = JSON.parse(localStorage.getItem('mp-map-dir-progress') || '{"lastIndex":-1}');
            const nextIdx = (p.lastIndex ?? -1) + 1;
            console.log(`[Background] Auto scanning cell ${nextIdx} from Trivandrum`);
            const r = await fetch(`/api/map-scraper?index=${nextIdx}`);
            const j = await r.json();
            if (r.ok && j.places) {
              // Save locally
              localStorage.setItem('mp-map-dir-progress', JSON.stringify({
                lastIndex: j.current.index,
                lastLat: j.current.lat,
                lastLng: j.current.lng,
                totalCells: (p.totalCells||0)+1,
                totalPlaces: (p.totalPlaces||0)+(j.places.length||0),
                lastScannedAt: new Date().toISOString()
              }));
              // Save to server
              fetch('/api/map-directory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(j) }).catch(()=>{});
              console.log(`[Background] Scanned cell ${nextIdx}: ${j.places.length} places`);
            }
          } catch (e) {
            console.log('[Background] Auto scan failed', e.message);
          }
        }, 40000); // 40s interval
      }
    }
  } catch {}
}

function routeFromLocation() {
  const p = location.pathname;
  const q = new URLSearchParams(location.search);
  const mTool = p.match(/^\/tools\/([^/]+)$/);
  const mFolder = p.match(/^\/folder\/([^/]+)$/);
  const mWiki = p.match(/^\/wiki\/([^/]+)$/);
  if (mTool) openTool(decodeURIComponent(mTool[1]), false);
  else if (mFolder) openFolder(decodeURIComponent(mFolder[1]).replace(/-/g, ' '), false);
  else if (mWiki) openWiki(decodeURIComponent(mWiki[1]), false);
  else if (p === '/self' || q.get('mode') === 'self') openApp('self-agent', false);
  else if (p.startsWith('/agent')) openApp(q.get('mode') === 'self' ? 'self-agent' : 'wiki-agent', false);
  else { state.folder = null; activate('home'); }
}

function push(url) { history.pushState({}, '', url); }

function activate(id) {
  state.active = id;
  if (!state.tabs.some(t => t.id === id)) state.active = 'home';
}

function openFolder(name, nav = true) {
  const cat = state.tools.map(t => t.category).find(c => c.toLowerCase() === String(name).toLowerCase()) || name;
  state.folder = cat;
  const id = 'folder-' + cat;
  upsertTab({ id, kind: 'folder', title: cat, path: `megaplan://folder/${slugCat(cat)}` });
  if (nav) push('/folder/' + slugCat(cat));
  render();
}

function openTool(slug, nav = true) {
  const tool = state.tools.find(t => t.slug === slug);
  if (!tool) return;
  const id = 'tool-' + slug;
  upsertTab({ id, kind: 'tool', title: tool.title, path: `megaplan://tools/${slug}`, slug });
  remember(tool);
  if (nav) push('/tools/' + encodeURIComponent(slug));
  render();
  const mount = document.querySelector(`[data-tool-mount="${CSS.escape(slug)}"]`);
  if (mount && !mount.dataset.ready) { mount.dataset.ready = '1'; mountTool(mount, tool); }
}

function openApp(kind, nav = true) {
  const app = APPS.find(a => a.kind === kind) || APPS[0];
  // If app is a tool (ai-mode, audio-studio), open as tool
  if (app.kind === 'tool' && app.slug) {
    return openTool(app.slug, nav);
  }
  upsertTab({ id: app.id, kind: app.kind, title: app.title, path: `megaplan://${app.id}` });
  if (nav) push(kind === 'self-agent' ? '/self' : kind === 'wiki-agent' ? '/agent/' : '/wiki/');
  render();
  if (kind === 'wiki-agent' || kind === 'self-agent') {
    const el = document.querySelector(`[data-agent="${kind}"]`);
    if (el && !el.dataset.ready) {
      el.dataset.ready = '1';
      mountWikiAgent(el, { mode: kind === 'self-agent' ? 'self' : 'hosted', standalone: false });
    }
  }
}

function openWiki(slug, nav = true) {
  upsertTab({ id: 'wiki-' + slug, kind: 'wiki-page', title: slug, path: `megaplan://wiki/${slug}`, slug });
  if (nav) push('/wiki/' + encodeURIComponent(slug));
  render();
}

function upsertTab(tab) {
  if (!state.tabs.some(t => t.id === tab.id)) state.tabs.push(tab);
  state.active = tab.id;
}

function closeTab(id) {
  if (id === 'home') return;
  state.tabs = state.tabs.filter(t => t.id !== id);
  if (state.active === id) { state.active = state.tabs.at(-1)?.id || 'home'; state.folder = null; push('/'); }
  render();
}

function remember(tool) {
  state.recents = [{ slug: tool.slug, title: tool.title, category: tool.category }, ...state.recents.filter(x => x.slug !== tool.slug)].slice(0, 12);
  localStorage.setItem('mp-recents', JSON.stringify(state.recents));
}

function slugCat(c) { return c.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }

function cats() {
  const map = {};
  state.tools.forEach(t => { map[t.category] = (map[t.category] || 0) + 1; });
  return Object.entries(map);
}

function filteredTools() {
  const q = state.query.toLowerCase();
  return state.tools.filter(t => {
    if (state.folder && t.category !== state.folder) return false;
    if (!q) return true;
    return `${t.title} ${t.category} ${t.description}`.toLowerCase().includes(q);
  });
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="desktop">${desktopHTML()}</div><div class="android">${androidHTML()}</div><div id="palette" class="palette hidden"></div>`;
  bind();
  const tab = state.tabs.find(t => t.id === state.active);
  if (tab?.kind === 'tool') {
    document.querySelectorAll(`[data-tool-mount="${CSS.escape(tab.slug)}"]`).forEach(el => {
      if (!el.dataset.ready) {
        el.dataset.ready = '1';
        const tool = state.tools.find(t => t.slug === tab.slug);
        if (tool) mountTool(el, tool);
      }
    });
  }
  if (tab?.kind === 'wiki-agent' || tab?.kind === 'self-agent') {
    document.querySelectorAll(`[data-agent="${tab.kind}"]`).forEach(el => {
      if (!el.dataset.ready) { el.dataset.ready = '1'; mountWikiAgent(el, { mode: tab.kind === 'self-agent' ? 'self' : 'hosted', standalone: false }); }
    });
  }
}

function desktopHTML() {
  const tab = state.tabs.find(t => t.id === state.active) || state.tabs[0];
  return `<section class="browser">
    <div class="traffic">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <div class="tabstrip">
        ${state.tabs.map(t => `<button class="tab ${t.id === state.active ? 'active' : ''}" data-tab="${esc(t.id)}"><b>${esc(t.title)}</b>${t.id !== 'home' ? `<span class="x" data-close="${esc(t.id)}">×</span>` : ''}</button>`).join('')}
        <button class="newtab" id="newtab" title="New tab">+</button>
      </div>
    </div>
    <div class="omnibar">
      <div class="navbtns">
        <button id="back" title="Back">←</button>
        <button id="forward" title="Forward">→</button>
        <button id="homebtn" title="Home">⌂</button>
      </div>
      <input class="addr" id="addr" value="${esc(tab.path)}" spellcheck="false">
      <button class="omni-go" id="command">⌘K</button>
    </div>
    <div class="stage">${sidebarHTML()}${desktopStage(tab)}</div>
    <div class="statusbar"><span>MegaPLAN</span><span>${state.tools.length} tools · Wiki Agent on the home screen · files stay on this device when they can</span></div>
  </section>`;
}

function sidebarHTML() {
  return `<aside class="sidebar">
    <div class="brand-row"><div class="brand-mark">MP</div><div><b>MegaPLAN</b><small>Desk of free tools</small></div></div>
    <div class="side-label">PINNED</div>
    ${APPS.map(a => `<button class="side-item ${state.active === a.id ? 'active' : ''}" data-app="${a.kind}">${a.title}</button>`).join('')}
    <div class="side-label">FOLDERS</div>
    ${cats().map(([c, n]) => `<button class="folder-row ${state.folder === c ? 'active' : ''}" data-folder="${esc(c)}">${folderSvg(FOLDER_META[c]?.color || '#e8b44c')}<span>${esc(c)}</span><span class="count">${n}</span></button>`).join('')}
  </aside>`;
}

function desktopStage(tab) {
  if (tab.kind === 'tool') return `<div class="files"><div data-tool-mount="${esc(tab.slug)}"></div></div>`;
  if (tab.kind === 'wiki-agent' || tab.kind === 'self-agent') return `<div class="files agent-mount" data-agent="${tab.kind}"></div>`;
  if (tab.kind === 'my-wiki' || tab.kind === 'wiki-page') return wikiStage();
  const tools = filteredTools();
  const showTools = Boolean(state.folder) || Boolean(state.query);
  return `<div class="files">
    <div class="files-head">
      <div class="crumb"><button data-home>Home</button><span>/</span>${state.folder ? `<b>${esc(state.folder)}</b>` : '<b>All folders</b>'}</div>
      <input id="desk-search" class="field" style="max-width:240px" placeholder="Search tools" value="${esc(state.query)}">
      <div class="view-toggle"><button data-view="icons">Icons</button><button data-view="list">List</button></div>
    </div>
    ${showTools ? filesView(tools) : homeIcons()}
  </div>`;
}

function homeIcons() {
  return `<div class="icon-grid">
    ${APPS.map(a => `<button class="icon" data-app="${a.kind}">${appSvg(a.kind)}<div class="name">${esc(a.title)}</div><div class="meta">${esc(a.blurb)}</div></button>`).join('')}
    ${cats().map(([c, n]) => `<button class="icon" data-folder="${esc(c)}">${folderSvg(FOLDER_META[c]?.color || '#e8b44c')}<div class="name">${esc(c)}</div><div class="meta">${n} tools</div></button>`).join('')}
  </div>`;
}

function filesView(tools) {
  if (state.view === 'list') {
    return `<div class="list">${tools.map(t => `<button class="list-row" data-slug="${esc(t.slug)}">${fileSvg()}<span>${esc(t.title)}</span><span class="muted">${esc(t.category)}</span><span class="muted">ready</span></button>`).join('')}</div>`;
  }
  return `<div class="icon-grid">${tools.map(t => `<button class="icon" data-slug="${esc(t.slug)}">${fileSvg()}<div class="name">${esc(t.title)}</div><div class="meta">${esc(t.category)}</div></button>`).join('')}</div>`;
}

function wikiStage() {
  const all = [...state.localPages, ...state.pages];
  return `<div class="files"><div class="tool-pane">
    <div class="tool-kicker">Wiki</div>
    <h1>Pages</h1>
    <p class="lede">Pages you build with Wiki Agent or Self Agent. Local pages live in this browser. Published pages come from the site wiki.</p>
    <div class="icon-grid">${all.map(p => `<button class="icon" data-wikipage="${esc(p.slug)}">${fileSvg()}<div class="name">${esc(p.title || p.slug)}</div></button>`).join('') || '<p class="muted">No wiki pages yet. Open Wiki Agent.</p>'}</div>
  </div></div>`;
}

function androidHTML() {
  const clock = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (state.mobileTab === 'agent') {
    return androidChrome(clock, 'Wiki Agent', `<div class="a-screen" style="min-height:60vh" data-agent="wiki-agent"></div>`);
  }
  if (state.mobileTab === 'self') {
    return androidChrome(clock, 'Self Agent', `<div class="a-screen" style="min-height:60vh" data-agent="self-agent"></div>`);
  }
  const tab = state.tabs.find(t => t.id === state.active);
  if (tab?.kind === 'tool') {
    return androidChrome(clock, tab.title, `<div class="a-screen"><button class="a-row" data-home>← Files</button><div data-tool-mount="${esc(tab.slug)}"></div></div>`);
  }
  if (state.folder) {
    const tools = filteredTools();
    return androidChrome(clock, state.folder, `<div class="a-screen">
      <button class="a-row" data-home>← Internal storage</button>
      <div class="a-list">${tools.map(t => `<button class="a-row" data-slug="${esc(t.slug)}">${fileSvg()}<span><b>${esc(t.title)}</b><div class="muted">${esc(t.description || '')}</div></span></button>`).join('')}</div>
    </div>`);
  }
  const hits = state.query ? filteredTools().slice(0, 40) : [];
  return androidChrome(clock, 'Files', `<div class="a-screen">
    <input class="a-search" id="msearch" placeholder="Search tools" value="${esc(state.query)}">
    ${state.query ? `<div class="a-section">${hits.length} results</div><div class="a-list">${hits.map(t => `<button class="a-row" data-slug="${esc(t.slug)}">${fileSvg()}<span><b>${esc(t.title)}</b><div class="muted">${esc(t.category)}</div></span></button>`).join('')}</div>` : `
    <div class="a-pins">
      ${APPS.map(a => `<button class="a-pin" data-app="${a.kind}">${appSvg(a.kind)}<b>${esc(a.title)}</b><span>${esc(a.blurb)}</span></button>`).join('')}
    </div>
    <div class="a-section">Internal storage</div>
    <div class="a-grid">${cats().map(([c, n]) => `<button class="a-folder" data-folder="${esc(c)}">${folderSvg(FOLDER_META[c]?.color || '#e8b44c')}<div class="name">${esc(c)}</div></button>`).join('')}</div>
    ${state.recents.length ? `<div class="a-section">Recent</div><div class="a-list">${state.recents.map(t => `<button class="a-row" data-slug="${esc(t.slug)}">${fileSvg()}<span>${esc(t.title)}</span></button>`).join('')}</div>` : ''}`}
  </div>`);
}

function androidChrome(clock, title, inner) {
  return `<div class="a-status"><span>${clock}</span><span>MegaPLAN</span></div>
    <div class="a-appbar"><button data-home aria-label="Back">←</button><h1>${esc(title)}</h1><button id="m-more" aria-label="Search">⌕</button></div>
    ${inner}
    <nav class="a-nav">
      <button data-mtab="home" class="${state.mobileTab === 'home' && !state.folder ? 'active' : ''}"><span class="ico">▣</span>Files</button>
      <button data-mtab="recents"><span class="ico">◷</span>Recent</button>
      <button data-mtab="agent" class="${state.mobileTab === 'agent' ? 'active' : ''}"><span class="ico">✦</span>Agent</button>
      <button data-mtab="self" class="${state.mobileTab === 'self' ? 'active' : ''}"><span class="ico">⌘</span>Self</button>
    </nav>`;
}

function bind() {
  document.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => openFolder(b.dataset.folder));
  document.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => openTool(b.dataset.slug));
  document.querySelectorAll('[data-app]').forEach(b => b.onclick = () => {
    if (b.dataset.app === 'my-wiki') { upsertTab({ id: 'my-wiki', kind: 'my-wiki', title: 'My Wiki', path: 'megaplan://wiki' }); push('/wiki/'); render(); }
    else openApp(b.dataset.app);
  });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = e => { if (e.target.dataset.close) return; activate(b.dataset.tab); render(); });
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = e => { e.stopPropagation(); closeTab(b.dataset.close); });
  document.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { state.folder = null; state.mobileTab = 'home'; activate('home'); push('/'); render(); });
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { state.view = b.dataset.view; localStorage.setItem('mp-view', state.view); render(); });
  document.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => {
    state.mobileTab = b.dataset.mtab;
    if (b.dataset.mtab === 'agent') openApp('wiki-agent');
    else if (b.dataset.mtab === 'self') openApp('self-agent');
    else if (b.dataset.mtab === 'recents' && state.recents[0]) openTool(state.recents[0].slug);
    else { state.folder = null; activate('home'); push('/'); render(); }
  });
  document.getElementById('homebtn')?.addEventListener('click', () => { state.folder = null; activate('home'); push('/'); render(); });
  document.getElementById('back')?.addEventListener('click', () => history.back());
  document.getElementById('forward')?.addEventListener('click', () => history.forward());
  document.getElementById('newtab')?.addEventListener('click', () => { state.folder = null; activate('home'); push('/'); render(); });
  document.getElementById('command')?.addEventListener('click', openPalette);
  document.getElementById('addr')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v.startsWith('megaplan://folder/')) openFolder(v.replace('megaplan://folder/', '').replace(/-/g, ' '));
      else { state.query = v.replace(/^megaplan:\/\//, ''); state.folder = null; render(); }
    }
  });
  document.getElementById('msearch')?.addEventListener('input', e => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const n = document.getElementById('msearch');
    if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.getElementById('desk-search')?.addEventListener('input', e => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const n = document.getElementById('desk-search');
    if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });
}

function openPalette() {
  const el = document.getElementById('palette');
  const items = [
    ...APPS.map(a => ({ t: a.title, run: () => a.kind === 'my-wiki' ? (upsertTab({ id: 'my-wiki', kind: 'my-wiki', title: 'My Wiki', path: 'megaplan://wiki' }), push('/wiki/'), render()) : openApp(a.kind) })),
    ...cats().map(([c]) => ({ t: c + ' folder', run: () => openFolder(c) })),
    ...state.tools.slice(0, 40).map(t => ({ t: t.title, run: () => openTool(t.slug) }))
  ];
  el.classList.remove('hidden');
  el.innerHTML = `<div class="palette-box"><input id="pal-q" placeholder="Search MegaPLAN…">${items.slice(0, 18).map((x, i) => `<button class="palette-item" data-i="${i}">${esc(x.t)}</button>`).join('')}</div>`;
  el.onclick = ev => { if (ev.target.id === 'palette') el.classList.add('hidden'); };
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { el.classList.add('hidden'); items[Number(b.dataset.i)].run(); });
  el.querySelector('#pal-q').focus();
}

load().catch(err => {
  document.getElementById('app').innerHTML = `<div class="boot"><div class="boot-mark">MP</div><p>${esc(err.message)}</p></div>`;
});
