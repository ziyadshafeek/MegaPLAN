# AI Mode — development plan

How every one of the 590 registered tools becomes genuinely usable from a
natural-language request, which tools need real work, and in what order.

This is the detailed companion to the AI Mode phases in
[`ROADMAP.md`](ROADMAP.md). Read it before touching `public/js/ai-*.js`,
`public/js/planner.js` or the tool engines.

---

## 1. The product rule

MegaPLAN is a **tool desk**. AI Mode is the way you drive the desk when you
know *what you want done* but not *which tool does it*. So:

- a request must map to **real tool work on real inputs**, not a chat answer;
- a tool that cannot run must be **named and offered**, never silently skipped;
- the UI stays **flat and quiet** (no gradients/glows), works on a **phone**,
  and never names a model or provider.

## 2. Measured baseline (this branch)

Counted by `tests/ai-mode-tool-contracts.mjs`, which mounts and drives every
registered tool — not estimated.

| Measure | Count |
| --- | --- |
| Registered tools | **590** (547 live, 40 beta, 3 catalogued) |
| Categories | 23 (PDF 54, Images 51, Developer 48, Calculators 43, Business 40, Text 37, Audio 34, OCR & AI 27, Video 26, Productivity 26, …) |
| Class **R** — runnable (319 driven here, 163 wired but needing a file/canvas/service) | **482** |
| Class **N** — real engine behind a service or CDN library | **20** |
| Class **S** — an app or interactive studio | **84** |
| Class **C** — no lawful or finished runner | **3** |
| Class **F** — needs a real file the harness cannot fabricate | **1** |
| **AI Mode can drive** (R + N) | **502** (it previously claimed 521) |
| PDF tools AI Mode can run itself (`ai-pdf-ops`) | **27 / 54** |
| **OCR & AI tools with a real engine** | **24 / 27** (the nine OCR tools and twelve note tools were rebuilt in Phase 2) |
| **Business tools with a real engine** | **24 of 40** (the 24 document makers; the 9 calculators/trackers and 3 beta directory tools were already live) |
| **`beta` promises kept** | **24 of 40** (was 40) — the 16 video tools now work, so they are live; what is left is the map, directory, scraper and music-search families that need a backend this desk does not have |

### 2.1 What the audit found

1. **Category guessing over-promised.** Deciding "can AI Mode run this?" from
   the category name claimed 521 tools and quietly promised 19 apps it could
   never drive — the directory pages, the presentation studio, the data-sources
   page, the keyboard and mouse testers. The contract table fixed this.
2. **Three tools called a handler that does not exist.** `Random Picker`,
   `Random Name Picker` and `Decision Wheel` all delegated to
   `HANDLERS['Random Line Picker']`, which was never defined: dead on click,
   with a perfectly normal-looking page. Now implemented.
3. **Three tools were identity functions.** `Subtitle Timing Helper`,
   `Citation Formatter` and `Decision Table Maker` were
   `textTool(r, t, s => s)` — they returned their input unchanged. Now
   implemented as a real SRT/VTT timing editor, a DOI/PMID citation formatter
   and a weighted decision-table builder.
4. **The OCR cluster was mis-wired — now fixed.** `Image OCR` had a genuine
   reader, but `ocr-image-to-text` (the slug the planner reaches for on an
   image) was a *text* assistant that answered "ask for pasted text", and so
   were `receipt-ocr`, `invoice-ocr`, `table-ocr`, `form-ocr`,
   `id-document-ocr` and `handwriting-ocr`. **None of them could accept an
   image at all** — the exact path the "medicine PPT from photos" workload
   needs. Phase 2 rebuilt all nine on `public/js/ocr-engine.js`. What is left
   in this category: 14 note/extractor tools still share a single assistant
   call.
5. **Video is 16 of the 40 `beta` tools**, so most of that category is a
   promise rather than a feature.

## 3. Integration model — execution classes

Every tool gets exactly one class. The class decides what AI Mode may promise.

