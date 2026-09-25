# FreeToolForge Agent Instructions

## Source of truth
This repository is the source of truth. The user expects another AI agent to continue development without reconstructing the chat.

Read before editing:
- MASTER_CONTEXT.md
- FREE_TOOLFORGE_HANDOFF.md
- README.md
- extension/README.md
- docs/SLIDE_STYLE_REFERENCE.md
- docs/NOTEBOOKLM_WORKFLOW.md

## Mission
Expand FreeToolForge into a large free-first utility encyclopedia with thousands of real tools, backed by reusable tool templates and registries. Keep the public UI like a normal utility/reference website rather than an AI-product catalog.

## Rules
- Never label a catalogued tool as live.
- Prefer browser-local processing for cheap/privacy-sensitive operations.
- Use server processing for heavy jobs when available.
- Do not expose provider API keys in frontend code.
- Model downloads must be explicit and cache-aware.
- Do not promise permanent offline storage.
- Keep ad slots tasteful and transparent.
- No fake AdSense IDs.
- Public OSINT only; no private-account access, credential attacks or access-control bypasses.
- Downloader tools must respect copyright/platform terms and should be framed for content the user has rights to download.
- Run tests after changes. State what was actually tested.
- Do not replace working architecture just to change frameworks.

## StudyBridge
The extension is `extension/` and is a Manifest V3 side panel.
Core flows:
- current YouTube context
- YouTube transcript panel capture when available
- NotebookLM handoff: copy public YouTube URL + open NotebookLM
- AI Studio handoff: copy prompt + open AI Studio for manual video upload
- visible playlist/channel/search URL collection
- PDF -> N parts server workflow + prompt pack
- background OCR via FreeToolForge processing service

Google NotebookLM's public YouTube source flow imports transcript text from public videos with captions; the extension does not try to automate Google's UI.

## Test commands
Node syntax checks:
- `node --check extension/service-worker.js`
- `node --check extension/youtube-content.js`
- `node --check extension/sidepanel.js`
- `node --check site/api/split-pdf.js`

Extension smoke tests:
- `node extension/tests-extension-smoke.mjs`
- `node extension/tests-sidepanel-mock.mjs`

The development environment used by the previous agent could not launch Chromium due sandbox policy, so a true browser interaction run remains an external verification step.
