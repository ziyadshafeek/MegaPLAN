# FreeToolForge browser testing

The canonical browser regression runner is:

```bash
python tests/browser-e2e.py
```

It launches a real Chromium binary through Playwright and executes the production `public/index.html`, `public/styles.css`, `public/app.js`, and `data/tools.json` together. It checks homepage rendering, search, category filtering, tool routing/mounting, representative text/developer/calculator tools, representative image tools using a real PNG `File`, every live tool's runnable UI shell, and a mobile viewport.

## Environment limitation

This execution environment blocks browser navigation to `localhost`, loopback HTTP, and external URLs. The runner therefore uses Playwright `page.set_content()` to load an in-memory copy of the production page instead of pretending that a blocked network navigation succeeded.

The opaque in-memory origin does not expose `crypto.subtle`. The runner supplies only fixed SHA-256/SHA-512 test vectors for the exact browser test input (`hello`) so the production hash UI path executes. `crypto.getRandomValues()` remains Chromium-native.

PDF tools are browser-tested for UI mounting and capability coverage here. Full PDF execution that dynamically imports CDN-hosted `pdf-lib`/PDF.js is covered by the static implementation audits; a network-blocked environment would otherwise turn a dependency-loading failure into a misleading browser failure.

## What the suite covers

- 555 registry entries and category/search rendering.
- `/tools/<slug>` routing through the production router function.
- Text/developer/calculator execution with deterministic expected outputs.
- Image processing using a real 2×2 PNG: dimensions, average color, pixel color, resize, crop, rotate, flip, blur, pixelation, border, padding and transparent-PNG conversion.
- Every live tool exposing a run control and, where applicable, a file input. The suite currently executes 50 browser checks.
- Desktop screenshot capture and mobile responsive checks.
- Zero page errors / console errors during the run.

## Design reference from similar projects

The testing architecture intentionally follows patterns visible in open-source utility projects: registry/plugin-style tool organization and local-first execution are used by projects such as DoxDock and FreeTools, while File-Forge keeps dedicated unit/integration test suites around file processing. The exact implementations differ; these projects are reference patterns, not dependencies.
