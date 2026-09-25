# FreeToolForge Test Report — PDF Engine Expansion

## Automated checks

- `node --check public/app.js` — PASS
- `python scripts/validate_registry.py` — PASS; registry contains 555 tools
- `node tests/smoke.mjs` — PASS
- `node tests/pdf-engine-coverage.mjs` — PASS; 40 PDF tools are marked live and have matching mount/execution references

## Completed browser/hybrid PDF tools in this build


1. Merge PDFs
2. Split PDF
3. Compress PDF
4. Repair PDF
5. OCR PDF
6. Redact PDF
7. Rotate PDF
8. Reorder PDF Pages
9. Extract PDF Pages
10. Delete PDF Pages
11. Extract PDF Images
12. PDF Metadata Viewer
13. Remove PDF Metadata
14. Add PDF Watermark
15. Add PDF Page Numbers
16. Overlay PDFs
17. Compare PDFs
18. Crop PDF
19. Resize PDF Pages
20. PDF to Images
21. PDF to Text
22. PDF to Markdown
23. PDF to HTML
24. Fill PDF
25. Annotate PDF
26. Sign PDF
27. PDF Form Field Viewer
28. Images to PDF
29. JPG to PDF
30. PNG to PDF
31. WEBP to PDF
32. Text to PDF
33. Markdown to PDF
34. Pages per Sheet
35. Two Pages per Sheet
36. Booklet PDF Maker
37. PDF Page Counter
38. PDF Page Extractor
39. PDF Batch Rename
40. Invoice PDF Maker

## Deliberately not marked live yet

- Word/Excel/PowerPoint conversion tools: need a real document conversion backend for faithful editable output.
- EPUB-to-PDF / HTML-to-PDF / PDF-to-EPUB / PDF-to-RTF: need dedicated conversion engines.
- PDF/A Helper: conformance validation/generation needs a standards-aware backend.
- PDF Bookmark Helper: true PDF outline creation needs low-level outline tree handling.

## Browser end-to-end note

Static syntax and registry tests pass. Full interactive browser execution against the production site depends on external CDN access and browser runtime/network policy in the test environment; this environment blocked local HTTP browser navigation during the final manual browser test. No claim of full production browser E2E validation is made here.
