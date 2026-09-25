# Agent Online Store architecture

The Agent Online Store is an original web workspace inspired by patterns visible in open-source agent environments such as BOSS Console, OpenHands Agent Canvas, browser-use, Stagehand, and WebContainers. It does **not** copy their source code.

## Workspace model
- left: task/navigation/project controls
- center: sandboxed browser preview + test terminal
- right: agent activity, publish target, and run state
- bottom: persistent status bar
- mobile: sidebar drawer + vertically stacked workspace panes
- command palette: keyboard-friendly task actions

## Autonomous page flow
1. User prompt.
2. Local model-probe refusal check.
3. Server-side provider request using a secret environment variable.
4. Strict JSON schema and content validation.
5. Sandboxed browser render.
6. Declarative DOM/interactivity tests.
7. Publish only after proof passes.
8. Git Database API creates one commit containing only generated page data.
9. Connected Vercel deployment updates the site.

## Publisher boundary
The publisher accepts a generated spec, never arbitrary paths. The only GitHub paths it writes are:
- `data/agent-pages/<slug>.json`
- `data/agent-pages.json`

Core source code, registry, deployment configuration, secrets, and existing site code are outside the autonomous publisher boundary.

## Reliability measures
- provider timeout
- transient 429/5xx retry with backoff
- 422 fallback without JSON-mode response formatting
- local model-probe refusal
- duplicate slug replacement is idempotent
- optimistic Git ref update with `force:false`
- no secret material in client code
- no arbitrary code emitted into generated pages
