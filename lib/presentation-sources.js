// Link-only research. External content is untrusted; no images are downloaded or stored.
export const SAFE_TOPICS = ['astronomy', 'mountains', 'solar energy', 'indian architecture', 'computers', 'plants'];
const ADULT = /\b(porn(?:ography)?|xxx|sex(?:ual)?|nudes?|nudity|erotic|fetish|hentai|explicit|genitals?|adult\s*content)\b/i;
const LICENSES = new Set(['cc0', 'by', 'by-sa']);
const MAX_QUERY = 150;

export function cleanTopic(value) {
  const topic = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY);
  if (topic.length < 3) throw Object.assign(Error('Enter a topic of at least three characters.'), { status: 400 });
  if (ADULT.test(topic)) throw Object.assign(Error('Adult or explicit topics are not supported.'), { status: 400 });
  return topic;
}
function stripMarkup(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:quot|#34);/gi, '"').replace(/&(?:amp|#38);/gi, '&').replace(/&(?:lt|#60);/gi, '<').replace(/&(?:gt|#62);/gi, '>').replace(/\s+/g, ' ').trim();
}
function safeHttps(value, hosts) {
  try { const u = new URL(value); return u.protocol === 'https:' && hosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host)) ? u.href : null; }
  catch { return null; }
}

export function normalizeImageLinks(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    if (item?.mature !== false || !LICENSES.has(String(item.license || '').toLowerCase())) return [];
    const title = stripMarkup(item.title).slice(0, 160), creator = stripMarkup(item.creator).slice(0, 120);
    if (ADULT.test(`${title} ${creator} ${(item.tags || []).map(t => t.name || '').join(' ')}`)) return [];
    const landingUrl = safeHttps(item.foreign_landing_url, ['commons.wikimedia.org']);
    const imageUrl = safeHttps(item.url, ['upload.wikimedia.org']);
    if (!landingUrl || !imageUrl) return [];
    return [{ id: String(item.id || '').slice(0, 80), title: title || 'Untitled', creator: creator || 'Unknown creator', license: String(item.license).toUpperCase(), landingUrl, imageUrl, source: 'Wikimedia Commons via Openverse' }];
  }).slice(0, 12);
}

async function fetchJSON(url, fetchImpl, headers = {}) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8500) });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}

export async function researchTopic(topicValue, fetchImpl = fetch, options = {}) {
  const topic = cleanTopic(topicValue);
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=4&format=json&origin=*`;
  const imageUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(topic)}&mature=false&source=wikimedia&license=cc0,by,by-sa&page_size=8`;
  const tasks = [
    fetchJSON(wikiUrl, fetchImpl),
    fetchJSON(imageUrl, fetchImpl),
    options.braveKey ? fetchJSON(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic)}&count=4`, fetchImpl, { 'X-Subscription-Token': options.braveKey }) : Promise.resolve(null)
  ];
  const [wiki, images, web] = await Promise.allSettled(tasks);
  const articles = wiki.status === 'fulfilled' ? (wiki.value.query?.search || []).flatMap(item => {
    if (!Number.isSafeInteger(item.pageid)) return [];
    const title = stripMarkup(item.title).slice(0, 180), snippet = stripMarkup(item.snippet).slice(0, 500);
    return ADULT.test(`${title} ${snippet}`) ? [] : [{ title, snippet, url: `https://en.wikipedia.org/?curid=${item.pageid}`, source: 'Wikipedia' }];
  }) : [];
  const links = images.status === 'fulfilled' ? normalizeImageLinks(images.value.results) : [];
  const webResults = web.status === 'fulfilled' ? (web.value?.web?.results || []).flatMap(item => {
    // General web links are untrusted. A provider key enables text-only references,
    // never automatic downloads, embeddings, or blind factual claims.
    const safe = (() => { try { const u = new URL(item.url); return u.protocol === 'https:' ? u.href : null; } catch { return null; } })();
    const title = stripMarkup(item.title).slice(0, 160);
    return safe && !ADULT.test(`${title} ${item.description || ''}`) ? [{ title, snippet: stripMarkup(item.description).slice(0, 400), url: safe, source: 'Web search (verify independently)' }] : [];
  }).slice(0, 4) : [];
  return { topic, articles, images: links, web: webResults,
    availability: { wikipedia: wiki.status === 'fulfilled', openverse: images.status === 'fulfilled', web: Boolean(options.braveKey && web.status === 'fulfilled') },
    note: 'Sources can be incomplete or wrong. Openverse excludes marked mature results, but metadata filtering is not a guarantee; linked images are not downloaded or automatically displayed.' };
}
