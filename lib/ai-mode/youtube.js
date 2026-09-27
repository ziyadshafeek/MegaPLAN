/**
 * YouTube retrieval — the keyless, public read path.
 *
 * Three sources, tried in order of reliability:
 *   1. InnerTube `player` / `browse` — YouTube's own public, unauthenticated
 *      API that the website itself calls. Returns caption track URLs, video
 *      metadata and playlist contents.
 *   2. Piped / Invidious mirrors, which proxy the same public data.
 *   3. The public web page HTML.
 *
 * Scope, enforced on purpose: public caption text, public metadata, public
 * playlist listings and public thumbnails. No stream URLs are ever resolved,
 * no private playlist is touched, and no access control is circumvented.
 */
import { getText, safeUrl } from './http.js';
export { getText, safeUrl };

const INNERTUBE = 'https://www.youtube.com/youtubei/v1';
const WEB_CONTEXT = {
  clientName: 'WEB',
  clientVersion: '2.20240726.00.00',
  hl: 'en',
  gl: 'US'
};

function innertubeHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Format-Version': '2',
    'X-YouTube-Client-Name': '1',
    'X-YouTube-Client-Version': WEB_CONTEXT.clientVersion,
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/'
  };
}

async function innertube(path, body, { fetchImpl = fetch, timeoutMs = 11_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${INNERTUBE}/${path}?prettyPrint=false`, {
      method: 'POST',
      headers: innertubeHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, data: null };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (err) {
    return { ok: false, status: 0, error: String(err?.message || err || 'network error'), data: null };
  } finally {
    clearTimeout(timer);
  }
}

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (VIDEO_ID_RE.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (VIDEO_ID_RE.test(id || '')) return id;
    }
    const v = u.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;
    const m = u.pathname.match(/\/(?:embed|v|shorts|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  const loose = s.match(/[A-Za-z0-9_-]{11}/);
  return loose ? loose[0] : null;
}

export function extractPlaylistId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Known playlist prefixes (PL…, OL…, UU…, LL…, RD…, FL…) followed by enough id.
  if (/^(?:PL|OL|UU|LL|RD|FL)[A-Za-z0-9_-]{4,}$/.test(s)) return s;
  if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return s;
  // A `list=` parameter straight out of a URL is trustworthy enough to pass on.
  try {
    const u = new URL(s);
    const list = u.searchParams.get('list');
    if (list && /^[A-Za-z0-9_-]{4,}$/.test(list)) return list;
  } catch { /* not a URL */ }
  return s.match(/list=([A-Za-z0-9_-]{4,})/)?.[1] || null;
}

/* ------------------------------------------------------------------ *
 * Caption parsing
 * ------------------------------------------------------------------ */

function decodeEntities(text) {
  return String(text || '')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (m, dec, hex, named) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[named.toLowerCase()] ?? m;
    });
}

export function parseJson3(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  const segments = [];
  for (const ev of data?.events || []) {
    const text = (ev.segs || []).map(s => s?.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    segments.push({
      start: (ev.tStartMs || 0) / 1000,
      duration: (ev.dDurationMs || 0) / 1000,
      text: decodeEntities(text)
    });
  }
  return segments.length ? segments : null;
}

export function parseTimedTextXml(raw) {
  const segments = [];
  const re = /<text([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(String(raw || ''))) !== null) {
    const attrs = m[1];
    const start = parseFloat((attrs.match(/start="([\d.]+)"/) || [])[1] || '0');
    const dur = parseFloat((attrs.match(/dur="([\d.]+)"/) || [])[1] || '0');
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) segments.push({ start, duration: dur, text });
  }
  return segments.length ? segments : null;
}

export function parseVtt(raw) {
  const segments = [];
  const lines = String(raw || '').split(/\r?\n/);
  const stamp = v => {
    const parts = String(v).trim().replace(',', '.').split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\S+)\s+-->\s+(\S+)/);
    if (!m) continue;
    const start = stamp(m[1]);
    const end = stamp(m[2]);
    if (start == null || end == null) continue;
    const text = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() && !/-->/.test(lines[j]); j++) text.push(lines[j].trim());
    const joined = decodeEntities(text.join(' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (joined) segments.push({ start, duration: Math.max(0, end - start), text: joined });
  }
  return segments.length ? segments : null;
}

const PARSERS = [parseJson3, parseVtt, parseTimedTextXml];
export function parseCaptions(raw) {
  for (const parse of PARSERS) {
    const out = parse(raw);
    if (out?.length) return out;
  }
  return null;
}

export function toSrt(segments) {
  const t = s => {
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return segments.map((seg, i) => `${i + 1}\n${t(seg.start)} --> ${t(seg.start + (seg.duration || 0))}\n${seg.text}\n`).join('\n');
}
export function toVtt(segments) {
  const t = s => {
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  return `WEBVTT\n\n${segments.map(seg => `${t(seg.start)} --> ${t(seg.start + (seg.duration || 0))}\n${seg.text}\n`).join('\n')}`;
}

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */

function pickTrack(tracks, lang) {
  const usable = (tracks || []).filter(t => t?.baseUrl);
  if (!usable.length) return null;
  return usable.find(t => t.languageCode === lang)
    || usable.find(t => (t.languageCode || '').startsWith(lang))
    || usable.find(t => t.languageCode === 'en')
    || usable.find(t => t.kind !== 'asr')
    || usable[0];
}

export async function fetchPlayer(videoId, { fetchImpl = fetch, lang = 'en' } = {}) {
  const res = await innertube('player', {
    videoId,
    context: { client: { ...WEB_CONTEXT, hl: lang, gl: WEB_CONTEXT.gl } },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
    contentCheckOk: true,
    racyCheckOk: true
  }, { fetchImpl });
  if (!res.ok) return { ok: false, error: res.error };
  const data = res.data || {};
  const details = data.videoDetails || {};
  const playability = data.playabilityStatus || {};
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return {
    ok: Boolean(details.videoId),
    error: details.videoId ? null : (playability.reason || playability.status || 'video is not publicly readable'),
    playable: details.videoId && playability.status !== 'ERROR' && playability.status !== 'LOGIN_REQUIRED',
    status: playability.status || null,
    videoId: details.videoId || videoId,
    title: details.title || '',
    author: details.author || '',
    channelId: details.channelId || '',
    lengthSeconds: Number(details.lengthSeconds) || null,
    viewCount: Number(details.viewCount) || null,
    keywords: Array.isArray(details.keywords) ? details.keywords.slice(0, 20) : [],
    description: String(details.shortDescription || '').slice(0, 20_000),
    thumbnail: safeUrl(details.thumbnail?.thumbnails?.slice(-1)[0]?.url) || null,
    publishDate: data?.microformat?.playerMicroformatRenderer?.publishDate || null,
    category: data?.microformat?.playerMicroformatRenderer?.category || null,
    isLive: Boolean(details.isLiveContent),
    captionTracks: tracks,
    track: pickTrack(tracks, lang)
  };
}

/** Download and parse one caption track. Public caption text only. */
export async function fetchTrackText(baseUrl, { fetchImpl = fetch } = {}) {
  const candidates = [];
  const withFmt = url => (url.includes('fmt=') ? url.replace(/&?fmt=[^&]*/, '') : url);
  for (const fmt of ['json3', 'srv3', 'vtt', '']) {
    const base = withFmt(baseUrl);
    candidates.push(fmt ? `${base}&fmt=${fmt}` : base);
  }
  for (const url of candidates) {
    const res = await getText(url, { fetchImpl, timeoutMs: 11_000, headers: { Referer: 'https://www.youtube.com/' } });
    if (!res.ok || !res.text) continue;
    const segments = parseCaptions(res.text);
    if (segments?.length) return { segments, url };
  }
  return null;
}

/** Timestamp chapters from the public description, or the structured block. */
export function chaptersFromDescription(description) {
  const lines = String(description || '').split(/\r?\n/);
  const out = [];
  const stamp = s => {
    const m = String(s).match(/^\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?$/);
    if (!m) return null;
    const [, a, b, c] = m;
    return c != null ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\[?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\]?\s*[-–—:|]?\s*(.+)$/);
    if (!m) continue;
    const start = stamp(m[1]);
    const title = m[2].trim().replace(/^[–—:|]\s*/, '');
    if (start != null && title.length > 1 && title.length < 120) out.push({ start, time: m[1], title });
  }
  return out.filter((c, i, arr) => i === 0 || c.start > arr[i - 1].start);
}

/* ------------------------------------------------------------------ *
 * Playlist
 * ------------------------------------------------------------------ */

function readPlaylistItems(data) {
  const contents =
    data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents
    || data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
      ?.playlistVideoListRenderer?.contents
    || data?.contents?.playlistVideoListRenderer?.contents
    || [];
  const map = item => {
    const vr = item?.playlistVideoRenderer;
    if (!vr?.videoId) return null;
    return {
      videoId: vr.videoId,
      title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || '',
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
      thumbnail: safeUrl(vr.thumbnail?.thumbnails?.slice(-1)[0]?.url) || `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
      duration: vr.lengthText?.simpleText || '',
      uploader: vr.shortBylineText?.runs?.[0]?.text || '',
      views: Number(String(vr.viewCountText?.simpleText || '').replace(/\D/g, '')) || null
    };
  };
  return contents.map(map).filter(Boolean);
}

