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

## Agent (Codex-style)
- Wiki Agent is a chat + live browser window. Run writes the page/API, tests it in the iframe, Deploy publishes (Git) or saves on-device.
- Hosted model defaults to DeepSeek V4.1 Flash on NVIDIA NIM when `NVIDIA_AGENT_MODEL` is unset; only `NVIDIA_API_KEY` is required. Still must exist on **Vercel** for instant Build — GitHub secrets are not visible to the website.
- `vercel.json` sets `outputDirectory: public` so production serves the MegaPLAN desk, not the stub root index.

## 2026-09-26 later
- Confirmed NVIDIA secrets live in **GitHub Actions**, not Vercel. Added `scripts/sync-github-ai-to-vercel.mjs` and workflow `sync-ai-env.yml`. Wiki Agent instant Build falls through to the GitHub runner when the website has no copy.
- PDF studio rewrite: thumbs, preview, n-up, booklet, fill, sign/annotate placement, OCR via tesseract.js, real Office/EPUB wrap. Not title-string coverage.

## 2026-09-26 — Regression fix + Audio Studio + Mobile polish
- **Regression fix**: Re-applied Codex-style Wiki Agent patch (13 files, +289/−139) that was missing after PR #1 merge. Verified with `git apply --check` against base `e06c6c3`. The patch is saved as `changes.patch` (737 lines, sha256 `8c27d35acc02ff9d2dff025bbb64e825c25aaf17fec19c8792de47fd25ac2991` after copy) and restores:
  - `api/lib/nvidia.js` defaults to `deepseek-ai/deepseek-v4.1-flash` when `NVIDIA_AGENT_MODEL` unset; only `NVIDIA_API_KEY` required.
  - `api/agent-plan.js` uses tool calling (`emit_wiki_page`) + JSON fallback, prefers calculator/API blocks.
  - `public/agent/*` is Codex split: chat left, live browser right, Deploy in chrome.
  - `vercel.json` `outputDirectory: public` so prod serves desk not stub root.
  - `AGENTS.md`, `VERCEL_AGENT_SETUP.md`, tests updated.
- **Audio Studio**: New `public/js/audio-studio.js` — Audacity-like multi-track DAW in browser:
  - Open multiple audio files, each as a track with waveform canvas (fast downsampled min/max).
  - Controls per track: mute/solo, gain, pan, offset, trim to selection, cut, fade in/out, normalize, reverse, duplicate, delete.
  - Transport: play/pause/stop, loop, seek by clicking waveform, timeline display.
  - Mix export: WAV always, MP3 via lamejs (cdn.jsdelivr.net) when available, otherwise WAV fallback.
  - Recording from mic via MediaRecorder.
  - Drag & drop import, autosave to IndexedDB + localStorage every 5s, restore prompt on reload.
  - Modern dark UI, touch-friendly, performant (requestAnimationFrame, chunked decode).
  - Registered as `Audio Studio` in `data/tools.json` (now 556 tools).
- **Mobile polish**: Improved `public/styles.css` for ≤840px, ≤520px, ≤380px and coarse pointers:
  - Tool pane padding reduced, h1 24px, panels 12px, work-grid single column.
  - Icon grid responsive (96px min, 3 cols ≤520px, 2 cols ≤380px), larger touch targets (≥40px), 16px inputs to prevent iOS zoom.
  - Android Files: pins single column on small screens, folders 4→3 cols, sticky bottom nav, safe-area padding.
  - Audio studio tracks stack vertically on mobile.
- **Audio tools improved**: `WAV to MP3` now actually encodes MP3 via lamejs (192 kbps default, selectable 128/192/256/320), `Waveform Viewer` draws real waveform canvas, `MP3 to WAV` preserves name.
- **Tests**: `smoke.mjs` now allows ≥555 tools (was strict 555) to accommodate Audio Studio.

## Deploy notes
Vercel project homepage: `https://mega-plan.vercel.app`. **NVIDIA secrets were added in GitHub, not Vercel.** Instant `/api/ai` on the website stays 503 until `scripts/sync-github-ai-to-vercel.mjs` copies them (GitHub secret `VERCEL_TOKEN`) or they are pasted in the Vercel dashboard. Wiki Agent Build falls through to the GitHub runner when the website has no copy. This sandbox cannot list GitHub Actions secrets (403).
