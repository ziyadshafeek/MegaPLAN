# FreeToolForge / StudyBridge test report — 2026-09-25

## Automated checks passed
- Extension Manifest V3 JSON parsed successfully.
- `node --check` passed for service worker, YouTube content script, sidepanel script and PDF splitter.
- YouTube content-script smoke test passed for context extraction, empty-link handling and transcript failure handling.
- Sidepanel mock test passed for NotebookLM tab creation, AI Studio tab creation, clipboard handoff, transcript copy and batch-link collection.
- Registry structural check passed with 555 entries.
- A generated 200-page PDF was partitioned into exactly 20 contiguous 10-page ranges with no gaps/duplicates using the same partition math used by the server splitter.
- Required StudyBridge buttons/IDs were present in the sidepanel HTML.

## Browser verification limitation
This environment could not launch/use Chromium against local or deployed pages because browser navigation is blocked by sandbox policy. Therefore a real Chrome interaction test is still required before Chrome Web Store publication.

## Deployment verification limitation
The Vercel deployment tool can create production deployments, but the connected Vercel read endpoint currently returns 403 for this project's scope, so this environment cannot independently inspect the final deployment logs/health endpoint after deployment. No runtime pass is claimed on that basis.

## Known operational limit
The Vercel serverless splitter deliberately caps direct PDF uploads at ~4 MB because Vercel Functions enforce a 4.5 MB request-body limit. A later direct-to-object-storage flow should be added for larger PDFs.
