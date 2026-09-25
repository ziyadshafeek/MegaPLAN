# FreeToolForge incremental update — browser/image expansion

This is an **incremental update for the existing `ziyadshafeek/MegaPLAN` repository**.

It is not a replacement project and it intentionally contains only files that should be added or overwritten on `main`.

## What changed

- Added 27 browser-local image engines.
- Tightened capability status: the registry marks a tool `live` only when its title is in the runtime live set.
- Added a deterministic browser regression suite using real Chromium + Playwright.
- Added mobile layout checks and real PNG file interaction tests.
- Preserved the existing 53 live PDF engines and PDF capability audits.
- Repairs the previously inconsistent `public/tools-registry.json` and restores the missing PDF audit test files in the GitHub repository.

## Expected resulting state

- 555 registered tools.
- 180 explicitly live tools.
- 53 live PDF tools.
- 27 live image tools.
- 36 live developer tools.
- 36 live calculator tools.
- 28 live text tools.

## Push mode

Upload this ZIP to the existing incremental GitHub push bridge and target:

```text
Repository: ziyadshafeek/MegaPLAN
Branch:     main
Mode:       update/overwrite-or-add only
```

Do not initialize, replace, or delete the repository.
