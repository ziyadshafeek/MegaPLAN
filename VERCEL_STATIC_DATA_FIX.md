# Vercel static data fix

The Vercel `Other` preset serves `public/` by default when that directory exists.
The homepage and Agent Wiki fetch JSON from `/data/...`, so runtime data must exist
under `public/data/` in the deployed static output.

This patch:
- mirrors `data/tools.json` -> `public/data/tools.json`
- mirrors Agent Wiki index/pages into `public/data/`
- keeps the root `vercel.json` rewrite limited to `/tools/:path*`
- keeps the function maxDuration override without an invalid runtime string
