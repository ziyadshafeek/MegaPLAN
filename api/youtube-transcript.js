/**
 * YouTube Transcript API — fetches captions for any video that has them.
 * Supports auto-generated and manual captions, multiple languages, SRT/WebVTT/JSON.
 * No API key required. Uses YouTube's own timedtext endpoint + Piped fallback.
 * 
 * POST /api/youtube-transcript
 * Body: { url or videoId, lang: 'en' (optional), format: 'text'|'json'|'srt'|'vtt' }
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

function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Direct ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (u.searchParams.get('v')) {
      const v = u.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    // /embed/ID, /v/ID, /shorts/ID
    const m = u.pathname.match(/\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  } catch {}
  // Try regex fallback
  const m = s.match(/[a-zA-Z0-9_-]{11}/);
  return m ? m[0] : null;
}

async function fetchWithTimeout(url, opts = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {})
      }
    });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function getCaptionTracks(videoId) {
  // Try YouTube watch page
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  try {
    const r = await fetchWithTimeout(watchUrl);
    const html = await r.text();
    // Look for ytInitialPlayerResponse
    const m1 = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    const m2 = html.match(/\"captionTracks\"\s*:\s*(\[.*?\])/s);
    const m3 = html.match(/\"captions\"\s*:\s*(\{.*?\}\}\}\})/s);
    
    let captionTracks = null;
    let playerResponse = null;
    
    if (m1) {
      try {
        playerResponse = JSON.parse(m1[1]);
        captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch {}
    }
    if (!captionTracks && m2) {
      try {
        captionTracks = JSON.parse(m2[1]);
      } catch {}
    }
    // Also try to extract from html directly via regex for baseUrl
    if (!captionTracks) {
      const baseUrlMatches = [...html.matchAll(/\"baseUrl\"\s*:\s*\"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)\"/g)];
      if (baseUrlMatches.length) {
        captionTracks = baseUrlMatches.map((match, idx) => {
          const url = JSON.parse(`"${match[1]}"`);
          // Try to get language from nearby
          return {
            baseUrl: url,
            languageCode: 'en',
            name: { simpleText: 'English' },
            vssId: `.en`
          };
        });
      }
    }
    
    return { captionTracks: captionTracks || [], playerResponse, htmlSnippet: html.slice(0, 5000) };
  } catch (e) {
    return { captionTracks: [], error: e.message };
  }
}

async function fetchTranscriptFromTrack(track, lang) {
  let url = track.baseUrl;
  // Ensure we have proper format
  if (!url.includes('&fmt=')) {
    // Try json3 for easier parsing
    url += '&fmt=json3';
  }
  // If lang requested and track is different, try to get translation
  if (lang && track.languageCode !== lang) {
    // Try to add tlang param for translation if available
    if (!url.includes('tlang=')) {
      url += `&tlang=${lang}`;
    }
  }
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw Error(`Transcript fetch failed ${r.status}`);
  const text = await r.text();
  return { url, text, status: r.status };
}

function parseJson3(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    const events = data.events || [];
    const segments = [];
    for (const ev of events) {
      if (!ev.segs) continue;
      const tStart = (ev.tStartMs || 0) / 1000;
      const dDuration = (ev.dDurationMs || 0) / 1000;
      const text = ev.segs.map(s => s.utf8 || '').join('').trim();
      if (!text) continue;
      segments.push({ start: tStart, duration: dDuration, text });
    }
    return segments;
  } catch {
    return null;
  }
}

function parseXmlTranscript(xml) {
  // Simple XML parse for <text start="..." dur="...">content</text>
  const segs = [];
  const re = /<text[^>]*start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1]);
    const dur = parseFloat(m[2]);
    let text = m[3];
    // Decode HTML entities
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#039;/g, "'");
    text = text.trim();
    if (text) segs.push({ start, duration: dur, text });
  }
  return segs;
}

function toSrt(segments) {
  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return segments.map((seg, i) => {
    const start = fmtTime(seg.start);
    const end = fmtTime(seg.start + seg.duration);
    return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
  }).join('\n');
}

function toVtt(segments) {
  const fmtTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec - Math.floor(sec)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };
  let vtt = 'WEBVTT\n\n';
  vtt += segments.map(seg => {
    const start = fmtTime(seg.start);
    const end = fmtTime(seg.start + seg.duration);
    return `${start} --> ${end}\n${seg.text}\n`;
  }).join('\n');
  return vtt;
}

async function tryPipedFallback(videoId, lang = 'en') {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de'
  ];
  for (const base of pipedInstances) {
    try {
      const url = `${base}/streams/${videoId}`;
      const r = await fetchWithTimeout(url, {}, 8000);
      if (!r.ok) continue;
      const data = await r.json();
      const subs = data.subtitles || [];
      // Find matching lang
      let track = subs.find(s => s.code === lang) || subs.find(s => s.code.startsWith(lang)) || subs[0];
      if (!track) continue;
      const subUrl = track.url;
      const tr = await fetchWithTimeout(subUrl);
      const text = await tr.text();
      // Piped returns VTT usually
      // Parse VTT
      const lines = text.split('\n');
      const segments = [];
      let current = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === 'WEBVTT' || /^\d+$/.test(line)) continue;
        const timeMatch = line.match(/(\d+):(\d+):(\d+\.\d+)\s+-->\s+(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          const end = parseInt(timeMatch[4]) * 3600 + parseInt(timeMatch[5]) * 60 + parseFloat(timeMatch[6]);
          current = { start, duration: end - start, text: '' };
        } else if (current) {
          if (current.text) current.text += ' ' + line;
          else current.text = line;
          // Look ahead to see if next line is blank or time
          const next = lines[i + 1];
          if (!next || !next.trim() || /-->/.test(next) || /^\d+$/.test(next.trim())) {
            if (current.text) segments.push(current);
            current = null;
          }
        }
      }
      if (segments.length) return { segments, source: 'piped', instance: base };
    } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'POST or GET' });
  
  let body = {};
  if (req.method === 'POST') body = readBody(req);
  else {
    body = {
      videoId: req.query.videoId || req.query.v || req.query.url,
      lang: req.query.lang,
      format: req.query.format
    };
  }
  
  const input = body.videoId || body.url || body.link;
  const lang = (body.lang || 'en').toLowerCase();
  const format = (body.format || 'text').toLowerCase();
  
  const videoId = extractVideoId(input);
  if (!videoId) return json(res, 400, { error: 'Enter a valid YouTube video URL or 11-char ID.' });
  
  try {
    // Step 1: Get caption tracks
    const { captionTracks } = await getCaptionTracks(videoId);
    
    let segments = null;
    let usedTrack = null;
    let transcriptSource = 'youtube';
    
    if (captionTracks && captionTracks.length) {
      // Prefer requested lang, then en, then first
      let track = captionTracks.find(t => t.languageCode === lang) ||
                  captionTracks.find(t => t.languageCode && t.languageCode.startsWith(lang)) ||
                  captionTracks.find(t => t.languageCode === 'en') ||
                  captionTracks[0];
      
      if (track) {
        usedTrack = track;
        try {
          const { text } = await fetchTranscriptFromTrack(track, lang);
          // Try json3 parse first
          let parsed = parseJson3(text);
          if (!parsed) parsed = parseXmlTranscript(text);
          if (parsed && parsed.length) segments = parsed;
        } catch (e) {
          // Try alternative fmt
          try {
            const altUrl = track.baseUrl.includes('fmt=') ? track.baseUrl.replace(/&fmt=[^&]+/, '') : track.baseUrl;
            const r = await fetchWithTimeout(altUrl);
            const txt = await r.text();
            let parsed = parseXmlTranscript(txt);
            if (!parsed.length) parsed = parseJson3(txt);
            if (parsed && parsed.length) segments = parsed;
          } catch {}
        }
      }
    }
    
    // Fallback to Piped
    if (!segments || !segments.length) {
      const piped = await tryPipedFallback(videoId, lang);
      if (piped && piped.segments && piped.segments.length) {
        segments = piped.segments;
        transcriptSource = piped.source;
        usedTrack = { languageCode: lang, name: { simpleText: lang } };
      }
    }
    
    // Last resort: try direct timedtext with auto-generated
    if (!segments || !segments.length) {
      try {
        const urlsToTry = [
          `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`,
          `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`,
          `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}`,
          `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`,
          `https://www.youtube.com/api/timedtext?kind=asr&lang=${lang}&v=${videoId}&fmt=json3`,
          `https://www.youtube.com/api/timedtext?kind=asr&lang=en&v=${videoId}&fmt=json3`
        ];
        for (const u of urlsToTry) {
          try {
            const r = await fetchWithTimeout(u);
            if (!r.ok) continue;
            const txt = await r.text();
            let parsed = parseJson3(txt);
            if (!parsed) parsed = parseXmlTranscript(txt);
            if (parsed && parsed.length) {
              segments = parsed;
              break;
            }
          } catch {}
        }
      } catch {}
    }
    
    if (!segments || !segments.length) {
      return json(res, 404, { 
        error: 'No transcript found. The video may have captions disabled, or YouTube blocked the request. Try a video that shows captions in YouTube player.',
        videoId,
        triedTracks: captionTracks?.length || 0,
        hint: 'Works for videos with manual or auto-generated captions. Some videos require age verification or are region-locked.'
      });
    }
    
    const fullText = segments.map(s => s.text).join(' ');
    const result = {
      ok: true,
      videoId,
      language: usedTrack?.languageCode || lang,
      languageName: usedTrack?.name?.simpleText || usedTrack?.languageCode || lang,
      isAutoGenerated: usedTrack?.kind === 'asr' || usedTrack?.vssId?.includes('a.'),
      segments,
      text: fullText,
      source: transcriptSource,
      count: segments.length,
      duration: segments.length ? (segments[segments.length - 1].start + segments[segments.length - 1].duration) : 0
    };
    
    if (format === 'srt') {
      result.srt = toSrt(segments);
    } else if (format === 'vtt') {
      result.vtt = toVtt(segments);
    } else if (format === 'json') {
      // already have segments
    }
    
    return json(res, 200, result);
    
  } catch (err) {
    return json(res, 500, { error: err.message || 'Transcript fetch failed', videoId });
  }
}