| Class | Meaning | AI Mode behaviour | Test |
| --- | --- | --- | --- |
| **R — Runnable** | A browser engine exists and ToolBus can fill `#tool-in` / `#n*` / `#file`, click `#run`, read `#tool-out` | run automatically, stream the real output | drive in jsdom, assert non-empty output |
| **N — Behind a service** | A real engine whose output comes from a network call or a CDN library (research, maps, assistant) | run, and report the failure honestly when the service is down | assert it is never claimed offline |
| **P — Programmatic** | No DOM contract, but a module can do the job directly on the file (`ai-pdf-ops.js`, `agentic-pdf.js`) | run automatically, produce a real artifact | call the op, assert a valid file |
| **S — Studio** | An interactive app needing eyes/hands (sign, fill, games, maps, audio DAW) | **offer to open it** with a one-line reason | assert the step is `action:'open'`, never `auto` |
| **C — Catalogued** | No lawful or no finished runner | **say so**, name the gap, offer the nearest real tool | assert AI Mode refuses and never claims success |
| **F — Unverified** | Nothing was produced when driven (usually it needs a real file) | **say so**; never promise it | assert the tool is not drivable |

**P** is not a registry class but an executor: the 27 PDF operations in
`ai-pdf-ops.js` run on the attached file, so those PDF tools are class S in the
table and still execute through `pdf-ops` when the request carries the file.

The class is **data, not a guess inside the planner**: it is derived once into
`data/tool-contracts.json` and consumed by the planner, the tool bus and the
test harness. That single table is what stops the planner from guessing, and
`tests/ai-mode-tool-contracts.mjs` fails if the product stops obeying it.

## 4. Phases

### Phase 0 — Land the in-flight batch (do this first)

The branch carries uncommitted work that must not be lost: the security
hardening batch (`safeUrl`, `redactSecrets`, WinAnsi PDF folding,
`X-MegaPLAN-Folded`, the jsdom DOM-sink suite) and the new `ai-pdf-ops.js`.

- [x] Implement hardening (`lib/ai-mode/pdf.js`, `public/js/ai-compose.js`, `public/js/ai-mode.js`, `public/js/ai-executors.js`, `public/ai-mode.css`)
- [x] New `tests/ai-mode-hardening.mjs` green
- [ ] Register `tests/ai-mode-hardening.mjs` in `package.json` `npm test`
- [ ] Wire `pdf-ops` into the planner's PDF branch and make the new executor pass its tests
- [ ] Full `npm test` green, then commit + push

**Acceptance:** `npm test` runs all 25 suites including the hardening and
PDF-ops suites; nothing uncommitted.

### Phase 1 — The contract table (foundation for everything else)

*Goal: know, mechanically, what every tool does — instead of inferring it.*

- [x] `tests/ai-mode-tool-contracts.mjs` — mounts all 590 in jsdom, records the
      discovered input/output contract, drives each tool, and fails on
      empty/placeholder/echo output
- [x] Emits `data/tool-contracts.json`: `{slug, class, kind, inputs, outputs, needsFile, controls}`
- [x] CI fails when a `live` tool does nothing, when an aliased handler is
      undefined, or when the planner stops obeying the table
- [x] The planner and the tool bus read `toolClass` instead of guessing from
      the category name

**Acceptance:** a tool cannot be labelled `live` unless the harness produced a
real output for it in that run. **Done** — 482 R, 20 N, 84 S, 3 C, 1 F, and no
live tool does nothing.

### Phase 2 — Make the dead tools real, cluster by cluster

Ordered by how much dead surface each removes.

| Cluster | Tools | Today | Target | Files to modify |
| --- | --- | --- | --- | --- |
| **OCR** | 9 tools (`ocr-image-to-text`, `handwriting-ocr`, `receipt-ocr`, `invoice-ocr`, `table-ocr`, `form-ocr`, `id-document-ocr`, `document-classifier`, `document-json-extractor`) | **done** — in-browser read + deterministic parsers | shipped: `public/js/ocr-engine.js`, 15 extraction tests |
| **Assistant/notes** | 15 (`smart-note-maker` … `entity-extractor`) | **12 done** on `public/js/note-tools.js`; 3 keep the assistant and say so | extractive key points, action items, citations, entities, abstract, cleaning, flashcards, quiz, notes and email summaries — all verified to copy rather than invent |
| **Business** | 24 of the 40 | **done** — one generator with a schema per document | shipped: `public/js/business-docs.js`, numbering series, tax/total maths, Indian amount-in-words, a PDF that paginates; 29 tests |
| **Video** | 26 (16 were beta) | **done** — no ffmpeg download; the browser's own decoders and `MediaRecorder` | shipped: `public/js/video-engine.js` + `public/js/video-tools.js`, a real GIF89a encoder, 44 tests; all 16 promises kept |
| **Audio** | 34 (5 beta) | good, 5 beta | close the 5 or state why not | `public/js/audio-studio.js` |
| **Catalogued** | 3 | **done** — refused, with the reason attached and a lawful route queued | shipped: refusal table in `planner.js`; SlideShare gained the refusal rule it never had, and a stale "no transcoding in the browser" message was removed |

