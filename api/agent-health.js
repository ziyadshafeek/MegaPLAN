function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  json(res, 200, {
    ok: true,
    aiConfigured: Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_AGENT_MODEL),
    githubConfigured: Boolean(process.env.GITHUB_TOKEN),
    actionsConfigured: Boolean(process.env.GITHUB_ACTIONS_DISPATCH_TOKEN),
    branch: process.env.GITHUB_BRANCH || 'main'
  });
}
