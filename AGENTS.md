# MegaPLAN — instructions for the next agent

## Source of truth
Repository: `ziyadshafeek/MegaPLAN`
Branch for this session: `arena/01a0dd3c-megaplan` (do not switch branches or push to main). Production is `main` via Vercel after PR merge.

Read before editing:

1. `docs/ARCHITECTURE.md` — how the desk, wiki, and APIs fit together
2. `docs/CHANGELOG.md` — what changed in the MegaPLAN rebuild
3. `MASTER_CONTEXT.md` — product rules that still apply
4. This file

## What this product is
MegaPLAN is **not** a clone of freetoolforge.org. The customer UI is a **desktop file manager** (folders + browser chrome) on large screens and **Android Files** on phones.

Pinned apps on the home screen:

- **Wiki Agent** — hosted page builder (`/agent/`, `/api/agent-plan`) — Codex-style chat + live browser + Deploy
- **Self Agent** — BYOK OpenAI-compatible builder (key is session-only and sent directly to the chosen provider)
- **AI Mode** — combine tools, upload files + complex request, 4-digit session code for private tools, future paid (free now) — `/tools/ai-mode`, `public/js/ai-mode.js`
- **Audio Studio** — Audacity-like multi-track DAW, waveform, MP3/WAV, autosave — `/tools/audio-studio`, `public/js/audio-studio.js`
- **My Wiki** — pages saved on this device + published pages

Other frontier tools:
- **YouTube Transcript** — any video with captions, SRT/VTT/text, AI summarize — `/api/youtube-transcript`, `public/js/youtube-tools.js`
- **YouTube Playlist Lister** — public playlist → video list, CSV/TXT export — `/api/youtube-playlist`
- **Agentic PDF Splitter** — AI reads PDF, splits into chapters/questions/batches, generates prompts for Gemini 1M / NotebookLM — `public/js/agentic-pdf.js`
- **Question Paper to Notes AI** — scanned question paper + textbook → OCR → notes per question/batch

## Hard rules
- **Never** show a local-model shelf, Hugging Face repos, “downloading TrOCR”, cache-clear for models, or provider names (NVIDIA, DeepSeek, etc.) on customer pages.
- **Never** put `NVIDIA_API_KEY` or `NVIDIA_AGENT_MODEL` in `public/`.
- `lib/nvidia.js` is the only place that reads those env vars for chat.
- Those env vars’ **source of truth is GitHub Actions secrets**. Vercel does not inherit them. Instant website AI needs the sync workflow (`.github/workflows/sync-ai-env.yml`) or a manual Vercel copy.
- Do not label a tool live if its runner is a fake. Prefer an honest limited engine (e.g. noise gate, public YouTube thumbnail URL) over a pretend download.
- YouTube/SlideShare **downloaders must not** fetch private media or bypass platform controls. Keep the rights notice.
- Ads: tasteful slots only, no fake AdSense IDs.
- Public OSINT only. `lib/api/inspect.js` blocks localhost and private IPs.

## Brand
- Public name: **MegaPLAN**
- Old name FreeToolForge / “Agent Online Store” must not appear in customer UI.
- Output filenames use `megaplan-*.pdf` etc.

## Layout of code
```
public/index.html          OS shell
public/styles.css          desktop + Android Files (improved mobile: touch ≥40px, 16px inputs, responsive grids)
public/app.js              router, tabs, folders, home apps (now pins AI Mode + Audio Studio)
public/js/kit.js           shared helpers (no model names)
public/js/engines.js       text/calc/dev dispatch
public/js/engines-rest.js  image/audio/video/ai/business/… + Audio Studio + YouTube + AI Mode + Agentic PDF
public/js/pdf-engine.js    PDF studio (thumbs, n-up, booklet, fill, OCR via tesseract.js)
public/js/pdf-ops.js       PDF algorithms used by the studio
public/js/audio-studio.js  Audacity-like multi-track DAW (waveform, mix, MP3 via lamejs, IndexedDB autosave)
public/js/youtube-tools.js YouTube Transcript (timedtext + Piped fallback), Playlist Lister, Chapter Generator
public/js/ai-mode.js       AI Mode — combine tools, 4-digit session, private tools, prompts for Gemini 1M / NotebookLM
public/js/agentic-pdf.js   Agentic PDF Splitter + Question Paper to Notes (OCR, detect Qs/chapters, batch, prompt gen)
public/agent/              Wiki Agent (Codex-style) + Self Agent
lib/nvidia.js          server-only provider client (defaults to deepseek-v4.1-flash)
lib/api/ai.js                  writing assistant (identity hidden)
lib/api/agent-*.js             wiki plan/publish/dispatch/status/health
lib/api/youtube-transcript.js  YouTube captions fetcher (YouTube timedtext + Piped/Invidious fallback, SRT/VTT/JSON)
lib/api/youtube-playlist.js    Playlist extractor (Piped + Invidious + YouTube scrape, CSV/TXT export)
lib/api/inspect.js             public URL/DNS/TLS/robots
scripts/dev-server.mjs     local static + API
data/tools.json            canonical 585-tool registry (some tools are beta)
public/data/               deployed copy of JSON
changes.patch              original 13-file Codex patch (737 lines, verified)
```

## How to add a tool
1. Add/update the row in `data/tools.json` (and copy to `public/data/tools.json`).
2. Register a runner in `public/js/engines.js` or `engines-rest.js` (or `pdf-engine.js`).
3. Keep customer copy ordinary. No model names.
4. Run `npm test`.

## How Wiki Agent works
Codex-style split: chat on the left, live browser window on the right, Deploy in the chrome.
1. User prompt.
2. Probe for “what model are you?” → refusal.
3. Hosted: `POST /api/agent-plan` → NVIDIA NIM. Default model `deepseek-ai/deepseek-v4.1-flash` if `NVIDIA_AGENT_MODEL` is unset. **Only `NVIDIA_API_KEY` is required, and it must be on Vercel** — GitHub Actions secrets are not visible to the website.
4. Self Agent: browser calls the user’s `/v1/chat/completions`.
5. Constrained JSON schema (blocks + optional `api` expression). Prefer a working calculator/API when asked.
6. Sandboxed iframe preview + declarative tests; use Local outline if hosted writing is unconfigured (not AI-written).
7. Validated pages save to `localStorage` (`mp-wiki-pages`) after preview checks pass; Self Agent key is kept in `sessionStorage`.
8. Deploy: `POST /api/agent-publish` requires `GITHUB_TOKEN` and `AGENT_WRITE_TOKEN` on Vercel, plus an operator-supplied write token (kept in tab memory only). Otherwise stay on-device.

## Data ingestion
Visitor devices do not run automatic scraping. The public directory endpoints are read-only on Vercel; scheduled GitHub jobs attempt verified upstream indexing and only commit data on success. The initial snapshots are empty because synthetic seeds were removed. Manual map scans remain local to IndexedDB. Never re-enable public filesystem POST writes.

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
