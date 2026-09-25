# FreeToolForge StudyBridge

Manifest V3 Chrome side panel for a simple YouTube -> study -> NotebookLM / AI Studio workflow and a PDF section splitter.

## Features
- Side panel with current YouTube video context
- Open NotebookLM and copy the YouTube URL + instructions
- Open Google AI Studio and copy a granular lecture-note prompt
- Read visible YouTube transcript panel and copy transcript
- Collect visible YouTube links from playlists/channels/search pages
- PDF -> N sections via FreeToolForge server endpoint, with matching prompts in the ZIP
- Background OCR through FreeToolForge OCR endpoint without model weights on the device

## Install
1. Open chrome://extensions
2. Enable Developer mode
3. Load unpacked
4. Choose this folder

## Important
NotebookLM's official YouTube source flow imports the transcript text of public videos with captions; the video file itself is not uploaded as a source. AI Studio is opened only as a normal browser tab; the user performs the video upload themselves.
