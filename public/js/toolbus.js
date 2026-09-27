/**
 * MegaPLAN AI Mode — tool bus.
 *
 * Mounts a registry tool into a hidden host, discovers its DOM contract
 * (#tool-in / #n0.. / #file, #run, #tool-out), fills it from the plan step,
 * clicks Run, and captures the result. Bespoke studios (PDF, Maps, Games)
 * are never driven blindly — the planner already marks those as OPEN.
 *
 * Honest limits: no filesystem writes, no private-network fetches, no
 * pretending a catalogued tool ran.
 */

const PROBE_DENY = new Set([
  'PDF', 'Games', 'Maps'
]);

const DENY_SLUG = /^(maps|ai-mode|wiki-agent|self-agent|audio-studio|inception)/i;

let mountToolFn = null;
async function getMountTool() {
  if (mountToolFn) return mountToolFn;
  await import('./engines-rest.js');              // side-effect: fills HANDLERS
  const { mountTool } = await import('./engines.js');
  mountToolFn = mountTool;
  return mountToolFn;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hostEl() {
  let el = document.getElementById('ai-toolbus-host');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ai-toolbus-host';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:-9999px;top:0;width:640px;height:480px;overflow:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
  return el;
}

export function isDrivable(tool) {
  if (!tool) return false;
  if (tool.status === 'catalogued') return false;
  // The measured contract table is authoritative when present: R and N are the
  // only classes this bus may drive. S is an app, C has no runner, F was never
  // seen producing output. Guessing from the category is the fallback only.
  if (tool.toolClass) return tool.toolClass === 'R' || tool.toolClass === 'N';
  if (PROBE_DENY.has(tool.category)) return false;
  if (DENY_SLUG.test(String(tool.slug || ''))) return false;
  if (tool.category === 'PDF') return false;
  return true;
}

function discover(root) {
  const q = sel => root.querySelector(sel);
  const text = q('#tool-in') || q('textarea');
  const run = q('#run') || q('button.primary') || q('button[type="submit"]');
  const out = q('#tool-out') || q('pre.out') || q('.out');
  const file = q('#file') || q('input[type="file"]');
  const nums = [...root.querySelectorAll('input.num, input[type="number"]')];
  const extra = q('#extra');
  return { text, run, out, file, nums, extra, kind: file ? 'file' : nums.length ? 'calc' : text ? 'text' : 'unknown' };
}

function fillText(node, value) {
  if (!node) return;
  node.value = value == null ? '' : String(value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
  node.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillFiles(input, files) {
  if (!input || !files?.length) return;
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch { /* DataTransfer may be unavailable in some hosts */ }
}

function readOut(node) {
  if (!node) return '';
  if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') return String(node.value || '');
  return String(node.textContent || node.innerText || '');
}

function collectArtifacts(root) {
  const arts = [];
  for (const a of root.querySelectorAll('a[download], a[href^="blob:"]')) {
    arts.push({ kind: 'link', href: a.href, name: a.getAttribute('download') || a.textContent || 'download' });
  }
  for (const img of root.querySelectorAll('img[src^="blob:"], img[src^="data:"]')) {
    arts.push({ kind: 'image', src: img.src, alt: img.alt || '' });
  }
  return arts;
}

/**
 * Drive one registry tool.
 * @param {{tool:object, text?:string, files?:File[], numbers?:number[], extra?:string, timeoutMs?:number}} job
 */
export async function runTool(job) {
  const tool = job.tool;
  if (!isDrivable(tool)) {
    return { ok: false, skipped: true, reason: 'bespoke-or-catalogued', tool: tool?.slug };
  }
  const mountTool = await getMountTool();
  const host = hostEl();
  host.innerHTML = '';
  const started = Date.now();
  try {
    await mountTool(host, tool);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), tool: tool.slug };
  }
  const ui = discover(host);
  if (ui.kind === 'unknown' || !ui.run) {
    host.innerHTML = '';
    return { ok: false, skipped: true, reason: 'no-run-contract', tool: tool.slug };
  }
  if (job.text != null) fillText(ui.text, job.text);
  if (job.extra != null) fillText(ui.extra, job.extra);
  if (Array.isArray(job.numbers)) {
    job.numbers.forEach((n, i) => {
      const el = ui.nums[i] || host.querySelector('#n' + i);
      if (el) fillText(el, n);
    });
  }
  if (job.files?.length) fillFiles(ui.file, job.files);

  const before = readOut(ui.out);
  try { ui.run.click(); } catch (e) {
    host.innerHTML = '';
    return { ok: false, error: 'run-click: ' + (e.message || e), tool: tool.slug };
  }

  const timeout = Math.max(800, Number(job.timeoutMs) || 12000);
  let text = before;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(60);
    text = readOut(ui.out);
    if (text && text !== before && !/^working/i.test(text.trim())) break;
    if (collectArtifacts(host).length) break;
  }
  const artifacts = collectArtifacts(host);
  const ok = Boolean((text && text !== before) || artifacts.length);
  const result = {
    ok,
    tool: tool.slug,
    title: tool.title,
    kind: ui.kind,
    text: text || '',
    artifacts,
    ms: Date.now() - started
  };
  // Keep the host empty so Games/canvas loops cannot linger.
  try { host.innerHTML = ''; } catch { /* ignore */ }
  return result;
}

export async function runPlanStep(step, ctx = {}) {
  const tools = ctx.tools || [];
  const tool = tools.find(t => t.slug === step.tool);
  if (!tool) return { ok: false, error: 'unknown-tool', slug: step.tool };
  return runTool({
    tool,
    text: step.params?.text || ctx.text || ctx.prompt || '',
    files: ctx.files || [],
    numbers: step.params?.numbers,
    extra: step.params?.extra,
    timeoutMs: ctx.timeoutMs
  });
}

export function unmountBus() {
  const el = document.getElementById('ai-toolbus-host');
  if (el) el.innerHTML = '';
}
