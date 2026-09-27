/**
 * Phase 5 — news from publisher feeds.
 *
 * A news answer is only honest if the publisher, the timestamp and the
 * reachability of the feed are all real. These tests stub `fetch`, so nothing
 * here depends on a network, and every assertion is about a property a user
 * would notice being wrong: a date that was invented, a publisher that was
 * guessed, or a feed that failed and was quietly dropped.
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import { newsSearch, parseFeed, chooseFeeds, NEWS_SOURCE } from '../lib/ai-mode/news.js';
import { research, chooseSources } from '../lib/ai-mode/research.js';
import { planRequest, buildIndex } from '../public/js/planner.js';

let pass = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

const rss = (items, title = 'BBC News') =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items}</channel></rss>`;
const item = (title, { link = 'https://example.com/1', date = 'Sat, 26 Sep 2026 08:00:00 GMT', desc = 'A short summary.' } = {}) =>
  `<item><title>${title}</title><link>${link}</link><description>${desc}</description>${date ? `<pubDate>${date}</pubDate>` : ''}</item>`;

/** A fetch that answers from a map of feed-id → body, and 404s everything else. */
const stubFetch = bodies => async (url) => {
  const hit = Object.entries(bodies).find(([k]) => String(url).includes(k));
  if (!hit) return { ok: false, status: 404, error: 'HTTP 404', text: '' };
  return { ok: true, status: 200, text: async () => hit[1] };
};

/* ------------------------------------------------------------- parsing */

await check('a feed yields title, link, summary and the date the feed gave', () => {
  const [first] = parseFeed(rss(item('Kerala floods begin', { desc: 'Rain since Monday.' })));
  assert.equal(first.title, 'Kerala floods begin');
  assert.equal(first.link, 'https://example.com/1');
  assert.equal(first.summary, 'Rain since Monday.');
  assert.match(first.published, /26 Sep 2026/);
});

await check('CDATA, entities and Atom links are read, not shown raw', () => {
  const feed = rss('<item><title><![CDATA[Tom &amp; Jerry <b>win</b>]]></title><link>https://x/1</link><description>d</description></item>');
  const [one] = parseFeed(feed);
  assert.equal(one.title, 'Tom & Jerry win', one.title);
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom headline</title><link href="https://a/2"/><summary>Body</summary><published>2026-09-26T08:00:00Z</published></entry></feed>';
  const [e] = parseFeed(atom);
  assert.equal(e.title, 'Atom headline');
  assert.equal(e.link, 'https://a/2');
  assert.match(e.published, /2026-09-26/);
});

await check('an item with no date has no date — nothing is filled in', () => {
  const feeds = [{ id: 'f', publisher: 'X', section: 'World', url: 'https://f' }];
  return newsSearch('kerala', {
    fetchImpl: stubFetch({ f: rss(item('Kerala story', { date: '' })) }),
    feeds
  }).then(out => {
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].published, null, 'no invented date');
    assert.equal(out.items[0].publishedRaw, null);
    assert.equal(out.undated, 1, 'and the result says how many are undated');
  });
});

/* ------------------------------------------------------------ searching */

const WORLD = { id: 'w', publisher: 'BBC News', section: 'World', url: 'https://feed/world' };
const SPORT = { id: 's', publisher: 'The Guardian', section: 'Sport', url: 'https://feed/sport' };
const TECH = { id: 't', publisher: 'Ars Technica', section: 'Technology', url: 'https://feed/tech' };

await check('an item keeps the publisher and desk that published it', async () => {
  const out = await newsSearch('kerala', {
    fetchImpl: stubFetch({
      'feed/world': rss(item('Kerala floods begin'), 'BBC News'),
      'feed/sport': rss(item('Kerala wins the match'), 'Guardian')
    }),
    feeds: [WORLD, SPORT]
  });
  const world = out.items.find(i => /floods/.test(i.title));
  assert.equal(world.source, 'BBC News');
  assert.equal(world.section, 'World');
  assert.equal(world.feed, 'w');
  assert.equal(out.publishers.length, 2, 'both desks reported');
});

await check('the newest dated item comes first, undated ones last', async () => {
  const out = await newsSearch('kerala', {
    fetchImpl: stubFetch({
      'feed/world': rss(
        item('Kerala, older report', { date: 'Fri, 25 Sep 2026 08:00:00 GMT', link: 'https://x/1' }) +
        item('Kerala, newest report', { date: 'Sun, 27 Sep 2026 08:00:00 GMT', link: 'https://x/2' }) +
        item('Kerala, undated report', { date: '', link: 'https://x/3' })
      )
    }),
    feeds: [WORLD]
  });
  assert.deepEqual(out.items.map(i => i.title), ['Kerala, newest report', 'Kerala, older report', 'Kerala, undated report']);
});

await check('the same story from three desks is one item that says who else ran it', async () => {
  const out = await newsSearch('kerala', {
    fetchImpl: stubFetch({
      'feed/world': rss(item('Kerala floods begin', { link: 'https://a/1' })),
      'feed/sport': rss(item('Kerala floods begin.', { link: 'https://b/1' })),
      'feed/tech': rss(item('Kerala floods begin', { link: 'https://c/1' }))
    }),
    feeds: [WORLD, SPORT, TECH]
  });
  assert.equal(out.items.length, 1, JSON.stringify(out.items.map(i => i.title)));
  assert.deepEqual(out.items[0].alsoPublished.sort(), ['Ars Technica', 'The Guardian']);
});

