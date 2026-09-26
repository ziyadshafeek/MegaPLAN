import { timingSafeEqual } from 'node:crypto';

// Scheduled ingestion writes files in a checked-out repository and commits them.
// Vercel functions cannot persist changes to the deployed public/ or data/ tree.
export function ingestionError(req) {
  if (process.env.VERCEL) return { status: 405, error: 'Dataset ingestion runs in scheduled jobs; this deployment is read-only.' };
  const expected = process.env.DATA_INGEST_TOKEN;
  if (!expected) return { status: 503, error: 'Local dataset ingestion is not configured.' };
  const provided = req.headers?.['x-data-ingest-token'];
  const a = Buffer.from(typeof provided === 'string' ? provided : '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401, error: 'Dataset write authorization required.' };
  return null;
}
