# Per-pair metadata migration

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 15. One JSON per pair — the fix for "the folder shows only the AI approval" (2026-10-05)

The report: *"i don't see json in local folder contain information about SVG
aproval. only AI image aproval"*. Both halves existed, in different places: the
AI-image approval lived in `<root>/review-decisions.json` (ONE file for the whole
picked tree, far from the images) while the SVG's own review lived in the
`<stem>.svg.json` beside the pair. A folder that was copied, moved or opened on
its own lost the approval; the file the user was looking at never said anything
about the pair.

Per I-41 both halves are now **one file per pair, in the pair's own folder**:
`<AI stem>.svg.json`, `v: 2`, carrying the pair identity + both image faces +
`decision`/`reviewedAt` + `versions[]` (status, review, prompt, provider/model,
timestamps, tokens, cost `{actual, estimated, currency, pricing, basis}`,
validation, batch ref, error, requestId). The Selection tabs read their
decisions from those files (`selection/pairstore.loadPairDecisions`), Generate
SVG discovers approved pairs from them (`svg/sources.discoverApprovedSources`),
and every writer — approve/decline/bulk/reset, generation, SVG review and both
undo paths — writes through `savePairDecision`/`saveMetaAt`, so no code path
touches a global decision file any more.

The migration is read-only (I-42): `review-decisions.json` still supplies
decisions for pairs that have no local file and is never written or deleted; a
local file always wins, including an explicit `pending` (a reset must outlive
the fallback). A legacy `v: 1` file keeps its versions and is upgraded on its
next write. `selection/reviewstore.ts` is deleted; `LEGACY_FILE` and the
fallback merge live in `selection/pairstore.ts`.

Honesty under failure (I-43): an unreadable pair file is named — the banners
(`sel-pairfiles` / `v2-pairfiles`), the log and the row's own status — while the
in-memory decision for that pair is kept; the Retry button rewrites exactly the
pairs whose write failed (`SelState.retryIds`), never the whole tree. The SVG
tab's `svg/svgfiles.ts` keeps the file-level reads (version listing, SVG text);
the pair-file read/write lives in `selection/pairstore` + `lib/pairmeta`, and
`svg/sourceindex.ts` moved to `state/sourceindex.ts` because both tabs' undo
paths share that id → path cache.
