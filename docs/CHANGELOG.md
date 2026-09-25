# Changelog — MegaPLAN desk rebuild

Date: 2026-09-26

This file exists so the next agent does not have to reconstruct the chat.

## Product
- Renamed the public brand from **FreeToolForge** to **MegaPLAN** (the GitHub/Vercel identity). “Agent Online Store” is now **Wiki Agent**. BYOK is **Self Agent**.
- Replaced the freetoolforge-style card catalog with:
  - Desktop: browser-chrome window, tabs, address bar, folder sidebar.
  - Mobile: Android Files home (pins, folder grid, bottom nav: Files / Recent / Agent / Self).
- Wiki Agent and Self Agent are pinned on the home screen.
- Removed the customer-facing **local model shelf**, cache card, and Hugging Face links.

## Features completed (previously missing or stubbed)
- SPA routing for `/`, `/folder/:cat`, `/tools/:slug`, `/wiki/:slug`, `/self`, `/agent/`.
- Tool engines for the 555-row registry (honest limits for video re-encode and media downloaders).
- Writing assistant via `POST /api/ai` (server-side NVIDIA NIM; model id never returned).
- Public inspector `POST /api/inspect` (headers, robots, sitemap, redirects, DNS, TLS; private IPs blocked).
- Wiki pages always save locally; GitHub publish remains optional.
- Custom **API** wiki block (safe numeric expression).
- Self Agent: OpenAI-compatible base URL + model + key in this browser only.

## Files added
- `public/js/kit.js`, `engines.js`, `engines-rest.js`, `pdf-engine.js`
- `api/lib/nvidia.js`, `api/ai.js`, `api/inspect.js`
- `scripts/dev-server.mjs`
- `docs/ARCHITECTURE.md`, this changelog

## Files rewritten
- `public/index.html`, `public/styles.css`, `public/app.js`
- `public/agent/*`
- `api/agent-plan.js`, `api/agent-health.js`
- `README.md`, `AGENTS.md`, `vercel.json`, `package.json`, tests

## Intentionally not customer-visible
- NVIDIA / DeepSeek / model ids
- Transformers.js / ONNX / TrOCR / Kokoro / Whisper shelf
- “Loading local models”

## Honest non-features
- YouTube/SlideShare file download is refused (rights).
- Thumbnail helper uses public `img.youtube.com` URLs only.
- Video “compress/merge” explains browser encoder limits.
- Audio “denoise” is a noise gate, not an unnamed magic model.
- Directory (Trivandrum) agentic ingest is still not a live crawler; it was removed from the customer home so it would not look like a broken search box. Re-add under a folder when a worker exists.

## 2026-09-26 later
- Confirmed NVIDIA secrets live in **GitHub Actions**, not Vercel. Added `scripts/sync-github-ai-to-vercel.mjs` and workflow `sync-ai-env.yml`. Wiki Agent instant Build falls through to the GitHub runner when the website has no copy.
- PDF studio rewrite: thumbs, preview, n-up, booklet, fill, sign/annotate placement, OCR via tesseract.js, real Office/EPUB wrap. Not title-string coverage.

## Deploy notes
Vercel project homepage: `https://mega-plan.vercel.app`. **NVIDIA secrets were added in GitHub, not Vercel.** Instant `/api/ai` on the website stays 503 until `scripts/sync-github-ai-to-vercel.mjs` copies them (GitHub secret `VERCEL_TOKEN`) or they are pasted in the Vercel dashboard. Wiki Agent Build falls through to the GitHub runner when the website has no copy. This sandbox cannot list GitHub Actions secrets (403).
