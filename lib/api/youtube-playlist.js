/**
 * YouTube Playlist Lister — public playlists only.
 *
 *   POST /api/youtube-playlist { url | playlistId }
 *   GET  /api/youtube-playlist?url=…
 *
 * Public playlist listings are read from YouTube's own public browse API with a
 * Piped mirror fallback. Private playlists are not accessible and are reported
 * as such.
 */
import { extractPlaylistId, fetchPlaylist, fetchViaPiped } from '../ai-mode/youtube.js';
import { sendJSON, readJSONBody, createLimiter, createCache } from '../ai-mode/http.js';

const limited = createLimiter({ max: 25, windowMs: 60_000 });
const cache = createCache({ ttlMs: 30 * 60_000, max: 120 });

export function toCsv(videos) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['#', 'Title', 'Video ID', 'Duration', 'Uploader', 'Views', 'URL']];
  videos.forEach((v, i) => rows.push([i + 1, v.title, v.videoId, v.duration, v.uploader, v.views, v.url]));
  return rows.map(r => r.map(cell).join(',')).join('\n');
}

export function toText(videos, title) {
  const lines = videos.map((v, i) => `${String(i + 1).padStart(2, '0')}. ${v.title} [${v.duration || '—'}]${v.uploader ? ` — ${v.uploader}` : ''}\n    ${v.url}`);
  return `${title || 'Playlist'}\n${videos.length} video(s)\n\n${lines.join('\n')}\n`;
}

/** Full retrieval chain, exported for tests. */
export async function getPlaylist(input, { fetchImpl = fetch } = {}) {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) return { ok: false, status: 400, error: 'Enter a public YouTube playlist URL or ID.' };

  const direct = await fetchPlaylist(playlistId, { fetchImpl });
  if (direct.ok) {
    return {
      ok: true,
      playlistId,
      title: direct.title || 'Playlist',
      videoCount: direct.videos.length,
      videos: direct.videos,
      source: 'youtube-browse'
    };
  }

  const piped = await fetchViaPiped('playlist', playlistId, { fetchImpl });
  if (piped.ok) {
    const list = piped.data?.relatedStreams || piped.data?.videos || [];
    const videos = list.map(v => {
      const videoId = v.url?.split('v=')[1]?.split('&')[0] || v.url?.split('/').pop() || v.id || '';
      return {
        videoId,
        title: v.title || v.name || '',
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : v.url,
        thumbnail: v.thumbnail || v.thumbnailUrl || null,
        duration: v.duration ? `${Math.floor(v.duration / 60)}:${String(Math.floor(v.duration % 60)).padStart(2, '0')}` : '',
        uploader: v.uploaderName || v.uploader || '',
        views: v.views ?? v.viewsNumber ?? null
      };
    }).filter(v => v.videoId);
    if (videos.length) {
      return { ok: true, playlistId, title: piped.data?.name || 'Playlist', videoCount: videos.length, videos, source: 'piped' };
    }
  }

  return {
    ok: false,
    status: 404,
    error: 'That playlist is private, deleted, or not publicly readable. AI Mode only lists public playlists.',
    playlistId
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST' && req.method !== 'GET') return sendJSON(res, 405, { error: 'GET or POST only.' });
  if (limited(req)) return sendJSON(res, 429, { error: 'Too many playlist lookups. Wait a minute.' });

  const url = new URL(req.url || '/api/youtube-playlist', 'https://megaplan.invalid');
  const body = req.method === 'POST' ? readJSONBody(req) : Object.fromEntries(url.searchParams);
  const input = body.url || body.playlistId || body.list || body.id;
  if (!input) return sendJSON(res, 400, { error: 'Enter a public playlist URL or ID.' });

  const playlistId = extractPlaylistId(input);
  const key = `pl:${playlistId}`;
  const cached = cache.get(key);
  const result = cached || await getPlaylist(input);
  if (!cached && result.ok) cache.set(key, result);
  if (!result.ok) return sendJSON(res, result.status || 502, result);

  const format = String(body.format || 'json').toLowerCase();
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="megaplan-playlist-${playlistId}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(toCsv(result.videos));
  }
  if (format === 'txt' || format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(toText(result.videos, result.title));
  }
  return sendJSON(res, 200, { ok: true, ...result, csv: toCsv(result.videos), text: toText(result.videos, result.title) });
}
