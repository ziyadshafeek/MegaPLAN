/**
 * Shared HTTP plumbing for AI Mode server endpoints.
 *
 * Everything here is deliberately dependency-free and fetch-injectable so the
 * same code runs in a Vercel serverless function and inside node:test-style
 * unit tests with a stubbed `fetch`.
 */

export const USER_AGENT =
  'Mozilla/5.0 (compatible; MegaPLANBot/1.0; +https://mega-plan.vercel.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Terse, fetch-with-timeout. Never throws for network reasons — returns null. */
export async function getText(url, { fetchImpl = fetch, timeoutMs = 9000, headers = {}, accept = '*/*' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en;q=0.9', Accept: accept, ...headers }
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, text: '' };
    const text = typeof res.text === 'function' ? await res.text() : '';
    return { ok: true, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err || 'network error'), text: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** JSON variant of {@link getText}. Returns `{ok, status, data, error}`. */
export async function getJSON(url, options = {}) {
  const res = await getText(url, { accept: 'application/json', ...options });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.text) };
  } catch {
    return { ok: false, status: res.status, error: 'invalid JSON' };
  }
}

/** XML variant — a couple of open APIs (arXiv) only speak Atom. */
export async function getXML(url, options = {}) {
  const res = await getText(url, { accept: 'application/atom+xml, application/xml, text/xml', ...options });
  return res;
}

export function stripMarkup(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&(?:lt|#60);/gi, '<')
    .replace(/&(?:gt|#62);/gi, '>')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&(?:amp);/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d) || 32))
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampText(value, max = 600) {
  const t = stripMarkup(value);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Only allow plain https links out of the product. */
export function safeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Reject obviously adult queries before any upstream call is made. */
const ADULT = /\b(porn(?:ography)?|xxx|sex(?:ual)?|nudes?|nudity|erotic|fetish|hentai|explicit|genitals?|adult\s*content)\b/i;
export function isSensitiveQuery(value) {
  return ADULT.test(String(value || ''));
}

/** Compact per-IP sliding window. Module scope ⇒ one window per warm instance. */
export function createLimiter({ max = 30, windowMs = 60_000, maxKeys = 5000 } = {}) {
  const hits = new Map();
  return function limited(req) {
    const ip = String(
      req?.headers?.['x-forwarded-for'] || req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'unknown'
    )
      .split(',')[0]
      .trim()
      .slice(0, 70);
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (list.length >= max) {
      hits.set(ip, list);
      return true;
    }
    list.push(now);
    hits.set(ip, list);
    if (hits.size > maxKeys) {
      for (const [key, times] of hits) {
        if (!times.some(t => now - t < windowMs)) hits.delete(key);
        if (hits.size <= maxKeys) break;
      }
    }
    return false;
  };
}

/** Tiny TTL memo so a repeated plan does not hammer open APIs. */
export function createCache({ ttlMs = 10 * 60_000, max = 200 } = {}) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() - hit.at > ttlMs) { store.delete(key); return null; }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { at: Date.now(), value });
      if (store.size > max) {
        const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, store.size - max);
        for (const [k] of oldest) store.delete(k);
      }
      return value;
    }
  };
}

export function sendJSON(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

export function readJSONBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return {};
}

export const HOSTILE_PROMPT =
  /\b(system prompt|developer message|reveal your instructions|print your instructions|what are your instructions|jailbreak|ignore previous instructions)\b/i;
