# Wiki Agent architecture

The old name “Agent Online Store” is retired. Customer name: **Wiki Agent**. BYOK name: **Self Agent**.

See `docs/ARCHITECTURE.md` for the current design.

Autonomous GitHub Actions still uses `.github/workflows/agent-online-store.yml` so existing secrets keep working. It may only write `data/agent-pages*` and the public mirrors.

Provider calls go through `api/lib/nvidia.js`. Model identity is not returned to the browser.
