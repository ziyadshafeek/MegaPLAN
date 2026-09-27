/**
 * YouTube retrieval — caption, chapter and playlist parsing.
 *
 * The upstream calls are stubbed; the assertions cover ID extraction, caption
 * formats, timestamp chapters, playlist shape and honest failure.
 */
import assert from 'node:assert/strict';
import {
  extractVideoId, extractPlaylistId, parseJson3, parseVtt, parseTimedTextXml,
  parseCaptions, toSrt, toVtt, chaptersFromDescription, fetchPlayer, fetchPlaylist
} from '../lib/ai-mode/youtube.js';
import { getTranscript, buildResult, deriveChapters } from '../lib/api/youtube-transcript.js';
import { getPlaylist, toCsv, toText } from '../lib/api/youtube-playlist.js';

/* ---------- id extraction ---------- */
assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
assert.equal(extractVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
assert.equal(extractVideoId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
assert.equal(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(extractVideoId('not a url at all'), null);
assert.equal(extractVideoId(''), null);
assert.equal(extractPlaylistId('https://www.youtube.com/playlist?list=PLabc123'), 'PLabc123');
assert.equal(extractPlaylistId('PLabc123'), 'PLabc123');

/* ---------- caption formats ---------- */
const json3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
    { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'Second line' }] },
    { tStartMs: 3500, dDurationMs: 500, segs: [] }
  ]
});
const a = parseJson3(json3);
assert.equal(a.length, 2, 'empty events are dropped');
assert.equal(a[0].text, 'Hello world');
assert.equal(a[1].start, 1.5);
assert.equal(parseJson3('not json'), null);

const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.500
First cue

2
00:00:02.500 --> 00:00:05.000
Second cue
spanning lines
`;
const b = parseVtt(vtt);
assert.equal(b.length, 2);
assert.equal(b[1].text, 'Second cue spanning lines', 'multi-line cues are joined');
assert.equal(b[1].duration, 2.5);

const srv3 = `<?xml version="1.0"?><timedtext><body>
  <text start="0" dur="1.2">Hi &amp; bye</text>
  <text start="1.2" dur="2">Later</text>
