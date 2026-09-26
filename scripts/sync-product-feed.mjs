// Scheduled only after a retailer issues redistributable affiliate/feed rights.
// Never crawls a storefront and never logs the bearer credential or raw feed.
import { publishAuthorizedFeed } from './import-authorized-products.mjs';
const { PRODUCT_FEED_URL: url, PRODUCT_FEED_TOKEN: token, PRODUCT_FEED_PERMISSION_URL: evidence, PRODUCT_RETAILER_DOMAIN: domain } = process.env;
if (!url || !token || !evidence || !domain) {
  console.log('SKIPPED_POLICY: no authorized retailer feed URL, token, permission evidence and domain configured.');
  process.exit(0);
}
const upstream = new URL(url);
if (upstream.protocol !== 'https:' || upstream.username || upstream.password || !/^https:\/\//.test(evidence)) throw Error('Feed and permission evidence must use HTTPS.');
const response = await fetch(upstream, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
if (!response.ok) throw Error(`Authorized feed HTTP ${response.status}; no records published.`);
if (Number(response.headers.get('content-length') || 0) > 2_000_000) throw Error('Feed exceeds 2 MB bounded import limit. Use paginated authorized feed exports.');
const text = await response.text();
if (text.length > 2_000_000) throw Error('Feed exceeds bounded import limit.');
const body = JSON.parse(text);
const result = publishAuthorizedFeed({ authorization: 'operator-confirmed-licensed-feed', permissionEvidence: evidence, retailerDomain: domain, products: body.products });
console.log(`Verified and indexed ${result.imported} licensed listings (${result.total} stored). Prices may change. No storefront scraping.`);
