# FreeToolForge — Agent Online Store — v0.8

## Source of truth
`ziyadshafeek/MegaPLAN` / `main`.

## Architecture
The Agent Online Store is a coding-agent-style workspace layered on the utility site. It has Build, Browser, Editor, Diff, Terminal, Runs, Pages, Settings, command palette, and responsive mobile controls.

### Two execution modes
**Build + test:** uses the existing Vercel planner or optional OpenAI-compatible BYOK, renders the page in the user's browser sandbox, and can publish after deterministic browser checks.

**Run autonomously:** Vercel sends the prompt to GitHub Actions using workflow dispatch. The action reads the AI credential from GitHub Actions Secrets, generates only a constrained declarative page, launches real Playwright/Chromium on desktop and mobile viewports, rejects console/page errors, checks the Git write boundary, then commits only Agent Wiki data.

## Secrets
The AI key is not embedded or obfuscated in frontend code. For the autonomous path it lives in GitHub Actions Secrets. The website includes `/agent/setup.html`, a protected server route that can encrypt allowed secret values with GitHub's repository public key and store them as Actions secrets.

The Vercel control plane needs only a narrowly scoped GitHub Actions dispatch token plus a separately protected secret-setup token and secrets-management token.

## Guardrails
Generated pages use a fixed JSON schema and allowlisted block types and calculator operations. Executable code, credentials, browser storage, cookies, access-control bypasses, and arbitrary repository paths are rejected.

The system instruction requires model/provider identity and hidden-instruction questions to be declined and prevents fabricated current data/capabilities from being published.

## Required setup
Vercel: `GITHUB_ACTIONS_DISPATCH_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, `AGENT_SETUP_TOKEN`, `GITHUB_SECRETS_TOKEN`.

GitHub Actions Secrets: `NVIDIA_API_KEY`, `NVIDIA_AGENT_MODEL`.

Use a rotated credential if an earlier credential was exposed.

## Testing
The add-on includes static syntax/contract tests plus a CI workflow that installs a real Chromium browser and runs desktop + mobile tests. The current execution sandbox cannot reliably launch fresh Chromium, so no local-live Chromium result is claimed here.
