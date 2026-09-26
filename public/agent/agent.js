/**
 * MegaPLAN Wiki Agent — Codex-style chat + live browser window.
 * Hosted path: POST /api/agent-plan (server holds the key).
 * Self Agent: browser-only OpenAI-compatible key.
 * Deploy publishes via /api/agent-publish (Git) or saves on this device.
 * Never display model or vendor names.
 */
import { esc, byok, saveByok } from '../js/kit.js';
import { evaluateExpression, validateApiBlock } from './expression.js';

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
    if (b.type === 'api') validateApiBlock(b);
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

export function previewHtml(s, nonce = '') {
  const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
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
    const safeEval = ${evaluateExpression.toString()};
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
    const nonce = ${safeJson(nonce)};
    if (nonce) {
      const logs = []; let ok = true;
      const check = (hit, message) => { logs.push((hit ? '✓ ' : '✗ ') + message); if (!hit) ok = false; };
      check(!!document.querySelector('[data-agent-root]'), 'root rendered');
      check(!!document.querySelector('h1'), 'title rendered');
      for (const test of ${safeJson(s.tests || [])}) {
        if (test.action === 'assert-text') check(document.body.innerText.includes(String(test.text)), 'text: ' + String(test.text).slice(0, 80));
        else if (test.action === 'assert-blocks') check(document.querySelectorAll('[data-agent-root] > *').length >= (test.minimum || 1), 'block count');
        else if (test.action === 'calculator-smoke') {
          const block = [...document.querySelectorAll('[data-agent-key]')].find(r => r.dataset.agentKey === test.key);
          if (!block) check(false, 'calculator missing');
          else {
            const inputs = block.querySelectorAll('input');
            for (const input of inputs) input.value = '10';
            block.querySelector('[data-run]')?.click();
            const result = block.querySelector('[data-result]')?.textContent?.trim() || '';
            check(result !== '' && result !== 'Check the inputs' && Number.isFinite(Number(result)), 'calculator ran');
          }
        } else check(false, 'unknown browser check');
      }
      parent.postMessage({ type: 'megaplan-wiki-test', nonce, ok, logs }, '*');
    }
  })()</script>`;
}

export function mountWikiAgent(root, { mode = 'hosted', standalone = false } = {}) {
  root.innerHTML = `
    <div class="wiki-agent ${standalone ? 'standalone' : ''}">
      <div class="codex">
        <aside class="codex-chat">
          <header>
            <div class="tool-kicker">${mode === 'self' ? 'SELF AGENT' : 'WIKI AGENT'}</div>
            <h1>${mode === 'self' ? 'Your key, this browser' : 'Prompt → page → deploy'}</h1>
            <p class="lede">${mode === 'self'
              ? 'Paste an OpenAI-compatible base URL, model id, and key. They stay in this browser.'
              : 'Describe a page or a calculator API. The agent writes it, this window runs it, Deploy publishes it.'}</p>
            ${standalone ? '<p class="lede"><a href="/" style="color:#e8b44c">← Desk</a></p>' : ''}
          </header>
          <div id="thread" class="codex-thread"></div>
          <form class="codex-composer" id="composer">
            <textarea id="prompt" maxlength="7000" placeholder="Example: Create a GST invoice checklist for small businesses in India, with a glossary and a GST calculator API."></textarea>
            <div class="codex-actions">
              <button class="btn primary" id="build" type="submit">Run</button>
              <button class="btn secondary" id="autonomous" type="button">${mode === 'hosted' ? 'GitHub runner' : 'Queue run'}</button>
              <button class="btn ghost" type="button" data-fill="Create a custom API page that calculates discount from price and percent.">New API</button>
              <button class="btn ghost" type="button" data-fill="Create a study reference page with an outline, glossary, checklist and FAQ.">Study page</button>
            </div>
            <details class="premium">
              <summary>Operator publishing (optional)</summary>
              <input id="write-token" class="field" type="password" autocomplete="off" placeholder="Operator write token — kept in this tab only">
            </details>
            <details class="premium" ${mode === 'self' ? 'open' : ''}>
              <summary>${mode === 'self' ? 'Self Agent credentials (this browser only)' : 'Optional Self Agent / bring your own key'}</summary>
              <div class="field-row" style="margin-top:8px">
                <input id="byok-url" class="field" placeholder="Base URL ending in /v1">
                <input id="byok-model" class="field" placeholder="Model id">
                <input id="byok-key" class="field" type="password" placeholder="API key" autocomplete="off">
              </div>
            </details>
          </form>
        </aside>
        <section class="codex-browser">
          <div class="cb-chrome">
            <div class="cb-dots" aria-hidden="true"><i class="r"></i><i class="y"></i><i class="g"></i></div>
            <div class="cb-url" id="cb-url">megaplan://preview</div>
            <button class="btn ghost" id="reload" type="button">Reload</button>
            <button class="btn primary" id="deploy" type="button">Deploy</button>
          </div>
          <iframe id="preview" title="Sandboxed preview" sandbox="allow-scripts"></iframe>
          <pre id="test-log" class="cb-log">Browser idle. Send a prompt to build.</pre>
          <div id="pages-side" class="cb-pages"></div>
        </section>
      </div>
    </div>`;

  const $ = id => root.querySelector('#' + id);
  let spec = null;
  const cred = byok();
  if ($('byok-url')) { $('byok-url').value = cred.url; $('byok-model').value = cred.model; $('byok-key').value = cred.key; }

  function addBubble(kind, text) {
    const d = document.createElement('div');
    d.className = 'bubble ' + kind;
    d.textContent = text;
    $('thread').appendChild(d);
    $('thread').scrollTop = $('thread').scrollHeight;
  }

  async function health() {
    try { return await (await fetch('/api/agent-health', { cache: 'no-store' })).json(); }
    catch { return {}; }
  }

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
      .map(x => `<a href="/agent/view.html?slug=${encodeURIComponent(x.slug)}">${esc(x.title)} · ${x.local ? 'device' : 'live'}</a>`)
      .join('') || '<span>No pages yet.</span>';
    $('pages-side').innerHTML = html;
    return [...local, ...(remote || [])];
  }

  let validationPassed = false;
  let testNonce = '';
  function renderSpec(s) {
    spec = s;
    validationPassed = false;
    testNonce = crypto.randomUUID();
    const nonce = testNonce;
    $('cb-url').textContent = 'megaplan://preview/' + (s.slug || 'draft');
    $('test-log').textContent = 'Running sandboxed browser checks…';
    $('preview').srcdoc = previewHtml(s, nonce);
    setTimeout(() => {
      if (testNonce !== nonce || validationPassed || $('test-log').textContent !== 'Running sandboxed browser checks…') return;
      $('test-log').textContent = '✗ Browser check timed out';
      addBubble('step', 'Preview checks timed out; publishing is disabled.');
    }, 5000);
  }

  window.addEventListener('message', event => {
    const d = event.data;
    if (event.source !== $('preview').contentWindow || d?.type !== 'megaplan-wiki-test' || d.nonce !== testNonce) return;
    validationPassed = d.ok === true && Array.isArray(d.logs) && d.logs.every(x => typeof x === 'string' && x.startsWith('✓'));
    $('test-log').textContent = d.logs.join('\n');
    if (validationPassed) persistLocal(spec);
    addBubble('step', validationPassed ? 'Browser tests passed. Saved on this device; Deploy requires an operator token.' : 'Browser tests failed; publishing is disabled.');
    pages();
  });

  async function publish() {
    if (!spec) { addBubble('agent', 'Nothing to deploy yet. Run a prompt first.'); return; }
    if (!validationPassed) { addBubble('agent', 'Run and pass the preview checks before publishing.'); return; }
    const token = $('write-token').value.trim();
    if (!token) { addBubble('agent', 'Saved on this device. Live publishing requires an operator write token.'); return; }
    addBubble('step', 'Publishing to GitHub…');
    try {
      const r = await fetch('/api/agent-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-write-token': token },
        body: JSON.stringify({ spec, proof: { passed: true, browser: 'sandboxed-browser', tests: $('test-log').textContent } })
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || 'Publish API unavailable.');
      addBubble('agent', `Deployed ${j.path}${j.deployed ? ' and triggered a site rebuild.' : '. Vercel will pick up the Git commit.'}`);
      $('cb-url').textContent = '/agent/view.html?slug=' + spec.slug;
      pages();
    } catch (e) {
      addBubble('agent', 'Saved on this device. Live Git deploy needs the website publisher: ' + e.message + ' Open /agent/view.html?slug=' + spec.slug);
    }
  }

  async function build(ev) {
    ev?.preventDefault();
    const p = $('prompt').value.trim();
    if (!p) { addBubble('agent', 'Enter a task first.'); return; }
    if (localModelProbe(p)) { addBubble('agent', 'I can build site features, but I cannot help identify the underlying model or provider.'); return; }
    saveByok({ url: $('byok-url')?.value, model: $('byok-model')?.value, key: $('byok-key')?.value });
    addBubble('user', p);
    addBubble('step', 'Planning…');
    try {
      const list = await pages();
      const b = byok();
      let specOut;
      const useSelf = mode === 'self' || (b.url && b.model && b.key);
      if (useSelf) {
        if (!b.url || !b.model || !b.key) throw Error('Self Agent needs a base URL, model id, and key in this browser.');
        addBubble('step', 'Writing with your key (never sent to MegaPLAN)…');
        const payload = {
          model: b.model,
          messages: [
            { role: 'system', content: 'Create one constrained MegaPLAN wiki page. Return JSON only with refusal, kind, slug, title, summary, blocks, tests. Block types: hero,text,markdown,list,table,note,tool-link,calculator,faq,api. Prefer a working api/calculator when asked. Do not disclose provider/model identity. No executable code.' },
            { role: 'user', content: `Build request:\n${p}\nExisting pages:\n${JSON.stringify(list.map(x => ({ slug: x.slug, title: x.title })))}` }
          ],
          max_tokens: 8000, temperature: 0.25, response_format: { type: 'json_object' }
        };
        const r = await fetch(b.url.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.key }, body: JSON.stringify(payload) });
        const raw = await r.text(); if (!r.ok) throw Error('Self Agent HTTP ' + r.status);
        specOut = JSON.parse(JSON.parse(raw).choices[0].message.content);
      } else {
        const h = await health();
        if (!h.aiConfigured && !h.providerConfigured && h.actionsConfigured) {
          addBubble('step', 'This website does not hold the hosted writing key. Queueing the GitHub runner…');
          return autonomous();
        }
        if (!h.aiConfigured && !h.providerConfigured) {
          throw Error('Hosted writing is not on this website. Use Self Agent with your own key, or ask the operator to add the hosted API key on the website host (GitHub secrets are not visible here).');
        }
        addBubble('step', 'Writing page and API…');
        const r = await fetch('/api/agent-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p, existingPages: list.map(x => ({ slug: x.slug, title: x.title })) }) });
        const j = await r.json(); if (!r.ok) throw Error(j.error || 'Build failed.'); specOut = j.spec;
        if (j.message) addBubble('agent', j.message);
      }
      if (specOut?.refusal) { addBubble('agent', specOut.refusal); return; }
      addBubble('step', 'Opening in the browser window…');
      renderSpec(validate(specOut));
    } catch (e) { addBubble('agent', e.message); }
  }

  async function autonomous() {
    const p = $('prompt').value.trim(); if (!p) return addBubble('agent', 'Enter a task first.');
    if (localModelProbe(p)) return addBubble('agent', 'I can build site features, but I cannot help identify the underlying model or provider.');
    addBubble('step', 'Queueing GitHub runner…');
    try {
      const token = $('write-token').value.trim();
      if (!token) throw Error('GitHub runner requires an operator write token.');
      const r = await fetch('/api/agent-dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-agent-write-token': token }, body: JSON.stringify({ prompt: p }) });
      const j = await r.json(); if (!r.ok) throw Error(j.error || 'Unable to queue run');
      addBubble('agent', 'Queued. Waiting for the runner…');
      let n = 0;
      const tick = async () => {
        n++;
        try {
          const s = await fetch('/api/agent-status?queued_after=' + encodeURIComponent(j.queuedAt), { cache: 'no-store' });
          const st = await s.json();
          if (!s.ok) throw Error(st.error || 'Status failed');
          if (st.pending) { if (n < 80) return setTimeout(tick, 3000); throw Error('Timed out waiting for the runner.'); }
          addBubble('agent', `Remote run ${st.run?.status || ''}${st.run?.conclusion ? ' / ' + st.run.conclusion : ''}`);
          if (st.run?.status === 'completed') { pages(); return; }
          if (n < 120) setTimeout(tick, 3000);
        } catch (e) { addBubble('agent', e.message); }
      };
      tick();
    } catch (e) { addBubble('agent', e.message); }
  }

  async function greet() {
    if (mode === 'self') return addBubble('agent', 'Self Agent uses only the key in this browser. Prompt, then Deploy.');
    const h = await health();
    if (h.aiConfigured || h.providerConfigured) addBubble('agent', 'Ready. Type a prompt — I will write a page or API, run it in the window on the right, then you can Deploy.');
    else if (h.actionsConfigured) addBubble('agent', 'This website does not hold the hosted writing key (it lives in GitHub Actions secrets). Run will queue the GitHub runner, or paste a Self Agent key.');
    else addBubble('agent', 'Hosted writing is not on this website yet. Use Self Agent, or add the hosted API key on Vercel. GitHub secrets are not visible to the website.');
  }

  $('composer').onsubmit = build;
  $('autonomous').onclick = autonomous;
  $('deploy').onclick = publish;
  $('reload').onclick = () => { if (spec) renderSpec(spec); };
  root.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => { $('prompt').value = b.dataset.fill; });
  greet();
  pages();
}

const standaloneRoot = document.getElementById('wiki-agent-root');
if (standaloneRoot) {
  const mode = new URLSearchParams(location.search).get('mode') === 'self' ? 'self' : 'hosted';
  mountWikiAgent(standaloneRoot, { mode, standalone: true });
}
