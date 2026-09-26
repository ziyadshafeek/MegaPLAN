# Collection workflow rescue — 2026-09-26

## Verified revision evidence

- Both failed scheduled runs used **54d1831ce928041897b95986ec6a0ee71cf57624**:
  - Map: https://github.com/ziyadshafeek/MegaPLAN/actions/runs/36246420267
  - Auto Master: https://github.com/ziyadshafeek/MegaPLAN/actions/runs/36246584673
- Fetched current `origin/main`: **707e086defebddd85c052ab48099183981af2432**.
  Its four source workflow definitions match this session's starting checkout.
- Examined all four workflow files at both revisions, not just the workflow display
  names (GitHub lists newer names against old executions).
- Old map: every 30 minutes, high-volume expansion plus legacy fallback. Its
  `node - << 'JS'` terminator remains indented after YAML block dedenting;
  Bash cannot close the heredoc/conditional, even without an NVIDIA key.
  Jobs API confirms classification failed and commit was skipped.
- Old Auto Master: every 20 minutes, retailer and Spotify runners, suppressed
  collector errors, broad staging and direct push. Jobs API confirms `Commit all`
  failed. The user's captured log reports HTTP 403; raw log download here failed
  with an EOF. The old YAML has no explicit `permissions` declaration.
- Current main already removed that schedule and the map AI step, and replaced
  licensed-source commands. This patch does NOT claim credit for those prior fixes.
  Current Auto Master still had manual execution, broad staging and direct push.

## Permission findings / immediate safety

Attempt to disable only Auto Master returned HTTP 403 `Resource not accessible
by integration`; workflow remains `active`. The current default-branch file has
no schedule. Access to default workflow token permissions and classic main branch
protection both returned 403. Effective branch rules endpoint returned `[]`;
this does not prove classic protection absent. Cannot establish whether token
permissions, classic protection, or both caused the old push failure.

No permissions were expanded. No old runner artifacts were downloaded/published.
No main protection was removed. No personal token was requested or added.
Rotate/revoke the previously shared Vercel token in the Vercel dashboard.

## Proposed code safety boundary

- Retire Auto Master and obsolete combined trial as manual, read-only refusal jobs.
- One bounded schedule per map/music source, no AI key, no direct push, no
  persisted checkout credentials. Source-specific artifact upload follows only
  successful collection; upload failure fails the job. Artifacts expire in 7 days.
- Products are manual authorized-feed-only review artifacts; no schedule or push.
- Artifacts are **not published data**. Human reviews source provenance, deltas,
  cursors and mirrored files before a scoped data PR. No bot PR creation/write
  permission is requested while owner permission diagnosis remains blocked.
- OSM: at most two cells / one worker / one phase, 100-cell Git cap, real typed
  IDs, ODbL attribution and endpoint per new cell, backoff and Retry-After handling,
  reject Overpass partial/error responses, fail on any failed cell.
- MusicBrainz: metadata only, capped existing shard/cursor design; a later failed
  page now fails the run rather than treating partial collection as success.
- Reports measure distinct IDs separately from overlapping occurrences, before
  and after counts and source timestamps. No fabricated coverage claims.
- No change to local music places, product records, image candidates/approvals.

## Owner actions (do not bypass protection)

1. Repository **Actions → Scheduled directory indexing** (Auto Master) → upper-right
   **… → Disable workflow**. If the name changes after merge, find `auto-master.yml`.
   Do not disable all Actions or give this retired workflow write permission.
2. **Settings → Actions → General → Workflow permissions**: inspect the current
   default. Keep restricted/read-only defaults; these map/music artifact jobs need
   only `contents: read`. Do not enable broad writes to repair the old 403.
3. **Settings → Branches → Branch protection rules → main → Edit**, and
   **Settings → Rules → Rulesets**: inspect required PR reviews/checks and push
   restrictions. Preserve them. Share non-secret rule descriptions if needed.
4. Review this code PR. On the session branch, use **Actions → map/music workflow →
   Run workflow → branch `arena/01a0de66-megaplan`**. Inspect collection and upload
   logs, download the source-specific artifact and inspect `report.json`.
5. Publication is a separate human-reviewed data PR: compare only
   `data/map-directory` + `public/data/map-directory`, or the corresponding music
   paths, against the latest base. Rerun if base/cursor changed. Do not replace
   unrelated files, apply artifacts from old Auto Master, or approve image links.
   Review provenance, distinct delta and cursor, run tests, merge under existing
   protections. If automation is later approved, design a narrowly scoped PR
   publisher in a separate reviewed change; this patch deliberately lacks one.
6. Only after merge/deployment verify `/api/source-status`: compare source timestamps
   and distinct counts against reviewed data. A green artifact job is NOT publication,
   and deployment success is NOT an ingestion result.

