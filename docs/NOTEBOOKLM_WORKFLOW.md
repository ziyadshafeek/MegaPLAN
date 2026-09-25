# NotebookLM / AI Studio workflow

NotebookLM currently supports public YouTube URLs as sources when captions are available; it imports transcript text rather than the video itself. Videos may fail when very recently uploaded or when captions are unavailable. See Google NotebookLM help.

AI Studio is handled as a normal external tab. The extension does not automate Google's UI. It opens AI Studio and copies the selected prompt so the user can manually upload the video and paste the prompt.

The extension can collect visible YouTube links from playlist/channel/search pages and copy them as a newline list. This deliberately avoids private account access and backend credential collection.
