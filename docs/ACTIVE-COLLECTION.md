# Active collection controls and provenance

## Trivandrum directories

`/tools/trivandrum-music-places` lists OSM-tagged music venues, clubs, and music/instrument shops, **not recorded tracks**. `/tools/trivandrum-shop-directory` lists OSM-tagged shops. They use bounded attributed OpenStreetMap node samples: shops within 2.5 km and music-related places within 6.5 km, from the same snapshot at `public/data/city-directory/index.json`. This is a sample within 6.5 km of the city center, not comprehensive coverage, live availability, current prices, or a Spotify catalogue. Both start empty until a verified scan succeeds; the initial network trial indexed ten Spotify tracks, but city OSM and Flipkart did not produce publishable records.

Run `node scripts/city-directory-runner.mjs` in a network-enabled checkout to attempt a one-shot collection. A failure does not replace the last verified snapshot. The source is OpenStreetMap via Overpass; attribution and ODbL are displayed next to the data. The run attempts two mirrors but does not bypass rate limits.

## Background trial on the session branch

The branch-scoped `Collect verified directories (branch trial)` GitHub Action starts when its workflow or collector source is pushed to `arena/01a0dd3c-megaplan`. Its four bounded one-shot jobs attempt city OSM, a Kerala OSM cell, Flipkart products and Spotify tracks. Each step reports its actual outcome. Successful snapshots are committed only to this branch. A step that fails does **not** make up records. A workflow start/checkmark alone is not evidence of an indexed dataset: inspect its log and the snapshot count. The workflow has `workflow_dispatch` for a permitted repository operator to run it again on the session branch. GitHub Actions permissions for this sandbox's integration did not allow dispatch (HTTP 403); the operator may need to grant Actions write permission or dispatch in GitHub's UI. Do not send credentials or tokens in chat.

Current local sandbox outbound HTTPS to Overpass, Spotify, Flipkart, and Inception fails during TLS negotiation. Local attempts cannot be represented as successful indexing. GitHub Actions may have different networking; verify results in its logs and branch commits before claiming success. The action does not automatically publish to the production site; merging/redeploying on the default branch is a separate authorized action.

## Inception

Do not run a Chromium bot that reverse engineers, scrapes, or automates `chat.inceptionlabs.ai`, generates accounts, or rotates fake IPs to circumvent limits. Inception's published Terms of Use prohibit crawling/scraping and reverse engineering the Services, and restrict unattended processes. The official Inception API remains the supported integration; it needs a privately configured `INCEPTION_API_KEY` and provider-side billing/quotas. Browser-based functional testing of *this site's* UI is distinct from automating a third-party chat interface.
