# MegaPLAN — instructions for the next agent

## Source of truth
Repository: `ziyadshafeek/MegaPLAN`
Branch for this session: whatever the user is on (Arena uses a working branch; production is `main` via Vercel).

Read before editing:

1. `docs/ARCHITECTURE.md` — how the desk, wiki, and APIs fit together
2. `docs/CHANGELOG.md` — what changed in the MegaPLAN rebuild
3. `MASTER_CONTEXT.md` — product rules that still apply
4. This file

## What this product is
MegaPLAN is **not** a clone of freetoolforge.org. The customer UI is a **desktop file manager** (folders + browser chrome) on large screens and **Android Files** on phones.

Pinned apps on the home screen:

- **Wiki Agent** — hosted page builder (`/agent/`, `/api/agent-plan`)
- **Self Agent** — BYOK OpenAI-compatible builder (keys stay in `localStorage`)
- **My Wiki** — pages saved on this device + published pages

## Hard rules
- **Never** show a local-model shelf, Hugging Face repos, “downloading TrOCR”, cache-clear for models, or provider names (NVIDIA, DeepSeek, etc.) on customer pages.
- **Never** put `NVIDIA_API_KEY` or `NVIDIA_AGENT_MODEL` in `public/`.
- `api/lib/nvidia.js` is the only place that reads those env vars for chat.
- Those env vars’ **source of truth is GitHub Actions secrets**. Vercel does not inherit them. Instant website AI needs the sync workflow (`.github/workflows/sync-ai-env.yml`) or a manual Vercel copy.
- Do not label a tool live if its runner is a fake. Prefer an honest limited engine (e.g. noise gate, public YouTube thumbnail URL) over a pretend download.
- YouTube/SlideShare **downloaders must not** fetch private media or bypass platform controls. Keep the rights notice.
- Ads: tasteful slots only, no fake AdSense IDs.
- Public OSINT only. `api/inspect.js` blocks localhost and private IPs.

## Brand
- Public name: **MegaPLAN**
- Old name FreeToolForge / “Agent Online Store” must not appear in customer UI.
- Output filenames use `megaplan-*.pdf` etc.

## Layout of code
```
public/index.html          OS shell
public/styles.css          desktop + Android Files
public/app.js              router, tabs, folders, home apps
public/js/kit.js           shared helpers (no model names)
public/js/engines.js       text/calc/dev dispatch
public/js/engines-rest.js  image/audio/video/ai/business/…
public/js/pdf-engine.js    PDF studio (thumbs, n-up, booklet, fill, OCR)
public/js/pdf-ops.js       PDF algorithms used by the studio
public/agent/              Wiki Agent + Self Agent
api/lib/nvidia.js          server-only provider client
api/ai.js                  writing assistant (identity hidden)
api/agent-*.js             wiki plan/publish/dispatch
api/inspect.js             public URL/DNS/TLS/robots
scripts/dev-server.mjs     local static + API
data/tools.json            canonical 555-tool registry
public/data/               deployed copy of JSON
```

## How to add a tool
1. Add/update the row in `data/tools.json` (and copy to `public/data/tools.json`).
2. Register a runner in `public/js/engines.js` or `engines-rest.js` (or `pdf-engine.js`).
3. Keep customer copy ordinary. No model names.
4. Run `npm test`.

## How Wiki Agent works
1. User prompt.
2. Probe for “what model are you?” → refusal.
3. Hosted: `POST /api/agent-plan` → NVIDIA NIM using env model id.
4. Self Agent: browser calls the user’s `/v1/chat/completions`.
5. Constrained JSON schema (blocks + optional `api` expression).
6. Sandboxed iframe preview + declarative tests.
7. Always saved to `localStorage` (`mp-wiki-pages`).
8. Optional publish via GitHub git API to `data/agent-pages/*` only.

## Tests
```
npm test
python3 scripts/validate_registry.py
```

Do not claim Chromium E2E if the sandbox cannot launch a browser.

## Do not
- Replace the file-desk UI with a freetoolforge-style marketing card grid.
- Hide Wiki Agent / Self Agent off the home screen.
- Log or return `NVIDIA_AGENT_MODEL` from `/api/agent-health` or `/api/ai`.