</body></timedtext>`;
const c = parseTimedTextXml(srv3);
assert.equal(c[0].text, 'Hi & bye', 'srv3 entities are decoded');
assert.equal(c[1].start, 1.2);

assert.equal(parseCaptions('<?xml version="1.0"?><x/>'), null, 'unparseable payloads yield nothing, never garbage');

/* ---------- SRT / VTT output ---------- */
const srt = toSrt([{ start: 0, duration: 2.5, text: 'One' }, { start: 2.5, duration: 1, text: 'Two' }]);
assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nOne/);
assert.match(toVtt(a), /^WEBVTT/);
assert.match(toVtt(a), /00:00:00\.000 --> 00:00:01\.500/);

/* ---------- chapters from the public description ---------- */
const chapters = chaptersFromDescription([
  '0:00 Intro', '1:30 The problem', '12:05 Results', 'not a stamp', '4:00'
].join('\n'));
assert.equal(chapters.length, 3, 'a bare timestamp with no title is not a chapter');
assert.equal(chapters[0].time, '0:00');
assert.equal(chapters[1].title, 'The problem');
assert.deepEqual(chaptersFromDescription('no timestamps here'), []);

/* ---------- derived chapters when the uploader gave none ---------- */
const derived = deriveChapters([{ start: 0, text: 'intro' }, { start: 300, text: 'middle' }, { start: 600, text: 'end' }]);
assert.ok(derived.length >= 1);
assert.ok(derived.every(c => typeof c.time === 'string'));

/* ---------- player retrieval (stubbed InnerTube) ---------- */
function playerResponse(overrides = {}) {
  return {
    playabilityStatus: { status: 'OK' },
    videoDetails: {
      videoId: 'dQw4w9WgXcQ', title: 'A Lecture', author: 'A Teacher', channelId: 'UC123',
      lengthSeconds: '212', viewCount: '1000', shortDescription: '0:00 Intro\n2:00 Middle\n',
      thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg' }] }
    },
    microformat: { playerMicroformatRenderer: { publishDate: '2024-05-01', category: 'Education' } },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [
      { baseUrl: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en', languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto)' } }
    ] } },
    ...overrides
  };
}

{
  const f = async (url, init) => {
    if (String(url).includes('/youtubei/v1/player')) return new Response(JSON.stringify(playerResponse()), { status: 200 });
    if (String(url).includes('/api/timedtext')) return new Response(json3, { status: 200 });
    return new Response('no', { status: 404 });
  };
  const player = await fetchPlayer('dQw4w9WgXcQ', { fetchImpl: f });
  assert.equal(player.title, 'A Lecture');
  assert.equal(player.channelId, 'UC123');
  assert.equal(player.lengthSeconds, 212);
  assert.equal(player.track.languageCode, 'en', 'the requested language track is chosen');
  assert.equal(player.publishDate, '2024-05-01');

  const t = await getTranscript('https://youtu.be/dQw4w9WgXcQ', { fetchImpl: f });
  assert.equal(t.ok, true);
  assert.equal(t.count, 2);
  assert.equal(t.text, 'Hello world Second line');
  assert.equal(t.isAutoGenerated, true, 'an asr track is flagged as auto-generated');
  assert.equal(t.title, 'A Lecture');
  assert.equal(t.channelUrl, 'https://www.youtube.com/channel/UC123');
  assert.equal(t.chapters.length, 2, 'description timestamps become chapters');
  assert.equal(t.source, 'youtube-captions');
}

/* ---------- no caption tracks → honest failure, never invented text ---------- */
{
  const f = async (url) => (String(url).includes('/youtubei/v1/player')
    ? new Response(JSON.stringify(playerResponse({ captions: undefined })), { status: 200 })
    : new Response('no', { status: 404 }));
  const t = await getTranscript('dQw4w9WgXcQ', { fetchImpl: f });
  assert.equal(t.ok, false);
  assert.equal(t.status, 404);
  assert.match(t.error, /no caption track/i);
  assert.ok(t.attempts.includes('innertube:no-caption-tracks'), 'the attempt log says what was tried');
}

/* ---------- captioned but the track fetch fails → still honest ---------- */
{
  const f = async (url) => (String(url).includes('/youtubei/v1/player')
    ? new Response(JSON.stringify(playerResponse()), { status: 200 })
    : new Response('no', { status: 503 }));
  const t = await getTranscript('dQw4w9WgXcQ', { fetchImpl: f });
  assert.equal(t.ok, false);
  assert.ok(!t.text, 'no text is invented when the track cannot be downloaded');
}

/* ---------- network down ---------- */
{
  const f = async () => { throw Error('offline'); };
  const t = await getTranscript('dQw4w9WgXcQ', { fetchImpl: f });
  assert.equal(t.ok, false);
  assert.ok(t.attempts.length >= 2, 'both the API and the mirror were attempted');
  const p = await getPlaylist('PL123', { fetchImpl: f });
  assert.equal(p.ok, false);
}

/* ---------- bad input ---------- */
{
  const t = await getTranscript('hello', { fetchImpl: async () => new Response('{}', { status: 200 }) });
  assert.equal(t.status, 400);
  const p = await getPlaylist('', { fetchImpl: async () => new Response('{}', { status: 200 }) });
  assert.equal(p.status, 400);
}

/* ---------- playlists ---------- */
{
  const renderer = v => ({ playlistVideoRenderer: v });
  const list = {
    playlistVideoListRenderer: {
      contents: [
        renderer({
          videoId: 'aaaaaaaaaaa',
          title: { runs: [{ text: 'Lecture 1' }] },
          lengthText: { simpleText: '10:00' },
          shortBylineText: { runs: [{ text: 'A Teacher' }] },
          thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/x.jpg' }] },
          viewCountText: { simpleText: '1,234 views' }
        }),
        renderer({ videoId: 'bbbbbbbbbbb', title: { simpleText: 'Lecture 2' }, lengthText: { simpleText: '11:30' } })
      ]
    }
  };
  const browse = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [list] } }] } } } }]
      }
    },
    header: { playlistHeaderRenderer: { title: { simpleText: 'Course 101' } } }
  };
  const f = async url => (String(url).includes('/youtubei/v1/browse')
    ? new Response(JSON.stringify(browse), { status: 200 })
    : new Response('no', { status: 404 }));
  const p = await getPlaylist('https://www.youtube.com/playlist?list=PL123', { fetchImpl: f });
  assert.equal(p.ok, true);
  assert.equal(p.videoCount, 2);
  assert.equal(p.title, 'Course 101');
  assert.equal(p.videos[0].views, 1234, 'view counts are parsed');
  assert.match(toCsv(p.videos), /^#,Title,Video ID/);
  assert.match(toCsv(p.videos), /Lecture 1/);
  assert.match(toText(p.videos, 'Course 101'), /Course 101/);
  const direct = await fetchPlaylist('PL123', { fetchImpl: f });
  assert.equal(direct.ok, true);
}

/* ---------- private playlist is reported, not bypassed ---------- */
{
  const f = async () => new Response('not stubbed', { status: 404 });
  const p = await getPlaylist('PLprivate', { fetchImpl: f });
  assert.equal(p.ok, false);
  assert.match(p.error, /private|deleted|not publicly readable/i);
  assert.match(p.error, /only lists public playlists/i);
}

console.log('YouTube retrieval ok: id extraction, json3/srv3/vtt captions, SRT+VTT export, description chapters, InnerTube player and playlist, auto-generated flagging, private/absent captions and offline honesty verified');
