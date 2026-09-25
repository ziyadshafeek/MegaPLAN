# FreeToolForge Handoff

## Current milestone: v0.3
The project is a static-first utility encyclopedia with a 555-tool registry and reusable tool-page shell.

### Verified live engines in this milestone
- Text: counters, case/whitespace cleanup, line transforms, JSON, Base64, URL encoding, UUID, SHA-256, statistics.
- Calculators: percentage, discount, tip, BMI, GST, markup, margin, profit, break-even.
- PDF: merge, split-by-pages, rotate, reorder, extract, delete, text-to-PDF.
- Images: browser resize/JPEG export shell.
- Audio: browser metadata inspection shell.

Everything else must remain explicitly catalogued until a real engine is implemented and tested.

## Architecture
- `public/` = deployed static site and browser tools.
- `data/tools.json` = canonical tool registry used to render the library.
- `extension/` = StudyBridge Manifest V3 extension.
- `backend/`, `api/`, `worker/`, `hf-space/` = heavier processing/integration layers.
- `scripts/` = registry/build validation utilities.

## Important behavior
- `/tools/<slug>` is handled by the same static shell; the router must run after registry load.
- The front-end must not contain provider secrets.
- PDF browser tools dynamically load `pdf-lib` from a public ESM CDN. A future production hardening pass can vendor/bundle this dependency if desired.
- Do not claim that browser-side PDF save is compression; structural rewrite and true stream/image recompression are different tasks.

## Next milestones
1. Add a bundled PDF worker so core PDF tools do not depend on a CDN at runtime.
2. Add real OCR with a server fallback and progress reporting.
3. Add object-storage + worker flow for files larger than serverless request limits.
4. Add directory ingestion schema + refresh jobs for public business listings.
5. Add per-tool privacy, input-size, retention and processing badges.

## Current continuation state — 2026-09-25

The PDF engine has been expanded to 40 live browser/hybrid tools. See `TEST_REPORT.md` and `tests/pdf-engine-coverage.mjs` for the current coverage. Complex conversion tools remain catalogued until a suitable backend/engine is attached.
