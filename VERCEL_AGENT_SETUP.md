# Hosted writing assistant — secrets

**Source of truth is GitHub Actions secrets, not Vercel.**

Vercel serverless functions (`/api/ai`, `/api/agent-plan`) cannot read GitHub secrets. If the key only lives in GitHub, instant Build on the website is unconfigured until a copy exists on Vercel.

## GitHub Actions secrets (required)

- `NVIDIA_API_KEY`
- `NVIDIA_AGENT_MODEL` — optional. Defaults to `deepseek-ai/deepseek-v4.1-flash`. Never return this value to the browser.

These power:

- `.github/workflows/agent-online-store.yml` (Wiki Agent autonomous runner)
- `.github/workflows/sync-ai-env.yml` (copy onto Vercel)

`/agent/setup.html` writes those two names into GitHub (operator page).

## Copy onto Vercel (for instant website Build)

Add **one more** GitHub Actions secret:

- `VERCEL_TOKEN` — a Vercel token that can write project env

Optional GitHub secrets:

- `VERCEL_PROJECT_ID`
- `VERCEL_ORG_ID` or `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_NAME` (default `mega-plan`)
- `VERCEL_DEPLOY_HOOK_URL`

Then run the workflow **Sync hosted AI env to Vercel**. It upserts the two hosted writing vars as encrypted Vercel env (production + preview + development) and never prints them.

Until that copy exists:

- Instant `/api/ai` and `/api/agent-plan` return 503
- Wiki Agent **Build** falls through to **Run autonomously** when the GitHub runner is connected
- **Self Agent** still works (browser-only key)

## Other Vercel env (optional product features)

Wiki publish:

- `GITHUB_TOKEN`
- `AGENT_WRITE_TOKEN` — high-entropy operator-only write authorization; required for publish and autonomous queue. Enter in the agent operator panel for that tab only. Never share it with visitors.
- `GITHUB_OWNER=ziyadshafeek`
- `GITHUB_REPO=MegaPLAN`
- `GITHUB_BRANCH=main`

Autonomous button on the website:

- `GITHUB_ACTIONS_DISPATCH_TOKEN`
- `GITHUB_AGENT_WORKFLOW=agent-online-store.yml` (optional)
- `AGENT_SETUP_TOKEN`
- `GITHUB_SECRETS_TOKEN`

Customers can skip all of this and use **Self Agent**.

Never put provider keys or model ids in `public/`.
