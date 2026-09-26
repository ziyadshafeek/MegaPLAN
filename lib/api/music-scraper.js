// Compatibility endpoint. Spotify embed-token extraction and catalogue
// aggregation are disabled: a public embed token is not licensed dataset access.
function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); }
export default async function handler(req, res) {
  return json(res, 501, { error: 'Unofficial Spotify scraping is disabled. Use /api/open-music for on-demand MusicBrainz search. An authorized Spotify application may use Spotify only within its developer terms; no complete Spotify catalogue is promised.' });
}
