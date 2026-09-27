/**
 * MegaPLAN AI Mode — the interface.
 *
 * What changed and why (the previous build was replaced end to end):
 *  - it now uses the shared deterministic planner (`planner.js`) instead of a
 *    hard-coded prompt blob, so the chain is inspectable, reproducible and testable
 *  - it now actually *runs* the chain (`ai-executors.js`) instead of printing
 *    prompts and hoping
 *  - it degrades honestly: no hosted key means the hosted step is skipped and
 *    labelled, never faked
 *  - the surface is a real instrument panel: mobile-first, keyboard-friendly,
 *    no inline styles, no wall-of-text greeting
 */
import { esc, toast } from './kit.js';
import {
  planRequest, buildIndex, planToText, normalizeRequest, draftToolSpec, PLANNER_VERSION
} from './planner.js';
import { runStep, buildBatchesLocally, batchToMarkdown, triggerDownload, canExecute, readFileText } from './ai-executors.js';
import { recognizeImages } from './ocr-engine.js';
import { citationList, renderCitationsText, summarize, truncate, revisionQuestions, safeUrl } from './ai-compose.js';
import { GUIDE } from './ai-guide.js';


/**
 * Reads one rendered page bitmap, returning just the text.
 *
 * A scanned PDF has no text layer, so the page is rendered to a canvas and read
 * by the same recogniser the image tools use. It is passed into the executors
 * as a callback rather than imported, so the OCR bundle is only fetched the
 * first time a scan is actually met.
 */
const readScanText = async (input, opts = {}) => {
  // Called two ways: with a rendered canvas (a scanned PDF page) and with the
  // image files the user attached. Both end up at the same recogniser.
  if (input && typeof input.toBlob === 'function') {
    const blob = await new Promise((res, rej) => input.toBlob(b => (b ? res(b) : rej(Error('The page could not be rendered.'))), 'image/png'));
    const res = await recognizeImages([new File([blob], 'page.png', { type: 'image/png' })], opts);
    return res.pages.map(p => p.text).join('\n');
  }
  return recognizeImages(input, opts);
};

const LS = {
  session: 'mp-ai-mode-session',
  history: 'mp-ai-mode-history',
  private: id => `mp-ai-private-tools-${id}`,
  settings: 'mp-ai-mode-settings'
};
const HISTORY_MAX = 40;
const PRIVATE_MAX = 40;

const EXAMPLES = [
  'Research solar power in Kerala from Wikipedia and give me a PDF with sources',
  'Create a PowerPoint about the Kerala backwaters with 8 slides',
  'Find 6 recent PubMed papers on vitamin D deficiency and summarise the findings',
  'Make notes and revision questions from this lecture video',
  'Turn the attached notes into a formatted PDF',
  'Coffee shops near Fort Kochi, plus the weather there'
];

