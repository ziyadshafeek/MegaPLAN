import { esc, downloadBlob, mountShell } from './kit.js';

export function presentationTopic(prompt) {
  if (!/\b(?:pptx?|power\s*point|presentation|slide\s*deck|slides?)\b/i.test(prompt) || !/\b(?:make|create|generate|build|prepare|need|want|give|download)\b/i.test(prompt)) return null;
  const match = String(prompt).match(/\b(?:on|about|covering|regarding)\s+(.+)$/i);
  const topic = (match?.[1] || prompt.replace(/\b(?:please|make|create|generate|build|prepare|need|want|give|download|a|an|me|pptx?|power\s*point|presentation|slide\s*deck|slides?)\b/gi, ' ')).replace(/\b(?:with|in)\s+\d+\s+slides?\b.*$/i, '').replace(/[.!?]+$/, '').trim();
  return topic.length >= 3 ? topic.slice(0, 150) : '';
}

export async function createPresentation(topic, notes = '', slideCount = 5) {
  const response = await fetch('/api/presentation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, notes, slideCount }) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.error || `Presentation failed (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.type && !blob.type.includes('presentationml')) throw Error('Server returned an unexpected file type.');
  const name = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'presentation'}.pptx`;
  downloadBlob(blob, name);
  return { name, bytes: blob.size };
}

export function mountPresentationTool(root, tool) {
  const body = mountShell(root, tool, `<p class="muted">Online research: Wikipedia; optional configured Brave search. Openverse searches for image candidates, but only human-reviewed, licensed, non-explicit image LINKS are shown. No image files are stored or embedded in your deck. Your topic and notes are sent to the MegaPLAN server to make the PPTX.</p>
    <label>Topic <input id="ppt-topic" class="field" maxlength="150" placeholder="e.g. solar energy in India"></label>
    <label style="display:block;margin-top:12px">Your notes (optional; used as slide text; max 4,000 characters)<textarea id="ppt-notes" class="input-area" maxlength="4000" placeholder="One point per line"></textarea></label>
    <label style="display:block;margin-top:12px">Slides (including cover and sources) <input id="ppt-count" class="num" type="number" min="3" max="8" value="5"></label>
    <div class="field-row" style="margin-top:12px"><button id="ppt-search" class="btn secondary">Search sources</button><button id="ppt-create" class="btn primary">Create & download .pptx</button></div>
    <div id="ppt-results" role="status" aria-live="polite" style="margin-top:14px"></div>`);
  const $ = id => body.querySelector('#' + id), out = $('ppt-results');
  $('ppt-search').onclick = async () => {
    out.textContent = 'Searching permitted online sources…';
    try {
      const r = await fetch(`/api/presentation?q=${encodeURIComponent($('ppt-topic').value.trim())}`);
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      const row = item => `<li><a href="${esc(item.url || item.landingUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a> — ${esc(item.snippet || `${item.creator} · ${item.license}`)}</li>`;
      out.innerHTML = `<p>Wikipedia ${data.availability.wikipedia ? 'reachable' : 'unavailable'} · Openverse candidate search ${data.availability.openverse ? 'reachable' : 'unavailable'} · broad web ${data.availability.web ? 'enabled' : 'not configured'}. Sources may be incomplete.</p>
        <h3>Research links</h3><ul>${[...data.articles, ...data.web, ...(data.dataset || [])].map(row).join('') || '<li>No results. Supply your own notes to make a deck.</li>'}</ul>
        <h3>Reviewed image links (no images downloaded)</h3><ul>${data.images.map(row).join('') || '<li>No reviewed links for this topic yet.</li>'}</ul>
        <p class="muted">${esc(data.imageSource)}. Links require license/attribution verification.</p>`;
    } catch (e) { out.textContent = e.message; }
  };
  $('ppt-create').onclick = async () => {
    out.textContent = 'Researching and building your downloadable PowerPoint…';
    try {
      const result = await createPresentation($('ppt-topic').value.trim(), $('ppt-notes').value, Number($('ppt-count').value));
      out.textContent = `Downloaded ${result.name} (${Math.round(result.bytes / 1024)} KB). Source snippets and references are in the deck; review them before presenting.`;
    } catch (e) { out.textContent = e.message; }
  };
}
