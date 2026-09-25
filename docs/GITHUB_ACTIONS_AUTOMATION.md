# GitHub Actions automation

Vercel is the interactive control plane; GitHub Actions is the autonomous execution plane.

Vercel -> workflow_dispatch -> GitHub Actions -> provider call using Actions Secrets -> constrained page write -> Playwright Chromium desktop/mobile gate -> Git path guard -> one commit to main -> Vercel Git deployment.

GitHub's REST API supports `workflow_dispatch`; fine-grained tokens need Actions: write to trigger it. Repository Actions secrets are written through GitHub's encrypted-secrets API using the repository public key.

Vercel variables:
- `GITHUB_ACTIONS_DISPATCH_TOKEN`
- `GITHUB_OWNER=ziyadshafeek`
- `GITHUB_REPO=MegaPLAN`
- `GITHUB_BRANCH=main`
- optional `GITHUB_AGENT_WORKFLOW=agent-online-store.yml`
- `AGENT_SETUP_TOKEN`
- `GITHUB_SECRETS_TOKEN`

GitHub Actions secrets:
- `NVIDIA_API_KEY`
- `NVIDIA_AGENT_MODEL`

The autonomous workflow has only `contents: write`. The agent step is allowed to change only `data/agent-pages/*.json` and `data/agent-pages.json`; any other diff fails the job.