**Acceptance:** every tool in the table is either verified by the Phase 1
harness, or its status is honestly downgraded in `data/tools.json`.

### Phase 3 — PDF depth (54 tools)

- [x] `ai-pdf-ops.js` runs 27 operations on the attached file (merge, split,
      extract, delete, reorder, rotate, numbers, watermark, compress, crop,
      2-up/4-up, overlay, text, forms, count, metadata, images→PDF, sections)
- [x] Planner routes a matched PDF tool to `pdf-ops` when the right file is
      attached, and to an honest "open the studio" step when it is not
- [x] **In-browser OCR of scans**: a page with no text layer is rendered and
      read in the page, so a scanned PDF is searchable like any other
- [x] **Page targeting for very large PDFs** (the 1000-page ask): the
      document's own bookmarks are read, sections are labelled, and a chapter
      match boosts its pages; `save` writes the cited pages as one PDF
- [x] **RAG-lite** for large documents: BM25 over the page text, extractive
      answers only from retrieved chunks, every quote carrying its page
      (`public/js/pdf-rag.js`, the `research` op, the `pdf-answer` executor)
- [x] Keep the remaining 27 as honest studio hand-offs (sign, fill, redact,
      repair, rasterise, office↔PDF, HEIC) — each one states what it opens,
      what it does, and that nothing is uploaded

**Answering a document, not a topic.** A question about an uploaded PDF is
routed to the document, not to the web: the planner suppresses open-source
research and unrelated tools so the answer can only come from the file the user
attached. “Find the termination clause in this PDF” and “who is the escalation
contact on nights?” are both read-then-answer. “Summarise this contract” and
“split this PDF” are jobs, not questions, and are left alone.

**Acceptance:** “rotate this PDF 90 degrees”, “delete pages 5–9”,
“merge these two PDFs” and “find the pages about diabetes in this 1000-page
PDF” all produce a real file from the browser alone.

### Phase 4 — Images → OCR → deck (the medicine-PPT workload)

- [ ] A composed plan: images → OCR → fact extraction → outline → `.pptx`,
      chained through the real executors rather than one opaque step
- [ ] `lib/presentation-deck.js` gains a **structured outline** path: OCR text
      in, title/bullets/dose tables out, no invented facts
- [ ] Medicine-shaped extraction: drug name, strength, dose, frequency,
      duration, advice — as a labelled table, with a “verify against the
      prescription” line (never advice, always transcription)
- [ ] Works for any “X topic deck from these images/notes/PDF” request, not
      only medicine

**Acceptance:** upload photos of a prescription or notes → get a real `.pptx`
whose slides are traceable to the OCR text, plus the source images listed.

### Phase 5 — Search, news and links (the “latest news” workload)

Honesty first: **AI Mode will not scrape Bing.** It will not claim to.

- [ ] A `web-search` capability over licensed/keyless sources: Wikipedia,
      Europe PMC/PubMed, Open-Meteo, and (when the operator supplies a key)
      Brave Search — the same key pattern already used for research
- [ ] A `news` capability from **RSS feeds** with real timestamps and a date
      filter, labelled with the actual publisher
- [ ] Copy that says *what it searched* — never “I searched Bing” when it
      did not; show the source name next to every result
- [ ] Open-ended queries: the planner must handle “latest news about X” for
      any X, not a fixed list of topics

**Acceptance:** the request is answered with dated, attributed links from
named sources, and the UI never names a source that was not actually used.

### Phase 6 — Planner universality (arbitrary requests)

