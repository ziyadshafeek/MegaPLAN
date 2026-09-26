// Candidate-only crawler of openly licensed image METADATA and URLs.
// Never downloads images or publishes unreviewed links to the website.
import fs from 'node:fs';
import { SAFE_TOPICS, researchTopic } from '../lib/presentation-sources.js';
const items = new Map();
let completed = 0;
for (const topic of SAFE_TOPICS) {
  const result = await researchTopic(topic);
  if (!result.availability.openverse) { console.warn(`Openverse unavailable for ${topic}`); continue; }
  completed++;
  for (const item of result.images) items.set(item.id, { ...item, topic, reviewed: false });
}
if (!completed || !items.size) throw Error('No verifiable Openverse image-link candidates returned; existing files unchanged.');
fs.mkdirSync(new URL('../data/image-links/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../data/image-links/candidates.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), topics: SAFE_TOPICS, count: items.size, note: 'URLs/attribution only. Human review required before publishing; Openverse maturity labels are imperfect.', items: [...items.values()] }, null, 2) + '\n');
console.log(`${items.size} licensed candidate LINKS from ${completed} successful topic queries; no image bytes downloaded. Public index remains unchanged pending review.`);
