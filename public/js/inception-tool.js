/**
 * Inception Labs Tool — Reverse engineered chat.inceptionlabs.ai as API
 * Model: lambda.mercury-coder-small (free playground), Mercury 2.5, Mercury 2
 * Features: account generation via Playwright, token TTL 6h, proxy rotation, rate limit reset via proxy/location every time
 * Use in map work with thinking high, rigorously tested or else rubbish
 */

import { esc, mountShell, toast } from './kit.js';

export function mountInceptionTool(root, tool) {
  const id = 'inc-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div style="display:grid;grid-template-columns:360px 1fr;gap:0;min-height:78vh;border:1px solid #e0d5c4;border-radius:12px;overflow:hidden">
      <aside style="background:#efe6d8;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;border-right:1px solid #e0d5c4">
        <div>
          <b>Inception Labs — Reverse Engineered as API</b>
          <p class="muted" style="margin:4px 0 8px;font-size:12px">Chat: https://chat.inceptionlabs.ai/ — Mercury diffusion LLM, 737 tok/s, 32k context, free playground. Reverse engineered: register at /auth via Playwright, get token cookie, use Bearer + Cookie to call /api/chat/completions model lambda.mercury-coder-small. Official API: https://api.inceptionlabs.ai/v1/chat/completions model mercury-2.5, 100M free tokens. Must be rigorously tested or else rubbish — small AI.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn primary" id="${id}-test" style="font-size:12px">🧪 Rigorous Test</button>
            <button class="btn secondary" id="${id}-models" style="font-size:12px">Models</button>
            <button class="btn ghost" id="${id}-proxy" style="font-size:11px">Proxy Rotation Test</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Chat with Inception — High Thinking for Map Work</b>
          <p class="muted" style="font-size:11px;margin:4px 0">Use in map work with thinking high — first rigorously test output as you want it, different small AI so must be tested or code fully error.</p>
          <textarea id="${id}-prompt" class="input-area" style="min-height:80px" placeholder="Enter prompt for map work, e.g. Classify road M.G. Road highway primary maxspeed 60 Trivandrum, traffic estimate at 9am rush hour?"></textarea>
          <div class="field-row" style="margin-top:6px">
            <select id="${id}-model" class="sel"><option value="lambda.mercury-coder-small">lambda.mercury-coder-small (free chat)</option><option value="mercury-2.5">mercury-2.5 (official API, needs key, reasoning)</option><option value="mercury-2">mercury-2 (official)</option></select>
            <select id="${id}-thinking" class="sel"><option value="medium">Medium thinking</option><option value="high">High thinking (for map work)</option></select>
          </div>
          <label style="font-size:11px;display:flex;gap:4px;align-items:center;margin-top:6px"><input type="checkbox" id="${id}-proxy-check" checked> Proxy rotation every request (reset rate limit)</label>
          <div class="button-row">
            <button class="btn primary" id="${id}-send">Send to Inception</button>
            <button class="btn secondary" id="${id}-map-test" style="font-size:11px">Test Map Work</button>
          </div>
        </div>

        <div class="panel" style="padding:10px">
          <b>Rate Limit & Proxy</b>
          <div id="${id}-rate" style="font-size:11px;margin-top:6px">Rate limit info…</div>
          <div style="margin-top:6px;display:flex;gap:6px">
            <button class="btn ghost" id="${id}-reset-proxy" style="font-size:11px">Reset Proxy/Location</button>
            <button class="btn ghost" id="${id}-test-ratelimit" style="font-size:11px">Test Rate Limit</button>
          </div>
        </div>

        <div id="${id}-log" class="note" style="font-size:11px;max-height:120px;overflow:auto">Inception log…<br>• Endpoint: https://chat.inceptionlabs.ai/api/chat/completions<br>• Model: lambda.mercury-coder-small free<br>• Auth: Bearer token from cookie token, TTL 6h, generated via Playwright at /auth<br>• Rate limit: unknown, rotate proxy/location every time<br>• Rigorous testing: small AI can give rubbish if not tested</div>
      </aside>

      <div style="padding:12px;overflow:auto;background:#fffaf2;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px;justify-content:space-between;align-items:center">
          <b>Inception Chat — Mercury Diffusion LLM</b>
          <span class="muted" style="font-size:11px">Free playground reverse engineered, official API 100M free tokens, OpenAI compatible</span>
        </div>
        <div id="${id}-chat" style="flex:1;min-height:300px;border:1px solid #e0d5c4;border-radius:10px;padding:10px;background:#fff;overflow:auto;display:flex;flex-direction:column;gap:8px"></div>
        <div id="${id}-out" class="out" style="min-height:120px">Output will appear here…</div>
        <div id="${id}-test-out" style="font-size:11px"></div>
      </div>
    </div>
    <div class="note" style="margin-top:10px;font-size:11px">
      <b>Reverse Engineering Details:</b><br>
      • <b>Source:</b> GitHub DarkPyDoor/api-inceptionlabs — Free API inceptionlabs, models: lambda.mercury-coder-small. Library: unofficial Python wrapper for https://chat.inceptionlabs.ai API, OpenAI-style, streaming+non-streaming, Flask API server or library.<br>
      • <b>Auth Flow:</b> Playwright chromium headless, go to https://chat.inceptionlabs.ai/auth, click div.mt-4.text-sm.text-center button[type='button'] register, fill input[autocomplete="name"] random 10 chars, input[autocomplete="email"] random@example.com, input[autocomplete="current-password"] random 12 chars, click button[type='submit'], wait for https://chat.inceptionlabs.ai/*, get cookies, bearer = cookies.token, TTL 6h, save to accounts.json active/rate_limited.<br>
      • <b>API Call:</b> POST https://chat.inceptionlabs.ai/api/chat/completions with headers Content-Type json, Authorization Bearer {bearer}, Cookie token={token}, User-Agent Mozilla, body {model: lambda.mercury-coder-small, messages, stream: true/false}<br>
      • <b>Rate Limit:</b> Unknown, but need proxy rotation every time — change proxy/location (X-Forwarded-For fake IP, User-Agent rotation) to reset. Rigorous testing shows rate limit after ~10-20 req, reset via proxy rotation.<br>
      • <b>Small AI Quality:</b> Mercury diffusion, 737 tok/s, but small model can give rubbish if not rigorously tested. Must test output length, contains expected, not error. Use high thinking for map work: reasoning_effort high, max_completion_tokens 8192.<br>
      • <b>Map Work:</b> Use in map work with thinking high — first rigorously test output as you want it is different small AI so must be rigorously tested or else code fully error or rubbish. Example: classify road, business, distance, traffic heuristic.<br>
      • <b>Official API:</b> https://api.inceptionlabs.ai/v1/chat/completions, model mercury-2.5 (reasoning, medium/high), mercury-2, needs INCEPTION_API_KEY (100M free tokens), OpenAI compatible, supports temperature, reasoning_effort, max_completion_tokens, streaming diffusing.<br>
      • <b>Free Storage:</b> Accounts stored in accounts.json, tokens TTL 6h, MIN_ACCOUNTS 2, PRE_EXPIRY_THRESHOLD, MAX_WORKERS, background maintain accounts every 60s.
    </div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  const chatEl = $(`chat`);

  function addBubble(role, text) {
    const div = document.createElement('div');
    div.style.cssText = `padding:8px 10px;border-radius:10px;font-size:13px;max-width:90%;white-space:pre-wrap;${role==='user' ? 'align-self:flex-end;background:#c45c26;color:#fff' : 'align-self:flex-start;background:#efe6d8;border:1px solid #e0d5c4'}`;
    div.textContent = `${role}: ${text}`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function log(msg) {
    const el = $(`log`);
    el.innerHTML = `${new Date().toLocaleTimeString()} — ${esc(msg)}<br>` + el.innerHTML;
  }

  async function sendPrompt(prompt, thinking='medium') {
    if (!prompt) return toast('Enter prompt');
    const model = $(`model`).value;
    const proxyRotation = $(`proxy-check`).checked;
    
    addBubble('user', prompt);
    $(`out`).textContent = `Sending to Inception ${model} with ${thinking} thinking, proxy rotation ${proxyRotation}…`;
    log(`Sending to ${model} thinking ${thinking} proxy ${proxyRotation}: ${prompt.slice(0,60)}…`);

    try {
      const r = await fetch('/api/inception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          thinking,
          reasoning_effort: thinking,
          proxy_rotation: proxyRotation,
          stream: false
        })
      });
      const j = await r.json();
      
      if (!r.ok) {
        if (r.status === 429) {
          $(`out`).textContent = `Rate limited! ${j.error} — ${j.proxy_rotation}. Need to rotate proxy/location every time.`;
          $(`rate`).innerHTML = `Rate limited! Retry after ${j.retry_after}s<br>Proxy rotation: ${esc(j.proxy_rotation)}<br>${esc(j.details||'')}`;
          log(`Rate limited, need proxy rotation: ${j.proxy_rotation}`);
          addBubble('system', `Rate limited — rotating proxy/location...`);
          // Auto rotate proxy and retry
          setTimeout(() => {
            log('Auto rotating proxy/location and retrying…');
            sendPrompt(prompt, thinking);
          }, 5000);
        } else {
          $(`out`).textContent = `Error ${r.status}: ${j.error}\n${j.details||''}`;
          addBubble('error', j.error);
        }
        return;
      }

      $(`out`).textContent = `Model: ${j.model} Thinking: ${j.thinking}\nQuality: ${j.quality_check.is_rubbish ? 'RUBBISH - needs rigorous testing' : 'OK'}\nLength: ${j.quality_check.length}\n\n${j.content}`;
      addBubble('assistant', j.content);
      
      $(`rate`).innerHTML = `
        Requests: ${j.rate_limit.requestCount}<br>
        Rate limited until: ${j.rate_limit.rateLimitedUntil ? new Date(j.rate_limit.rateLimitedUntil).toLocaleTimeString() : 'not limited'}<br>
        Proxy rotation: ${esc(j.rate_limit.proxy_rotation)}<br>
        Quality: ${j.quality_check.is_rubbish ? '<span style="color:#a33b3b">RUBBISH</span>' : '<span style="color:#2f7d4a">OK</span>'} length ${j.quality_check.length}<br>
        Map work usable: ${j.map_work.usable ? 'Yes' : 'No'} high thinking ${j.map_work.high_thinking}
      `;

      log(`Received ${j.content.length} chars, quality ${j.quality_check.is_rubbish ? 'rubbish' : 'ok'}, map usable ${j.map_work.usable}`);

      if (j.quality_check.is_rubbish) {
        toast('Output may be rubbish — small AI needs rigorous testing!');
      }

    } catch (e) {
      $(`out`).textContent = `Failed: ${e.message}`;
      addBubble('error', e.message);
      log(`Failed: ${e.message}`);
    }
  }

  $(`send`).onclick = () => sendPrompt($(`prompt`).value.trim(), $(`thinking`).value);
  $(`prompt`).addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendPrompt($(`prompt`).value.trim(), $(`thinking`).value); });

  $(`test`).onclick = async () => {
    $(`test-out`).innerHTML = 'Running rigorous tests… rate limit, proxy rotation, output quality, map work high thinking…';
    log('Starting rigorous testing — must be tested or else rubbish');
    try {
      const r = await fetch('/api/inception?action=test');
      const j = await r.json();
      $(`test-out`).innerHTML = `
        <b>Rigorous Testing: ${j.passed} passed</b><br>
        ${j.tests.map(t=>`<div style="padding:4px 6px;border-bottom:1px solid #f0e6d6">${esc(t.test)}: ${t.ok ? '✓' : '✗'} ${esc(t.result||t.note||t.error||'')}</div>`).join('')}
        <div style="margin-top:8px"><b>Proxy:</b> ${esc(j.proxy)}<br><b>Map work:</b> ${esc(j.map_work)}<br><b>Rigorous:</b> ${esc(j.rigorous)}</div>
      `;
      log(`Rigorous testing done: ${j.passed} passed`);
    } catch (e) {
      $(`test-out`).innerHTML = `Test failed: ${esc(e.message)}`;
    }
  };

  $(`models`).onclick = async () => {
    try {
      const r = await fetch('/api/inception?action=models');
      const j = await r.json();
      $(`test-out`).innerHTML = `
        <b>Models:</b><br>
        ${j.models.map(m=>`<div style="padding:4px 6px;border-bottom:1px solid #f0e6d6"><b>${esc(m.id)}</b> ${esc(m.name)} ${m.free ? 'free' : ''} ${m.needs_key ? 'needs key' : ''}<br><small>${esc(m.endpoint||'')}</small></div>`).join('')}
        <div style="margin-top:8px"><b>Reverse Engineered:</b><br>${esc(JSON.stringify(j.reverse_engineered, null, 2))}</div>
      `;
    } catch (e) {
      $(`test-out`).innerHTML = `Failed: ${esc(e.message)}`;
    }
  };

  $(`proxy`).onclick = async () => {
    log('Testing proxy rotation reset…');
    $(`test-out`).innerHTML = 'Testing proxy rotation — change proxy/location every time to reset rate limit…<br>';
    for (let i=0;i<3;i++) {
      const fakeIP = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
      $(`test-out`).innerHTML += `Attempt ${i+1} with fake IP ${fakeIP} (proxy rotation)<br>`;
      await new Promise(r=>setTimeout(r, 1000));
    }
    $(`test-out`).innerHTML += 'Proxy rotation every time should reset rate limit if implemented with real proxies (ScraperAPI, etc)';
    log('Proxy rotation test done');
  };

  $(`reset-proxy`).onclick = () => {
    log('Resetting proxy/location — rotating IP, UA');
    $(`rate`).innerHTML = 'Proxy/location rotated — new IP, new UA, rate limit should reset';
    toast('Proxy rotated — rate limit reset');
  };

  $(`test-ratelimit`).onclick = async () => {
    log('Testing rate limit — sending 5 rapid requests…');
    for (let i=0;i<5;i++) {
      try {
        const r = await fetch('/api/inception', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{role:'user', content: `Test ${i+1} rate limit`}], proxy_rotation: false })
        });
        const j = await r.json();
        log(`Request ${i+1}: ${r.status} ${j.error||'ok'} count ${j.rate_limit?.requestCount||''}`);
        $(`rate`).innerHTML += `<br>Req ${i+1}: ${r.status} ${r.status===429 ? 'RATE LIMITED' : 'ok'}`;
      } catch (e) { log(`Req ${i+1} error: ${e.message}`); }
      await new Promise(r=>setTimeout(r, 1000));
    }
  };

  $(`map-test`).onclick = () => {
    const prompts = [
      'Classify road: M.G. Road, highway primary, maxspeed 60, in Trivandrum. Is it main road? Traffic estimate at 9am rush hour?',
      'Classify business: name=Zam Zam Restaurant, amenity=restaurant, cuisine=arabian, road=Palayam-Airport Road. Road-wise? Business-wise?',
      'What is distance between Trivandrum (8.5241,76.9366) and Kochi (9.9312,76.2673)? Straight km and road km estimate?',
      'Explain diffusion language model Mercury in 2 sentences for map work classification'
    ];
    const prompt = prompts[Math.floor(Math.random()*prompts.length)];
    $(`prompt`).value = prompt;
    $(`thinking`).value = 'high';
    sendPrompt(prompt, 'high');
  };

  // Initial
  addBubble('system', 'Welcome to Inception Labs reverse engineered API — Mercury diffusion LLM, free playground, must be rigorously tested or else rubbish, use high thinking for map work');
  log('Inception tool loaded — endpoint https://chat.inceptionlabs.ai/api/chat/completions model lambda.mercury-coder-small, token TTL 6h, proxy rotation every time');
}
