# FreeToolForge — Continuation Context

Mission: build a massive free-first tool encyclopedia: useful utilities first, ordinary productivity branding, ads as primary monetization, optional paid/AI infrastructure, and agentically maintained public local-business directory.

## Source of truth
GitHub repository: `ziyadshafeek/MegaPLAN` (public, user-owned, empty at project start).
Current deployment prototypes are not the source of truth. Future AI agents should pull this repository and work from it.

## Current repo structure
- public/index.html — shell and semantic layout
- public/styles.css — design system
- public/app.js — catalog/search/routing and initial live tool engines
- data/tools.json — 555 tool registry entries
- backend/app.py — optional FastAPI public-data utilities
- worker/index.js + wrangler.toml — optional Cloudflare lightweight adapter
- hf-space/app.py + README.md — optional Hugging Face AI worker shell
- scripts/generate_registry.py — registry generator
- scripts/validate_registry.py — registry validation
- tests/smoke.mjs — structural test

## Product direction
Never collapse this into one niche tool. Expand into a library of hundreds/thousands of useful utilities across PDF, image, audio, video, OCR/AI, text, developer, calculators, business, education, India, privacy/security, OSINT/public data, files/data, productivity, design/web, finance, media/downloads, health/medical and miscellaneous.

## Quality gate
A tool can be `live`, `beta`, or `catalogued`. Published pages must not masquerade as implemented. Do not use thin mass-generated SEO pages.

## Ad model
Every tool page gets tasteful ad slots. Use real AdSense only after publisher approval and insert the exact publisher code supplied by Google. No fabricated publisher IDs, no fake download buttons, no ad-click inducement.

## Compute architecture
- Browser/local for lightweight transforms, privacy-sensitive tasks, and models that work well in Transformers.js/ONNX.
- Cloudflare Workers Free is suitable for edge routing/caching/light public metadata, but its current free CPU limit is 10ms/request, so it is not a heavy media/ML compute layer.
- Hugging Face ZeroGPU can provide free on-demand GPU for up to 2 Spaces on qualifying personal free accounts, with current free quota of 5 min/day; use as a best-effort heavy AI backend, not a guaranteed SLA.
- Large model caches should use explicit opt-in download, progress, cache status, clear-cache, and automatic cleanup after 30 days of inactivity. Browser eviction is outside app control.

## Model shelf
Current HF research:
- GLM-OCR — complex document OCR/table/formula extraction.
- TrOCR Small Printed / Handwritten — browser-friendly OCR candidates.
- Nougat Small ONNX — scientific document extraction.
- Kokoro 82M ONNX — browser TTS candidate.
- Whisper Tiny EN ONNX — browser ASR candidate.
- Clear — speech enhancement/denoise; verify commercial license before shipping.
Always re-check model card, license, hardware requirements, and download size immediately before integrating.

## OSINT boundary
Public, lawful information only. Safe tools include URL metadata, DNS, TLS, HTTP headers, redirects, robots/sitemap, public profile URL checks, public social link extraction, EXIF and hashes. No private account access, credential attacks, bypasses, hidden data extraction, or stalking workflows.

## Current capability status (2026-09-25)
- Registry remains 555 tools. After the capability-status sync, 180 are explicitly marked `live`: 53 PDF, 36 Developer, 36 Calculators, 28 Text, and 27 Images.
- New image browser engines cover compression/resizing/cropping/rotation/flipping, common format conversion, image analysis, blur/pixelation, watermark/border/padding, thumbnails, transparent-PNG conversion, and print/DPI helpers.
- The runtime `live` set is authoritative for status. `scripts/sync_live_status.py` mirrors that set into both `data/tools.json` and `public/tools-registry.json`.

## Browser regression testing
- Canonical runner: `python tests/browser-e2e.py`.
- It uses real Chromium + Playwright with the production page/source assembled in memory because this execution environment blocks browser navigation to local/remote URLs.
- It exercises UI behavior and representative engines, mounts every live tool, captures desktop/mobile screenshots, and fails on page/console errors.
- Full CDN-backed PDF execution is not claimed by the browser harness in this environment; PDF functionality is covered by static implementation audits plus browser UI/capability checks.

## Directory
Trivandrum directory must be agent-driven: discover -> fetch public source -> normalize -> dedupe -> confidence -> publish -> refresh -> stale marking. Categories should cover the broad local economy.

## Media/downloader boundary
Only support downloads the user is authorized to make and comply with platform/copyright terms. Show a rights notice. Do not build DRM circumvention, login bypass, private media extraction, or other access-control bypasses.

## StudyBridge extension addition (2026-09-25)
User-specific workflow based on uploaded example slides: long-source -> numbered PDF sections -> one PPTX per section -> merge -> compress. Extension provides a simple side panel rather than an AI-branded experience.

Features implemented in extension/:
- YouTube side panel
- NotebookLM handoff
- AI Studio handoff
- prompt shortcuts for summary / complete lecture notes / granular line-by-line notes / MCQ generation
- YouTube transcript panel capture when available
- batch visible YouTube link collector
- PDF section splitting via server endpoint with per-part prompts and MANIFEST.json
- background OCR via FreeToolForge server

The PDF splitter is `site/api/split-pdf.js` and uses `pdf-lib` + `jszip` at deployment time, so model/library weights are not put on the user's device.
