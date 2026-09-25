# MegaPLAN architecture (2026-09-26 rebuild)

## Why this exists
The previous MegaPLAN/FreeToolForge tree was a stack of ZIP add-ons. The home page was a card catalog, Wiki Agent was not on the home screen, most “live” tools were not wired in `public/app.js`, and a **local model shelf** was shown to customers.

This rebuild keeps the 555-tool registry and the serverless agent APIs, and replaces the customer product.

## Surfaces
| Surface | Who sees it | Notes |
|---|---|---|
| Desktop desk | viewport ≥ 841px | Fake browser chrome, tabs, address bar, sidebar folders |
| Android Files | viewport ≤ 840px | Status bar, search, pin tiles, 4-column folders, bottom nav |
| Wiki Agent | everyone | Hosted planner |
| Self Agent | everyone | BYOK, browser-only secrets |
| `/agent/setup.html` | operators | Writes GitHub Actions secrets |

## Data flow
```
Browser (public/) ──POST /api/ai──────────► api/lib/nvidia.js ──► NVIDIA NIM
                 ──POST /api/agent-plan──► same helper
                 ──POST /api/inspect─────► public HTTP/DNS/TLS
                 ──POST /api/agent-publish► GitHub git API (wiki JSON only)
Self Agent ──────► user /v1/chat/completions (no MegaPLAN server)
```

Vercel: `public/` is the static root. `api/*.js` are Node serverless functions except `api/split-pdf.js` (Web `POST` handler for StudyBridge).

## Identity hiding
`api/lib/nvidia.js` reads `NVIDIA_API_KEY` + `NVIDIA_AGENT_MODEL`. Responses to the browser are `{ text }` or `{ spec }`. Health returns `aiConfigured: boolean` only.

Customer copy may say “writing assistant”. It must not say DeepSeek, NVIDIA, TrOCR, Transformers.js, or similar.

## Tool engines
`public/app.js` opens a folder or file, then calls `mountTool` from `public/js/engines.js`.

`engines-rest.js` mutates the shared `HANDLERS` map (imported after `engines.js` in `app.js` — do not reverse that order).

PDF tools go through `pdf-engine.js` (pdf-lib + pdf.js from a public CDN).

OCR image tools use tesseract.js quietly (“Read text”), never “download model”.

## Wiki schema
Allowed blocks: `hero, text, markdown, list, table, note, tool-link, calculator, faq, api`.

`api` blocks are numeric only: `expression` matching `^[0-9a-zA-Z_+\-*/().\s]+$`.

Publishable git paths remain:

- `data/agent-pages/<slug>.json`
- `data/agent-pages.json`
- mirrored `public/data/agent-pages*`

## Local wiki
`localStorage`:

- `mp-wiki-pages` — index
- `mp-wiki-<slug>` — full spec
- `mp-byok-url` / `mp-byok-model` / `mp-byok-key`
- `mp-recents`, `mp-view`

Wiki works without GitHub. Publish is optional.

## StudyBridge
`extension/` is unchanged in purpose. PDF split remains `api/split-pdf.js`.
