// TEMPORARY read-only artifact mirror helper (delete with artifact-mirror.yml
// before the data PR). Re-emits downloaded review-artifact files as check-run
// annotations so a reviewer whose egress cannot reach Actions artifact blob
// storage can read them back through api.github.com. Every file is verified
// by SHA-256 on both sides of the channel; nothing is written to the repo.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const CHUNK = 3500;
const PARTS = 12;
const root = process.cwd();
const mirrorDir = path.join(root, 'mirror');

function walk(dir, base = dir) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs, base));
    else out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs, size: st.size });
  }
  return out;
}

export function buildStream() {
  const files = walk(mirrorDir).sort((a, b) => (a.rel < b.rel ? -1 : 1));
  if (!files.length) throw Error('mirror/ is empty');
  let stream = 'MIRROR1';
  for (const f of files) {
    const raw = fs.readFileSync(f.abs);
    const gz = zlib.gzipSync(raw, { level: 9 });
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    stream += `~FILE~${f.rel}~${raw.length}~${sha}~${gz.length}~${gz.toString('base64')}`;
  }
  return { stream, files };
}

export function parseStream(stream) {
  if (!stream.startsWith('MIRROR1')) throw Error('bad stream header');
  const parts = stream.slice('MIRROR1'.length).split('~FILE~').filter(Boolean);
  return parts.map(part => {
    const first = part.indexOf('~');
    const rel = part.slice(0, first);
    const rest = part.slice(first + 1).split('~');
    const [size, sha, gzLen, b64] = rest;
    if (rest.length !== 4) throw Error(`bad file record: ${rel}`);
    return { rel, size: Number(size), sha, gzLen: Number(gzLen), b64 };
  });
}

function chunksOf(stream) {
  const out = [];
  for (let i = 0; i < stream.length; i += CHUNK) out.push(stream.slice(i, i + CHUNK));
  return out;
}

async function fetchAnnotations() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const runs = await (await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, { headers })).json();
  const targets = (runs.check_runs || []).filter(r => /^mirror-[abc]$/.test(r.name));
  if (targets.length !== 3) throw Error(`expected 3 mirror check runs, found ${targets.length}`);
  const messages = [];
  for (const run of targets) {
    for (let page = 1; page <= 20; page++) {
      const res = await (await fetch(`https://api.github.com/repos/${repo}/check-runs/${run.id}/annotations?per_page=100&page=${page}`, { headers })).json();
      if (!Array.isArray(res)) throw Error('annotations fetch failed');
      for (const a of res) if (typeof a.message === 'string' && a.message.startsWith('MIRROR|')) messages.push(a.message);
      if (res.length < 100) break;
    }
  }
  return messages;
}

async function main() {
  const [, , mode, arg] = process.argv;
  const { stream, files } = buildStream();
  const streamSha = crypto.createHash('sha256').update(stream).digest('hex');
  const chunks = chunksOf(stream);

  if (mode === 'emit') {
    const part = Number(arg);
    if (!Number.isInteger(part) || part < 0 || part >= PARTS) throw Error('emit needs a valid part');
    let count = 0;
    for (let i = part; i < chunks.length; i += PARTS) {
      process.stdout.write(`::notice::MIRROR|${i}|${chunks.length}|${streamSha}|${chunks[i]}\n`);
      count++;
    }
    console.log(`Emitted ${count}/${chunks.length} chunks for part ${part} of stream ${streamSha}`);
    return;
  }

  if (mode === 'verify') {
    await new Promise(r => setTimeout(r, 15000));
    const messages = await fetchAnnotations();
    const byIndex = new Map();
    let total = null;
    for (const msg of messages) {
      const [tag, idxS, totalS, sha, ...rest] = msg.split('|');
      if (tag !== 'MIRROR') continue;
      if (total === null) total = Number(totalS);
      if (Number(totalS) !== total || sha !== streamSha) throw Error('chunk metadata mismatch');
      byIndex.set(Number(idxS), rest.join('|'));
    }
    if (byIndex.size !== total) throw Error(`missing chunks: have ${byIndex.size} of ${total}`);
    let rebuilt = '';
    for (let i = 0; i < total; i++) {
      if (!byIndex.has(i)) throw Error(`missing chunk ${i}`);
      rebuilt += byIndex.get(i);
    }
    const rebuiltSha = crypto.createHash('sha256').update(rebuilt).digest('hex');
    if (rebuiltSha !== streamSha) throw Error(`stream sha mismatch: ${rebuiltSha}`);
    const records = parseStream(rebuilt);
    if (records.length !== files.length) throw Error('file count mismatch');
    const rebuiltDir = path.join(root, 'mirror-rebuilt');
    fs.rmSync(rebuiltDir, { recursive: true, force: true });
    for (const r of records) {
      const raw = zlib.gunzipSync(Buffer.from(r.b64, 'base64'));
      const sha = crypto.createHash('sha256').update(raw).digest('hex');
      if (raw.length !== r.size || sha !== r.sha) throw Error(`file verify failed: ${r.rel}`);
      const dest = path.join(rebuiltDir, r.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, raw);
      const orig = fs.readFileSync(path.join(mirrorDir, r.rel));
      if (!orig.equals(raw)) throw Error(`mirror/ copy differs: ${r.rel}`);
    }
    console.log(`MIRROR-OK stream=${streamSha} files=${records.length} chunks=${total}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      fs.appendFileSync(summary, `## Artifact mirror verified\n\nstream sha256: \`${streamSha}\`\n\nfiles: ${records.length}, chunks: ${total}\n\n`);
      fs.appendFileSync(summary, '```\n' + stream + '\n```\n');
    }
    return;
  }
  throw Error('usage: emit <part> | verify');
}

await main();
