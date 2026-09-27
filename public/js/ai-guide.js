/**
 * AI Mode guide — the single source of truth for the in-app Guide section.
 *
 * Served by `GET /api/ai-mode?view=guide` and rendered by `public/js/ai-mode.js`,
 * so the documentation customers read can never drift from the code that runs.
 *
 * Product rules applied here:
 *  - no provider or model names on customer surfaces
 *  - no claim that something ran when it did not
 *  - AI Studio / NotebookLM are described as the user's own external assistants
 */

export const GUIDE_VERSION = '3.0.0';

export const GUIDE = {
  version: GUIDE_VERSION,
  title: 'AI Mode Guide',
  tagline: 'Type what you want. AI Mode reads the request, plans the work, runs the real MegaPLAN tools, and hands you a file or a finished answer.',
  sections: [
    {
      id: 'what-it-is',
      icon: '◈',
      title: 'What AI Mode actually is',
      body: [
        'AI Mode is the conductor in front of the rest of MegaPLAN. You describe an outcome in one sentence — attach files, paste links, or just type — and AI Mode turns it into an ordered plan of steps, runs the steps that can be executed automatically, and shows you exactly what ran, what it produced, and what still needs you.',
        'The planner is deterministic. The same request always produces the same plan, so a result can be explained, re-run, and reproduced. The hosted writing assistant is optional: when this deployment has one it adds a language pass over material that was already gathered, and when it does not, every other step still works.'
      ],
      points: [
        'Plan first, then run — you see the chain before anything happens',
        'Every step is labelled RUN (automatic), OPEN (hands you to the dedicated tool) or OPT (skipped unless useful)',
        'No fake results. A step that cannot run says why and offers the lawful alternative'
      ]
    },
    {
      id: 'how-to-use',
      icon: '▸',
      title: 'How to use it',
      body: [
        'One field, three inputs. Type the request, attach files, and add links. Links are detected anywhere in your text, so pasting a YouTube or article URL straight into the request is enough.'
      ],
      steps: [
        { n: 1, title: 'Say what you want', text: '"Make a 10-slide deck on solar power in Kerala", "Find 6 recent PubMed papers on metformin", "Summarise this lecture video and turn it into study notes", "Turn these notes into a PDF with a source list".' },
        { n: 2, title: 'Attach and link', text: 'Drop PDFs, images, audio, CSV, Word or text files into the drop zone, or paste YouTube / article / playlist links into the links box. PDFs and images are read on your device; only the text you submit for a language pass leaves the browser.' },
        { n: 3, title: 'Read the plan', text: 'The plan appears instantly with a one-line reason per step. Fix it by editing the request — there is no hidden queue and no page reload.' },
        { n: 4, title: 'Run it', text: 'Press Run. Steps report running, done, or failed-with-reason. Downloads land in your browser as real files.' }
      ]
    },
    {
      id: 'recipes',
      icon: '▦',
      title: 'Recipes that work today',
      body: ['These are the flows the backend really executes end to end. Each one produces a file or a cited answer, not a promise.'],
      recipes: [
        { task: 'PDF', request: 'Research <topic> from Wikipedia and give me a PDF with a source list', does: 'Searches open sources, fetches the full article text, then writes megaplan-<topic>.pdf with numbered pages and an attributed source list.' },
        { task: 'PDF', request: 'Turn the attached notes into a formatted PDF', does: 'Your uploaded text becomes the document body. Nothing is invented; nothing is sent anywhere.' },
        { task: 'PPT', request: 'Create a PowerPoint about <topic> with 8 slides', does: 'Researches first, then builds a real .pptx where every sourced line keeps its link and the last slide lists the references.' },
        { task: 'Wikipedia', request: 'Who was Rosalind Franklin / tell me about the Kerala backwaters from Wikipedia', does: 'Returns the article title, revision id, canonical link and the full plain-text extract, which the next steps can turn into notes, a PDF or a deck.' },
        { task: 'PubMed', request: 'Find recent PubMed papers on <condition> and summarise the findings', does: 'Queries PubMed for PMIDs, DOIs, journals and years, falls back to Europe PMC if NCBI rate-limits, and produces a numbered reference list you can paste into a review.' },
        { task: 'YouTube', request: '<video or playlist link> → transcript, chapters and study notes', does: 'Fetches real captions, timestamps them, and derives chapters plus notes. Playlist links are expanded to a video list with CSV export.' },
        { task: 'YouTube', request: 'Summarise this lecture and give me revision questions', does: 'Transcript → local notes → question set. The transcript is the only source; the summary never adds facts the speaker did not say.' },
        { task: 'Files & data', request: 'Convert this CSV to JSON and count the rows', does: 'Runs the matching MegaPLAN converters and counters in the chain, and shows the real output.' },
        { task: 'Study batch', request: 'Question paper + textbook → notes per question, split into batches for AI Studio', does: 'Reads both PDFs, splits the paper into question-sized batches, maps them to textbook chapters, and writes a copy-paste prompt per batch.' },
        { task: 'Places', request: 'Coffee shops near Fort Kochi and weather there', does: 'Geocodes the place, lists nearby POIs, and reads current conditions — all from open map and weather services with no API key.' }
      ]
    },
    {
      id: 'ai-studio-notebooklm',
      icon: '⌘',
      title: 'Why AI Studio and NotebookLM are offered',
      body: [
        'These two options exist because of one honest limit: a hosted assistant can be given a large but bounded context, while a whole textbook plus a whole question paper often exceeds it. Rather than silently truncating your material, AI Mode splits the work the way a person would and hands each piece to an assistant you control.',
        'They are not required. If the material fits, AI Mode answers it here. They are the escape hatch for the material that does not — and they cost you nothing extra because the quota is yours.',
        'Nothing you type into those services is sent to MegaPLAN. The prompt pack is generated on your device and copied to your clipboard.'
      ],
      options: [
        {
          name: 'Google AI Studio — long context, one batch',
          when: 'Use it when everything fits in one enormous context window and you want a single, coherent answer: the whole textbook plus every question at once.',
          why: 'One request, no splitting, best for a full subject revision in a single pass.',
          mode: 'Choose Mode: Batch.',
          steps: ['AI Mode writes one prompt that contains the full request, the source inventory and the exact output shape.', 'Copy the prompt.', 'Open AI Studio, paste it, and upload the files AI Mode listed.', 'Paste the answer back here if you want it turned into a PDF or a deck.']
        },
        {
          name: 'NotebookLM — many sources, one question at a time',
          when: 'Use it for per-question study: one textbook, one question paper, dozens of questions that each need an answer grounded in the textbook.',
          why: 'NotebookLM keeps the sources pinned and answers each question against them, which is exactly the per-question batch pattern.',
          mode: 'Choose Mode: Per question.',
          steps: ['AI Mode splits the question paper into question-sized batches and maps each one to the textbook chapter it belongs to.', 'Upload the textbook (and, if you want, the question paper) as NotebookLM sources.', 'Paste the per-batch prompts in order; each returns one answer block.', 'Bring the answers back to AI Mode to merge them into notes, a PDF or a deck.']
        }
      ],
      note: 'NotebookLM can also import a public YouTube video as a source, but only when that video has captions. If the video is brand new, region-locked or caption-free, the import fails — in that case run the transcript through AI Mode first and upload the text.'
    },
    {
      id: 'what-runs-where',
      icon: '⌂',
      title: 'What runs where',
      body: ['Knowing this matters: it is the difference between "it is broken" and "that is on purpose".'],
      table: [
        { where: 'This device (your browser)', what: 'PDF reading and writing, merging, splitting, compression, OCR, image and audio work, CSV/JSON conversion, every calculator, YouTube transcript parsing, notes and summary construction, all downloads.' },
        { where: 'MegaPLAN server (no API key needed)', what: 'Open-source research: Wikipedia, PubMed/Europe PMC, arXiv, Crossref, OpenAlex, Semantic Scholar, Open Library, Project Gutenberg, Stack Exchange, MusicBrainz, Open-Meteo, geocoding and routing.' },
        { where: 'MegaPLAN server (hosted key)', what: 'An optional writing/summarising pass over text you explicitly submit. If the deployment has no key, this step is skipped and everything else still runs — you are told, not shown a fake answer.' },
        { where: 'Your own account', what: 'AI Studio, NotebookLM and the Self Agent. Their keys stay in your browser and their traffic never reaches MegaPLAN.' }
      ]
    },
    {
      id: 'limits',
      icon: '△',
      title: 'What AI Mode will not do',
      body: [
        'These are refusals with a working alternative attached, not dead ends. Each one appears in the plan as an OPEN step pointing at the tool that does the job.',
        'The rule is simple: if the only way to do it would be to bypass a platform control, access a private account, or invent a fact, AI Mode refuses and offers the lawful route.'
      ],
      limits: [
        { no: 'Downloading video or audio streams from YouTube, Netflix, Spotify or similar', instead: 'Public captions, thumbnails, playlists, chapters and metadata — all of which AI Mode does fetch for you.' },
        { no: 'Private messages, follower lists, stories, or any credential or login work', instead: 'Public pages and public metadata only.' },
        { no: 'Live WHOIS registry lookups', instead: 'The WHOIS interface, which tells you where to look and formats whatever you paste in.' },
        { no: 'Full video transcoding', instead: 'Frame, thumbnail, duration, bitrate and metadata tools.' },
        { no: 'Medical diagnosis, prescriptions or legal advice', instead: 'Educational calculators and formatters, with a note to check against an authoritative source.' }
      ]
    },
    {
      id: 'private-tools',
      icon: '◈',
      title: 'Private tools and your session code',
      body: [
        'When nothing in the library covers a request, AI Mode drafts a private tool for you instead of guessing. It is stored under your 4-digit session code on this device only, and it stays private until you choose to push it for public review.',
        'Your session code also restores your private tools on a new browser: type the old code on this device and the drafts come back. Anyone with the code can restore them, so treat it like a password you would be willing to share with yourself.'
      ]
    },
    {
      id: 'privacy',
      icon: '◇',
      title: 'Privacy',
      body: [
        'Files you attach are read in your browser. They are not uploaded to a file store, and there is no filesystem write on the server. A file only leaves the device if you explicitly run a research or language step, and even then only the text you submitted is sent — not the binary.',
        'History is kept on this device so you can re-run or copy a previous request. Clear it from the header at any time.'
      ]
    }
  ],
  faq: [
    { q: 'Do I need an account or a key?', a: 'No. Every plan, research, PDF, deck, transcript and tool run works without an account. A language pass is optional.' },
    { q: 'Why did a step say OPEN instead of RUN?', a: 'That step is a dedicated app with its own interface — the PDF studio, the map, a game. AI Mode opens it with your request pre-filled instead of clicking through it blindly, because blind automation of those apps produces wrong results.' },
    { q: 'Can I trust the research?', a: 'Every result carries its canonical link, and a PDF or deck you download lists its sources. Read the source before you reuse the claim — open sources can still be wrong or out of date.' },
    { q: 'Why is a research group marked unavailable?', a: 'That upstream service was rate-limiting, offline, or blocked at that moment. AI Mode reports it rather than filling the gap with a guess, and the other groups still returned.' },
    { q: 'What happened to my private tools?', a: 'They are per browser. Use Export to download a JSON copy, or type your 4-digit session code on the new device to restore them.' }
  ],
  glossary: [
    { term: 'Chain', def: 'The ordered list of steps AI Mode derived from your request, with the reason for each one.' },
    { term: 'Gather / Transform / Output', def: 'The three phases. Gather pulls material in, Transform works on it, Output produces a file or a finished answer.' },
    { term: 'Auto step', def: 'A step with a real executor. If it has no executor, AI Mode marks it OPEN or OPT instead of pretending.' },
    { term: 'Session code', def: 'Four digits that identify your private tools and history on this device.' },
    { term: 'Prompt pack', def: 'Copy-paste instructions for AI Studio, NotebookLM or any assistant you already use. Generated locally; sent nowhere.' }
  ]
};
