/**
 * News, from publisher RSS feeds.
 *
 * A news result is only worth anything if three things are true of it: it came
 * from a named publisher, it has the publisher's own timestamp, and the feed
 * really was read. So this module keeps those three apart.
 *
 *  - A feed that could not be read is reported as unreachable, never skipped
 *    silently, so a chain can say "Reuters was not reachable" instead of
 *    implying it found nothing.
 *  - A date is only shown when the feed carried one. A missing `pubDate` stays
 *    empty — a guessed "today" is how a six-year-old article ends up
 *    presented as this morning's news.
 *  - The publisher named on the item is the one in the feed's own metadata, not
 *    whatever the query happened to match.
 *
 * Dependency-free and fetch-injectable, like the rest of `lib/ai-mode/`.
 */
import { getText, stripMarkup, clampText, safeUrl } from './http.js';

/**
 * Feeds chosen for what they cover. Each entry names the publisher and what the
 * feed is actually for, so a result is attributed to a desk and not to a site.
 */
export const NEWS_FEEDS = [
  { id: 'reuters-world', publisher: 'Reuters', section: 'World', url: 'https://news.google.com/rss/search?q=when:7d+site:reuters.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'reuters-business', publisher: 'Reuters', section: 'Business', url: 'https://news.google.com/rss/search?q=when:7d+site:reuters.com+business&hl=en-US&gl=US&ceid=US:en' },
  { id: 'bbc-world', publisher: 'BBC News', section: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc-business', publisher: 'BBC News', section: 'Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'bbc-technology', publisher: 'BBC News', section: 'Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'bbc-science', publisher: 'BBC News', section: 'Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { id: 'npr-news', publisher: 'NPR', section: 'News', url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'guardian-world', publisher: 'The Guardian', section: 'World', url: 'https://www.theguardian.com/world/rss' },
  { id: 'guardian-science', publisher: 'The Guardian', section: 'Science', url: 'https://www.theguardian.com/science/rss' },
  { id: 'guardian-sport', publisher: 'The Guardian', section: 'Sport', url: 'https://www.theguardian.com/uk/sport/rss' },
  { id: 'aljazeera', publisher: 'Al Jazeera', section: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'verge', publisher: 'The Verge', section: 'Technology', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'ars-technica', publisher: 'Ars Technica', section: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'nature-news', publisher: 'Nature', section: 'Science', url: 'https://www.nature.com/nature.rss' },
  { id: 'sciencedaily', publisher: 'ScienceDaily', section: 'Science', url: 'https://www.sciencedaily.com/rss/top/science.xml' }
];

/** Words that ask for news in general, and so name no particular desk. */
const GENERIC = /\b(news|latest|today|recent|this week|breaking|headlines|yesterday|current|update|updates|what happened|about|on|in|for|the|of|and)\b/g;

/** Which feeds could plausibly answer this, cheapest and most specific first. */
export function chooseFeeds(query, feeds = NEWS_FEEDS) {
  // "latest news" asks for news, not for the news desk, so the generic words
  // are dropped before anything is matched against a section.
  const q = String(query || '').toLowerCase().replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return feeds;
  const scored = feeds.map(f => {
    let score = 0;
    if (q.includes(f.section.toLowerCase())) score += 6;
    if (q.includes(f.publisher.toLowerCase())) score += 5;
    if (new RegExp(`\\b${f.section.toLowerCase()}\\b`).test(q)) score += 4;
    if (/\b(sport|football|cricket|match|tournament)\b/.test(q) && f.section === 'Sport') score += 5;
    if (/\b(science|study|research|climate|space|nasa|discovery)\b/.test(q) && f.section === 'Science') score += 4;
    if (/\b(tech|technology|ai|software|gadget|chip|startup|app)\b/.test(q) && f.section === 'Technology') score += 4;
    if (/\b(market|markets|business|economy|stock|trade|inflation)\b/.test(q) && f.section === 'Business') score += 4;
    return { feed: f, score };
  });
  const best = Math.max(...scored.map(s => s.score));
  return best > 0 ? scored.filter(s => s.score === best).map(s => s.feed) : feeds;
}

/* ------------------------------------------------------------------ * *
 * A small, strict XML reader — enough for RSS and Atom, nothing more
 * ------------------------------------------------------------------ * */

const decodeEntities = value => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '');

const tagText = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
};

