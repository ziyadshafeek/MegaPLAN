/**
 * Public-information inspector. No credentials, no private-account access.
 * Used by OSINT / Privacy tools. Customer UI never mentions this as "OSINT hacking".
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return null;
}

function assertPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw Error('Enter a valid http(s) URL.'); }
  if (!/^https?:$/.test(u.protocol)) throw Error('Only http and https URLs are allowed.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw Error('Local hosts are not allowed.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw Error('Private IP addresses are not allowed.');
  } else if (host === '0.0.0.0' || host === '::') {
    throw Error('That host is not allowed.');
  }
  return u;
}

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return true;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

async function fetchPublic(url, { maxBytes = 120000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, {
      method,
      redirect: 'manual',
      headers: { 'User-Agent': 'MegaPLAN-PublicInspector/1.0' },
      signal: controller.signal
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    const slice = buf.slice(0, maxBytes);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    return { status: r.status, url: r.url, headers, text, location: r.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  let body;
  try { body = readBody(req) || {}; } catch { return json(res, 400, { error: 'Invalid JSON.' }); }
  const action = String(body.action || 'headers');
  try {
    if (action === 'dns') {
      const host = String(body.host || '').trim().replace(/\.$/, '');
      if (!host || host.length > 253) throw Error('Enter a hostname.');
      const addresses = [...new Set((await dns.lookup(host, { all: true })).map(x => x.address))];
      return json(res, 200, { ok: true, host, addresses });
    }
    if (action === 'tls') {
      const host = String(body.host || '').trim();
      if (!host) throw Error('Enter a hostname.');
      const info = await new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
          const cert = socket.getPeerCertificate();
          resolve({
            host,
            protocol: socket.getProtocol(),
            authorized: socket.authorized,
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            fingerprint256: cert.fingerprint256
          });
          socket.end();
        });
        socket.on('error', reject);
        socket.on('timeout', () => { socket.destroy(); reject(new Error('TLS timeout')); });
      });
      return json(res, 200, { ok: true, ...info });
    }

    const target = assertPublicHttpUrl(body.url || body.host);
    if (action === 'headers' || action === 'metadata') {
      const r = await fetchPublic(target.href);
      const title = (r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
      return json(res, 200, {
        ok: true,
        finalUrl: r.url,
        status: r.status,
        headers: r.headers,
        title: title ? title.replace(/\s+/g, ' ').trim() : null,
        contentType: r.headers['content-type'] || null
      });
    }
    if (action === 'robots') {
      const robots = new URL('/robots.txt', target.origin);
      const r = await fetchPublic(robots.href);
      return json(res, 200, { ok: true, url: robots.href, status: r.status, body: r.text.slice(0, 20000) });
    }
    if (action === 'sitemap') {
      const sm = new URL('/sitemap.xml', target.origin);
      const r = await fetchPublic(sm.href);
      return json(res, 200, { ok: true, url: sm.href, status: r.status, body: r.text.slice(0, 20000) });
    }
    if (action === 'redirects') {
      const chain = [];
      let current = target.href;
      for (let i = 0; i < 8; i++) {
        const r = await fetchPublic(current, { method: 'GET', maxBytes: 2000 });
        chain.push({ url: current, status: r.status, location: r.location || null });
        if (!r.location || r.status < 300 || r.status >= 400) break;
        current = new URL(r.location, current).href;
        assertPublicHttpUrl(current);
      }
      return json(res, 200, { ok: true, chain });
    }
    throw Error('Unknown inspect action.');
  } catch (err) {
    return json(res, 400, { error: err.message || 'Inspection failed.' });
  }
}