function readContinuation(data) {
  const items = data?.onResponseReceivedActions || data?.onResponseReceivedEndpoints || [];
  for (const action of items) {
    const token = action?.appendContinuationItemsAction?.continuationItems?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
      || action?.reloadContinuationItemsCommand?.continuationCommand?.token;
    if (token) return token;
  }
  return null;
}

export async function fetchPlaylist(playlistId, { fetchImpl = fetch, pages = 3 } = {}) {
  let token = null;
  let data = null;
  for (let page = 0; page < Math.max(1, Math.min(6, pages)); page++) {
    const body = token
      ? { continuation: token, context: { client: { ...WEB_CONTEXT } } }
      : { browseId: `VL${playlistId}`, context: { client: { ...WEB_CONTEXT } } };
    const res = await innertube('browse', body, { fetchImpl });
    if (!res.ok) {
      if (page === 0) return { ok: false, error: res.error, videos: [] };
      break;
    }
    data = res.data;
    if (page === 0) {
      const first = readPlaylistItems(res.data);
      if (!first.length) {
        // The browse response may be a continuation-only shape; try once more.
        token = readContinuation(res.data);
        if (!token) {
          const title = res.data?.header?.playlistHeaderRenderer?.title?.simpleText
            || res.data?.metadata?.playlistMetadataRenderer?.title || '';
          return { ok: true, videos: [], title, error: title ? 'playlist is empty or private' : 'playlist is not publicly readable' };
        }
        continue;
      }
    }
    token = readContinuation(res.data);
    if (!token) break;
  }
  const videos = readPlaylistItems(data || {});
  const title = data?.header?.playlistHeaderRenderer?.title?.simpleText
    || data?.microformat?.microformatDataRenderer?.title?.simpleText
    || data?.metadata?.playlistMetadataRenderer?.title || '';
  return { ok: videos.length > 0, videos, title, error: videos.length ? null : 'playlist is empty, private, or not publicly readable' };
}

/* ------------------------------------------------------------------ *
 * Mirrors (Piped / Invidious) — fallbacks only
 * ------------------------------------------------------------------ */

export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptos.xyz',
  'https://pipedapi.r4fo.com'
];

export async function fetchViaPiped(kind, id, { fetchImpl = fetch } = {}) {
  for (const base of PIPED_INSTANCES) {
    const url = kind === 'playlist' ? `${base}/playlists/${id}` : `${base}/streams/${id}`;
    const res = await getText(url, { fetchImpl, timeoutMs: 7000, headers: { Accept: 'application/json' } });
    if (!res.ok) continue;
    try { return { ok: true, data: JSON.parse(res.text), instance: base }; }
    catch { continue; }
  }
  return { ok: false, error: 'no Piped mirror answered', data: null };
}