/* ------------------------------------------------------------------ *
 * Storage helpers — every one is failure-tolerant. Private browsing,
 * quota errors and corrupted JSON must never break the app.
 * ------------------------------------------------------------------ */

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
function newCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function sessionCode() {
  const existing = lsGet(LS.session, null);
  if (typeof existing === 'string' && /^\d{4}$/.test(existing)) return existing;
  const code = newCode();
  lsSet(LS.session, code);
  return code;
}
function loadPrivate(code) {
  const list = lsGet(LS.private(code), []);
  return Array.isArray(list) ? list.slice(0, PRIVATE_MAX) : [];
}
function savePrivate(code, list) {
  return lsSet(LS.private(code), list.slice(0, PRIVATE_MAX));
}
function loadHistory() {
  const list = lsGet(LS.history, []);
  return Array.isArray(list) ? list.slice(0, HISTORY_MAX) : [];
}
function pushHistory(entry) {
  const list = loadHistory().filter(h => h.prompt !== entry.prompt);
  list.unshift({ ...entry, ts: Date.now() });
  lsSet(LS.history, list.slice(0, HISTORY_MAX));
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

export function mountAIMode(root, tool) {
  const code = sessionCode();
  const uid = 'mai';

  if (!document.getElementById('mai-styles')) {
    const link = document.createElement('link');
    link.id = 'mai-styles';
    link.rel = 'stylesheet';
    link.href = '/ai-mode.css';
    document.head.appendChild(link);
  }

  root.innerHTML = `
<div class="mai" id="${uid}">
  <div class="mai-bar">
    <div class="mai-mark" aria-hidden="true">MP</div>
    <div class="mai-titles">
      <h1 class="mai-title">AI Mode</h1>
      <p class="mai-sub" id="${uid}-status"><span class="mai-dot"></span><span>Starting…</span></p>
    </div>
    <div class="mai-bar-actions">
      <button class="mai-btn ghost icon" id="${uid}-guide-btn" title="Guide" aria-label="Open the AI Mode guide">?</button>
      <button class="mai-btn ghost icon" id="${uid}-hist-btn" title="History" aria-label="Open request history">⟲</button>
      <button class="mai-btn ghost icon" id="${uid}-code-btn" title="Session code" aria-label="Session code">#</button>
    </div>
  </div>

  <div class="mai-progress hidden" id="${uid}-progress"><i></i></div>

  <!-- One polite live region for the whole desk. Every step state change,
       progress tick and toast goes through here, so a screen reader hears
       what changed instead of a wall of text re-reading on every update. -->
  <p class="mai-sr" id="${uid}-live" role="status" aria-live="polite" aria-atomic="true"></p>

  <div class="mai-body">
    <div class="mai-cols mai-scroll">

      <div class="mai-col-main">
        <!-- ============ COMPOSE ============ -->
        <section class="mai-pane active" id="${uid}-pane-compose" aria-label="Request">
          <div class="mai-card">
            <header>
              <h2>Request</h2>
              <span class="mai-spacer"></span>
              <span class="mai-chip" id="${uid}-count">0 files · 0 links</span>
            </header>
            <div class="mai-card-body mai-compose">

              <div class="mai-field">
                <div class="mai-drop" id="${uid}-drop" role="button" tabindex="0" aria-label="Add files">
                  <strong>Attach files</strong>
                  Drop them here, or tap to choose
                  <input type="file" multiple id="${uid}-file" class="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.tsv,.json,.xml,.html,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.wav,.m4a,.mp4,.webm,.svg,.epub">
                </div>
                <div class="mai-chips" id="${uid}-files"></div>
              </div>

              <div class="mai-field">
                <label class="mai-label" for="${uid}-links">Links <span class="mai-hint">YouTube, playlists, articles</span></label>
                <div class="mai-field-inline">
                  <input class="mai-input" id="${uid}-link" placeholder="https://www.youtube.com/watch?v=…" inputmode="url" autocomplete="off">
                  <button class="mai-btn sm" id="${uid}-link-add">Add</button>
                </div>
                <div class="mai-chips" id="${uid}-linklist"></div>
              </div>

              <div class="mai-field">
                <label class="mai-label" for="${uid}-prompt">What do you want? <span class="mai-hint">Ctrl/⌘ + Enter to run</span></label>
                <textarea class="mai-textarea" id="${uid}-prompt" rows="3"
                  placeholder="Research solar power in Kerala from Wikipedia, then make a PDF with every source listed."></textarea>
              </div>

              <div class="mai-row">
                <div class="mai-field">
                  <label class="mai-label" for="${uid}-mode">Study mode</label>
                  <select class="mai-select" id="${uid}-mode">
                    <option value="auto">Auto</option>
                    <option value="batch">Batch — one prompt for many questions</option>
                    <option value="per">Per question — NotebookLM shape</option>
                  </select>
                </div>
                <div class="mai-field">
                  <label class="mai-label" for="${uid}-target">Deliver to</label>
                  <select class="mai-select" id="${uid}-target">
                    <option value="file">A file here (PDF / PPTX / text)</option>
                    <option value="gemini">Google AI Studio prompt pack</option>
                    <option value="notebooklm">NotebookLM prompt pack</option>
                    <option value="assistant">Writing-assistant pass</option>
                    <option value="local">This browser only</option>
                  </select>
                </div>
              </div>

              <div class="mai-field">
                <span class="mai-label">Try one</span>
                <div class="mai-examples" id="${uid}-examples"></div>
              </div>

              <div class="mai-row">
                <button class="mai-btn primary block" id="${uid}-run">Run</button>
                <button class="mai-btn block" id="${uid}-batches">Study batches</button>
              </div>
              <button class="mai-btn block hidden" id="${uid}-stop">Stop</button>
            </div>
          </div>
        </section>

        <!-- ============ RUN ============ -->
        <section class="mai-pane" id="${uid}-pane-run" aria-label="Plan and results">
          <div class="mai-card">
            <header>
              <h2>Plan</h2>
              <span class="mai-spacer"></span>
              <button class="mai-btn sm ghost" id="${uid}-copy-plan">Copy plan</button>
            </header>
            <div class="mai-plan-head">
              <div class="mai-plan-summary" id="${uid}-plan-summary">Type a request to see the chain before anything runs.</div>
              <button class="mai-btn sm" id="${uid}-run2">Run</button>
            </div>
            <div class="mai-steps" id="${uid}-steps"></div>
          </div>
        </section>
      </div>

      <div class="mai-col-side">
        <section class="mai-pane active" id="${uid}-pane-output" aria-label="Output">
          <div class="mai-card">
            <header>
              <h3>Deliverables</h3>
              <span class="mai-spacer"></span>
              <span class="mai-chip" id="${uid}-deliv-count">0</span>
            </header>
            <div class="mai-card-body mai-list" id="${uid}-deliv"></div>
          </div>

          <div class="mai-card">
            <header>
              <h3>Answer</h3>
              <span class="mai-spacer"></span>
              <button class="mai-btn sm ghost" id="${uid}-copy-answer">Copy</button>
              <button class="mai-btn sm ghost" id="${uid}-dl-answer">Download</button>
            </header>
            <div class="mai-card-body">
              <pre class="mai-step-pre mai-answer" id="${uid}-answer">Nothing yet — run a request.</pre>
            </div>
          </div>

          <div class="mai-card">
            <header>
              <h3>Sources</h3>
              <span class="mai-spacer"></span>
              <span class="mai-chip" id="${uid}-src-count">0</span>
            </header>
            <div class="mai-card-body mai-src" id="${uid}-sources"></div>
          </div>

          <div class="mai-card">
            <header>
              <h3>Prompt pack</h3>
              <span class="mai-spacer"></span>
              <button class="mai-btn sm ghost" id="${uid}-copy-prompt">Copy</button>
            </header>
            <div class="mai-card-body">
              <div class="mai-row three mb">
                <button class="mai-btn sm" data-prompt="gemini">AI Studio</button>
                <button class="mai-btn sm" data-prompt="notebooklm">NotebookLM</button>
                <button class="mai-btn sm" data-prompt="assistant">Assistant</button>
              </div>
              <pre class="mai-step-pre mai-promptbox" id="${uid}-promptpack">Runs with the request.</pre>
            </div>
          </div>

          <div class="mai-card">
            <header>
              <h3>Private tools</h3>
              <span class="mai-spacer"></span>
              <button class="mai-btn sm ghost" id="${uid}-pt-export">Export</button>
            </header>
            <div class="mai-card-body mai-list" id="${uid}-private"></div>
          </div>
        </section>
      </div>

      <!-- ============ GUIDE ============ -->
      <section class="mai-pane mai-pane-wide" id="${uid}-pane-guide" aria-label="Guide">
        <div class="mai-card">
          <header>
            <h2>Guide</h2>
            <span class="mai-spacer"></span>
            <button class="mai-btn sm ghost" id="${uid}-guide-close">Back to work</button>
          </header>
          <div class="mai-card-body mai-guide" id="${uid}-guide"></div>
        </div>
      </section>

    </div>
  </div>

  <nav class="mai-tabs" id="${uid}-tabs" role="tablist" aria-label="AI Mode sections">
    <button role="tab" data-pane="compose" aria-selected="true"><span class="ic" aria-hidden="true">✎</span>Compose</button>
    <button role="tab" data-pane="run" aria-selected="false"><span class="ic" aria-hidden="true">▶</span>Run<span class="badge hidden" id="${uid}-tab-run-badge">0</span></button>
    <button role="tab" data-pane="output" aria-selected="false"><span class="ic" aria-hidden="true">▤</span>Output<span class="badge hidden" id="${uid}-tab-out-badge">0</span></button>
    <button role="tab" data-pane="guide" aria-selected="false"><span class="ic" aria-hidden="true">◈</span>Guide</button>
  </nav>
</div>`;

  const $ = s => root.querySelector('#' + uid + '-' + s);
  const el = {
    status: $('status'), progress: $('progress'), bar: $('progress').querySelector('i'),
    drop: $('drop'), file: $('file'), files: $('files'), count: $('count'),
    link: $('link'), linkAdd: $('link-add'), linkList: $('linklist'),
    prompt: $('prompt'), mode: $('mode'), target: $('target'), examples: $('examples'),
    run: $('run'), run2: $('run2'), stop: $('stop'), batches: $('batches'),
    planSummary: $('plan-summary'), steps: $('steps'), copyPlan: $('copy-plan'),
    deliv: $('deliv'), delivCount: $('deliv-count'), answer: $('answer'),
    sources: $('sources'), srcCount: $('src-count'), promptpack: $('promptpack'),
    private: $('private'), guide: $('guide'), tabs: $('tabs'),
    tabRun: $('tab-run-badge'), tabOut: $('tab-out-badge'),
    copyAnswer: $('copy-answer'), dlAnswer: $('dl-answer'),
    copyPrompt: $('copy-prompt'), ptExport: $('pt-export'),
    live: $('live')
  };

  /* ---------------- state ---------------- */
  const state = {
    files: [],
    links: [],
    tools: [],
    index: null,
    plan: null,
    results: {},
    running: false,
    abort: false,
    privateTools: loadPrivate(code),
    assistant: null,
    toolCount: 0,
    answer: '',
    sourceItems: [],
    prompts: { gemini: '', notebooklm: '', assistant: '' },
    lastFileTexts: []
  };

  /* ---------------- status ---------------- */
  function setStatus(dot, text) {
    el.status.innerHTML = `<span class="mai-dot ${dot}"></span><span>${esc(text)}</span>`;
  }
  setStatus('busy', 'Loading the tool library…');

  /* ---------------- panes ---------------- */
  const panes = ['compose', 'run', 'output', 'guide'];
  const isNarrow = () => window.matchMedia('(max-width: 899px)').matches;
  function showPane(name) {
    for (const p of panes) {
      $(`pane-${p}`)?.classList.toggle('active', p === name);
    }
    el.tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pane === name)));
  }
  el.tabs.addEventListener('click', e => {
    const btn = e.target.closest('button[data-pane]');
    if (btn) showPane(btn.dataset.pane);
  });
  $('guide-btn').onclick = () => showPane('guide');
  $('guide-close').onclick = () => showPane('compose');

  /* ---------------- tool library ---------------- */
  (async () => {
    let tools = [];
    try {
      const cached = lsGet('mp-tools-list', null);
      if (Array.isArray(cached) && cached.length) tools = cached;
      else {
        const res = await fetch('/data/tools.json', { cache: 'no-store' });
        tools = res.ok ? await res.json() : [];
        if (Array.isArray(tools) && tools.length) lsSet('mp-tools-list', tools.slice(0, 600));
      }
    } catch { tools = []; }
    // The measured contract table decides what AI Mode may promise. It is
    // optional: without it the planner falls back to its own rules, and with it
    // no studio, app or catalogued tool is ever queued as runnable.
    let classes = null;
    try {
      const res = await fetch('/data/tool-contracts.json', { cache: 'no-store' });
      if (res.ok) {
        const doc = await res.json();
        if (Array.isArray(doc?.tools)) {
          classes = new Map(doc.tools.map(t => [t.slug, t.class]));
          state.contractCounts = doc.counts || null;
        }
      }
    } catch { classes = null; }
    state.tools = (Array.isArray(tools) ? tools : []).map(t => (
      classes && classes.has(t.slug) ? { ...t, toolClass: classes.get(t.slug) } : t
    ));
    state.toolCount = state.tools.length;
    state.index = buildIndex(state.tools);
    setStatus('on', `${state.toolCount} tools ready · session ${code}`);
    refreshPlan();
    loadHealth();
  })();

  async function loadHealth() {
    try {
      const res = await fetch('/api/ai-mode', { cache: 'no-store' });
      const m = res.ok ? await res.json() : null;
      if (!m) { setStatus('on', `${state.toolCount} tools ready · session ${code}`); return; }
      state.assistant = m.assistant?.configured ?? null;
      const base = `${state.toolCount} tools ready · session ${code}`;
      setStatus('on', state.assistant ? `${base} · writing pass ready` : `${base} · on-device only`);
    } catch {
      setStatus('on', `${state.toolCount} tools ready · session ${code}`);
    }
  }

  /* ---------------- attachments ---------------- */
  const MAX_FILE_MB = 24;
  el.drop.addEventListener('click', () => el.file.click());
  el.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); } });
  ['dragenter', 'dragover'].forEach(type => el.drop.addEventListener(type, e => { e.preventDefault(); el.drop.classList.add('has'); }));
  ['dragleave', 'drop'].forEach(type => el.drop.addEventListener(type, e => { e.preventDefault(); el.drop.classList.remove('has'); }));
  el.drop.addEventListener('drop', e => { addFiles([...(e.dataTransfer?.files || [])]); });
  el.file.addEventListener('change', () => { addFiles([...(el.file.files || [])]); el.file.value = ''; });
  el.prompt.addEventListener('paste', e => {
    const items = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    if (items.length) { e.preventDefault(); addFiles(items); }
  });

  function addFiles(list) {
    let rejected = 0;
    for (const f of list) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) { rejected++; continue; }
      if (state.files.some(x => x.name === f.name && x.size === f.size)) continue;
      state.files.push(f);
    }
    if (rejected) toast(`${rejected} file(s) over ${MAX_FILE_MB} MB were skipped`);
    renderFiles();
    refreshPlan();
  }
  function renderFiles() {
    el.files.innerHTML = state.files.map((f, i) =>
      `<span class="mai-chip"><b>${esc(f.name)}</b><small>${Math.max(1, Math.round(f.size / 1024))} KB</small><button class="x" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`
    ).join('');
    el.files.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => { state.files.splice(Number(b.dataset.rm), 1); renderFiles(); refreshPlan(); };
    });
    el.count.textContent = `${state.files.length} file${state.files.length === 1 ? '' : 's'} · ${state.links.length} link${state.links.length === 1 ? '' : 's'}`;
  }

  el.linkAdd.onclick = addLink;
  el.link.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
  function addLink() {
    const raw = el.link.value.trim().replace(/[<>"']/g, '');
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) return toast('That does not look like a link');
    if (!state.links.some(l => l.url === url)) state.links.push({ url });
    el.link.value = '';
    renderFiles();
    refreshPlan();
  }
  function renderLinks() {
    el.linkList.innerHTML = state.links.map((l, i) =>
      `<span class="mai-chip"><b>${esc(l.url.replace(/^https?:\/\//, '').slice(0, 42))}</b><button class="x" data-rml="${i}" aria-label="Remove link">×</button></span>`
    ).join('');
    el.linkList.querySelectorAll('[data-rml]').forEach(b => {
      b.onclick = () => { state.links.splice(Number(b.dataset.rml), 1); renderLinks(); renderFiles(); refreshPlan(); };
    });
  }

  /* ---------------- examples ---------------- */
  el.examples.innerHTML = EXAMPLES.map(t => `<button class="mai-example">${esc(t)}</button>`).join('');
  el.examples.querySelectorAll('.mai-example').forEach(b => {
    b.onclick = () => { el.prompt.value = b.textContent; el.prompt.focus(); refreshPlan(); };
  });

  /* ---------------- planning ---------------- */
  let planTimer = null;
  el.prompt.addEventListener('input', () => {
    clearTimeout(planTimer);
    planTimer = setTimeout(refreshPlan, 180);
  });
  [el.mode, el.target].forEach(node => node.addEventListener('change', refreshPlan));

  function currentRequest() {
    return {
      prompt: el.prompt.value.trim(),
      files: state.files.map(f => ({ name: f.name, size: f.size, type: f.type })),
      links: state.links.map(l => l.url),
      options: {
        mode: el.mode.value,
        target: el.target.value,
        hasKey: false,
        includeImages: true
      },
      tools: state.tools,
      index: state.index || undefined
    };
  }

  function refreshPlan() {
    renderLinks();
    const req = currentRequest();
    if (!state.index) return;
    try {
      state.plan = planRequest(req);
    } catch (err) {
      state.plan = null;
      renderSteps([{ n: 1, id: 'err', title: 'The request could not be planned', why: String(err?.message || err), state: 'failed', kind: 'error' }], []);
      return;
    }
    if (!req.prompt && !req.files.length && !req.links.length) {
      state.plan = null;
      state.results = {};
      renderEmptySteps();
      el.planSummary.innerHTML = 'Type a request to see the chain before anything runs.';
      return;
    }
    const auto = state.plan.steps.filter(s => s.auto).length;
    const open = state.plan.steps.filter(s => s.action === 'open').length;
    el.planSummary.innerHTML =
      `<b>${state.plan.steps.length}</b> step${state.plan.steps.length === 1 ? '' : 's'} · ` +
      `<b>${auto}</b> run here${open ? ` · <b>${open}</b> open a tool` : ''} · ` +
      esc(state.plan.summary);
    renderSteps(state.plan.steps.map(s => ({ ...s, state: 'pending' })), state.plan);
  }

  function renderEmptySteps() {
    el.steps.innerHTML = `
      <div class="mai-empty">
        <div class="glyph" aria-hidden="true">MP</div>
        <h3>Nothing planned yet</h3>
        <p>Describe what you want. The chain appears here before anything runs.</p>
      </div>`;
  }

  function renderSteps(steps, plan) {
    if (!steps.length) return renderEmptySteps();
    el.steps.innerHTML = steps.map(s => {
      const stateClass = s.state || 'pending';
      const tag = stateClass === 'done' ? '<span class="mai-tag done">done</span>'
        : stateClass === 'running' ? '<span class="mai-tag auto">running</span>'
        : stateClass === 'failed' ? '<span class="mai-tag failed">failed</span>'
        : stateClass === 'skipped' ? '<span class="mai-tag">skipped</span>'
        : s.auto ? '<span class="mai-tag auto">run</span>'
        : s.action === 'open' ? '<span class="mai-tag open">open</span>'
        : '<span class="mai-tag">you</span>';
      const res = s.result;
      return `
      <article class="mai-step is-${stateClass}" data-state="${stateClass}" data-step="${esc(s.id || '')}">
        <div class="mai-step-n">${s.n ?? '·'}</div>
        <div class="mai-step-main">
          <div class="mai-step-title">${tag}<span>${esc(s.title || '')}</span>${s.toolTitle && s.toolTitle !== s.title ? `<span class="mai-step-alt">${esc(s.toolTitle)}</span>` : ''}</div>
          ${s.why ? `<p class="mai-step-why">${esc(s.why)}</p>` : ''}
          ${s.detail && stateClass === 'pending' ? `<p class="mai-step-detail">${esc(s.detail)}</p>` : ''}
          ${res ? `<div class="mai-step-out ${res.ok ? 'ok' : 'bad'}"><span class="lbl">${res.ok ? 'Result' : 'Stopped'}</span>${esc(res.summary || '')}</div>` : ''}
          ${res?.text ? `<pre class="mai-step-pre" data-out="${esc(s.id)}">${esc(String(res.text).slice(0, 6000))}${String(res.text).length > 6000 ? '\n\n…' : ''}</pre>` : ''}
          <div class="mai-step-acts" data-acts></div>
        </div>
      </article>`;
    }).join('');
    wireStepActions(steps, plan);
  }

  function wireStepActions(steps, plan) {
    for (const node of el.steps.querySelectorAll('.mai-step')) {
      const id = node.dataset.step;
      const step = steps.find(s => s.id === id);
      if (!step) continue;
      const acts = node.querySelector('[data-acts]');
      const add = (label, fn, cls = 'sm ghost') => {
        const b = document.createElement('button');
        b.className = `mai-btn ${cls}`;
        b.textContent = label;
        b.onclick = fn;
        acts.appendChild(b);
      };
      if (step.tool && step.action === 'open') {
        add('Open tool', () => openTool(step.tool), 'sm');
      }
      if (step.result?.text) {
        add('Copy', async () => { await copy(String(step.result.text)); });
        add('Download', () => downloadText(String(step.result.text), `megaplan-${step.id}.txt`));
      }
      if (step.result?.artifact) {
        add('Save again', () => toast(`${step.result.artifact.name} was written when the step ran`));
      }
      if (step.state === 'failed' || stateClassIsPending(step)) {
        add('Retry', () => runStepAndRefresh(step, plan));
      }
    }
  }
  const stateClassIsPending = s => !s.state || s.state === 'pending';

  function openTool(slug) {
    const url = `/tools/${encodeURIComponent(slug)}`;
    if (location.pathname === url) return toast('This tool is already open in another tab position');
    location.assign(url);
  }

  /* ---------------- execution ---------------- */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch { toast('Copy is blocked in this browser'); }
      ta.remove();
    }
  }
  function downloadText(text, name) {
    triggerDownload(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  }

  function setRunning(on) {
    state.running = on;
    el.run.disabled = on;
    el.run2.disabled = on;
    el.batches.disabled = on;
    el.stop.classList.toggle('hidden', !on);
    el.progress.classList.toggle('hidden', !on);
  }
  function setProgress(pct) { el.bar.style.width = `${Math.max(0, Math.min(100, pct))}%`; }

  /**
   * Say one thing once. Screen readers re-read a changed live region in full,
   * so repeating "3 of 7" on every tick makes the app unusable rather than
   * accessible: only a change in the message is announced.
   */
  let lastSaid = '';
  function announce(message) {
    const text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text || text === lastSaid) return;
    lastSaid = text;
    el.live.textContent = text;
  }
  function announceStep(step, stateName) {
    if (!step) return;
    const n = step.n ? `Step ${step.n} of ` : '';
    const verb = { done: 'finished', running: 'started', failed: 'failed', skipped: 'was skipped', pending: 'is waiting' }[stateName] || stateName;
    announce(`${n}${step.title} ${verb}.`);
  }

  async function execute() {
    if (state.running) return;
    if (!state.plan) refreshPlan();
    if (!state.plan) return toast('Type a request, attach a file or add a link first');
    state.abort = false;
    state.results = {};
    setRunning(true);
    setProgress(0);
    const steps = state.plan.steps.map(s => ({ ...s, state: 'pending', result: null }));
    renderSteps(steps, state.plan);
    showPaneIfNarrow('run');

    const ctx = {
      files: state.files,
      tools: state.tools,
      plan: state.plan,
      steps: state.plan.steps,
      prompt: el.prompt.value.trim(),
      results: state.results,
      // Scanned pages are read here, in the page, by the same recogniser the
      // image tools use. It is handed to the executors rather than imported so
      // the Tesseract bundle is only fetched when a scan is actually met.
      ocr: readScanText,
      readScanText
    };

    const runnable = steps.filter(s => s.auto && canExecute(s.executor));
    let done = 0;
    for (const step of runnable) {
      if (state.abort) break;
      const live = steps.find(s => s.id === step.id);
      live.state = 'running';
      renderSteps(steps, state.plan);
      setProgress(Math.round((done / Math.max(1, runnable.length)) * 100));
      announceStep(step, 'running');
      announce(`${done + 1} of ${runnable.length} steps started.`);
      let result;
      try {
        result = await runStep(step, { ...ctx, results: state.results });
      } catch (err) {
        result = { ok: false, summary: String(err?.message || err) };
      }
      if (state.abort && !result.ok) result = { ...result, summary: 'Stopped at your request.' };
      state.results[step.id] = result;
      live.result = result;
      live.state = result.ok ? 'done' : (result.skipped ? 'skipped' : 'failed');
      done++;
      renderSteps(steps, state.plan);
      // What it produced, not just that it finished: "Finished" with no result
      // leaves a screen-reader user reading the plan again to find out.
      announceStep(step, live.state);
      if (result.summary) announce(`${step.title}: ${result.summary}`);
    }
    if (state.abort) {
      let stopped = 0;
      for (const s of steps) if (s.state === 'running' || s.state === 'pending') {
        if (s.auto && s.id !== state.results[s.id]) { s.state = 'skipped'; stopped++; }
      }
      renderSteps(steps, state.plan);
      announce(`Stopped at your request. ${stopped} step${stopped === 1 ? '' : 's'} did not run.`);
    }
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
    setRunning(false);
    const finished = steps.filter(s => s.auto && s.result?.ok).length;
    const failed = steps.filter(s => s.auto && s.result && !s.result.ok).length;
    announce(`Run finished: ${finished} step${finished === 1 ? '' : 's'} completed${failed ? `, ${failed} failed` : ''}.`);

    collectOutput(steps, ctx);
    pushHistory({
      prompt: el.prompt.value.trim().slice(0, 400),
      mode: el.mode.value,
      target: el.target.value,
      files: state.files.map(f => f.name),
      links: state.links.map(l => l.url),
      steps: steps.length,
      ok: Object.values(state.results).filter(r => r?.ok).length
    });
    showPaneIfNarrow('output');
  }

  function showPaneIfNarrow(name) { if (isNarrow()) showPane(name); }

  async function runStepAndRefresh(step, plan) {
    const ctx = { files: state.files, tools: state.tools, plan, steps: plan?.steps || [], prompt: el.prompt.value.trim(), results: state.results, ocr: readScanText, readScanText };
    const steps = (plan?.steps || []).map(s => ({ ...s, state: s.id === step.id ? 'running' : (state.results[s.id] ? (state.results[s.id].ok ? 'done' : 'failed') : 'pending'), result: state.results[s.id] || null }));
    renderSteps(steps, plan);
    const result = await runStep(step, ctx);
    state.results[step.id] = result;
    const i = steps.findIndex(s => s.id === step.id);
    steps[i] = { ...steps[i], result, state: result.ok ? 'done' : 'failed' };
    renderSteps(steps, plan);
    collectOutput(steps, ctx);
  }

  /* ---------------- output aggregation ---------------- */
  function collectOutput(steps, ctx) {
    const artifacts = [];
    const sources = [];
    const texts = [];
    let prompts = { gemini: '', notebooklm: '', assistant: '' };

    for (const step of steps) {
      const r = state.results[step.id];
      if (!r) continue;
      if (r.artifact) artifacts.push(r.artifact);
      if (r.text) texts.push(`## ${step.title}\n\n${r.text}`);
      if (r.prompts) prompts = r.prompts;
      for (const item of [...(r.items || []), ...(r.sources || [])]) sources.push(item);
      if (r.article) sources.push(r.article);
    }

    state.sourceItems = dedupeSources(sources);
    state.prompts = prompts;

    const answer = texts.join('\n\n---\n\n');
    state.answer = answer;
    el.answer.textContent = answer || 'Nothing yet — run a request.';

    renderDeliverables(artifacts, steps);
    renderSources();
    renderPromptPack();
    renderBadges(steps);
  }

  function dedupeSources(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item) continue;
      const key = item.url || item.id || item.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out.slice(0, 80);
  }

  function renderDeliverables(artifacts, steps) {
    const rows = [];
    for (const a of artifacts) {
      rows.push(`<div class="mai-item"><div class="ico">${esc(String(a.kind || 'file').toUpperCase())}</div>
        <div class="body"><b>${esc(a.name)}</b><small>${Math.max(1, Math.round(a.size / 1024))} KB · saved to your downloads</small></div></div>`);
    }
    if (state.answer) {
      rows.push(`<div class="mai-item"><div class="ico">TXT</div><div class="body"><b>Answer</b><small>${state.answer.length.toLocaleString('en-IN')} characters</small></div>
        <button class="mai-btn sm ghost" data-act="dl-answer">Save</button></div>`);
    }
    const promptsFilled = Object.values(state.prompts).some(Boolean);
    if (promptsFilled) {
      rows.push(`<div class="mai-item"><div class="ico">PRM</div><div class="body"><b>Prompt pack</b><small>AI Studio · NotebookLM · assistant</small></div>
        <button class="mai-btn sm ghost" data-act="dl-prompts">Save</button></div>`);
    }
    el.deliv.innerHTML = rows.join('') || `<p class="mai-note info">No file yet. Ask for a PDF, a deck or a prompt pack and it lands here.</p>`;
    el.delivCount.textContent = String(rows.length);
    el.deliv.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'dl-answer') downloadText(state.answer, 'megaplan-answer.txt');
        else downloadText(promptPackText(), 'megaplan-prompt-pack.txt');
      };
    });
  }

  function renderSources() {
    const items = state.sourceItems;
    el.srcCount.textContent = String(items.length);
    if (!items.length) {
      el.sources.innerHTML = '<p class="mai-note info">No sources yet. Research, articles, transcripts and files add their links here — and every PDF or deck you download lists them.</p>';
      return;
    }
    el.sources.innerHTML = items.map((item, i) => {
      const meta = [item.source, item.authors || item.artist, item.journal, item.year, item.pmid ? `PMID ${item.pmid}` : null, item.doi ? `doi:${item.doi}` : null]
        .filter(Boolean).join(' · ');
      // Escaping stops markup injection; it does not stop a javascript: scheme.
      const href = safeUrl(item.url);
      const label = esc(item.title || item.url || 'Source');
      return `<div class="mai-src-item"><span class="n">${String(i + 1).padStart(2, '0')}</span>
        <div class="b">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label}
        ${href ? '' : item.url ? '<small>link withheld — not an http(s) address</small>' : ''}
        ${meta ? `<small>${esc(meta)}</small>` : ''}</div></div>`;
    }).join('');
  }

  function promptPackText() {
    const p = state.prompts;
    const parts = [];
    if (p.gemini) parts.push(`# Google AI Studio — one long-context pass\n\n${p.gemini}`);
    if (p.notebooklm) parts.push(`# NotebookLM — per-question batches\n\n${p.notebooklm}`);
    if (p.assistant) parts.push(`# Writing assistant\n\n${p.assistant}`);
    if (state.sourceItems.length) parts.push(`# Sources\n\n${renderCitationsText(state.sourceItems)}`);
    return parts.join('\n\n---\n\n');
  }

  function renderPromptPack() {
    const target = el.target.value;
    const key = ['gemini', 'notebooklm', 'assistant'].includes(target) ? target : 'gemini';
    el.promptpack.textContent = state.prompts[key] || 'Runs with the request.';
  }
  el.target.addEventListener('change', renderPromptPack);
  el.promptpack.parentElement.querySelectorAll('[data-prompt]').forEach(b => {
    b.onclick = () => {
      const key = b.dataset.prompt;
      if (!state.prompts[key]) return toast('No prompt pack yet — run a request first');
      const ta = el.promptpack;
      ta.textContent = state.prompts[key];
      copy(state.prompts[key]);
    };
  });

  function renderBadges(steps) {
    const failed = steps.filter(s => s.state === 'failed').length;
    const pending = steps.filter(s => s.auto && s.state === 'pending').length;
    const runBadge = failed ? failed : pending;
    el.tabRun.textContent = String(runBadge);
    el.tabRun.classList.toggle('hidden', !runBadge);
    const outs = state.sourceItems.length + (state.answer ? 1 : 0);
    el.tabOut.textContent = String(outs);
    el.tabOut.classList.toggle('hidden', !outs);
  }

  /* ---------------- private tools ---------------- */
  function renderPrivate() {
    if (!state.privateTools.length) {
      el.private.innerHTML = '<p class="mai-note info">Nothing here yet. When no tool in the library covers a request, AI Mode drafts a private tool for this session instead of guessing. Drafts stay on this device.</p>';
      return;
    }
    el.private.innerHTML = state.privateTools.map((t, i) => `
      <div class="mai-tool">
        <b>${esc(t.title || 'Private tool')}</b>
        <code>${esc(t.slug || '')}</code>
        <p>${esc(t.summary || '')}</p>
        <div class="acts">
          <button class="mai-btn sm" data-view="${i}">View</button>
          <button class="mai-btn sm ghost" data-del="${i}">Delete</button>
        </div>
      </div>`).join('');
    el.private.querySelectorAll('[data-view]').forEach(b => {
      b.onclick = () => {
        const t = state.privateTools[Number(b.dataset.view)];
        el.answer.textContent = `${t.title} (${t.slug})\n\n${t.summary || ''}\n\n${JSON.stringify(t, null, 2)}`;
        showPaneIfNarrow('output');
      };
    });
    el.private.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        state.privateTools.splice(Number(b.dataset.del), 1);
        savePrivate(code, state.privateTools);
        renderPrivate();
      };
    });
  }
  el.ptExport.onclick = () => {
    if (!state.privateTools.length) return toast('No private tools to export');
    downloadText(JSON.stringify({ session: code, tools: state.privateTools }, null, 2), `megaplan-private-${code}.json`);
  };

  /* ---------------- study batches (AI Studio / NotebookLM) ---------------- */
  el.batches.onclick = async () => {
    if (state.running) return;
    const gathered = Object.values(state.results).map(r => r?.text || '').join('\n\n');
    const fileTexts = [];
    for (const f of state.files) {
      if (/\.(txt|md|csv|json)$/i.test(f.name) && f.size < 3_000_000) {
        try { fileTexts.push({ name: f.name, text: await readFileText(f) }); } catch { /* unreadable */ }
      }
    }
    const paperText = state.files.find(f => /question|paper|qp|test|exam/i.test(f.name)) || fileTexts[0];
    const bookText = fileTexts.find(t => t !== paperText);
    const source = gathered || [paperText?.text, bookText?.text].filter(Boolean).join('\n\n');
    if (!source.trim()) {
      return toast('Run a request first, or attach the question paper and textbook so the text is available');
    }
    const batches = buildBatchesLocally({
      paper: paperText?.text || source,
      textbook: bookText?.text || source,
      mode: el.mode.value === 'auto' ? 'batch' : el.mode.value,
      batchSize: 5,
      topic: el.prompt.value.trim().slice(0, 120) || 'the syllabus'
    });
    if (!batches.totalQuestions) {
      state.answer = batchToMarkdown(batches) + '\n\n_No numbered questions were detected. Paste the question paper text, or run a request that reads the PDF first._';
      el.answer.textContent = state.answer;
      showPaneIfNarrow('output');
      return;
    }
    state.answer = batchToMarkdown(batches);
    el.answer.textContent = state.answer;
    showPaneIfNarrow('output');
    toast(`${batches.groups.length} batch prompt(s) for ${batches.totalQuestions} question(s)`);
  };

  /* ---------------- buttons ---------------- */
  el.run.onclick = execute;
  el.run2.onclick = execute;
  el.stop.onclick = () => { state.abort = true; toast('Stopping after the current step'); };
  el.prompt.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); execute(); }
  });
  el.copyPlan.onclick = () => {
    if (!state.plan) return toast('No plan yet');
    copy(planToText(state.plan));
  };
  el.copyAnswer.onclick = () => state.answer ? copy(state.answer) : toast('Nothing to copy yet');
  el.dlAnswer.onclick = () => state.answer ? downloadText(state.answer, 'megaplan-answer.txt') : toast('Nothing to save yet');
  el.copyPrompt.onclick = () => {
    const text = promptPackText();
    text ? copy(text) : toast('No prompt pack yet');
  };

  $('hist-btn').onclick = () => {
    const history = loadHistory();
    if (!history.length) return toast('No history yet');
    state.answer = history.map((h, i) =>
      `${i + 1}. ${new Date(h.ts).toLocaleString()} · ${h.steps} steps, ${h.ok} ok\n   ${h.prompt}`
    ).join('\n\n');
    el.answer.textContent = state.answer;
    showPaneIfNarrow('output');
  };

  $('code-btn').onclick = () => {
    const next = prompt('Your 4-digit session code. Enter an existing code to restore its private tools, or press Cancel to keep this one.', code);
    if (next == null) return;
    const value = String(next).trim();
    if (!/^\d{4}$/.test(value)) return toast('A session code is exactly four digits');
    if (value === code) return toast('That is already your active session');
    lsSet(LS.session, value);
    location.reload();
  };

  /* ---------------- guide ---------------- */
  function renderGuide(guide) {
    const g = guide || GUIDE;
    const parts = [];
    parts.push(`<div class="mai-hero">
      <h1>${esc(g.title)}</h1>
      <p>${esc(g.tagline)}</p>
      <p class="ver">guide ${esc(g.version)} · planner ${esc(PLANNER_VERSION)}</p>
    </div>`);

    for (const section of g.sections) {
      parts.push(`<section class="mai-gsec"><h2><span class="ico" aria-hidden="true">${esc(section.icon || '•')}</span>${esc(section.title)}</h2>`);
      for (const p of section.body || []) parts.push(`<p>${esc(p)}</p>`);
      if (section.points?.length) parts.push(`<ul>${section.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`);
      if (section.steps?.length) {
        parts.push(section.steps.map(s => `<div class="mai-gnum"><span class="n">${s.n}</span><div><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div></div>`).join(''));
      }
      if (section.recipes?.length) {
        parts.push(section.recipes.map(r => `<div class="mai-recipe">
          <div class="top"><span class="mai-badge">${esc(r.task)}</span></div>
          <code class="req">${esc(r.request)}</code>
          <p class="does">${esc(r.does)}</p>
        </div>`).join(''));
      }
      if (section.options?.length) {
        parts.push(section.options.map(o => `<div class="mai-opt">
          <header><b>${esc(o.name)}</b><small>${esc(o.when)}</small></header>
          <div>
            <dl><dt>Why</dt><dd>${esc(o.why)}</dd><dt>Mode</dt><dd>${esc(o.mode)}</dd></dl>
            <ol>${(o.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          </div>
        </div>`).join(''));
        if (section.note) parts.push(`<p class="mai-note">${esc(section.note)}</p>`);
      }
      if (section.table?.length) {
        const rows = section.table.map(row => (Array.isArray(row) ? row : [row.where, row.what]).filter(v => v != null));
        parts.push(`<div class="mai-tablewrap"><table class="mai-table">
          <thead><tr>${rows[0].map((_, i) => `<th>${i === 0 ? 'Where' : 'What'}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`);
      }
      if (section.limits?.length) {
        parts.push(section.limits.map(l => `<div class="mai-recipe"><div class="top"><span class="mai-badge off">not done</span></div>
          <b class="mai-lead">${esc(l.no)}</b><p class="does">Instead: ${esc(l.instead)}</p></div>`).join(''));
      }
      parts.push('</section>');
    }

    if (g.faq?.length) {
      parts.push(`<section class="mai-gsec"><h2><span class="ico" aria-hidden="true">?</span>Questions people ask</h2>
        ${g.faq.map(f => `<details class="mai-faq"><summary>${esc(f.q)}</summary><div>${esc(f.a)}</div></details>`).join('')}</section>`);
    }
    if (g.glossary?.length) {
      parts.push(`<section class="mai-gsec"><h2><span class="ico" aria-hidden="true">⌘</span>Words AI Mode uses</h2>
        <dl class="mai-terms">${g.glossary.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.def)}</dd>`).join('')}</dl></section>`);
    }
    el.guide.innerHTML = parts.join('');
  }

  renderGuide(GUIDE);
  fetch('/api/ai-mode?view=guide', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { if (j?.guide) renderGuide(j.guide); })
    .catch(() => { /* the embedded copy already rendered */ });

  /* ---------------- initial paint ---------------- */
  renderFiles();
  renderLinks();
  renderPrivate();
  renderEmptySteps();
  renderSources();
  renderDeliverables([], []);
  renderBadges([]);
}
