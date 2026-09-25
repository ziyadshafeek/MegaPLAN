/**
 * Copy hosted writing-assistant env from GitHub Actions secrets (process env)
 * into the Vercel project so /api/ai and /api/agent-plan work on the website.
 *
 * GitHub Actions secrets are NOT visible to Vercel at runtime. This script is
 * the only supported bridge. It never prints secret values or the model id.
 *
 * Required env:
 *   NVIDIA_API_KEY, NVIDIA_AGENT_MODEL
 *   VERCEL_TOKEN
 * Optional:
 *   VERCEL_PROJECT_ID, VERCEL_PROJECT_NAME (default mega-plan)
 *   VERCEL_ORG_ID or VERCEL_TEAM_ID
 *   VERCEL_DEPLOY_HOOK_URL
 *   ALLOW_SKIP=1  → exit 0 when VERCEL_TOKEN is missing
 */
const TOKEN = process.env.VERCEL_TOKEN || '';
const KEY = process.env.NVIDIA_API_KEY || '';
const MODEL = process.env.NVIDIA_AGENT_MODEL || '';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || '';
const PROJECT_NAME = process.env.VERCEL_PROJECT_NAME || 'mega-plan';
const TEAM = process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID || '';
const HOOK = process.env.VERCEL_DEPLOY_HOOK_URL || '';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!TOKEN) {
  if (process.env.ALLOW_SKIP === '1') {
    console.log('Skip: VERCEL_TOKEN is not set. GitHub still holds the hosted writing key; the website will not until you add a Vercel token and re-run this workflow.');
    process.exit(0);
  }
  fail('VERCEL_TOKEN is required to copy hosted writing env onto Vercel.');
}
if (!KEY || !MODEL) fail('NVIDIA_API_KEY and NVIDIA_AGENT_MODEL must be present as GitHub Actions secrets.');

function qs(extra = '') {
  const p = new URLSearchParams();
  if (TEAM) p.set('teamId', TEAM);
  if (extra) {
    const e = new URLSearchParams(extra);
    for (const [k, v] of e) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function vercel(path, opts = {}) {
  const r = await fetch(`https://api.vercel.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: true }; }
  if (!r.ok) {
    const err = new Error(`Vercel API HTTP ${r.status}`);
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function resolveProject() {
  if (PROJECT_ID) {
    return vercel(`/v9/projects/${encodeURIComponent(PROJECT_ID)}${qs()}`);
  }
  const list = await vercel(`/v9/projects${qs('limit=100')}`);
  const projects = list?.projects || list || [];
  const hit = projects.find(p => p.name === PROJECT_NAME || p.name === 'MegaPLAN' || p.name === 'megaplan');
  if (!hit) fail(`No Vercel project named ${PROJECT_NAME}. Set VERCEL_PROJECT_ID.`);
  return hit;
}

async function upsertEnv(projectId, key, value) {
  const existing = await vercel(`/v9/projects/${encodeURIComponent(projectId)}/env${qs()}`);
  const rows = existing?.envs || existing || [];
  for (const row of rows) {
    if (row.key === key) {
      try {
        await vercel(`/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(row.id)}${qs()}`, { method: 'DELETE' });
      } catch { /* keep going; POST may still upsert */ }
    }
  }
  await vercel(`/v10/projects/${encodeURIComponent(projectId)}/env${qs('upsert=true')}`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview', 'development']
    })
  });
}

const project = await resolveProject();
const id = project.id || PROJECT_ID;
if (!id) fail('Vercel project id missing.');
await upsertEnv(id, 'NVIDIA_API_KEY', KEY);
await upsertEnv(id, 'NVIDIA_AGENT_MODEL', MODEL);
console.log(`Copied hosted writing env onto Vercel project ${project.name || id} (production, preview, development).`);

if (HOOK) {
  const d = await fetch(HOOK, { method: 'POST' });
  console.log(d.ok ? 'Triggered Vercel deploy hook so functions pick up the new env.' : `Deploy hook HTTP ${d.status}. Redeploy the project in Vercel.`);
} else {
  console.log('Redeploy the Vercel project so serverless functions pick up the new env.');
}
