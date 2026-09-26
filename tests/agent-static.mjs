import fs from 'node:fs';
import assert from 'node:assert/strict';

const files = [
  'public/agent/index.html', 'public/agent/agent.css', 'public/agent/agent.js',
  'public/agent/view.html', 'api/agent-plan.js', 'api/agent-publish.js',
  'api/agent-health.js', 'data/agent-pages.json'
];
for (const f of files) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), `missing ${f}`);

const html = fs.readFileSync(new URL('../public/agent/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('Wiki Agent'), 'Wiki Agent title missing');
assert.ok(!html.includes('Agent Online Store'), 'old Agent Online Store name still in agent home');

const js = fs.readFileSync(new URL('../public/agent/agent.js', import.meta.url), 'utf8');
for (const t of ['sandbox', 'runBrowserTests', 'agent-publish', 'localStorage', 'CSS.escape', 'Self Agent', 'mountWikiAgent', 'codex', 'Deploy']) {
  assert.ok(js.includes(t), `missing ${t}`);
}
assert.ok(!/NVIDIA_AGENT_MODEL/.test(js), 'model env leaked into agent client');

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
assert.ok(app.includes('Wiki Agent'), 'Wiki Agent missing from home OS');
assert.ok(app.includes('Self Agent'), 'Self Agent missing from home OS');

const css = fs.readFileSync(new URL('../public/agent/agent.css', import.meta.url), 'utf8');
assert.match(css, /max-width: 840px/);

console.log('agent-static ok');
