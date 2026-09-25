# FreeToolForge GitHub Push Bridge v5.2

This is the replacement for the buggy v5.1 file-by-file Contents API bridge.

## Core fix

v5.2 uses the Git Data API:

`ZIP → existing tree → blobs → one tree → one commit → fast-forward branch update`

It never carries a previous file's SHA into the next file update.

## Safety / behavior

- Existing repository files not present in the ZIP are preserved.
- The ZIP can contain a single top-level wrapper folder; that wrapper is stripped.
- Unsafe paths and duplicate paths are rejected before pushing.
- Unchanged files are skipped by comparing Git blob SHA values.
- Changed/new files are uploaded as blobs, then one tree and one commit are created.
- The branch is updated only after the entire commit is ready.
- If the branch moves during the operation, v5.2 rebuilds once from the new head.
- Tokens are held only in the browser tab and sent directly to GitHub's API.
- No token is written to localStorage, cookies, or a server endpoint.

## Deploy on Vercel

Use Vercel Drop with this ZIP/folder. This project is intentionally static and has no serverless functions or Vercel runtime configuration.

After deployment, open the bridge URL, enter a fine-grained GitHub token with **Contents: Read and write** on `ziyadshafeek/MegaPLAN`, select the V4 MegaPLAN ZIP, inspect it, then push.
