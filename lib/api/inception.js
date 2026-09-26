// Official Inception Labs API integration. No generated accounts, fake IPs, or
// sample responses: if the operator has not configured a key, report that fact.
const ENDPOINT = 'https://api.inceptionlabs.ai/v1/chat/completions';
const MODEL_IDS = new Set(['mercury-2.5', 'mercury-2']);
// Best-effort per-instance budget. The provider gateway must enforce global quotas.
const recentCalls = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const action = new URL(req.url, 'https://megaplan.invalid').searchParams.get('action') || 'status';
    if (!['status', 'models', 'test'].includes(action)) return json(res, 400, { error: 'Unknown action' });
    return json(res, 200, {
      ok: true,
      configured: Boolean(process.env.INCEPTION_API_KEY),
      models: [...MODEL_IDS],
      note: 'Only the official API is supported. Status does not test the provider or output quality.'
    });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'GET status or POST chat only' });
  if (!process.env.INCEPTION_API_KEY) return json(res, 503, { error: 'Inception Labs is not configured on this deployment.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return json(res, 400, { error: 'Invalid JSON' }); }
  const model = body.model || 'mercury-2.5';
  if (!MODEL_IDS.has(model)) return json(res, 400, { error: 'Choose a supported official model.' });
  const messages = body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 10 ||
    messages.some(m => !['user', 'assistant', 'system'].includes(m?.role) || typeof m.content !== 'string' || m.content.length > 8000) ||
    !messages.some(m => m.role === 'user' && m.content.trim())) {
    return json(res, 400, { error: 'Provide up to 10 valid messages, including a nonempty user message.' });
  }
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].slice(0, 80);
  const now = Date.now();
  for (const [key, calls] of recentCalls) {
    const active = calls.filter(t => now - t < 60_000);
    if (active.length) recentCalls.set(key, active); else recentCalls.delete(key);
  }
  const calls = recentCalls.get(ip) || [];
  if (calls.length >= 6) return json(res, 429, { error: 'Too many requests. Retry in a minute.' });
  recentCalls.set(ip, [...calls, now]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INCEPTION_API_KEY}` },
      body: JSON.stringify({ model, messages, stream: false, max_completion_tokens: 2048 })
    });
    if (!upstream.ok) return json(res, upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429 ? 'Provider rate limit reached. Please retry later.' : `Inception Labs request failed (HTTP ${upstream.status}).`
    });
    const result = await upstream.json();
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return json(res, 502, { error: 'Provider returned no usable text.' });
    return json(res, 200, { ok: true, model, content, source: 'Inception Labs official API' });
  } catch {
    return json(res, 502, { error: 'Inception Labs did not respond. Please retry later.' });
  } finally { clearTimeout(timer); }
}
