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

## 2026-09-26 — Frontier: AI Mode + YouTube Transcript + Agentic PDF + 562 tools
- **YouTube Transcript** (`api/youtube-transcript.js` + `public/js/youtube-tools.js`):
  - Fetches captions for any video that has them (manual or auto-generated) via YouTube timedtext API + Piped/Invidious fallback, no API key.
  - Extracts video ID from any URL form, tries captionTracks from watch page, then direct timedtext endpoints (`fmt=json3`, XML), then Piped.
  - Returns segments with start/duration/text, full text, SRT/VTT export, source tracking.
  - Frontend: URL + lang + format selector, copy/download, AI summarize via `/api/ai`, clickable timestamp segments.
  - Based on GitHub: `PlayZone30/youtube-transcript-api-js`, `vishnumishra/ai-youtube-transcript`, `pawanhirumina/yt-transcript-yoinker` (15KB extension logic).
- **YouTube Playlist Lister** (`api/youtube-playlist.js`):
  - Extracts video list from public playlist via Piped API (`pipedapi.kavin.rocks`), Invidious (`yewtu.be/api/v1/playlists`), and YouTube scrape (`ytInitialData`).
  - Returns title, uploader, thumbnails, durations, views, export URLs/titles/CSV.
  - Frontend: extract, copy all URLs/titles, download CSV/TXT, per-video copy/open.
  - Based on GitHub: `curiousbud/YouTube-Playlist-videos-link-Extractor` (MERN, Next.js 14, Excel/CSV/PDF), `juanakira/playlist-extractor` (Piped + AllOrigins CORS proxy).
- **YouTube Chapter Generator**: Generates chapters from transcript timestamps (YouTube style `0:00 - Title`, Markdown, SRT). Interval-based or AI summarization.
- **AI Mode — Combine Tools** (`public/js/ai-mode.js`):
  - Pinned app on home screen, future paid (free now). Complex workflow: upload files + YouTube URLs + complex request, AI chains tools.
  - 4-digit session code (`mp-ai-mode-session`) to remember private tools. `gen4Digit()` 1000-9000, stored in localStorage.
  - File drop + YouTube URL add, prompt with mode (auto/batch/per) and target (Gemini 1M / NotebookLM / local) + API key checkbox.
  - Chat interface: user bubbles, agent bubbles, tool bubbles (monospace). History in `mp-ai-mode-history`.
  - When user gives files + request like "question paper + textbook → notes", AI:
    1. Fetches YouTube transcripts if URLs
    2. Detects scanned PDFs → OCR via tesseract.js
    3. Asks clarifying Qs: API key? batch vs per? recommends Google AI Studio free Gemini 2.0 Flash 1M context or NotebookLM
    4. Calls `/api/ai` to plan tool chain (OCR → agentic split → prompt gen)
    5. Generates prompts for Gemini 1M and NotebookLM (copy/download)
    6. Detects deficit → proposes building private tool via Wiki Agent (`/api/agent-plan`) under session code, private until Push for review.
  - Private tools stored in `mp-private-tools-{code}`, review queue in `mp-review-queue-{code}`. Export private, Push for public review (rigorous testing).
  - Initial greet explains 560+ tools, 4-digit code, future paid.
- **Agentic PDF Splitter + Question Paper to Notes** (`public/js/agentic-pdf.js`):
  - Upload PDFs (question paper scanned OK + textbook/source). Auto OCR checkbox via tesseract.js.
  - Uses pdf-lib for page count, pdf.js (cdn) for text extraction (first 20 pages), falls back to OCR note.
  - Heuristics: `detectQuestions()` regex for `1.`, `Q1`, `Question 1`, etc. `detectChapters()` for Chapter/Unit/Section.
  - AI intelligent split: calls `/api/ai` with combined text to get JSON `{type, items: [{title, summary}]}` like Codex browser agent.
  - Batch modes: per question/chapter, batch of 5/10, all at once (Gemini 1M). Pages per batch input.
  - Generates prompts:
    - Gemini 1M: includes source + questions + instruction "Answer based on textbook, cite page", recommends free tier, includes batches.
    - NotebookLM: questions + "Answer using textbook as source", per-question better.
  - Split & Download PDFs: uses pdf-lib `copyPages` to split first PDF into batches by pages (first 5 batches).
  - Download prompts, questions, etc.
  - Question Paper to Notes reuses same but Q&A focused.
  - Implements idea: "backend let ai use python agent as codex would split — search for open codex browser like code GitHub" → we use JS + /api/ai as codex-like splitter.
- **Tool registry**: Now 562 tools (was 555 → 556 → 562). Improved 466 vague descriptions (e.g., "Merge PDFs — edit or convert…" → specific browser implementation). All handlers exist (0 missing).
- **Pinned apps**: Updated `public/app.js` APPS to include AI Mode and Audio Studio as first-class pinned apps. `appSvg` colors: ai-mode `#7a4bb5`, audio-studio `#c45c26`.
- **Vercel**: Added `youtube-transcript` and `youtube-playlist` to `functions` maxDuration 30s.
- **Tests**: Updated `smoke.mjs` to check new files syntax, `agent-static.mjs` to check AI Mode + Audio Studio pinned, `pdf-engine-coverage.mjs` to check allPdf (pdf-engine + ops + rest + agentic).
- **Production ready**: All files pass `node --check`, `npm test` passes (562 tools, 54 PDF tools). Mobile polish from previous commit retained. No model names in customer UI. Honest limits kept (YouTube downloader still refuses bypass, but transcript uses public captions only).

## Deploy notes
Vercel project homepage: `https://mega-plan.vercel.app`. **NVIDIA secrets were added in GitHub, not Vercel.** Instant `/api/ai` on the website stays 503 until `scripts/sync-github-ai-to-vercel.mjs` copies them (GitHub secret `VERCEL_TOKEN`) or they are pasted in the Vercel dashboard. Wiki Agent Build falls through to the GitHub runner when the website has no copy. This sandbox cannot list GitHub Actions secrets (403).
