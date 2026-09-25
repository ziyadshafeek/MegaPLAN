# FreeToolForge test report — 2026-09-25

## Current audited state

- Registry: 555 tools
- Explicitly live: 180
  - PDF: 53
  - Developer: 36
  - Calculators: 36
  - Text: 28
  - Images: 27

## Static checks

```text
node --check public/app.js                       PASS
python scripts/validate_registry.py             PASS
node tests/smoke.mjs                             PASS
node tests/pdf-engine-coverage.mjs               PASS
node tests/pdf-capabilities.mjs                  PASS
node tests/pdf-comprehensive.mjs                 PASS
```

## Real Chromium browser regression

```text
python tests/browser-e2e.py
50/50 checks passed
0 page errors
0 console errors
17 representative image workflows exercised
Desktop screenshot: /mnt/data/ftf-desktop.png
Mobile screenshot:  /mnt/data/ftf-mobile.png
```

The browser runner executes the production HTML/CSS/JavaScript in Chromium with a real PNG file. The environment blocks browser navigation to local/remote URLs, so the test page is loaded with Playwright `set_content()` instead. A tiny test-only WebCrypto vector shim is used for SHA-256/SHA-512 because opaque origins do not expose `crypto.subtle`; this does not claim to test the browser's native WebCrypto implementation.

PDF tools are checked in-browser for mounting and file-input/run-control coverage, while PDF execution itself is covered by the static PDF implementation audits because CDN dependency imports cannot be exercised reliably in this network-blocked environment.
