import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Structural DOM mount audit, not an interaction/output test. Canvas and
// external APIs are stubbed so the registry can be walked without a browser.
const dom = new JSDOM('<!doctype html><html><body><div id="target"></div></body></html>', { url: 'https://mega-plan.test/' });
const { window } = dom;
for (const name of ['window','document','navigator','localStorage','sessionStorage','history','location','Image','FileReader']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
}
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: (_target, key) => key === 'measureText' ? () => ({ width: 0 }) : () => {}
});
const originalInterval = globalThis.setInterval;
globalThis.setInterval = () => 0; // prevent game loops persisting after unmount
window.requestAnimationFrame = () => 0;
globalThis.fetch = async () => new Response('{}', { status: 200 });
const { mountTool } = await import('../public/js/engines.js');
await import('../public/js/engines-rest.js');
const registry = JSON.parse(fs.readFileSync(new URL('../data/tools.json', import.meta.url)));
const root = window.document.getElementById('target');
const failures = [];
try {
  for (const tool of registry) {
    try {
      await mountTool(root, tool);
      if (!root.textContent.trim() && !root.querySelector('canvas')) failures.push(`${tool.slug}: empty mount`);
    } catch (error) { failures.push(`${tool.slug}: ${error.message}`); }
    root.replaceChildren();
  }
  for (const [title, input, output] of [
    ['Purchase Tracker', 'Notebook | 2 | 12.50', 'Total: 25.00'],
    ['Timetable Maker', 'Monday | 10:00 | Algebra', '| Monday | 10:00 | Algebra |'],
    ['CSV Merger', 'name,notes\n"Ada, Lovelace","line1\nline2"\n---\nname,notes\nGrace,compiler', 'Grace,compiler'],
    ['Subtitle Extractor', '1\n00:00:01,000 --> 00:00:02,000\nHello world', 'Hello world']
  ]) {
    const tool = registry.find(x => x.title === title);
    assert.ok(tool, `${title} missing from registry`);
    await mountTool(root, tool);
    root.querySelector('#tool-in').value = input;
    await root.querySelector('#run').onclick();
    assert.ok(root.querySelector('#tool-out').textContent.includes(output), `${title} produced incorrect output`);
    root.replaceChildren();
  }
} finally {
  globalThis.setInterval = originalInterval;
  dom.window.close();
}
assert.deepEqual(failures, [], `mount failures:\n${failures.join('\n')}`);
console.log(`tool mount ok: ${registry.length} registry entries render in a simulated DOM (operations not E2E)`);
