// Read-only workflow output: measured source changes, never a claim of publication.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function measure(source, root = process.cwd()) {
  const dir = path.join(root, 'data', `${source}-directory`);
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const index = read('index.json');
  let records;
  if (source === 'map') records = (index.cells || []).flatMap(i => read(`cell_${i}.json`).places || []);
  else if (fs.existsSync(path.join(dir, 'shards'))) records = fs.readdirSync(path.join(dir, 'shards')).filter(x => x.endsWith('.json')).flatMap(x => read(`shards/${x}`).records || []);
  else records = index.tracks || [];
  return { distinctRecords: new Set(records.map(x => x.id)).size, occurrences: records.length,
    cells: source === 'map' ? new Set(index.cells).size : undefined, sourceTimestamp: index.lastScannedAt || null };
}
export function review(source, root = process.cwd(), run = spawnSync) {
  if (!['map', 'music'].includes(source)) throw Error('Expected map or music');
  const output = path.join(root, 'collection-review-output');
  fs.rmSync(output, { recursive: true, force: true });
  const before = measure(source, root);
  const args = source === 'map' ? ['scripts/kerala-expansion-runner.mjs', '--phase', '1', '--batch', '2', '--workers', '1'] : ['scripts/open-music-runner.mjs'];
  const result = run(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error('Upstream collection failed; no review artifact or publication permitted');
  const after = measure(source, root);
  const report = { source, branch: process.env.GITHUB_REF_NAME || null, sha: process.env.GITHUB_SHA || null,
    measuredAt: new Date().toISOString(), before, after, distinctDelta: after.distinctRecords - before.distinctRecords,
    collection: 'completed', publication: 'pending-human-PR-review', deployed: false };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  // Include new files without staging anything or requiring Git write permissions.
  fs.cpSync(path.join(root, 'data', `${source}-directory`), path.join(output, 'data', `${source}-directory`), { recursive: true });
  fs.cpSync(path.join(root, 'public/data', `${source}-directory`), path.join(output, 'public/data', `${source}-directory`), { recursive: true });
  console.log(JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { review(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
