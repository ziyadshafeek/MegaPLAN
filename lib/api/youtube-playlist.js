/**
 * YouTube Playlist Lister — extracts video list from a public playlist
 * Uses Piped API fallback + YouTube scraping
 * POST /api/youtube-playlist { url or playlistId }
 */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function extractPlaylistId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Direct ID (PL... or OL... etc, 10+ chars)
  if (/^(PL|OL|UU|LL|RD|FL)[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s) && s.length >= 10) return s; // fallback
  try {
    const u = new URL(s);
    const list = u.searchParams.get('list');
    if (list) return list;
  } catch {}
  const m = s.match(/(?:list=)([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

async function fetchWithTimeout(url, opts = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {})
      }
    });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function tryPipedPlaylist(playlistId) {
  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.leptos.xyz'
  ];
  for (const base of instances) {
    try {
      const url = `${base}/playlists/${playlistId}`;
      const r = await fetchWithTimeout(url, {}, 10000);
      if (!r.ok) continue;
      const data = await r.json();
      if (!data || !data.relatedStreams) continue;
      const videos = data.relatedStreams.map(v => ({
        videoId: v.url?.split('v=')[1] || v.url?.split('/').pop() || '',
        title: v.title,
        url: `https://www.youtube.com${v.url}`,
        thumbnail: v.thumbnail,
        duration: v.duration,
        uploader: v.uploaderName,
        views: v.views,
        uploaded: v.uploadedDate
      }));
      return {
        title: data.name,
        uploader: data.uploader,
        thumbnail: data.thumbnailUrl,
        videoCount: videos.length,
        videos,
        source: 'piped',
        instance: base
      };
    } catch {}
  }
  return null;
}

async function tryYouTubeScrape(playlistId) {
  try {
    const url = `https://www.youtube.com/playlist?list=${playlistId}&hl=en`;
    const r = await fetchWithTimeout(url);
    const html = await r.text();
    // Try to find ytInitialData
    const m = html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
    let videos = [];
    let title = null;
    
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        // Navigate through the structure
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
        const section = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;
        if (section) {
          videos = section.map(item => {
            const vr = item.playlistVideoRenderer;
            if (!vr) return null;
            return {
              videoId: vr.videoId,
              title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || '',
              url: `https://www.youtube.com/watch?v=${vr.videoId}&list=${playlistId}`,
              thumbnail: vr.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${vr.videoId}/mqdefault.jpg`,
              duration: vr.lengthText?.simpleText || '',
              uploader: vr.shortBylineText?.runs?.[0]?.text || '',
              isPlayable: vr.isPlayable
            };
          }).filter(Boolean);
        }
        // Try alternative path for title
        title = data?.metadata?.playlistMetadataRenderer?.title || data?.header?.playlistHeaderRenderer?.title?.simpleText || null;
      } catch (e) {
        // fallback regex
      }
    }
    
    // Fallback regex extraction for video IDs
    if (!videos.length) {
      const videoIdRegex = /\"videoId\"\s*:\s*\"([a-zA-Z0-9_-]{11})\"/g;
      const titleRegex = /\"title\"\s*:\s*\{\s*\"runs\"\s*:\s*\[\s*\{\s*\"text\"\s*:\s*\"([^\"]+)\"/g;
      const ids = [...html.matchAll(videoIdRegex)].map(m => m[1]);
      const uniqueIds = [...new Set(ids)];
      videos = uniqueIds.slice(0, 100).map(id => ({
        videoId: id,
        title: '',
        url: `https://www.youtube.com/watch?v=${id}&list=${playlistId}`,
        thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
        duration: '',
        uploader: ''
      }));
    }
    
    if (!title) {
      const tMatch = html.match(/<title>([^<]+)<\/title>/);
      if (tMatch) title = tMatch[1].replace(' - YouTube', '').trim();
    }
    
    return {
      title: title || `Playlist ${playlistId}`,
      videoCount: videos.length,
      videos,
      source: 'youtube-scrape'
    };
  } catch (e) {
    return null;
  }
}

async function tryInvidiousPlaylist(playlistId) {
  const instances = [
    'https://yewtu.be',
    'https://invidious.io',
    'https://inv.nadeko.net'
  ];
  for (const base of instances) {
    try {
      const url = `${base}/api/v1/playlists/${playlistId}`;
      const r = await fetchWithTimeout(url, {}, 8000);
      if (!r.ok) continue;
      const data = await r.json();
      const videos = (data.videos || []).map(v => ({
        videoId: v.videoId,
        title: v.title,
        url: `https://www.youtube.com/watch?v=${v.videoId}&list=${playlistId}`,
        thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
        duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, '0')}` : '',
        uploader: v.author,
        views: v.viewCountText
      }));
      return {
        title: data.title,
        uploader: data.author,
        videoCount: videos.length,
        videos,
        source: 'invidious',
        instance: base
      };
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'POST or GET' });
  
  let body = {};
  if (req.method === 'POST') body = readBody(req);
  else body = { playlistId: req.query.playlistId || req.query.list || req.query.url, url: req.query.url };
  
  const input = body.playlistId || body.url || body.link;
  const playlistId = extractPlaylistId(input);
  if (!playlistId) return json(res, 400, { error: 'Enter a valid YouTube playlist URL or ID (starts with PL, OL, etc).' });
  
  try {
    let result = await tryPipedPlaylist(playlistId);
    if (!result || !result.videos?.length) {
      result = await tryInvidiousPlaylist(playlistId);
    }
    if (!result || !result.videos?.length) {
      result = await tryYouTubeScrape(playlistId);
    }
    
    if (!result || !result.videos?.length) {
      return json(res, 404, { error: 'Could not extract playlist. It may be private, deleted, or YouTube blocked the request.', playlistId });
    }
    
    // Limit to 200 for performance
    const limited = result.videos.slice(0, 200);
    
    return json(res, 200, {
      ok: true,
      playlistId,
      title: result.title,
      uploader: result.uploader || null,
      thumbnail: result.thumbnail || null,
      videoCount: result.videoCount,
      returned: limited.length,
      truncated: result.videos.length > 200,
      videos: limited,
      source: result.source,
      export: {
        urls: limited.map(v => v.url).join('\n'),
        titles: limited.map(v => v.title).join('\n'),
        csv: 'videoId,title,url,duration\n' + limited.map(v => `"${v.videoId}","${(v.title||'').replace(/"/g,'""')}","${v.url}","${v.duration||''}"`).join('\n')
      }
    });
    
  } catch (err) {
    return json(res, 500, { error: err.message || 'Playlist extraction failed', playlistId });
  }
}
