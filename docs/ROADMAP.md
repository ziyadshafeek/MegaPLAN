# Roadmap

## Phase A — Core browser engines
- [x] Text utility family
- [x] Basic calculator family
- [x] PDF merge/split/page operations
- [ ] Real PDF compression
- [ ] PDF rendering / PDF-to-images
- [ ] Image format conversion matrix

## Phase B — Heavy processing
- [ ] Background OCR with progress
- [ ] Audio denoise worker
- [ ] Large-file object storage ingress
- [ ] Expiring outputs and cache cleanup

## Phase C — Directory + growth
- [ ] Public-data directory schema
- [ ] Trivandrum ingestion pipeline
- [ ] Duplicate resolution and stale-record refresh
- [ ] SEO metadata per tool
- [ ] Content/FAQ pages generated from structured tool metadata

## Phase D — StudyBridge
- [x] YouTube context detection
- [x] NotebookLM URL handoff
- [x] AI Studio handoff
- [x] Visible YouTube URL collection
- [ ] Browser-packaged extension release ZIP generated automatically from the repository

---

# AI Mode phases

Full plan, per-tool integration matrix and acceptance criteria:
**[`docs/AI-MODE-PLAN.md`](AI-MODE-PLAN.md)**.

Baseline measured on this branch: 590 tools (547 live / 40 beta / 3
catalogued). AI Mode can run 521 today, can only *open* 66 (all 54 PDF, 6
Games, 2 Maps, 3 studios), and refuses 3. Only **3 of 27** OCR & AI tools
have a real engine — the rest are one shared text box. That is the work.

Each phase is a checkbox; do them in order, `npm test` green at every step.

## Phase 0 — Land the in-flight batch
- [x] Security hardening: `safeUrl`, secret redaction, WinAnsi PDF folding, `X-MegaPLAN-Folded`, DOM-sink suite
- [x] New `tests/ai-mode-hardening.mjs` green
- [x] New `public/js/ai-pdf-ops.js` — 27 PDF operations run on the attached file
- [x] Register the hardening suite in `npm test`
- [x] Wire `pdf-ops` into the planner's PDF branch + tests
- [x] Full `npm test` green (29 suites, exit 0)

## Phase 1 — The tool contract table
- [ ] `tests/ai-mode-tool-contracts.mjs` mounts and runs all 590 tools in jsdom
- [ ] Emit `data/tool-contracts.json` (class, inputs, outputs, needsFile, timing)
- [ ] Four classes: **R** runnable, **P** programmatic, **S** studio/open, **C** catalogued-beta
- [ ] CI fails when a `live` tool has no verified contract

## Phase 2 — Make the dead tools real
- [ ] OCR cluster (9 tools): real tesseract engine, image input, structured receipt/invoice/form/ID JSON
- [ ] Notes/extractors (15 tools): per-task engines instead of one assistant call
- [ ] Business (23 tools): real generators with numbering series and tax maths
- [ ] Video (26, 16 beta): promote only what is genuinely done, keep the rest honest
- [ ] Catalogued 3: keep refused, name the gap, offer transcript retrieval instead

## Phase 3 — PDF depth (54 tools)
- [x] 27 operations runnable from the browser (merge, split, rotate, delete, numbers, watermark, crop, n-up, text, forms, sections…) — `public/js/ai-pdf-ops.js`, 23 behavioural tests
- [x] A matched PDF job **runs** on the attached file instead of only offering to open the studio
- [x] Page ranges read out of the sentence ("delete pages 5 to 9"); alias slugs queue once
- [x] Large-PDF keyword page search (`op: sections`) for the 1000-page ask
- [ ] In-browser OCR so scans become searchable
- [ ] Large-PDF handling: TOC/bookmark detection + keyword page ranking (the 1000-page ask)
- [ ] RAG-lite: section chunking, in-browser BM25, answers only from cited pages
- [ ] The other 27 stay honest studio hand-offs (sign, fill, redact, repair, office↔PDF)

## Phase 4 — Images → OCR → deck
- [ ] Composed chain: images → OCR → facts → outline → real `.pptx`
- [ ] Structured outline path in `lib/presentation-deck.js`
- [ ] Medicine-shaped extraction (drug, strength, dose, frequency, duration) as a labelled table
- [ ] Generalises to any "deck from these images/notes" request

## Phase 5 — Search, news and links
- [ ] `web-search` over licensed/keyless sources (Wikipedia, Europe PMC, Open-Meteo, optional Brave key)
- [ ] `news` from RSS with real timestamps and publisher attribution
- [ ] Copy names only the sources actually used — no pretending to search Bing
- [ ] Works for any topic, not a fixed list

## Phase 6 — Planner universality
- [ ] Operation/object/parameter extraction (page ranges, numbers, units, formats)
- [ ] Multi-tool composition with a real dependency graph
- [ ] Request-coverage suite: every request gets a runnable step or a specific honest refusal
- [ ] A step that didn't run can never be reported as run

## Phase 7 — Codex-like agent parity
- [ ] Audit `public/agent/agent.js` against plan / preview / save / Deploy / BYOK
- [ ] Share one planner between the agent and AI Mode
- [ ] Fix every gap; keys stay session-only, server keys stay server-side
- [ ] Mobile split view

## Phase 8 — Interface, guide, mobile
- [ ] Stay flat and quiet: one accent, no gradients/blur/glow
- [ ] Rewrite the AI Mode guide to match real behaviour
- [ ] Mobile matrix (360 px, keyboard-open, large uploads, no h-scroll)
- [ ] Accessibility: focus order, live regions, AA text, 3:1 borders

## Done when
All 590 tools have a class and a verified contract · no `live` tool without a
real runner · the four named workloads work end to end · no unexplained
request in the coverage suite · still flat, quiet and usable on a phone.
