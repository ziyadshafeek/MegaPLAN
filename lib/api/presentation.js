import fs from 'node:fs';
import { cleanTopic, researchTopic } from '../presentation-sources.js';
import { planDeck, makePresentation } from '../presentation-deck.js';
import { snapshotReferences } from '../presentation-context.js';

const recent = new Map();
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function limited(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].slice(0, 70);
  const now = Date.now();
  const calls = (recent.get(ip) || []).filter(t => now - t < 60_000);
  if (calls.length >= 8) return true;
  recent.set(ip, [...calls, now]);
  if (recent.size > 2000) recent.clear();
  return false;
}
function storedImages(topic) {
  try {
    const index = JSON.parse(fs.readFileSync(new URL('../../data/image-links/index.json', import.meta.url)));
    const words = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return (index.items || []).filter(item => words.some(w => item.topic.includes(w) || item.title.toLowerCase().includes(w))).slice(0, 4);
  } catch { return []; }
}
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Use GET research or POST presentation.' });
  if (limited(req)) return json(res, 429, { error: 'Slow down and retry in a minute.' });
  try {
    let body = {};
    if (req.method === 'POST') {
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
      catch { return json(res, 400, { error: 'Invalid JSON.' }); }
    }
    const topic = cleanTopic(req.method === 'GET' ? new URL(req.url, 'https://megaplan.invalid').searchParams.get('q') : body.topic);
    const notes = String(body.notes || '').slice(0, 4000);
    let research = await researchTopic(topic, fetch, { braveKey: process.env.BRAVE_SEARCH_API_KEY });
    // A maturity flag is not sufficient proof that an image is safe. Only a
    // human-approved link index may be returned or included in presentations.
    research = { ...research, dataset: snapshotReferences(topic), images: storedImages(topic), imageSource: 'Human-reviewed link-only index; unreviewed live matches are withheld' };
    if (req.method === 'GET') return json(res, 200, { ok: true, ...research });
    const plan = planDeck({ topic, notes, research, slideCount: body.slideCount });
    const file = await makePresentation(plan);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'presentation'}.pptx"`);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(file);
  } catch (error) { return json(res, error.status || 502, { error: error.status ? error.message : 'Presentation generation is unavailable. Try again with your own notes.' }); }
}
