# Push to `ziyadshafeek/MegaPLAN`

The connected GitHub integration used by the previous AI could read this repository but returned HTTP 403 on write operations. The source is therefore packaged for a direct local push.

## Recommended layout
Keep this repository as the source of truth. The current package root already contains the website, tool registry, processing backends, docs and `extension/`.

## Fastest push from a computer
1. Create/obtain a fine-grained GitHub token restricted to `ziyadshafeek/MegaPLAN` with Contents: Read and write.
2. Download/unzip this package.
3. Clone the empty repository:
   `git clone https://github.com/ziyadshafeek/MegaPLAN.git`
4. Copy the package contents into the cloned repository.
5. `git add .`
6. `git commit -m "feat: bootstrap FreeToolForge utility platform and StudyBridge"`
7. `git push origin main`

Do not put the GitHub token in source files or commit history.

## After push
A coding AI can work from `AGENTS.md` + `MASTER_CONTEXT.md`. Vercel can be connected to the GitHub repository for continuous deployment. The PDF/OCR processing service may remain a separate Vercel project until credentials/infrastructure are consolidated.
