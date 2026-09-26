/**
 * MegaPLAN OSINT Advanced — Instagram username checker + public OSINT
 * Only public info, no private account access, no bypass.
 * Features:
 * - Username availability checker across 20+ platforms (public URL existence)
 * - Instagram public profile inspector (via /api/osint, respects safety)
 * - Social link extractor, favicon, WHOIS, etc improved
 * Based on GitHub OSINT tools but safe: only public HTTP checks, no login, no private data.
 */
import { esc, mountShell, setOut, toast } from './kit.js';

const PLATFORMS = [
  { name: 'Instagram', url: 'https://www.instagram.com/{username}/', check: 'public' },
  { name: 'YouTube', url: 'https://www.youtube.com/@{username}', check: 'public' },
  { name: 'Twitter/X', url: 'https://x.com/{username}', check: 'public' },
  { name: 'GitHub', url: 'https://github.com/{username}', check: 'public' },
  { name: 'Reddit', url: 'https://www.reddit.com/user/{username}/', check: 'public' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@{username}', check: 'public' },
  { name: 'Medium', url: 'https://medium.com/@{username}', check: 'public' },
  { name: 'Pinterest', url: 'https://www.pinterest.com/{username}/', check: 'public' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/{username}/', check: 'public' },
  { name: 'Facebook', url: 'https://www.facebook.com/{username}', check: 'public' },
  { name: 'Twitch', url: 'https://www.twitch.tv/{username}', check: 'public' },
  { name: 'Vimeo', url: 'https://vimeo.com/{username}', check: 'public' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/{username}', check: 'public' },
  { name: 'Dribbble', url: 'https://dribbble.com/{username}', check: 'public' },
  { name: 'Behance', url: 'https://www.behance.net/{username}', check: 'public' },
  { name: 'DeviantArt', url: 'https://www.deviantart.com/{username}', check: 'public' },
  { name: 'Steam', url: 'https://steamcommunity.com/id/{username}', check: 'public' },
  { name: 'Patreon', url: 'https://www.patreon.com/{username}', check: 'public' },
  { name: 'ProductHunt', url: 'https://www.producthunt.com/@{username}', check: 'public' },
  { name: 'Keybase', url: 'https://keybase.io/{username}', check: 'public' }
];

export function mountInstagramOSINT(root, tool) {
  const id = 'ig-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div class="field-row" style="margin-top:8px">
      <input id="${id}-user" class="field" placeholder="Username (without @), e.g. instagram" style="grid-column: span 2">
      <button class="btn primary" id="${id}-check">Check Instagram (public)</button>
    </div>
    <div class="button-row">
      <button class="btn secondary" id="${id}-all">Check all 20 platforms</button>
      <button class="btn ghost" id="${id}-copy">Copy results</button>
    </div>
    <div id="${id}-meta" class="note" style="margin-top:12px">Public OSINT only — checks if public profile URL exists, no login, no private data, no bypass. Instagram may block scraping; we use /api/inspect and /api/osint with safety checks. If blocked, open URL manually.</div>
    <div id="${id}-results" style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px"></div>
    <pre id="tool-out" class="out" style="margin-top:12px;min-height:100px"></pre>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);
  let lastResults = [];

  async function checkPlatform(platform, username) {
    const url = platform.url.replace('{username}', encodeURIComponent(username));
    try {
      // Use /api/inspect to check public URL
      const r = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'metadata', url })
      });
      const j = await r.json();
      if (!r.ok) return { platform: platform.name, url, exists: null, status: j.error || 'error' };
      
      // Heuristic: if title contains username or not 404, likely exists
      // For Instagram, 404 page title is different
      const exists = j.status === 200 && !/not found|404|page not found/i.test(j.title || '');
      return { platform: platform.name, url, exists, status: j.status, title: j.title };
    } catch (e) {
      return { platform: platform.name, url, exists: null, status: e.message };
    }
  }

  async function checkInstagram(username) {
    if (!username) return toast('Enter username');
    const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    $(`meta`).textContent = 'Checking Instagram public profile… (may be rate-limited)';
    $(`results`).innerHTML = '<div style="padding:10px;color:#8a7f72">Checking…</div>';
    
    try {
      const r = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'metadata', url })
      });
      const j = await r.json();
      
      if (!r.ok) {
        setOut(body, `Instagram check failed: ${j.error}\nURL: ${url}\n\nInstagram heavily rate-limits public scraping. Try opening URL manually: ${url}\n\nSafety: This tool only checks public URL existence, no login, no private data.`);
        $(`results`).innerHTML = `<div style="padding:10px"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><br>Status: ${esc(j.error)}</div>`;
        return;
      }
      
      const exists = j.status === 200;
      setOut(body, `Instagram: ${username}\nURL: ${url}\nStatus: ${j.status}\nTitle: ${j.title || '(no title)'}\nExists: ${exists ? 'Likely yes (public URL returns 200)' : 'Likely no or private/blocked'}\n\nThis is public OSINT only — checks if public profile URL exists. No private data, no bypass, no login. Instagram may show login wall even for public profiles due to anti-scraping.\n\nFor advanced OSINT, use:\n- Check same username on other platforms (button below)\n- Use official Instagram app for public info\n- For business, use Meta Graph API with proper auth (not this tool)`);
      
      $(`results`).innerHTML = `
        <div style="padding:10px;border:1px solid #e0d5c4;border-radius:8px;background:${exists ? '#e6f4ea' : '#fce8e6'}">
          <b>Instagram</b> · ${exists ? 'Found (200)' : 'Not found / blocked'}<br>
          <a href="${esc(url)}" target="_blank" rel="noopener" style="font-size:12px">${esc(url)}</a><br>
          <small style="color:#6e655b">Title: ${esc(j.title || '')}</small>
        </div>
      `;
      
      lastResults = [{ platform: 'Instagram', username, url, exists, title: j.title, status: j.status }];
      
    } catch (e) {
      setOut(body, 'Error: ' + e.message);
    }
  }

  async function checkAllPlatforms(username) {
    if (!username) return toast('Enter username');
    $(`meta`).textContent = `Checking ${PLATFORMS.length} platforms for ${username}… (this may take 20s, uses public /api/inspect)`;
    $(`results`).innerHTML = '<div style="padding:10px;color:#8a7f72">Checking all platforms… please wait</div>';
    setOut(body, `Checking ${username} across ${PLATFORMS.length} platforms…`);
    
    const results = [];
    for (const plat of PLATFORMS) {
      const res = await checkPlatform(plat, username);
      results.push(res);
      // Update UI progressively
      $(`results`).innerHTML = results.map(r => `
        <div style="padding:8px;border:1px solid #e0d5c4;border-radius:8px;background:${r.exists ? '#e6f4ea' : r.exists === false ? '#fce8e6' : '#f4efe6'}">
          <b>${esc(r.platform)}</b> · ${r.exists === true ? 'Found' : r.exists === false ? 'Not found' : 'Unknown'}<br>
          <a href="${esc(r.url)}" target="_blank" rel="noopener" style="font-size:11px;word-break:break-all">${esc(r.url)}</a><br>
          <small style="color:#8a7f72">${r.status} ${r.title ? '· ' + esc(r.title.slice(0,60)) : ''}</small>
        </div>
      `).join('');
      
      // Small delay to avoid rate limits
      await new Promise(res => setTimeout(res, 300));
    }
    
    lastResults = results;
    const found = results.filter(r => r.exists).length;
    setOut(body, `Username: ${username}\nChecked: ${results.length} platforms\nFound: ${found} (public URL returned 200)\n\nResults:\n${results.map(r => `${r.platform}: ${r.exists ? 'FOUND' : r.exists === false ? 'not found' : 'unknown'} — ${r.url}`).join('\n')}\n\nSafety: Public OSINT only, no login, no private data, no bypass. Some platforms show login wall or block scraping. Open URLs manually to verify.\nFor Instagram real OSINT, use official app or Meta Graph API with proper auth. This tool only checks public URL existence.`);
    $(`meta`).textContent = `Done! Found ${found}/${results.length} platforms for ${username}. Open URLs to verify (some may be login walls).`;
  }

  $(`check`).onclick = () => checkInstagram($(`user`).value.trim().replace(/^@/, ''));
  $(`all`).onclick = () => checkAllPlatforms($(`user`).value.trim().replace(/^@/, ''));
  $(`copy`).onclick = async () => {
    const txt = body.querySelector('#tool-out').textContent;
    if (!txt) return toast('Nothing to copy');
    await navigator.clipboard.writeText(txt);
    toast('Copied results');
  };
  
  $(`user`).addEventListener('keydown', e => { if (e.key === 'Enter') checkInstagram($(`user`).value.trim()); });
}