/** Pull `<item>` (RSS) or `<entry>` (Atom) blocks out of a feed. */
export function parseFeed(xml) {
  const text = String(xml || '');
  const blocks = [
    ...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)
  ].map(m => m[1]);
  const channelTitle = tagText(text, 'title');
  return blocks.map(block => {
    const link = tagText(block, 'link') || (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
    return {
      title: tagText(block, 'title'),
      link: safeUrl(link) || '',
      summary: clampText(stripMarkup(tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content')), 320),
      // A date the feed did not carry stays empty. It is never invented.
      published: tagText(block, 'pubDate') || tagText(block, 'published') || tagText(block, 'updated') || tagText(block, 'date') || '',
      author: tagText(block, 'author') || tagText(block, 'dc:creator') || ''
    };
  }).filter(i => i.title);
}

const toIsoDate = value => {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
};

/**
 * Search news across the chosen feeds.
 * @returns {{ok:boolean, items:object[], feeds:object[], error?:string}}
 */
export async function newsSearch(query, { fetchImpl = fetch, limit = 8, feeds = NEWS_FEEDS, timeoutMs = 9000, maxFeeds = 6 } = {}) {
  // Fifteen feeds at once is fifteen upstream requests for one question. Take
  // the best few, and say which were left unread rather than reading them all.
  const all = chooseFeeds(query, feeds);
  const chosen = all.slice(0, Math.max(1, Math.min(all.length, Number(maxFeeds) || 6)));
  const skipped = all.slice(chosen.length);
  if (!chosen.length) return { ok: false, items: [], feeds: [], error: 'No news feed is configured.' };
  const results = await Promise.all(chosen.map(async feed => {
    const res = await getText(feed.url, { fetchImpl, timeoutMs, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' });
    if (!res.ok) return { feed, ok: false, error: res.error || 'unreachable', items: [] };
    const parsed = parseFeed(res.text);
    return { feed, ok: true, error: null, items: parsed };
  }));

  const terms = String(query || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const items = [];
  for (const r of results) {
    for (const i of r.items) {
      if (terms.length) {
        const hay = `${i.title} ${i.summary}`.toLowerCase();
        if (!terms.some(t => hay.includes(t))) continue;
      }
      items.push({
        id: `news:${r.feed.id}:${(i.title || '').slice(0, 60)}`,
        kind: 'news',
        title: i.title,
        snippet: i.summary,
        url: i.link,
        source: r.feed.publisher,
        section: r.feed.section,
        feed: r.feed.id,
        // Null, not a guess: the UI can say "no date given" and mean it.
        published: toIsoDate(i.published),
        publishedRaw: i.published || null,
        author: i.author || null
      });
    }
  }
  // The same story is often carried by several desks. Keep the first and
  // remember who else ran it, so a question is not answered three times by
  // three near-identical bullets.
  const seenTitle = new Map();
  const unique = [];
  for (const i of items) {
    const key = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    if (seenTitle.has(key)) {
      const first = seenTitle.get(key);
      if (i.source && i.source !== first.source && !first.alsoPublished.includes(i.source)) first.alsoPublished.push(i.source);
      continue;
    }
    const row = { ...i, alsoPublished: [] };
    seenTitle.set(key, row);
    unique.push(row);
  }
  items.length = 0;
  items.push(...unique);
  // Newest first when the feeds gave dates; undated items sort after dated ones
  // rather than pretending to be new.
  items.sort((a, b) => {
    if (a.published && b.published) return b.published.localeCompare(a.published);
    if (a.published) return -1;
    if (b.published) return 1;
    return 0;
  });
  const dated = items.filter(i => i.published).length;
  return {
    ok: results.some(r => r.ok),
    items: items.slice(0, Math.max(1, Math.min(20, limit))),
    feeds: results.map(r => ({ id: r.feed.id, publisher: r.feed.publisher, section: r.feed.section, ok: r.ok, count: r.items.length, error: r.error })),
    publishers: [...new Set(results.filter(r => r.ok).map(r => r.feed.publisher))],
    unreadFeeds: skipped.map(f => ({ id: f.id, publisher: f.publisher, section: f.section })),
    undated: items.length - dated,
    error: results.some(r => r.ok) ? null : 'No configured news feed could be read.',
    query: String(query || '')
  };
}

/** Registry entry, so research can offer news like any other source. */
export const NEWS_SOURCE = {
  id: 'news',
  label: 'News (publisher RSS)',
  kinds: ['news'],
  blurb: 'Publisher feeds with their own timestamps and named desks.',
  keywords: ['news', 'latest', 'today', 'recent', 'this week', 'breaking', 'headlines', 'yesterday', 'current', 'update on', 'what happened', 'news about'],
  run: (query, opts) => newsSearch(query, opts)
};
