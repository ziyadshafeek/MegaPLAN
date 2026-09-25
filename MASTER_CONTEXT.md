# MegaPLAN — continuation context

Mission: a large free-first utility **desk** (not a marketing clone of freetoolforge.org): hundreds of real tools in folders, ads as optional monetization later, Wiki Agent for pages the user writes, Self Agent for BYOK.

## Source of truth
GitHub: `ziyadshafeek/MegaPLAN`
Public brand: **MegaPLAN**
Do not ship customer UI under the FreeToolForge name.

## Current tree (after 2026-09-26 rebuild)
- `public/` — deployed static desk (desktop file manager + Android Files)
- `public/js/` — tool engines
- `public/agent/` — Wiki Agent / Self Agent
- `data/tools.json` — 555 tool registry (mirrored to `public/data/tools.json`)
- `api/` — Vercel functions (`ai`, `inspect`, wiki agent, StudyBridge split-pdf)
- `api/lib/nvidia.js` — server-only provider client
- `extension/` — StudyBridge Manifest V3
- `scripts/dev-server.mjs` — local preview with APIs

## Quality gate
A tool in the registry should have a runner. If the real job cannot be done in-browser (DRM media, full video transcode, WHOIS), the runner must say so — never pretend.

## Compute
- Browser for PDF/image/text/calc/csv/audio-gate.
- `/api/ai` + `/api/agent-plan` for writing/wiki (env key, hidden identity).
- NVIDIA key/model live in **GitHub Actions secrets**. Vercel does not inherit them; sync with `scripts/sync-github-ai-to-vercel.mjs`.
- Self Agent never sends the user’s key to MegaPLAN.
- No customer-facing model downloads.

## OSINT boundary
Public, lawful information only. `api/inspect.js` rejects localhost and RFC1918. No credential attacks, no private-account access.

## Directory
Trivandrum public-directory ingest is **not** on the customer home in this build. Keep it as a future worker; do not show a search box that queues nothing.

## StudyBridge
See `extension/README.md`. PDF splitter: `api/split-pdf.js`.
