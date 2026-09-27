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

Baseline measured on this branch by `tests/ai-mode-tool-contracts.mjs` (not
estimated): 590 tools — 547 live, 40 beta, 3 catalogued.

| Class | Count | Meaning |
| --- | --- | --- |
| **R** | 482 | runnable — 319 were *driven* here and produced real output; 163 have a real, wired contract but need a file, a canvas or a service this harness will not fake |
| **N** | 20 | real engine; output comes from a service or a CDN library |
| **S** | 84 | an app or interactive studio (PDF, games, directories, the data-sources page) |
| **C** | 3 | no lawful or finished runner — refused |
| **F** | 1 | needs a real file the harness cannot fabricate |

AI Mode can therefore drive **502** tools and open 84. Category guessing used
to claim 521 and quietly promise 19 apps it could never run.

The audit also found defects no UI test could see: **three tools called a
handler that did not exist** (Random Picker, Random Name Picker and Decision
Wheel were dead on click) and **three were literal identity functions**
(Subtitle Timing Helper, Citation Formatter, Decision Table Maker returned
their input unchanged). All six are implemented now.

The nine OCR tools (`ocr-image-to-text`, `handwriting-ocr`, `receipt-ocr`,
`invoice-ocr`, `table-ocr`, `form-ocr`, `id-document-ocr`,
`document-classifier`, `document-json-extractor`) used to be wired to the
writing assistant, so they could not accept an image at all. They now read the
picture in the browser and parse it — all nine are class R with a file input.

Twelve more tools that shared one assistant call are now deterministic:
key points, action items, citations, entities, abstract, text cleaning,
flashcards, quiz, smart notes, lecture notes, meeting notes and email
summaries. They extract and never invent, and 20 tests hold them to it. Three
tools still use the assistant on purpose — `Text Rewriter`, `Study Guide Maker`
and `Transcript Summarizer` — because rewriting and sequencing genuinely need a
model, and their copy now says so.

What is left in OCR & AI: those three, and Video is 16 of the 40 `beta` tools.

The 24 business document tools all shared one template that fitted on a single
page: it **silently dropped every line past the bottom of page one**, printed
"Saved PDF." with no figures, and turned a bad paste into a zero-rupee invoice
through `Number(x) || 0`. They now have their own generator
(`public/js/business-docs.js`) and a form each — a quotation is not an invoice, a
delivery challan carries no tax, a payslip pays earnings less deductions — with a
numbering series that continues, Indian amount-in-words, and a PDF that
**paginates and repeats its column headings**. 29 tests hold the arithmetic, the
parsing of what people actually paste, and the finished PDF bytes.

Each phase is a checkbox; do them in order, `npm test` green at every step.

## Phase 0 — Land the in-flight batch
- [x] Security hardening: `safeUrl`, secret redaction, WinAnsi PDF folding, `X-MegaPLAN-Folded`, DOM-sink suite
- [x] New `tests/ai-mode-hardening.mjs` green
- [x] New `public/js/ai-pdf-ops.js` — 27 PDF operations run on the attached file
- [x] Register the hardening suite in `npm test`
- [x] Wire `pdf-ops` into the planner's PDF branch + tests
- [x] Full `npm test` green (30 suites, exit 0)

## Phase 1 — The tool contract table
- [x] `tests/ai-mode-tool-contracts.mjs` mounts and drives all 590 tools in jsdom
- [x] Emit `data/tool-contracts.json` (class, inputs, outputs, needsFile, controls)
- [x] Classes **R** runnable / **N** behind a service / **S** studio / **C** refused / **F** unverified
- [x] The planner and the tool bus obey the table instead of the category name
- [x] CI fails when a `live` tool does nothing, or an aliased handler is undefined
- [x] Fix the dead tools the audit found (3 missing handlers, 3 identity functions)

## Phase 2 — Make the dead tools real
- [x] OCR cluster (9 tools): real in-browser reader, image input, structured receipt/invoice/form/ID JSON, 15 extraction tests
- [x] Notes/extractors: 12 deterministic engines (20 tests); 3 keep the assistant and say why
- [x] Business (24 of the 40 Business tools): real generators with numbering series, per-document fields, tax maths and a paginating PDF — `public/js/business-docs.js`, 29 tests
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
