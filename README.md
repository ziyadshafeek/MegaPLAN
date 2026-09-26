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

**Hosted writing key lives in GitHub Actions secrets** (`NVIDIA_API_KEY`, `NVIDIA_AGENT_MODEL`). Vercel cannot read those. Instant `/api/ai` needs `NVIDIA_API_KEY` on Vercel — add a newly rotated `VERCEL_TOKEN` as a private GitHub Actions secret and run **Sync hosted AI env to Vercel**, or configure the key directly in the Vercel dashboard. `NVIDIA_AGENT_MODEL` is optional. See `VERCEL_AGENT_SETUP.md`.

Optional Vercel env:

- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` and `AGENT_WRITE_TOKEN` for operator-only wiki publish
- `GITHUB_ACTIONS_DISPATCH_TOKEN` plus `AGENT_WRITE_TOKEN` for the operator-only GitHub runner button
- `AGENT_SETUP_TOKEN`, `GITHUB_SECRETS_TOKEN` for `/agent/setup.html`

## Current limitations

New Trivandrum music-place and shop directories use a bounded, attributed OpenStreetMap snapshot. They are **empty until real indexing succeeds**; the music-place directory is not a tracks catalogue. See `docs/ACTIVE-COLLECTION.md` for source, controls and live-collection blockers.


The map, product, and music repository snapshots start **empty**: earlier starter records were synthetic and have been removed. The scheduled indexers must successfully contact their upstream sources and publish verified records before directory searches will return indexed results. Product HTML parsing and Spotify public-token lookups are experimental. The Inception tool requires a separately configured `INCEPTION_API_KEY` and uses the official API only.


The 587-tool registry has mount/routing tests, not 587 full browser interaction tests. A number of tools remain beta (including video conversion). The Wiki Agent has a clearly labelled local outline mode; AI writing still requires a hosted key or Self Agent credentials. Published map/product/music data is a repository snapshot populated by scheduled jobs, not by visitor browsers or by writes to Vercel's filesystem. See `docs/QA-2026-09-26.md` for the current evidence and rollout blockers.

## Continue work

Read `AGENTS.md` and `docs/ARCHITECTURE.md` before editing. The public brand is **MegaPLAN**. Do not resurrect FreeToolForge branding or a local-model shelf on customer pages.
