import { esc, mountShell, toast } from './kit.js';

export function mountInceptionTool(root, tool) {
  const id = 'inc-' + Math.random().toString(36).slice(2, 6);
  root.innerHTML = '';
  const body = mountShell(root, tool, `
    <div class="panel" style="padding:18px;max-width:850px;margin:0 auto">
      <h2>Inception Labs</h2>
      <p class="muted">Use the official Inception Labs API when the site operator has configured <code>INCEPTION_API_KEY</code>. Without it, this tool cannot generate a response. Outputs are AI-generated and may be wrong; verify facts, especially maps and travel estimates.</p>
      <p id="${id}-status" class="note" aria-live="polite">Checking provider configuration…</p>
      <label for="${id}-model">Model</label>
      <select id="${id}-model" class="sel"><option value="mercury-2.5">Mercury 2.5</option><option value="mercury-2">Mercury 2</option></select>
      <label for="${id}-prompt" style="display:block;margin-top:12px">Your prompt</label>
      <textarea id="${id}-prompt" class="input-area" style="min-height:130px;width:100%" placeholder="Ask a question; include the information needed to answer it."></textarea>
      <div class="button-row"><button class="btn primary" id="${id}-send">Generate response</button></div>
      <div id="${id}-out" class="out" aria-live="polite" style="min-height:100px;white-space:pre-wrap">Response will appear here.</div>
    </div>
  `);
  const $ = sid => body.querySelector('#' + id + '-' + sid);
  fetch('/api/inception?action=status').then(r => r.json()).then(j => {
    $(`status`).textContent = j.configured ? 'Official provider key is configured. This status does not prove the provider is currently responding.' : 'The operator has not configured the provider key. Generation is unavailable.';
  }).catch(() => { $(`status`).textContent = 'Provider configuration status is unavailable.'; });

  async function send() {
    const content = $(`prompt`).value.trim();
    if (!content) return toast('Enter a prompt first');
    const button = $(`send`);
    button.disabled = true;
    $(`out`).textContent = 'Contacting Inception Labs…';
    try {
      const r = await fetch('/api/inception', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: $(`model`).value, messages: [{ role: 'user', content }] })
      });
      const j = await r.json();
      $(`out`).textContent = r.ok ? String(j.content || '') : `Unavailable: ${j.error || 'Request failed'}`;
    } catch (e) { $(`out`).textContent = `Unable to reach the service: ${esc(e.message)}`; }
    finally { button.disabled = false; }
  }
  $(`send`).onclick = send;
  $(`prompt`).addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
}
