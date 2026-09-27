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

What is left in OCR & AI: those three.

The video desk was the largest hole left. **Fourteen tools shared one handler
that printed a refusal**, and `Extract Frames` and `Video to GIF` both returned
a single JPEG called `frame.jpg` — neither extracted frames nor made a GIF. They
now run `public/js/video-engine.js`: trimming, cutting a section out, muting,
resizing, cropping, rotating, compressing, merging and converting all record
through `MediaRecorder` and the browser's own decoders, with nothing uploaded;
frames are sampled at real times and zipped; a contact sheet is one picture; and
`Video to GIF` writes a real animated GIF from a real encoder (palette, LZW,
loop flag — checked by reading the bytes back). `GIF to MP4` plays the GIF and
re-records it, because a GIF is an image and not a video file. All 16 beta
promises are now kept, and 24 `beta` tools remain — the map, directory and
scraper families, which need a backend that this desk does not have.

`Subtitle Formatter` used to be `input.replace(/\r/g, '')`. It, `Subtitle
Timing Helper`, `SRT to VTT` and `VTT to SRT` now share a parser and a repair
pass that separates overlapping cues, holds a cue that flashes past, slows one
that is read too fast, wraps lines, renumbers, and reports every change — with
the format converters leaving every timing exactly as it found it.

The 24 business document tools all shared one template that fitted on a single
page: it **silently dropped every line past the bottom of page one**, printed
"Saved PDF." with no figures, and turned a bad paste into a zero-rupee invoice
through `Number(x) || 0`. They now have their own generator
(`public/js/business-docs.js`) and a form each — a quotation is not an invoice, a
delivery challan carries no tax, a payslip pays earnings less deductions — with a
numbering series that continues, Indian amount-in-words, and a PDF that
**paginates and repeats its column headings**. 29 tests hold the arithmetic, the
parsing of what people actually paste, and the finished PDF bytes.

Three of the 24 remaining `beta` tools are also worth naming: `Audio Dereverb`
and `Voice Isolation` run a noise gate. A gate removes hiss between words; it
cannot remove echo or separate a voice from a backing track, so they stay beta
and say so.

**Phase 2 is done.** Two gaps in the honesty of the refusals were found while
closing it, and both mattered more than the cluster itself: a request for a
SlideShare downloader met no rule at all and was simply ignored, and a
transcoding request was told "full video transcoding is not available in the
browser" — which stopped being true when the video engine shipped. A refusal
that is out of date is worse than no refusal.

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
- [x] Video (26 tools, all 16 betas promoted): a real in-browser engine — `public/js/video-engine.js` records with the platform's own decoders and `MediaRecorder`, and a GIF89a encoder with its own LZW; 44 tests
- [x] Catalogued 3: never queued, the reason travels with the match, and a request for one is answered with the lawful route — including SlideShare, which had no refusal at all

## Phase 3 — PDF depth (54 tools)
- [x] 27 operations runnable from the browser (merge, split, rotate, delete, numbers, watermark, crop, n-up, text, forms, sections…) — `public/js/ai-pdf-ops.js`, 23 behavioural tests
- [x] A matched PDF job **runs** on the attached file instead of only offering to open the studio
- [x] Page ranges read out of the sentence ("delete pages 5 to 9"); alias slugs queue once
- [x] Large-PDF keyword page search (`op: sections`) for the 1000-page ask
- [x] In-browser OCR so scans become searchable: a page with no text layer is rendered and read by the same recogniser the image tools use
- [x] Large-PDF handling: the document's own bookmarks are read, sections are labelled, and a chapter match boosts its pages
- [x] RAG-lite: BM25 over the page text, extractive answers, every sentence carrying the page it came from — `public/js/pdf-rag.js`
- [x] The other 27 stay honest studio hand-offs, and each one says so: what it opens, what it does, and that nothing is uploaded

The 1000-page ask is now a real answer rather than a suggestion. Uploading a
PDF and asking a question of it runs `pdf-answer`: every page is ranked with
BM25, the sentences that carry the question are quoted out, and each quote names
its page. No model is involved, so there is nothing to hallucinate — and a
question the document does not answer returns "none of them mention it", not a
guess. The document's own table of contents is read when it has one, so the
chapter a question lands in can be preferred over a page that merely repeats the
word.

Three defects surfaced while doing it. `runPdfRead` **gave up on scans** and told
the user to go and open a different tool; a scanned contract is now read in the
page. A question about an uploaded PDF also fired **open-source web research**,
which mixes a citation with a summary and answers from the wrong document. And
"redact the bank details from this pdf" queued a **map lookup** for banks,
because "bank" is a place word.