await check('a bare "the headlines" reads the feeds instead of asking about nothing', async () => {
  const out = await newsSearch('', { fetchImpl: stubFetch({ 'feed/world': rss(item('Anything at all')) }), feeds: [WORLD] });
  assert.equal(out.items.length, 1, 'an empty query means "whatever the feeds have"');
});

await check('the desk is chosen from the question, not by luck', () => {
  assert.deepEqual(chooseFeeds('cricket match today').map(f => f.section), ['Sport']);
  assert.ok(chooseFeeds('ai chips').every(f => f.section === 'Technology'));
  // "latest news" names no desk at all, so it must not quietly mean one publisher.
  assert.ok(chooseFeeds('latest news').length > 3, 'a general request reads several desks');
});

await check('a query with no words is asked verbatim, not filtered away', async () => {
  const out = await newsSearch('zzzznothing', { fetchImpl: stubFetch({ 'feed/world': rss(item('Kerala floods')) }), feeds: [WORLD] });
  assert.equal(out.items.length, 0, 'nothing matches, and nothing is returned instead');
  assert.equal(out.ok, true, 'the feed itself was read fine');
});

/* ---------------------------------------------------------- reachability */

await check('a feed that cannot be read is named, never quietly dropped', async () => {
  const out = await newsSearch('kerala', {
    fetchImpl: stubFetch({ 'feed/world': rss(item('Kerala floods')) }),
    feeds: [WORLD, { id: 'dead', publisher: 'Reuters', section: 'World', url: 'https://feed/dead' }]
  });
  const dead = out.feeds.find(f => f.id === 'dead');
  assert.equal(dead.ok, false);
  assert.ok(dead.error, 'the reason travels with the failure');
  assert.ok(!out.publishers.includes('Reuters'), 'a publisher that did not answer is not listed as a source');
  assert.equal(out.items.length, 1, 'the feed that did answer still answered');
});

await check('when no feed can be read, that is the answer', async () => {
  const out = await newsSearch('kerala', { fetchImpl: async () => { throw Error('offline'); }, feeds: [WORLD, SPORT] });
  assert.equal(out.ok, false);
  assert.equal(out.items.length, 0);
  assert.match(out.error, /No configured news feed could be read/);
  assert.equal(out.feeds.length, 2, 'both failures are reported');
});

await check('reading every feed is not an option — the rest are reported as unread', async () => {
  const feeds = Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, publisher: `P${i}`, section: 'World', url: `https://feed/${i}` }));
  const bodies = Object.fromEntries(feeds.map(f => [f.url, rss(item('Kerala'))]));
  const out = await newsSearch('kerala', { fetchImpl: stubFetch(bodies), feeds, maxFeeds: 3 });
  assert.equal(out.feeds.length, 3, 'only the first three were read');
  assert.equal(out.unreadFeeds.length, 6, 'and the other six are named, not pretended');
});

/* -------------------------------------------------------------- wiring */

await check('news is a research source, and it is chosen for news', () => {
  assert.equal(NEWS_SOURCE.id, 'news');
  const forNews = chooseSources('latest news on chips').map(s => s.id);
  const forPapers = chooseSources('research papers on metformin').map(s => s.id);
  assert.ok(forNews.includes('news'), 'news is chosen for a news request: ' + forNews.join(','));
  assert.equal(forPapers.includes('news'), false,
    'a literature request does not go to the news feeds: ' + forPapers.join(','));
});

await check('research reports a news failure through the normal channel', async () => {
  const out = await research('kerala news', { fetchImpl: async () => { throw Error('offline'); }, groups: ['news'] });
  assert.equal(out.items.length, 0);
  assert.equal(out.availability.news.ok, false);
  assert.match(out.availability.news.error, /feed/i);
});

await check('a news request reaches the feeds and nothing else', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mp.test/' });
  const { window } = dom;
  for (const n of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'DOMParser'])
    if (window[n] !== undefined) Object.defineProperty(globalThis, n, { configurable: true, writable: true, value: window[n] });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const tools = JSON.parse(await fs.readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
  const index = buildIndex(tools);
  const planFor = prompt => planRequest({ prompt, tools, index, files: [], links: [] });

  const news = planFor('what is the latest news on kerala').steps.find(s => s.executor === 'research');
  assert.deepEqual(news.params.groups, ['news']);
  assert.equal(news.params.query, 'kerala', 'the request words are stripped: ' + news.params.query);

  const bare = planFor('give me the headlines today').steps.find(s => s.executor === 'research');
  assert.deepEqual(bare.params.groups, ['news']);
  assert.equal(bare.params.query, '', 'no subject named means the feeds are read for their latest');

  const papers = planFor('the latest research papers on metformin').steps.find(s => s.executor === 'research');
  assert.equal(papers.params.groups, null, 'news words do not turn a literature request into a news one');

  const who = planFor('who was einstein').steps.find(s => s.executor === 'research');
  assert.equal(who.params.groups, null, 'a biography is not the news');
});

console.log(`${pass}/${pass + (process.exitCode ? 1 : 0)} news tests passed`);
if (process.exitCode) throw new Error('news tests failed');
