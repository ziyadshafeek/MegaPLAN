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

Counted from `data/tools.json` and the current engine sources, not estimated.

| Measure | Count |
| --- | --- |
| Registered tools | **590** |
| `live` / `beta` / `catalogued` | 547 / 40 / 3 |
| Categories | 23 (PDF 54, Images 51, Developer 48, Calculators 43, Business 40, Text 37, Audio 34, OCR & AI 27, Video 26, Productivity 26, …) |
| Tools whose engine actually mounts a UI | 588 / 590 (the 2 misses are canvas games, a jsdom limit, not a product bug) |
| Tools AI Mode can **run** today via ToolBus | **521** |
| Tools AI Mode can only **open** (bespoke studios) | **66** — all 54 PDF, 6 Games, 2 Maps, `audio-studio`, `ai-mode`, `inception-labs` |
| Tools AI Mode **refuses** (catalogued) | 3 — YouTube/SlideShare downloaders (no lawful runner) |
| PDF tools AI Mode can run itself (new `ai-pdf-ops`) | **27 / 54** |
| **OCR & AI tools with a real engine** | **3 / 27** — 24 are one shared text-assistant box |

### 2.1 The three real problem clusters

1. **The OCR cluster is mis-wired.** `Image OCR` has a genuine tesseract
   engine, but `ocr-image-to-text` (the slug the planner reaches for on an
   image) is a *text* assistant that answers "ask for pasted text". The same is
   true of `receipt-ocr`, `invoice-ocr`, `table-ocr`, `form-ocr`,
   `id-document-ocr`, `handwriting-ocr`. **They cannot accept an image at
   all** — which is exactly the path the "medicine PPT from photos" workload
   needs. This is the largest single quality gap in the registry.
2. **PDF is 54 tools that AI Mode could only open.** 27 are now runnable via
   `public/js/ai-pdf-ops.js`; the other 27 (sign, fill, redact, OCR, repair,
   rasterise, office conversions) still need the studio, and that must stay an
   honest hand-off.
3. **Video is 16 of the 40 `beta` tools.** 26 Video tools exist, 10 are live —
   so most of that category is a promise, not a feature. AI Mode must not
   present a beta tool as something it will do.

## 3. Integration model — four execution classes

Every tool gets exactly one class. The class decides what AI Mode may promise.

| Class | Meaning | AI Mode behaviour | Test |
| --- | --- | --- | --- |
| **R — Runnable** | A browser engine exists and ToolBus can fill `#tool-in` / `#n*` / `#file`, click `#run`, read `#tool-out` | run automatically, stream the real output | drive in jsdom, assert non-empty output |
| **P — Programmatic** | No DOM contract, but a module can do the job directly on the file (`ai-pdf-ops.js`, `agentic-pdf.js`) | run automatically, produce a real artifact | call the op, assert a valid file |
| **S — Studio** | An interactive app needing eyes/hands (sign, fill, games, maps, audio DAW) | **offer to open it** with a one-line reason | assert the step is `action:'open'`, never `auto` |
| **C — Catalogued/beta** | No lawful or no finished runner | **say so**, name the gap, offer the nearest real tool | assert AI Mode refuses and never claims success |

The class is **data, not a guess inside the planner**: it is derived once into
`data/tool-contracts.json` and consumed by the planner, the tool pages, and the
test harness. That single table is what stops the planner from guessing.

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

- [ ] `tests/ai-mode-tool-contracts.mjs` — mount all 590 in jsdom, record the
      discovered input/output contract, run each R-class tool, and fail on
      empty/placeholder/unchanged output
- [ ] Emit `data/tool-contracts.json`: `{slug, class, inputs, outputs, needsFile, needsNumbers, ms, verifiedAt}`
- [ ] Fail CI when a tool is `live` but has no passing contract (keeps the
      "no fake runners" rule in `AGENTS.md` mechanical)
- [ ] `tests/tool-mount.mjs` extended to assert the same thing

**Acceptance:** a tool cannot be labelled `live` unless the harness produced a
real output for it in that run.

### Phase 2 — Make the dead tools real, cluster by cluster

Ordered by how much dead surface each removes.

| Cluster | Tools | Today | Target | Files to modify |
| --- | --- | --- | --- | --- |
| **OCR** | 9 real OCR tools (`ocr-image-to-text`, `handwriting-ocr`, `receipt-ocr`, `invoice-ocr`, `table-ocr`, `form-ocr`, `id-document-ocr`, `document-classifier`, `document-json-extractor`) | text assistant, no image input | tesseract.js worker with progress; structured JSON for receipt/invoice/form/ID; TSV→table for `table-ocr` | new `public/js/ocr-engine.js`; `engines-rest.js` reroutes all 9 to it; retire the duplicate `Image OCR` alias |
| **Assistant/notes** | 15 (`smart-note-maker` … `entity-extractor`) | all one assistant call | real extractive engines where it is honestly better (entity/keyword/citation extraction) and **keep the assistant only where a model is genuinely required**; each tool's copy must describe what it actually does | `public/js/ai-compose.js` gains per-task extractors; `engines-rest.js` |
| **Business** | 23 | one `docPdf` template | real generators: numbering series, tax/total maths, CSV round-trip, per-region invoice fields | new `public/js/business-engine.js` |
| **Video** | 26 (16 beta) | mostly beta | promote only what ffmpeg.wasm can truly do; keep the rest honestly beta | `public/js/video-engine.js` |
| **Audio** | 34 (5 beta) | good, 5 beta | close the 5 or state why not | `public/js/audio-studio.js` |
| **Catalogued** | 3 | refused | keep refused; AI Mode must name the gap and offer YouTube *transcripts* instead | `planner.js` messaging |

**Acceptance:** every tool in the table is either verified by the Phase 1
harness, or its status is honestly downgraded in `data/tools.json`.

### Phase 3 — PDF depth (54 tools)

- [x] `ai-pdf-ops.js` runs 27 operations on the attached file (merge, split,
      extract, delete, reorder, rotate, numbers, watermark, compress, crop,
      2-up/4-up, overlay, text, forms, count, metadata, images→PDF, sections)
- [ ] Planner routes a matched PDF tool to `pdf-ops` when the right file is
      attached, and to an honest "open the studio" step when it is not
- [ ] **In-browser OCR of scans** so `ocr-pdf` becomes runnable and a scanned
      PDF becomes searchable (tesseract worker + progress in the AI Mode step)
- [ ] **Page targeting for very large PDFs** (the 1000-page ask): detect
      bookmarks/TOC, rank pages by the user's own keywords, then let them
      upload only the relevant pages *or* save them as one PDF —
      the `sections` op is the first slice of this
- [ ] **RAG-lite** for large documents: chunk by section, build an in-browser
      BM25 index, answer only from retrieved chunks with page citations
- [ ] Keep the remaining 27 as honest studio hand-offs (sign, fill, redact,
      repair, rasterise, office↔PDF, HEIC)

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
