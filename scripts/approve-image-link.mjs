// Operator-only: open the Commons landing page and visually review age safety,
// accuracy, and license BEFORE invoking this explicit approval command.
import fs from 'node:fs';
const [flag, id, ack] = process.argv.slice(2);
if (flag !== '--id' || !id || ack !== '--ack-reviewed') throw Error('Usage: node scripts/approve-image-link.mjs --id <candidate-id> --ack-reviewed (after human visual review)');
const candidates = JSON.parse(fs.readFileSync(new URL('../data/image-links/candidates.json', import.meta.url)));
const item = candidates.items.find(x => x.id === id);
if (!item) throw Error('Candidate not found');
if (!item.landingUrl.startsWith('https://commons.wikimedia.org/') || !item.imageUrl.startsWith('https://upload.wikimedia.org/')) throw Error('Unexpected source URL');
const file = new URL('../data/image-links/index.json', import.meta.url);
const index = JSON.parse(fs.readFileSync(file));
index.items = [...index.items.filter(x => x.id !== id), { ...item, reviewed: true, approvedAt: new Date().toISOString() }].slice(-200);
index.updatedAt = new Date().toISOString();
const content = JSON.stringify(index, null, 2) + '\n';
fs.writeFileSync(file, content);
fs.writeFileSync(new URL('../public/data/image-links/index.json', import.meta.url), content);
console.log(`Approved metadata link ${id} after human review. No image bytes stored.`);
