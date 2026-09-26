import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
const dir = new URL('../.github/workflows/', import.meta.url);
const workflows = new Map(fs.readdirSync(dir).filter(x => x.endsWith('.yml')).map(name => [name, parse(fs.readFileSync(new URL(name, dir), 'utf8'))]));
const shellOK = script => spawnSync('bash', ['-n'], { input: script.replace(/\$\{\{[\s\S]*?\}\}/g, 'EXPRESSION'), encoding: 'utf8' }).status === 0;
assert.equal(shellOK("if true; then\n  node - << 'JS'\n  console.log('x');\n  JS\nfi"), false, 'detect old heredoc bug');
for (const [name, workflow] of workflows) {
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps || []) {
    if (step.run) assert.ok(shellOK(step.run), `${name}: ${step.name} has invalid shell syntax`);
    if (step.run && workflow.on.schedule) assert.doesNotMatch(step.run, /(?:product|music|map)-scraper-runner|auto-master|spotify|NVIDIA_API_KEY/i, `${name}: unsafe scheduled command`);
  }
}
for (const name of ['auto-master.yml', 'collect-now.yml']) {
  const w = workflows.get(name);
  assert.deepEqual(Object.keys(w.on), ['workflow_dispatch']);
  assert.equal(w.permissions.contents, 'read');
  assert.doesNotMatch(JSON.stringify(w.jobs), /node scripts|git push|secrets\./);
}
assert.equal(workflows.get('product-scraper.yml').on.schedule, undefined);
for (const source of ['map', 'music']) {
  const owners = [...workflows].filter(([, w]) => w.on.schedule && JSON.stringify(w.jobs).includes(`collection-review.mjs ${source}`));
  assert.equal(owners.length, 1, `${source}: exactly one schedule owner`);
  const w = workflows.get(`${source}-scraper.yml`);
  assert.equal(w.permissions.contents, 'read');
  const steps = w.jobs.collect.steps;
  assert.equal(steps[0].with['persist-credentials'], false);
  assert.equal(steps.find(x => x.uses?.startsWith('actions/upload-artifact')).with['if-no-files-found'], 'error');
  assert.ok(steps.every(x => !x['continue-on-error']));
  assert.doesNotMatch(JSON.stringify(steps), /git push|\|\| true|NVIDIA/);
  assert.match(JSON.stringify(steps), /pending human PR review/);
  const upload = steps.find(x => x.uses?.startsWith('actions/upload-artifact'));
  assert.equal(upload.with.path, 'collection-review-output/', 'upload must match the non-hidden collector output directory');
  assert.ok(upload.with.path.split('/').every(part => !part.startsWith('.')), 'default upload filtering excludes hidden directories');
  assert.equal(upload.if, undefined, 'artifact only after successful upstream, upload errors fail job');
}
console.log('Workflow safety: parsed YAML, bash syntax, retired schedulers, bounded source ownership, fail-closed review artifacts OK');