*Goal: any reasonable request becomes a reliable, honest, multi-step plan.*

- [ ] Extract operation + objects + parameters from free text: verbs, formats,
      page ranges, numbers, units, languages, quality settings
- [ ] Compose chains across tools (OCR → table → deck; search → notes → PDF;
      merge → number → watermark → compress) with a real dependency graph, so
      later steps consume earlier outputs
- [ ] Bound the chain sensibly and mark surplus steps optional
- [ ] A request-coverage suite: several hundred varied requests; each must
      produce ≥1 runnable step or an explicit, specific refusal
- [ ] Never claim a catalogued/beta/bespoke tool ran; the step model must
      make that impossible rather than merely discouraged

**Acceptance:** the coverage suite has no request that produces neither a
runnable step nor a specific, honest explanation.

### Phase 7 — Codex-like agent parity (`public/agent/agent.js`)

- [ ] Audit Wiki Agent + Self Agent against the acceptance bar: chat, sandbox
      preview, Deploy, local draft, GitHub runner, BYOK
- [ ] Share one planner between the agent and AI Mode so “build me a page” and
      “do this with my tools” use the same decomposition
- [ ] Fix every gap found; keep the key session-only and server-side keys
      server-side
- [ ] Mobile layout for the split view (chat + preview)

**Acceptance:** the agent can plan, preview, save locally, and deploy or
explain precisely why it cannot.

### Phase 8 — Interface, guide, mobile, polish

- [ ] Keep the flat/quiet language: one accent, no gradients/blur/glow,
      square-ish radii, one type scale
- [ ] Rewrite the AI Mode guide for the new behaviour (it must describe what
      AI Mode can and cannot do, per request)
- [ ] Mobile matrix: 360 px, keyboard-open composer, large uploads, no
      horizontal scroll, steps readable one-handed
- [ ] Accessibility: focus order, live regions for step progress, AA text and
      3:1 control borders (regression-tested)

**Acceptance:** the UI suite and the mobile matrix pass; the design stays
simplistic.

## 5. The named workloads, mapped to phases

| Request | Phases | End state |
| --- | --- | --- |
| “search latest news from Bing” | 5 | attributed, dated links from named sources; Bing named only if a licensed integration exists, otherwise the copy says what was actually searched |
| medicine PPT from uploaded images | 2, 4, 6 | images → real OCR → structured dose table → real `.pptx`, fully in-browser |
| query a ~1000-page PDF | 3, 6 | in-browser text layer + section/TOC detection + keyword ranking (+ OCR for scans), then answers only from retrieved pages with citations |
| make the Codex-like feature fully working | 7 | plan, preview, local save, Deploy/BYOK parity, mobile |

## 6. Test strategy

- `npm test` runs every suite, including the new hardening, tool-contract,
  PDF-ops and request-coverage suites. Nothing may be skipped to make it green.
- jsdom for engine/tool contracts and DOM-sink safety; Node for planner and
  API suites with injected `fetch`; a real browser run only when the sandbox
  can launch one (never claim otherwise).
- **Live network is not assumed.** Wikipedia, NCBI, Europe PMC, YouTube and
  Piped must be exercised with mocked responses, plus one clearly-labelled
  live smoke check that is allowed to be offline.
- Every PDF artifact is asserted to be a real `%PDF-` byte stream, and every
  failure path is asserted to *say* what failed.

## 7. Constraints that must not be broken

- `NVIDIA_API_KEY` stays a Vercel secret, read only by `lib/nvidia.js`, and is
  never returned to a client.
- No customer-visible model or provider names.
- No private-network fetches; `lib/api/inspect.js` keeps blocking localhost.
- No fake runners: if it cannot really run, it is `beta` or `catalogued` and
  AI Mode says so.
- AI Studio and NotebookLM remain the *study-batch* hand-off for question
  papers; they are not the general answer to everything.
- Nothing that claims a tool ran unless the harness or the executor produced
  the result in that run.

## 8. Definition of done

AI Mode is finished when: every one of the 590 tools has a class from §3 and a
verified contract from Phase 1; no `live` tool lacks a real runner; the four
named workloads in §5 work end to end; the request-coverage suite has no
unexplained request; and the interface is still flat, quiet and usable on a
phone.
