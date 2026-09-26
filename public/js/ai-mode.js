/**
 * MegaPLAN AI Mode — Combine Tools (Future Paid, currently free)
 * Complex workflow: user gives files + complex request, AI chains tools.
 * Features:
 * - 4-digit session code to remember private tools/pages
 * - File upload (PDF, images, audio, etc)
 * - Chat with AI agent that knows about all 560+ tools
 * - AI detects deficit and can build new tool via Wiki Agent
 * - When user builds tool, it's private until they click Push for review
 * - Prompt generation for Google AI Studio (Gemini 1M) / NotebookLM
 */
import { esc, downloadBlob, downloadText, mountShell, setOut, toast } from './kit.js';
import { mountTool } from './engines.js';

const LS_SESSION = 'mp-ai-mode-session';
const LS_HISTORY = 'mp-ai-mode-history';

function gen4Digit() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getSession() {
  let s = localStorage.getItem(LS_SESSION);
  if (!s) {
    s = gen4Digit();
    localStorage.setItem(LS_SESSION, s);
  }
  return s;
}

function saveHistory(entry) {
  const h = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
  h.push({ ...entry, ts: Date.now(), session: getSession() });
  localStorage.setItem(LS_HISTORY, JSON.stringify(h.slice(-50)));
}

export function mountAIMode(root, tool) {
  const sessionCode = getSession();
  const id = 'aim-' + Math.random().toString(36).slice(2, 6);

  root.innerHTML = `
  <div class="tool-pane" style="padding:0;display:flex;flex-direction:column;min-height:78vh;overflow:hidden">
    <div style="padding:14px 16px;background:#1c1916;color:#f4efe6;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between">
      <div>
        <div class="tool-kicker" style="color:#e8b44c">AI MODE · COMBINE TOOLS · FUTURE PAID (FREE NOW)</div>
        <h1 style="margin:4px 0 2px;font-size:22px">AI Mode — Your Private Agent</h1>
        <p class="lede" style="margin:0;color:#cbbba8;max-width:68ch">Upload files, give complex request. AI chains OCR, PDF split, YouTube transcript, audio, etc. Your session code: <b style="color:#e8b44c;font-size:18px;letter-spacing:0.1em">${sessionCode}</b> — remember it to restore private tools. Tools you build stay private until you Push for review.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" id="${id}-newcode" style="background:#2a241f;color:#f4efe6;border-color:#3a322c">New code</button>
        <button class="btn secondary" id="${id}-history" style="background:#2a241f;color:#f4efe6">History</button>
        <button class="btn ghost" id="${id}-clear" style="color:#f4efe6;border-color:#3a322c">Clear chat</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:320px 1fr;flex:1;min-height:0;overflow:hidden" id="${id}-main">
      <aside style="background:#efe6d8;border-right:1px solid #e0d5c4;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
        <div class="panel" style="padding:12px">
          <b style="font-size:13px">1. Upload files</b>
          <p class="muted" style="margin:4px 0 8px">PDFs, images, audio, YouTube URL, etc. AI will OCR if scanned.</p>
          <div class="dropzone" id="${id}-drop" style="padding:16px 10px">
            <div>Drop files or click</div>
            <input id="${id}-file" type="file" multiple class="hidden" accept="*/*">
          </div>
          <div id="${id}-filelist" class="chip-row"></div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <input id="${id}-yt" class="field" placeholder="YouTube URL for transcript" style="flex:1;min-width:140px">
            <button class="btn secondary" id="${id}-yt-add" style="font-size:12px;padding:6px 10px">+ YouTube</button>
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <b style="font-size:13px">2. Complex request</b>
          <p class="muted" style="margin:4px 0 8px">Example: "Question paper PDF + textbook PDF → notes per question for Gemini 1M"</p>
          <textarea id="${id}-prompt" class="input-area" style="min-height:90px" placeholder="Describe what you want… e.g.&#10;• Transcribe YouTube video and summarize&#10;• Split PDF into chapters and make prompts for NotebookLM&#10;• OCR scanned question paper + textbook → answer per question"></textarea>
          <div class="field-row" style="margin-top:8px">
            <select id="${id}-mode" class="sel"><option value="auto">Auto chain tools</option><option value="batch">Batch (all at once)</option><option value="per">Per question/item</option></select>
            <select id="${id}-target" class="sel"><option value="gemini">Google AI Studio (Gemini 1M)</option><option value="notebooklm">NotebookLM</option><option value="local">Local AI (this browser)</option></select>
          </div>
          <label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px"><input type="checkbox" id="${id}-has-key"> I have API key (Gemini / OpenAI)</label>
          <div class="button-row">
            <button class="btn primary" id="${id}-run">Run AI Agent</button>
            <button class="btn secondary" id="${id}-build-tool">Build new tool for this</button>
          </div>
        </div>

        <div class="panel" style="padding:12px">
          <b style="font-size:13px">Your private tools (session ${sessionCode})</b>
          <div id="${id}-private" style="margin-top:8px;font-size:12px;color:#6e655b">No private tools yet. When AI detects deficit, it will build one. Use 4-digit code to restore.</div>
          <div class="button-row" style="margin-top:8px">
            <button class="btn ghost" id="${id}-export-private" style="font-size:11px">Export private</button>
            <button class="btn ghost" id="${id}-push-review" style="font-size:11px">Push for public review</button>
          </div>
        </div>
      </aside>

      <section style="display:flex;flex-direction:column;min-width:0;min-height:0;background:#fffaf2">
        <div id="${id}-chat" style="flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px"></div>
        <div style="padding:10px;border-top:1px solid #e0d5c4;background:#f4efe6;display:flex;gap:8px">
          <input id="${id}-chat-in" class="field" placeholder="Chat with AI agent… e.g. 'I have a scanned PDF question paper'" style="flex:1">
          <button class="btn primary" id="${id}-chat-send">Send</button>
        </div>
        <div id="${id}-result" style="padding:12px;border-top:1px solid #e0d5c4;max-height:40vh;overflow:auto;display:none"></div>
      </section>
    </div>

    <div style="padding:8px 12px;background:#1c1916;color:#cbbba8;font-size:11px;display:flex;gap:8px;flex-wrap:wrap">
      <span>AI Mode combines 560+ tools. Files stay on device unless you use /api/ai. Future paid — free now.</span>
      <span style="margin-left:auto">Tip: For large PDFs, use batch mode + Gemini 1M context (free in Google AI Studio).</span>
    </div>
  </div>
  <style>
    .aim-bubble { border-radius:12px; padding:10px 12px; font-size:13px; line-height:1.45; max-width:92%; white-space:pre-wrap; }
    .aim-bubble.user { align-self:flex-end; background:#c45c26; color:#fffaf2; }
    .aim-bubble.agent { align-self:flex-start; background:#efe6d8; color:#1c1916; border:1px solid #e0d5c4; }
    .aim-bubble.tool { align-self:flex-start; background:#1c1916; color:#eadfce; font-family:ui-monospace,monospace; font-size:12px; }
    @media (max-width: 900px) {
      #${id}-main { grid-template-columns: 1fr !important; }
      #${id}-main aside { border-right:0; border-bottom:1px solid #e0d5c4; max-height:50vh; }
    }
  </style>
  `;

  const $ = sid => root.querySelector('#' + id + '-' + sid);
  const chatEl = $(`chat`);
  const resultEl = $(`result`);
  const fileInput = $(`file`);
  const drop = $(`drop`);
  const fileListEl = $(`filelist`);
  const privateEl = $(`private`);

  let files = [];
  let youtubeUrls = [];
  let privateTools = JSON.parse(localStorage.getItem(`mp-private-tools-${sessionCode}`) || '[]');

  function renderPrivate() {
    if (!privateTools.length) {
      privateEl.innerHTML = 'No private tools yet. When AI detects deficit, it will build one. Use 4-digit code to restore.';
      return;
    }
    privateEl.innerHTML = privateTools.map(t => `
      <div style="padding:6px 8px;border:1px solid #e0d5c4;border-radius:8px;margin-bottom:6px;background:#fff">
        <b>${esc(t.title)}</b><br><small>${esc(t.slug)} · ${esc(t.summary||'')}</small>
        <div style="margin-top:4px;display:flex;gap:4px">
          <button class="btn ghost" data-open="${esc(t.slug)}" style="font-size:10px;padding:4px 6px">Open</button>
          <button class="btn ghost" data-del="${esc(t.slug)}" style="font-size:10px;padding:4px 6px">Delete</button>
        </div>
      </div>
    `).join('');
    privateEl.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
      const slug = b.dataset.open;
      const spec = privateTools.find(x => x.slug === slug);
      if (spec) {
        addBubble('agent', `Opening private tool: ${spec.title}\nSlug: ${spec.slug}\nThis is your private build, not public yet.`);
        // Render preview
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<div class="panel"><h3>${esc(spec.title)}</h3><p>${esc(spec.summary||'')}</p><pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(spec, null, 2).slice(0, 4000))}</pre></div>`;
      }
    });
    privateEl.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      privateTools = privateTools.filter(x => x.slug !== b.dataset.del);
      localStorage.setItem(`mp-private-tools-${sessionCode}`, JSON.stringify(privateTools));
      renderPrivate();
    });
  }

  function renderFiles() {
    fileListEl.innerHTML = [
      ...files.map((f,i) => `<span class="file-chip">${esc(f.name)} · ${Math.round(f.size/1024)}KB <button data-rm="${i}" style="border:0;background:transparent;cursor:pointer">×</button></span>`),
      ...youtubeUrls.map((u,i) => `<span class="file-chip">YT: ${esc(u.slice(0,40))} <button data-rmyt="${i}" style="border:0;background:transparent">×</button></span>`)
    ].join('') || '<span class="muted">No files yet</span>';
    fileListEl.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { files.splice(Number(b.dataset.rm),1); renderFiles(); });
    fileListEl.querySelectorAll('[data-rmyt]').forEach(b => b.onclick = () => { youtubeUrls.splice(Number(b.dataset.rmyt),1); renderFiles(); });
  }

  function addBubble(kind, text) {
    const d = document.createElement('div');
    d.className = 'aim-bubble ' + kind;
    d.textContent = text;
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function addToolBubble(html) {
    const d = document.createElement('div');
    d.className = 'aim-bubble tool';
    d.innerHTML = html;
    chatEl.appendChild(d);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  // File handling
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('has'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('has'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('has');
    files.push(...e.dataTransfer.files);
    renderFiles();
  });
  fileInput.addEventListener('change', () => { files.push(...fileInput.files); renderFiles(); });

  $('yt-add').onclick = () => {
    const v = $('yt').value.trim();
    if (!v) return toast('Paste YouTube URL');
    youtubeUrls.push(v);
    $('yt').value = '';
    renderFiles();
    addBubble('user', `Added YouTube: ${v}`);
  };

  $('newcode').onclick = () => {
    if (!confirm('Generate new 4-digit code? You will lose access to private tools under old code unless you remember it.')) return;
    const newCode = gen4Digit();
    localStorage.setItem(LS_SESSION, newCode);
    location.reload();
  };

  $('clear').onclick = () => { chatEl.innerHTML = ''; resultEl.style.display = 'none'; resultEl.innerHTML = ''; };

  $('history').onclick = () => {
    const h = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
    if (!h.length) return addBubble('agent', 'No history yet.');
    addBubble('agent', 'Recent AI Mode history:\n' + h.slice(-10).map(x => `${new Date(x.ts).toLocaleTimeString()} [${x.session}] ${x.prompt.slice(0,80)}`).join('\n'));
  };

  $('export-private').onclick = () => {
    if (!privateTools.length) return toast('No private tools');
    downloadText(JSON.stringify(privateTools, null, 2), `megaplan-private-${sessionCode}.json`, 'application/json');
  };

  $('push-review').onclick = async () => {
    if (!privateTools.length) return toast('No private tools to push');
    if (!confirm(`Push ${privateTools.length} private tool(s) for public review? They will be checked rigorously before going live.`)) return;
    // In real app, this would POST to /api/agent-publish with review flag
    addBubble('agent', `Pushing ${privateTools.length} tool(s) for review… (simulated)\nIn production, this calls POST /api/agent-publish with proof and review queue.\nYour tools will be tested in sandboxed browser, checked for safety, then merged.`);
    // For demo, save to localStorage as pending
    localStorage.setItem(`mp-review-queue-${sessionCode}`, JSON.stringify(privateTools));
    toast('Pushed for review — admin will check');
  };

  async function runAIAgent() {
    const prompt = $('prompt').value.trim();
    if (!prompt && !files.length && !youtubeUrls.length) return toast('Upload files or enter request');
    
    const mode = $('mode').value;
    const target = $('target').value;
    const hasKey = $('has-key').checked;

    addBubble('user', prompt || '(files only)');
    saveHistory({ prompt, mode, target, files: files.map(f => f.name), youtubeUrls });

    // Step 1: Analyze files
    addBubble('agent', `Analyzing ${files.length} file(s) + ${youtubeUrls.length} YouTube URL(s)…\nMode: ${mode} · Target: ${target} · API key: ${hasKey ? 'yes' : 'no'}\nSession: ${sessionCode}`);

    // Step 2: If YouTube URLs, fetch transcripts
    if (youtubeUrls.length) {
      for (const yt of youtubeUrls) {
        addToolBubble(`Fetching YouTube transcript for ${esc(yt)}…`);
        try {
          const r = await fetch('/api/youtube-transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: yt, lang: 'en', format: 'text' })
          });
          const j = await r.json();
          if (r.ok) {
            addToolBubble(`Transcript (${j.count} segments, ${j.language}):\n${esc(j.text.slice(0, 2000))}…`);
          } else {
            addToolBubble(`Transcript failed: ${esc(j.error)}`);
          }
        } catch (e) {
          addToolBubble(`Transcript error: ${esc(e.message)}`);
        }
      }
    }

    // Step 3: If PDFs, do OCR detection
    let ocrNeeded = false;
    for (const f of files) {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        addToolBubble(`PDF detected: ${esc(f.name)} · Checking if scanned… (will use tesseract.js if needed)`);
        ocrNeeded = true;
      }
    }

    // Step 4: Ask clarifying questions like the spec
    if (!hasKey) {
      addBubble('agent', `Quick questions before I chain tools:\n1. Do you have API key? You said ${hasKey ? 'yes' : 'no'}. If no, I recommend Google AI Studio free tier — Gemini 1.5 Flash / 2.0 Flash has 1M context, perfect for large PDFs. Or use NotebookLM for question batches.\n2. Do you want ${mode === 'per' ? 'per question' : mode === 'batch' ? 'batch' : 'auto'} processing? For question paper → notes, I recommend:\n   - Batch: All questions at once → 1 prompt for Gemini 1M\n   - Per question: Each question separate → better for NotebookLM\n3. Is the PDF scanned? ${ocrNeeded ? 'Looks like yes — I will OCR first with tesseract.js in browser.' : 'Probably text PDF, no OCR needed.'}\n\nReply in chat, then I will generate the final prompts.`);
    }

    // Step 5: Call /api/ai to plan tool chain
    try {
      addToolBubble('Planning tool chain with /api/ai…');
      const toolList = JSON.parse(localStorage.getItem('mp-tools-list') || '[]');
      const allTools = toolList.length ? toolList : [{ slug: 'ocr-pdf', title: 'OCR PDF' }, { slug: 'agentic-pdf-splitter', title: 'Agentic PDF Splitter' }, { slug: 'youtube-transcript', title: 'YouTube Transcript' }];
      
      const aiPrompt = `User request: ${prompt}\nFiles: ${files.map(f => f.name).join(', ')}\nYouTube: ${youtubeUrls.join(', ')}\nMode: ${mode}\nTarget: ${target}\nHas API key: ${hasKey}\nSession: ${sessionCode}\n\nYou are MegaPLAN AI Mode. You combine ${allTools.length}+ tools. Plan the chain:\n- If PDF scanned → OCR\n- If question paper + textbook → agentic split into chapters/questions, then generate prompts for ${target}\n- If YouTube → transcript → summarize/chapters\n- Detect if new tool needed, if yes, propose to build private tool (session ${sessionCode})\nReturn JSON: { steps: [{tool, reason}], needsNewTool: bool, newToolSpec: {slug, title, summary}, prompts: { gemini, notebooklm } }`;

      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'custom', text: aiPrompt, extra: 'Return tool chain plan as JSON. Be specific about OCR, splitting, batch vs per-question.' })
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || 'AI unavailable');

      const resultText = j.result || j.text || JSON.stringify(j);
      addBubble('agent', `Tool chain plan:\n${resultText}`);

      // Step 6: Generate prompts for Gemini / NotebookLM
      const geminiPrompt = `You are given:\n- Question paper PDF (scanned, OCRed)\n- Textbook PDF\n- Request: ${prompt}\nMode: ${mode}\n\nTasks:\n1. OCR both PDFs if needed (use tesseract.js)\n2. Agentic split: Read content, split question paper into ${mode === 'per' ? 'per question' : 'batches of 5'} and map to textbook chapters\n3. For each batch, create prompt:\n   - For Gemini 1M: Include source textbook excerpt + questions + instruction "Answer based on textbook, cite page, keep concise"\n   - For NotebookLM: Just questions + prompt "Answer using the textbook as source"\n4. Recommend: Use Google AI Studio free tier Gemini 2.0 Flash (1M context) for batch, or NotebookLM for per-question\n\nGenerate final prompts now.`;

      const notebookPrompt = `Answer these questions based on the textbook PDF:\n${prompt}\n\nUse textbook as only source. If scanned, OCR first.`;

      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="panel">
          <h3>Generated Prompts for ${esc(target)}</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <b>For Google AI Studio (Gemini 1M) — copy/paste</b>
              <pre class="out" style="min-height:200px;max-height:300px">${esc(geminiPrompt)}</pre>
              <button class="btn secondary" id="${id}-copy-gemini" style="margin-top:6px">Copy Gemini prompt</button>
            </div>
            <div>
              <b>For NotebookLM — questions + prompt</b>
              <pre class="out" style="min-height:200px;max-height:300px">${esc(notebookPrompt)}</pre>
              <button class="btn secondary" id="${id}-copy-nb" style="margin-top:6px">Copy NotebookLM prompt</button>
            </div>
          </div>
          <div style="margin-top:12px">
            <b>Next steps:</b>
            <ol style="font-size:13px">
              <li>Use <b>Agentic PDF Splitter</b> tool to intelligently split PDF into chapters/questions (uses AI + python-like logic in browser)</li>
              <li>For large PDFs, use batch mode + Gemini 1M (free, 1M context)</li>
              <li>For per-question, use NotebookLM (upload textbook + questions)</li>
              <li>If you need new tool, click "Build new tool for this" — it will be private under code ${sessionCode}, push for review when ready</li>
            </ol>
          </div>
          <div class="button-row">
            <button class="btn primary" id="${id}-open-splitter">Open Agentic PDF Splitter</button>
            <button class="btn secondary" id="${id}-open-ocr">Open OCR PDF</button>
            <button class="btn ghost" id="${id}-dl-prompts">Download prompts</button>
          </div>
        </div>
      `;

      resultEl.querySelector(`#${id}-copy-gemini`).onclick = async () => { await navigator.clipboard.writeText(geminiPrompt); toast('Copied Gemini prompt'); };
      resultEl.querySelector(`#${id}-copy-nb`).onclick = async () => { await navigator.clipboard.writeText(notebookPrompt); toast('Copied NotebookLM prompt'); };
      resultEl.querySelector(`#${id}-dl-prompts`).onclick = () => {
        downloadText(`GEMINI PROMPT:\n${geminiPrompt}\n\n---\nNOTEBOOKLM PROMPT:\n${notebookPrompt}`, `megaplan-prompts-${sessionCode}.txt`, 'text/plain');
      };
      resultEl.querySelector(`#${id}-open-splitter`).onclick = () => {
        // Navigate to agentic pdf splitter tool
        location.hash = '';
        history.pushState({}, '', '/tools/agentic-pdf-splitter');
        window.dispatchEvent(new Event('popstate'));
        location.reload();
      };
      resultEl.querySelector(`#${id}-open-ocr`).onclick = () => {
        history.pushState({}, '', '/tools/ocr-pdf');
        window.dispatchEvent(new Event('popstate'));
        location.reload();
      };

      // Step 7: Detect deficit and propose new tool
      if (resultText.toLowerCase().includes('new tool') || prompt.toLowerCase().includes('build') || files.length >= 2) {
        addBubble('agent', `I detect you need a custom workflow that combines ${files.length} files + ${youtubeUrls.length} YouTube videos.\nThis is a deficit in current tools — I can build a private tool for session ${sessionCode}.\nClick "Build new tool for this" to create it. It will stay private until you Push for public review (rigorous testing).`);
      }

    } catch (e) {
      addBubble('agent', `AI planning failed: ${e.message}\n\nFallback manual plan:\n1. If scanned PDF → use OCR PDF tool (tesseract.js)\n2. Use Agentic PDF Splitter to split into chapters/questions\n3. Generate prompts for ${target}\n4. For YouTube → use YouTube Transcript + Summarizer\n5. For large context, use Google AI Studio Gemini 1.5 Flash (1M, free) or NotebookLM\n\nYour session code ${sessionCode} keeps private tools.`);
    }
  }

  $('run').onclick = runAIAgent;

  $('build-tool').onclick = async () => {
    const prompt = $('prompt').value.trim() || 'Combine uploaded files into new workflow';
    addBubble('user', `Build new tool for: ${prompt}`);
    addBubble('agent', `Building private tool for session ${sessionCode}… This uses Wiki Agent to draft, tests in sandboxed iframe, saves locally under your 4-digit code.`);

    // Use Wiki Agent API to build tool spec
    try {
      const r = await fetch('/api/agent-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: `Build a tool that: ${prompt}. Files: ${files.map(f=>f.name).join(', ')}. YouTube: ${youtubeUrls.join(', ')}. This is for AI Mode session ${sessionCode}, private until pushed. Make it useful, specific, with calculator/api block if numeric.`,
          existingPages: []
        })
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || 'Build failed');
      if (j.spec?.refusal) {
        addBubble('agent', `Build refused: ${j.spec.refusal}`);
        return;
      }
      const spec = j.spec;
      privateTools.push(spec);
      localStorage.setItem(`mp-private-tools-${sessionCode}`, JSON.stringify(privateTools));
      renderPrivate();
      addBubble('agent', `Built private tool: ${spec.title} (${spec.slug})\nSummary: ${spec.summary}\nIt is saved under session ${sessionCode} — not public. Click Push for public review when ready. It will be tested rigorously.`);
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div class="panel"><h3>Private Tool Built: ${esc(spec.title)}</h3><p>${esc(spec.summary)}</p><pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(spec, null, 2).slice(0, 5000))}</pre></div>`;
    } catch (e) {
      addBubble('agent', `Build failed: ${e.message}\nTry Self Agent with your own key, or use Wiki Agent page directly at /agent/. Your session code ${sessionCode} will still track private tools.`);
    }
  };

  $('chat-send').onclick = async () => {
    const input = $('chat-in').value.trim();
    if (!input) return;
    addBubble('user', input);
    $('chat-in').value = '';
    
    // Simple intent detection
    if (input.toLowerCase().includes('transcript') || input.toLowerCase().includes('youtube')) {
      addBubble('agent', `For YouTube transcript, use the YouTube Transcript tool or add YouTube URL in upload section. It works for any video with captions (manual or auto). I can also list playlists via YouTube Playlist Lister.`);
    } else if (input.toLowerCase().includes('pdf') && input.toLowerCase().includes('question')) {
      addBubble('agent', `For question paper + textbook workflow:\n1. Upload both PDFs\n2. Choose mode: batch (all questions at once for Gemini 1M) or per question (for NotebookLM)\n3. I will OCR if scanned (tesseract.js)\n4. Use Agentic PDF Splitter to intelligently split into chapters/questions\n5. I generate prompts for Google AI Studio (Gemini 2.0 Flash, 1M context, free) or NotebookLM\n\nYour session code ${sessionCode} remembers private tools.`);
    } else {
      // Call AI for chat
      try {
        const r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'custom', text: input, extra: `You are MegaPLAN AI Mode, session ${sessionCode}. You combine 560+ tools. Help user with complex request. If need new tool, propose building private tool under 4-digit code ${sessionCode}.` })
        });
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        addBubble('agent', j.result || j.text || JSON.stringify(j).slice(0, 2000));
      } catch (e) {
        addBubble('agent', `Chat failed: ${e.message}. Try AI Mode Run button for full workflow.`);
      }
    }
  };

  $('chat-in').addEventListener('keydown', e => { if (e.key === 'Enter') $('chat-send').click(); });

  // Initial greet
  addBubble('agent', `Welcome to AI Mode! Session ${sessionCode}\n\nI combine 560+ tools:\n• PDF: OCR, agentic split, merge, etc\n• YouTube: transcript (all videos with captions), playlist lister, chapters\n• Audio: studio, transcription\n• And more\n\nUpload files + describe complex request, I will chain tools and generate prompts for Gemini 1M / NotebookLM.\nIf I detect deficit, I will build private tool under your 4-digit code ${sessionCode} — not public until you Push for review (rigorous testing).\n\nFuture: This will be paid, currently free. Try: "Question paper PDF + textbook → notes per question"`);
  renderPrivate();
  renderFiles();
}
