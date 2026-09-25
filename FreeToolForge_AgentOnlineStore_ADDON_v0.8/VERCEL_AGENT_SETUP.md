# Vercel setup for GitHub Actions agent

Set these Environment Variables in the Vercel Project (Production; Preview if you need previews):

`GITHUB_ACTIONS_DISPATCH_TOKEN` — GitHub token with Actions: write for this repo.
`GITHUB_OWNER=ziyadshafeek`
`GITHUB_REPO=MegaPLAN`
`GITHUB_BRANCH=main`
`GITHUB_AGENT_WORKFLOW=agent-online-store.yml` (optional)
`AGENT_SETUP_TOKEN` — long random setup password used by `/agent/setup.html`.
`GITHUB_SECRETS_TOKEN` — GitHub token with repository Secrets: write and Metadata: read, used only by the protected secret setup endpoint.

Do not add the provider API key to frontend source. Put it into GitHub Actions Secrets as `NVIDIA_API_KEY`.
Store the provider model identifier as `NVIDIA_AGENT_MODEL` in GitHub Actions Secrets so it is not displayed in the product.

After changing Vercel variables, redeploy so the functions receive the new values. Vercel documents Project Settings -> Environment Variables as the place for runtime variables, with environment scoping; sensitive production variables can be stored as write-only values. GitHub pushes to the connected Vercel project can then deploy updated `main` content.
