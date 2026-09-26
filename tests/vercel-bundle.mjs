import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nodeFileTrace } from '@vercel/nft';

// Exercise the same Node file tracer Vercel uses instead of merely importing
// handlers locally (a variable import succeeds locally but disappears in /var/task).
const { fileList, warnings } = await nodeFileTrace(['api/index.js'], { base: new URL('..', import.meta.url).pathname });
const bundled = new Set(fileList);
const handlers = fs.readdirSync(new URL('../lib/api/', import.meta.url)).filter(name => name.endsWith('.js'));
for (const name of handlers) assert.ok(bundled.has('lib/api/' + name), `Vercel bundle misses lib/api/${name}`);
for (const name of ['lib/nvidia.js', 'lib/rate-limiter.js', 'public/agent/expression.js']) assert.ok(bundled.has(name), `Vercel bundle misses ${name}`);
assert.equal(warnings.size, 0, [...warnings].map(String).join('\n'));
console.log(`Vercel nft bundle ok: ${handlers.length} handlers and shared dependencies traced (${bundled.size} files)`);
