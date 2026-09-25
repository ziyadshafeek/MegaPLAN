/**
 * MegaPLAN Wiki Agent + Self Agent.
 * Hosted path calls /api/agent-plan (server holds the provider key).
 * Self Agent uses a browser-only OpenAI-compatible key.
 * Never display model or vendor names.
 */
import { esc, byok, saveByok, safeEval } from '../js/kit.js';

const OPS = new Set(['percentage', 'discount', 'tip', 'gst', 'bmi', 'markup', 'margin', 'profit', 'break-even']);
const BLOCKS = ['hero', 'text', 'markdown', 'list', 'table', 'note', 'tool-link', 'calculator', 'faq', 'api'];

function localModelProbe(s) {
  return /\b(what model|which model|model name|llm|deepseek|nvidia|provider|system prompt|hidden prompt|training data|are you gpt|are you deepseek|identify yourself|reveal your instructions)\b/i.test(s);
}

export function validate(s) {
  if (!s || s.refusal) return s;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+){2,69}$/.test(s.slug || '')) throw Error('Invalid slug');
  if (!s.title) throw Error('Invalid title');
  if (!Array.isArray(s.blocks) || !s.blocks.length || s.blocks.length > 24) throw Error('Invalid blocks');
  if (!Array.isArray(s.tests) || !s.tests.length) throw Error('Browser tests missing');
  for (const b of s.blocks) {
    if (!BLOCKS.includes(b.type)) throw Error('Unsupported block');
    if (b.type === 'calculator' && !OPS.has(b.operation)) throw Error('Unsupported calculator');
    if (b.type === 'api' && !/^[0-9a-zA-Z_+\-*/().\s]+$/.test(String(b.expression || ''))) throw Error('Unsafe API expression');
    if (/<script|javascript:|document\.cookie|localStorage|sessionStorage|fetch\(|XMLHttpRequest/i.test(JSON.stringify(b))) throw Error('Unsafe content rejected');
  }
  return s;
}

