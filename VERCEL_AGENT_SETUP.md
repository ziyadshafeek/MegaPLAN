# Vercel setup for MegaPLAN Wiki Agent

Set these on the Vercel project (Production; Preview if needed). Never put them in `public/`.

Hosted writing assistant / Wiki Agent:

- `NVIDIA_API_KEY`
- `NVIDIA_AGENT_MODEL` — example `deepseek-ai/deepseek-v4-flash`. This value must not be returned to the browser.

Wiki publish (optional):

- `GITHUB_TOKEN`
- `GITHUB_OWNER=ziyadshafeek`
- `GITHUB_REPO=MegaPLAN`
- `GITHUB_BRANCH=main`

Autonomous GitHub Actions path:

- `GITHUB_ACTIONS_DISPATCH_TOKEN`
- `GITHUB_AGENT_WORKFLOW=agent-online-store.yml` (optional)
- `AGENT_SETUP_TOKEN`
- `GITHUB_SECRETS_TOKEN`

Customers can skip all of this and use **Self Agent** with their own key, which never leaves the browser.

After changing Vercel variables, redeploy. GitHub Actions also needs `NVIDIA_API_KEY` and `NVIDIA_AGENT_MODEL` as repository Actions secrets for autonomous runs.