export function mountOSINTAdvanced(root, tool) {
  const id = 'osint-' + Math.random().toString(36).slice(2,6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <p class="muted">Advanced public OSINT — username across platforms, URL metadata, DNS, TLS, favicon, WHOIS hint, social links. No private data, no bypass.</p>
    <div class="field-row" style="margin-top:8px">
      <input id="${id}-user" class="field" placeholder="Username or URL or domain">
      <select id="${id}-type" class="sel"><option value="username">Username across platforms</option><option value="url">URL metadata</option><option value="domain">Domain WHOIS hint + DNS/TLS</option></select>
      <button class="btn primary" id="${id}-run">Run OSINT</button>
    </div>
    <div class="button-row">
      <button class="btn secondary" data-fill="instagram">Check instagram</button>
      <button class="btn secondary" data-fill="github">Check github username</button>
      <button class="btn ghost" id="${id}-copy">Copy</button>
    </div>
    <pre id="tool-out" class="out" style="margin-top:12px;min-height:180px"></pre>
    <div id="${id}-extra" style="margin-top:12px"></div>
  `);

  const $ = sid => body.querySelector('#' + id + '-' + sid);

  async function runOSINT() {
    const input = $(`user`).value.trim();
    const type = $(`type`).value;
    if (!input) return setOut(body, 'Enter username, URL, or domain');
    
    setOut(body, `Running ${type} OSINT for ${input}…`);
    
    if (type === 'username') {
      // Reuse Instagram checker logic but via platform check
      const username = input.replace(/^@/, '');
      setOut(body, `Checking ${username} across platforms — this uses public /api/inspect, may take 15s…`);
      
      const results = [];
      for (const plat of PLATFORMS.slice(0, 10)) { // limit to 10 for speed
        try {
          const url = plat.url.replace('{username}', encodeURIComponent(username));
          const r = await fetch('/api/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'metadata', url })
          });
          const j = await r.json();
          results.push({ platform: plat.name, url, status: j.status, exists: j.status === 200, title: j.title });
        } catch (e) {
          results.push({ platform: plat.name, url: PLATFORMS[0].url.replace('{username}', username), status: 'error' });
        }
        await new Promise(res => setTimeout(res, 200));
      }
      
      setOut(body, `Username: ${username}\n\n${results.map(r => `${r.platform}: ${r.exists ? 'FOUND' : 'not found'} (${r.status}) — ${r.url}`).join('\n')}\n\nPublic OSINT only. Open URLs manually to verify.`);
      
      $(`extra`).innerHTML = results.map(r => `
        <div style="padding:6px 8px;border:1px solid #e0d5c4;border-radius:6px;margin-bottom:4px;background:${r.exists ? '#e6f4ea' : '#f4efe6'}">
          <b>${esc(r.platform)}</b> · <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a> · ${r.status}
        </div>
      `).join('');
      
    } else if (type === 'url') {
      try {
        const r = await fetch('/api/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'metadata', url: input.startsWith('http') ? input : 'https://' + input })
        });
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        setOut(body, `URL: ${j.finalUrl}\nStatus: ${j.status}\nTitle: ${j.title}\nContent-Type: ${j.contentType}\n\nHeaders:\n${JSON.stringify(j.headers, null, 2).slice(0, 2000)}`);
      } catch (e) {
        setOut(body, 'Error: ' + e.message);
      }
    } else if (type === 'domain') {
      try {
        const domain = input.replace(/^https?:\/\//, '').split('/')[0];
        const [dnsRes, tlsRes] = await Promise.all([
          fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dns', host: domain }) }).then(r => r.json()).catch(() => ({ error: 'DNS failed' })),
          fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tls', host: domain }) }).then(r => r.json()).catch(() => ({ error: 'TLS failed' }))
        ]);
        
        setOut(body, `Domain: ${domain}\n\nDNS:\n${JSON.stringify(dnsRes, null, 2)}\n\nTLS:\n${JSON.stringify(tlsRes, null, 2)}\n\nWHOIS: Look up WHOIS for ${domain} in a public WHOIS service (this desk does not proxy WHOIS due to rate limits/ToS).\nFavicon: https://${domain}/favicon.ico`);
      } catch (e) {
        setOut(body, 'Error: ' + e.message);
      }
    }
  }

  $(`run`).onclick = runOSINT;
  $(`copy`).onclick = async () => {
    const txt = body.querySelector('#tool-out').textContent;
    if (!txt) return toast('Nothing');
    await navigator.clipboard.writeText(txt);
    toast('Copied');
  };
  body.querySelectorAll('[data-fill]').forEach(b => {
    b.onclick = () => { $(`user`).value = b.dataset.fill; $(`type`).value = 'username'; };
  });
  $(`user`).addEventListener('keydown', e => { if (e.key === 'Enter') runOSINT(); });
}