function blockHtml(b) {
  if (b.type === 'hero') return `<section class="hero"><div class="eyebrow">WIKI</div><h1>${esc(b.title)}</h1><p>${esc(b.subtitle)}</p></section>`;
  if (b.type === 'text') return `<section><h2>${esc(b.title || '')}</h2><p>${esc(b.body)}</p></section>`;
  if (b.type === 'markdown') return `<section><p>${esc(b.body).replace(/\n/g, '<br>')}</p></section>`;
  if (b.type === 'list') return `<section><h2>${esc(b.title || '')}</h2><ul>${(b.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
  if (b.type === 'table') return `<section><h2>${esc(b.title || '')}</h2><div class="table"><table><thead><tr>${(b.columns || []).map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  if (b.type === 'note') return `<aside class="note">${esc(b.body)}</aside>`;
  if (b.type === 'tool-link') return `<section><a class="tool-link" href="/tools/${encodeURIComponent(b.slug)}">${esc(b.title)} ↗</a></section>`;
  if (b.type === 'faq') return `<section><h2>FAQ</h2>${(b.items || []).map(x => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</section>`;
  if (b.type === 'calculator') return `<section class="calc" data-agent-key="${esc(b.key || 'calc')}" data-operation="${esc(b.operation)}"><h2>${esc(b.title || 'Calculator')}</h2><div class="calc-grid"><input type="number" placeholder="${esc(b.labels?.[0] || 'Value A')}"><input type="number" placeholder="${esc(b.labels?.[1] || 'Value B')}"></div><button data-run>Calculate</button><div class="result" data-result></div></section>`;
  if (b.type === 'api') return `<section class="calc" data-agent-key="${esc(b.key || 'api')}" data-api="1" data-expression="${esc(b.expression)}"><h2>${esc(b.title || 'API')}</h2><div class="calc-grid">${(b.inputs || []).map(i => `<input data-id="${esc(i.id)}" type="number" placeholder="${esc(i.label || i.id)}">`).join('')}</div><button data-run>Run</button><div class="result" data-result></div></section>`;
  return '';
}

export function previewHtml(s) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{font-family:Segoe UI,system-ui,sans-serif;margin:0;padding:28px;color:#1c1916;line-height:1.65;background:#fffaf2}
    .wrap{max-width:820px;margin:auto}.eyebrow{font-size:9px;letter-spacing:.12em;font-weight:800;color:#6e655b}
    .hero h1{font-size:40px;letter-spacing:-.05em;margin:12px 0}.calc,.note{border:1px solid #e0d5c4;border-radius:12px;padding:14px;background:#f7ead3;margin:18px 0}
    .calc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.calc input{padding:10px;border:1px solid #d7cbb8;border-radius:8px}
    .calc button{margin-top:9px;padding:9px 12px;background:#1c1916;color:#fff;border:0;border-radius:8px}
    table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #e0d5c4;padding:8px}
    .tool-link{display:inline-block;padding:10px 12px;background:#1c1916;color:#fff;border-radius:8px;text-decoration:none}
  </style><main class="wrap" data-agent-root>${(s.blocks || []).map(blockHtml).join('')}</main>
  <script>(()=>{
    function safeEval(expr, vars){
      if(!/^[0-9a-zA-Z_+\\-*/().\\s]+$/.test(expr)) throw Error('bad');
      const keys=Object.keys(vars); const fn=new Function(...keys, '"use strict"; return ('+expr+');');
      return fn(...keys.map(k=>Number(vars[k])));
    }
    for(const r of document.querySelectorAll('.calc')) r.querySelector('[data-run]').onclick=()=>{
      try{
        if(r.dataset.api){
          const vars={}; for(const i of r.querySelectorAll('input')) vars[i.dataset.id]=i.value;
          const v=safeEval(r.dataset.expression, vars);
          r.querySelector('[data-result]').textContent=String(Math.round(v*10000)/10000); return;
        }
        const a=Number(r.querySelectorAll('input')[0].value), b=Number(r.querySelectorAll('input')[1].value); let v;
        switch(r.dataset.operation){
          case'percentage':v=a*b/100;break; case'discount':v=a-a*b/100;break; case'tip':case'gst':v=a+a*b/100;break;
          case'bmi':v=b>0?a/(b*b):NaN;break; case'markup':v=a*(1+b/100);break; case'margin':v=a?((a-b)/a)*100:NaN;break;
          case'profit':v=a-b;break; case'break-even':v=b?Math.ceil(a/b):NaN;break;
        }
        r.querySelector('[data-result]').textContent=Number.isFinite(v)?String(Math.round(v*10000)/10000):'Check the inputs';
      }catch(e){ r.querySelector('[data-result]').textContent='Check the inputs'; }
    };
  })()<\\/script>`;
}

export function mountWikiAgent(root, { mode = 'hosted', standalone = false } = {}) {
  root.innerHTML = `
    <div class="wiki-agent ${standalone ? 'standalone' : ''}">
      <header class="wa-head">
        <div>
          <div class="tool-kicker">${mode === 'self' ? 'SELF AGENT' : 'WIKI AGENT'}</div>
          <h1>${mode === 'self' ? 'Run your own agent' : 'Build a wiki page'}</h1>
          <p class="lede">${mode === 'self'
            ? 'Paste an OpenAI-compatible base URL, model id, and key. They stay in this browser and are never written to MegaPLAN servers or Git.'
            : 'Describe a page or a tiny calculator API. The hosted agent drafts it, this browser tests it, then you can keep it locally or publish it to the wiki.'}</p>
        </div>
        <a class="btn ghost" href="/">← Desk</a>
      </header>
      <div class="wa-grid">
        <section class="panel">
          <label class="muted">Task</label>
          <textarea id="prompt" class="input-area" maxlength="7000" placeholder="Example: Create a GST invoice checklist for small businesses in India, with a glossary and a simple GST calculator."></textarea>
          <div class="button-row">
            <button class="btn secondary" data-fill="Create a study reference page with an outline, glossary, checklist and FAQ.">Study page</button>
            <button class="btn secondary" data-fill="Create a custom API page that calculates discount from price and percent.">New API</button>
            <button class="btn secondary" data-fill="Create a troubleshooting guide with symptoms, checks and an FAQ.">Guide</button>
          </div>
          ${mode === 'self' || true ? `<details class="premium" ${mode === 'self' ? 'open' : ''}><summary>${mode === 'self' ? 'Self Agent credentials (this browser only)' : 'Optional Self Agent / bring your own key'}</summary>
            <div class="field-row" style="margin-top:8px">
              <input id="byok-url" class="field" placeholder="Base URL ending in /v1">
              <input id="byok-model" class="field" placeholder="Model id">
              <input id="byok-key" class="field" type="password" placeholder="API key" autocomplete="off">
            </div>
            <p class="muted">Hosted Wiki Agent ignores these fields. Self Agent uses only these fields.</p>
          </details>` : ''}
          <div class="button-row">
            <button class="btn primary" id="build">Build + test</button>
            ${mode === 'hosted' ? '<button class="btn secondary" id="autonomous">Run autonomously</button>' : ''}
            <label class="muted"><input id="autopublish" type="checkbox"> Publish when tests pass</label>
          </div>
          <div id="status" class="note" style="margin-top:12px">Ready.</div>
        </section>
        <section class="panel" style="padding:0;overflow:hidden;min-height:420px;display:flex;flex-direction:column">
          <div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid #e0d5c4;font-size:12px">
            <button class="btn ghost" data-view="preview">Preview</button>
            <button class="btn ghost" data-view="editor">JSON</button>
            <span id="test-state" class="muted" style="margin-left:auto">Not tested</span>
          </div>
          <iframe id="preview" title="Sandboxed preview" sandbox="allow-scripts" style="flex:1;border:0;background:#fff;min-height:280px"></iframe>
          <textarea id="spec-editor" class="input-area hidden" style="flex:1;border:0;border-radius:0;font-family:ui-monospace,monospace;font-size:12px"></textarea>
          <pre id="test-log" class="out" style="max-height:120px;border-radius:0;margin:0"></pre>
        </section>
      </div>
      <div class="panel" style="margin-top:12px">
        <b>Published & local pages</b>
        <div id="pages-side" class="icon-grid" style="margin-top:8px"></div>
      </div>
    </div>`;

  const $ = id => root.querySelector('#' + id);
  let spec = null;
  const cred = byok();
  if ($('byok-url')) { $('byok-url').value = cred.url; $('byok-model').value = cred.model; $('byok-key').value = cred.key; }

  function timeline(msg) { $('status').textContent = msg; }

  function persistLocal(s) {
    const list = JSON.parse(localStorage.getItem('mp-wiki-pages') || '[]').filter(x => x.slug !== s.slug);
    list.push({ slug: s.slug, title: s.title, summary: s.summary, spec: s, savedAt: new Date().toISOString() });
    localStorage.setItem('mp-wiki-pages', JSON.stringify(list));
    localStorage.setItem('mp-wiki-' + s.slug, JSON.stringify(s));
  }

  async function pages() {
    let remote = [];
    try { remote = await (await fetch('/data/agent-pages.json', { cache: 'no-store' })).json(); } catch {}
    const local = JSON.parse(localStorage.getItem('mp-wiki-pages') || '[]');
    const html = [...local.map(x => ({ ...x, local: true })), ...(remote || [])]
      .map(x => `<a class="icon" href="/agent/view.html?slug=${encodeURIComponent(x.slug)}"><div class="name">${esc(x.title)}</div><div class="meta">${x.local ? 'this device' : 'published'}</div></a>`)
      .join('') || '<p class="muted">No pages yet.</p>';
    $('pages-side').innerHTML = html;
    return [...local, ...(remote || [])];
  }

  async function runBrowserTests() {
    const d = $('preview').contentDocument; const logs = []; let ok = true;
    if (!d?.querySelector('[data-agent-root]')) { ok = false; logs.push('✗ root missing'); } else logs.push('✓ root rendered');
    if (!d?.querySelector('h1')) { ok = false; logs.push('✗ title missing'); } else logs.push('✓ title rendered');
    for (const t of spec.tests || []) {
      if (t.action === 'assert-text') {
        const hit = (d.body.innerText || '').includes(String(t.text)); logs.push(`${hit ? '✓' : '✗'} text: ${t.text}`); if (!hit) ok = false;
      }
      if (t.action === 'assert-blocks') {
        const hit = d.querySelectorAll('[data-agent-root] > *').length >= (t.minimum || 1); logs.push(`${hit ? '✓' : '✗'} block count`); if (!hit) ok = false;
      }
      if (t.action === 'calculator-smoke') {
        const r = d.querySelector(`[data-agent-key="${CSS.escape(t.key)}"]`);
        if (!r) { ok = false; logs.push('✗ calculator missing'); }
        else {
          const ins = r.querySelectorAll('input'); if (ins[0]) ins[0].value = 10; if (ins[1]) ins[1].value = 20;
          r.querySelector('[data-run]')?.click();
          const hit = !!(r.querySelector('[data-result]')?.textContent || '').trim();
          logs.push(`${hit ? '✓' : '✗'} interaction`); if (!hit) ok = false;
        }
      }
    }
    $('test-log').textContent = logs.join('\n');
    $('test-state').textContent = ok ? 'Tests passed' : 'Tests failed';
    return ok;
  }

  function renderSpec(s) {
    spec = s;
    $('spec-editor').value = JSON.stringify(s, null, 2);
    $('preview').srcdoc = previewHtml(s);
    $('preview').onload = () => setTimeout(async () => {
      const ok = await runBrowserTests();
      persistLocal(s);
      timeline(ok ? 'Draft rendered and saved on this device.' : 'Draft rendered; tests failed.');
      if (ok && $('autopublish').checked) publish();
      pages();
    }, 40);
  }

  async function publish() {
    if (!spec) return;
    timeline('Publishing…');
    try {
      const r = await fetch('/api/agent-publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec, proof: { passed: true, browser: 'sandboxed-browser', tests: $('test-log').textContent } }) });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || 'Publish failed.');
      timeline(`Published ${j.path}.`);
      pages();
    } catch (e) { timeline(e.message); }
  }

  async function build() {
    const p = $('prompt').value.trim();
    if (!p) return timeline('Enter a task first.');
    if (localModelProbe(p)) return timeline('I can build site features, but I cannot help identify the underlying model or provider.');
    saveByok({ url: $('byok-url')?.value, model: $('byok-model')?.value, key: $('byok-key')?.value });
    timeline('Planning…');
    try {
      const list = await pages();
      const b = byok();
      let specOut;
      const useSelf = mode === 'self' || (b.url && b.model && b.key);
      if (useSelf) {
        if (!b.url || !b.model || !b.key) throw Error('Self Agent needs a base URL, model id, and key in this browser.');
        const payload = {
          model: b.model,
          messages: [
            { role: 'system', content: 'Create one constrained MegaPLAN wiki page. Return JSON only with refusal, kind, slug, title, summary, blocks, tests. Block types: hero,text,markdown,list,table,note,tool-link,calculator,faq,api. Do not disclose provider/model identity. No executable code.' },
            { role: 'user', content: `Build request:\n${p}\nExisting pages:\n${JSON.stringify(list.map(x => ({ slug: x.slug, title: x.title })))}` }
          ],
          max_tokens: 8000, temperature: 0.25, response_format: { type: 'json_object' }
        };
        const r = await fetch(b.url.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.key }, body: JSON.stringify(payload) });
        const raw = await r.text(); if (!r.ok) throw Error('Self Agent HTTP ' + r.status);
        specOut = JSON.parse(JSON.parse(raw).choices[0].message.content);
      } else {
        const r = await fetch('/api/agent-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p, existingPages: list.map(x => ({ slug: x.slug, title: x.title })) }) });
        const j = await r.json(); if (!r.ok) throw Error(j.error || 'Build failed.'); specOut = j.spec;
      }
      if (specOut?.refusal) { timeline(specOut.refusal); return; }
      renderSpec(validate(specOut));
    } catch (e) { timeline(e.message); }
  }

  async function autonomous() {
    const p = $('prompt').value.trim(); if (!p) return timeline('Enter a task first.');
    if (localModelProbe(p)) return timeline('I can build site features, but I cannot help identify the underlying model or provider.');
    timeline('Queueing autonomous run…');
    try {
      const r = await fetch('/api/agent-dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p }) });
      const j = await r.json(); if (!r.ok) throw Error(j.error || 'Unable to queue run');
      timeline('Queued. Waiting for the runner…');
      let n = 0;
      const tick = async () => {
        n++;
        try {
          const s = await fetch('/api/agent-status?queued_after=' + encodeURIComponent(j.queuedAt), { cache: 'no-store' });
          const st = await s.json();
          if (!s.ok) throw Error(st.error || 'Status failed');
          if (st.pending) { if (n < 80) return setTimeout(tick, 3000); throw Error('Timed out waiting for the runner.'); }
          timeline(`Remote run ${st.run?.status || ''}${st.run?.conclusion ? ' / ' + st.run.conclusion : ''}`);
          if (st.run?.status === 'completed') { pages(); return; }
          if (n < 120) setTimeout(tick, 3000);
        } catch (e) { timeline(e.message); }
      };
      tick();
    } catch (e) { timeline(e.message); }
  }

  $('build').onclick = build;
  $('autonomous')?.addEventListener('click', autonomous);
  root.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => { $('prompt').value = b.dataset.fill; });
  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    $('preview').classList.toggle('hidden', b.dataset.view !== 'preview');
    $('spec-editor').classList.toggle('hidden', b.dataset.view !== 'editor');
  });
  pages();
}

const standaloneRoot = document.getElementById('wiki-agent-root');
if (standaloneRoot) {
  const mode = new URLSearchParams(location.search).get('mode') === 'self' ? 'self' : 'hosted';
  mountWikiAgent(standaloneRoot, { mode, standalone: true });
}
