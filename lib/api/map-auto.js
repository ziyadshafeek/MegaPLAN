import fs from 'node:fs';

// Public serverless deployments are read-only. Scheduled GitHub workflow runners
// execute scripts/kerala-expansion-runner.mjs in a checkout and commit their data.
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const action = new URL(req.url, 'https://megaplan.invalid').searchParams.get('action') || 'status';
  if (req.method === 'GET' && action === 'status') {
    let index = {};
    try { index = JSON.parse(fs.readFileSync(new URL('../../data/map-directory/index.json', import.meta.url), 'utf8')); }
    catch { /* no published cells yet */ }
    return json(res, 200, {
      ok: true,
      source: 'published repository snapshot',
      totalCells: index.totalCells || 0,
      totalPlaces: index.totalPlaces || 0,
      lastScannedAt: index.lastScannedAt || null,
      ingestion: 'scheduled GitHub workflow; website requests cannot persist new cells'
    });
  }
  return json(res, 405, { error: 'Website indexing is read-only. Use the scheduled map workflow or scan a cell locally in Map Directory.' });
}
