# MegaPLAN

A file-desk of free tools, a wiki you can write, and an agent you can run yourself.

This repository used to ship as “FreeToolForge”. That name collided with the existing [freetoolforge.org](https://freetoolforge.org/) product, and the old site looked like a generic tool-card catalog. MegaPLAN is a different product:

- **Desktop:** a browser-chrome window with folders (PDF, Images, Design, …).
- **Phone:** an Android Files-style home grid.
- **Wiki Agent** and **Self Agent** sit on the home screen, not buried in a nav link.
- Customers never see a “local model shelf”, Hugging Face repo list, or provider/model names.

## Run locally

```bash
npm start
```

Open http://127.0.0.1:4173

Or, static-only (no `/api/*`):

```bash
python -m http.server 8080 --directory public
```

## Validate

```bash
npm test
python3 scripts/validate_registry.py
```

## Deploy

Vercel serves `public/` as the website and `api/` as serverless functions.

**Hosted writing key lives in GitHub Actions secrets** (`NVIDIA_API_KEY`, `NVIDIA_AGENT_MODEL`). Vercel cannot read those. Instant `/api/ai` needs a copy on Vercel — add GitHub secret `VERCEL_TOKEN` and run **Sync hosted AI env to Vercel**, or paste the same two names in the Vercel dashboard. See `VERCEL_AGENT_SETUP.md`.

Optional Vercel env:

- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` for wiki publish
- `GITHUB_ACTIONS_DISPATCH_TOKEN` for the website’s Run autonomously button
- `AGENT_SETUP_TOKEN`, `GITHUB_SECRETS_TOKEN` for `/agent/setup.html`

## Continue work

Read `AGENTS.md` and `docs/ARCHITECTURE.md` before editing. The public brand is **MegaPLAN**. Do not resurrect FreeToolForge branding or a local-model shelf on customer pages.