## Phase 4 — Images → OCR → deck
- [x] Composed chain: images → OCR → facts → outline → real `.pptx`. The deck
      step declares the read as a dependency, so it cannot run on nothing
- [x] Table slides in `lib/presentation-deck.js`, sized to fit and capped with
      "N more lines not shown" rather than dropping rows
- [x] Medicine-shaped extraction (`public/js/med-table.js`): drug, strength,
      dose, frequency, duration — read, never inferred
- [x] Generalises: any "deck from these images" reads them first, and an image
      the chain does not need is not read at all

**A deck from a photo of a prescription.** The chain used to end at the deck
engine with nothing in its hands: the images were never read, the engine
threw its "no source text" error, or it filled the gap with something that
looked like slides. Now the photos are read in the page, and what they say is
arranged into a table — one row per medicine, five columns, each cell filled
only where the text actually filled it.

The last part is the point. A dose is not a thing to infer, so `med-table.js`
does not infer one. "Vitamin D3 60,000 IU once weekly" has no dose in it, and
the cell stays empty with a dash where a value would have gone; the table
reports how many lines arrived without one. What made this work was refusing to
be helpful: the parser starts a drug name only at a word, stops it at the first
number, and treats a line that opens with a strength as a continuation of the
drug above it — which is how a scan of a prescription actually reads.

Two planning mistakes went with it. "Make a deck from these photos" also queued
a photo-strip maker, because "photo" matched, giving one request two different
artifacts. And the presentation studio was opened *and* the deck built, so there
was no way to tell which one ran.

## Phase 5 — Search, news and links
- [x] `web-search` over keyless sources — Wikipedia, PubMed/Europe PMC, arXiv,
      Crossref, OpenAlex, Semantic Scholar, Open Library, Gutenberg, Stack
      Exchange, MusicBrainz — every one named in the plan
- [x] `news` from publisher RSS (`lib/ai-mode/news.js`) with the publisher's own
      timestamp, the desk that ran it, and unreached feeds reported as such
- [x] Copy names only the sources actually used; a group that failed is listed
      as failed, and a dead feed never appears in the source list
- [x] Works for any topic: the desk is chosen from the question's own words
- [x] Copy-paste prompt packs and NotebookLM/Gemini hand-offs name the real
      sources instead of implying a general web search

**News is not a search with a date filter.** The failure this fixes is
specific: an item with no `pubDate` came out looking like today's news, because
"now" is what a headline implies and a missing field quietly filled it in. So a
date is only ever the date the publisher put there — otherwise the cell says no
date was given, and the result says how many of its items are undated. A feed
that could not be read is named with its reason; it is never dropped, because a
silently missing source reads as "there was nothing to find".

The other half is attribution. The same story carried by three desks is one
item that lists who else ran it, not three near-identical bullets, and each item
names the publisher and desk rather than a search engine. A bare "give me the
headlines" is a real request: the request words are stripped away and the feeds
are read for their latest, newest first. It is not passed to the feeds as the
literal string "headlines today" and allowed to match nothing.

## Phase 6 — Planner universality
- [x] Operation/object/parameter extraction: verbs, formats, subjects, places,
      page ranges, languages and the attachment kind are all read from the
      request itself, so a tool nobody wrote a rule for still gets routed
- [x] Multi-tool composition with a real dependency graph — later steps name
      the steps they consume, and the coverage suite fails on a dependency that
      does not exist or that runs later than its dependant
- [x] Request-coverage suite: 60 varied requests, each asserted to run the right
      executor, refuse in specific words, or offer a lawful alternative
- [x] A step that didn't run can never be reported as run: `auto` is derived
      from the executor registry, and a drift test fails the build if the
      planner's list and the registry disagree

**What the coverage suite found.** It was written to fail, and on the first run
it did — `image-read` was missing from the planner's executor list, so every
"read the text in this photo" produced a plan that did nothing at all and said
nothing about it. That one class of bug is the dangerous one: no error, no
refusal, just a plan that looks like it is working. The drift test now exists
specifically to catch it.

The rest were plans that ran the wrong thing. "Give me the latest news on
Kerala" queued four Kerala *directory* tools, because Kerala is a word in a
subject, and a directory of districts cannot answer a question about events.
"Diagnose my chest pain" queued a research run underneath its own refusal. And
"hack into my ex phone" queued a research run *and* two phone tools, with the
refusal sitting quietly in the notes underneath — a plan that looks busy and
says no, which is the worst of both.

So a refusal with no lawful alternative now stops the plan instead of
annotating it, and the plan envelope is built in one function so an early
return cannot drift from the normal one.

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