## Baseline and verification limits

Live production `/api/source-status` fetched in this session (before any deployment):
MusicBrainz 249, timestamp `2026-09-26T11:50:08.951Z`; OSM 4 cells / 370 occurrences,
timestamp `2026-09-26T11:50:01.310Z`; shops 120, local music places 1; authorized
products 0; candidates 48; approved/public links 0. Production `complete=false`.
Local snapshot distinct IDs: map **363** (370 occurrences), MusicBrainz **249**
(285 shard occurrences). These are baseline counts, NOT new collection results.

`npm test` and workflow/collector fixtures pass locally on Node 22.22.3; package
and Actions request Node 24. Syntax tests parse every workflow with YAML and
`bash -n`, including a negative fixture reproducing the old indented heredoc.
Fixtures cover duplicate source schedules, unsafe scheduled commands, read-only
review boundaries, missing-artifact failure, upstream rejection, OSM retry and
partial-response handling, distinct counts, honest zero delta and music partial
failure. Fixture counts are not production ingestion evidence.

The four broader brief/ledger paths supplied in the request are absent from this
checkout at current main; no broad import or tool-completion work was attempted.
Large datasets must remain external; no paid service was introduced.

## End-of-session evidence

- Pushed code commit `476b029` only to `arena/01a0de66-megaplan`.
- Draft review PR: https://github.com/ziyadshafeek/MegaPLAN/pull/4 . Not reviewed,
  not merged; this is a proposed safety repair, not completed acceptance.
- Explicit workflow dispatch for both `map-scraper.yml` and `music-scraper.yml`
  on that branch returned HTTP 403 `Resource not accessible by integration`.
  Branch run listing returned `[]`. There are NO corrected GitHub run logs,
  source count deltas or data publication outcomes to report for this patch.
- Re-ran the full `npm test` suite with Node **24.21.0** using an ephemeral npm
  runtime, exit **0** (also passed with local Node 22.22.3). No dependency/runtime
  files from that ephemeral runtime were added to the repository.
- No source data changed. No reviewed change merged or data PR published. No
  post-deployment JSON verification is possible yet; live JSON above is baseline
  only. GitHub access works for reading workflows/jobs and pushing this branch / PR,
  but not workflow administration, dispatch or protected-settings inspection.
- Next smallest safe step: owner disables Auto Master via its workflow menu, then
  reviews draft PR #4 and manually dispatches the two read-only branch workflows.
  Leave PR draft until actual provider runs and artifacts can be reviewed. A run
  yielding zero new distinct IDs is acceptable; a failed upstream is not success.

## Follow-up: owner-triggered branch tests

- Owner disabled Auto Master; API confirmed `disabled_manually`.
- Map run https://github.com/ziyadshafeek/MegaPLAN/actions/runs/36254572038
  at `7d306d6` failed. Supplied step screenshot shows cell 4 exhausted mirrors
  (including HTTP 504), cell 5 returned 94 occurrences, then partial failure
  correctly blocked review artifact/publication. No verified published delta.
- Music run https://github.com/ziyadshafeek/MegaPLAN/actions/runs/36255011965
  at `7d306d6` failed. Supplied screenshot shows two verified pages followed by
  MusicBrainz HTTP 503; upload was skipped. No published count increase claimed.
- Added at most two retries per MusicBrainz page for HTTP 429/500/502/503/504,
  waiting 10s then 20s minimum, honoring Retry-After seconds/date up to 60s.
  Longer requested pauses abort instead of retrying too early. Permanent HTTP
  failures still stop immediately; exhausted retries still prohibit publication.
  Network/JSON errors remain fail-closed without retry.
- Full npm test on Node 24 passed after retry change, including deterministic
  recovery, exhaustion, same-page URL, Retry-After and permanent-error fixtures.
  This is test evidence, not a successful live collection run.

## Follow-up: artifact path correction

Music run https://github.com/ziyadshafeek/MegaPLAN/actions/runs/36255205532 at
`83a9aa7` completed the collection step successfully (confirmed via Jobs API),
but failed uploading the review artifact. User screenshot reports no files found
at `.collection-review/`. upload-artifact v4 excludes hidden paths by default;
using a dot-prefixed output directory was a workflow bug in this patch.

Renamed output to `collection-review-output/` consistently in collector, map/music
uploads, summaries, ignore rule and fixtures. Hidden-file uploading remains off;
no secret-bearing directory is included. Added assertions for a non-hidden upload
path, matching output files, mirrored snapshots, and no artifact on upstream error.
Full npm test passes on Node 24 after the fix. The corrected upload still needs a
new live branch run; no successful artifact, published data or deployed delta is
claimed from the failed run. Raw log download still fails with EOF in this session.
