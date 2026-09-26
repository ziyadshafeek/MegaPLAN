import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const p of ['lib/api/agent-dispatch.js','lib/api/agent-status.js','lib/api/github-secret-setup.js','scripts/agent-actions-runner.mjs','scripts/agent-actions-browser.mjs']){const r=spawnSync(process.execPath,['--check',new URL('../'+p,import.meta.url).pathname],{encoding:'utf8'});assert.equal(r.status,0,`${p} syntax`)}
const wf=read('.github/workflows/agent-online-store.yml');for(const x of ['workflow_dispatch','contents: write','NVIDIA_API_KEY','NVIDIA_AGENT_MODEL','playwright','git push origin HEAD:main','data/agent-pages'])assert.match(wf,new RegExp(x.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')),x);
const setup=read('lib/api/github-secret-setup.js');assert.match(setup,/crypto_box_seal/);assert.match(setup,/AGENT_SETUP_TOKEN/);assert.match(setup,/NVIDIA_API_KEY/);
const js=read('public/agent/agent.js');assert.match(js,/function autonomous\(/);assert.match(js,/api\/agent-dispatch/);assert.match(js,/api\/agent-status/);assert.match(js,/GitHub runner/);
const sync=read('.github/workflows/sync-ai-env.yml');assert.match(sync,/NVIDIA_API_KEY/);assert.match(sync,/VERCEL_TOKEN/);assert.match(sync,/sync-github-ai-to-vercel/);
console.log('agent actions static ok');
