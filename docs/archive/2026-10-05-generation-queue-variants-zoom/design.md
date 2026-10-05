# Generation queue, version variants & one zoom (2026-10-05)

Fixes requested: Generate must stay usable while a run is in flight (new work
appends to a queue instead of being refused); every generated version of one
icon must be reachable in a popup where any version can be chosen as
**preferred** — the choice persisted and used by the row preview/copy, with the
whole history kept; the zoom maximum rises 240 → 800 px and Selection V2 and
Generate SVG must share ONE zoom/preview implementation that resizes both
paired thumbnails without clipping or overlap.

## 1. Queue — one worker, many confirmed batches

Today `actions.confirmRun` returns early while `running` is true and the bulk
bar's Generate button is disabled: a batch added during a run is lost, and the
plan the user confirmed is rebuilt from *current* state at send time.

* `src/svg/queue.ts` — the pure queue: `QueuedBatch { id, label, sourceIds,
  run }` where `run` is the WHOLE confirmation payload (sources + config +
  caps + params + prompt) frozen at confirm time, so what was confirmed is
  what is sent, even if the user edits settings while the batch waits. Helpers:
  `queuedBatch`, `enqueue`, `removeQueued`, `nextQueued`, `queuedSourceIds`,
  `queueLabel`. The queue is in-memory only (a reload never resends anything —
  the in-flight journal still owns restart truth, I-20).
* `SvgModel.queue: QueuedBatch[]` + three table-driven reducer actions
  (`queue-add`, `queue-remove`, `queue-clear`) — RULE 24: the strip renders the
  model, never a copy.
* `src/svg/runqueue.ts` — the one worker. `drainQueue(get)` is re-entrant-safe
  through `refs.draining`, takes batches from the HEAD by ticket (an id already
  taken is never taken twice, so a React re-render can never double-run one),
  marks that batch's rows `generating`, runs `runGeneration` with the frozen
  payload, reloads the pair files and reports one summary line per batch.
* `confirmGenerate` always enqueues (no `running` guard) and starts the worker
  when it is idle; a second, third… confirmation appends. The bulk bar's and
  the row's Generate buttons are never disabled by a running batch; rows in the
  queue show a derived `Queued` badge (RULE 24 — derived from the queue, not a
  second copy of the state).
* Cancel is ONE decision per control (RULE 10): `Cancel run` aborts the request
  in flight (finished results are kept) and NAMES what happens to the queue;
  `Clear queue` drops the waiting batches. Neither silently discards the other.

## 2. Variants — a preferred version, history untouched

* The pair file gains `preferredVersion: number | null` (`PairMeta`,
  `PAIR_META_VERSION` 3; a v2 file still parses, its preference absent = null,
  its versions untouched). Migration stays read-only and additive (I-42).
* `lib/svgfile.preferredValid(versions, preferred)` answers only a version that
  exists, is `generated` and passed validation — otherwise null, and the row
  falls back to the newest valid one. A preferred version that later fails
  validation is therefore never previewed by accident (RULE 4).
* `svg/rowmodel.previewTargetOf(row)` becomes the ONE target everywhere
  (preview, Copy, Code, Location, the row's own Approve/Decline): preferred when
  valid, else newest valid. Because the target is written back to the pair file
  through `svg/preferact.setPreferredVersion`, the choice survives a restart and
  a rescan, and no version is ever deleted — every old SVG stays on disk and
  stays rechoosable.
* UI: the row's `History` action opens the **versions popup**
  (`svg-history-dialog`, extended): one row per recorded version with its own
  artwork (`svg-history-art-{n}`, rendered from the saved file), status, review,
  tokens, cost, saved-at, Code — and a preference control
  (`svg-prefer-{n}`), the preferred row marked (`svg-history-row-{n}` carries
  `.preferred`, `svg-history-pref-{n}` says `preferred`). A
  `svg-prefer-newest` button returns to the newest version; a failed version
  cannot be preferred (its button is disabled). The write is one pair-file
  write, reported with a toast; a failed write keeps the choice in memory.

## 3. Zoom — one range, one sizing helper, one pair shell

* `lib/reviewprefs` owns the range: **48–800 px, step 4, default 84** — ONE
  constant read by both tabs (`THUMB_MAX`). `thumbBox(maxPx, natural)` gives the
  box a raster thumbnail occupies: height = the slider value, never upscaled
  past the source pixels; width from the source's own aspect ratio (square
  while the natural size is not known yet, which is also the honest fallback for
  a missing/unreadable side). `vectorThumbBox(maxPx, ratio)` does the same for a
  vector: full height, width from the document's `viewBox` ratio. A thumbnail is
  therefore never stretched, and a box that does not fit its column is capped by
  `max-width: 100%` with `object-fit: contain` / `xMidYMid meet`, so the
  artwork letterboxes instead of being clipped or distorted.
* `src/ui/ZoomSlider.tsx` and `src/ui/ThumbPair.tsx` are the ONE zoom control
  and the ONE two-cell preview shell (`thumb-pair` / `thumb-cell` / `thumb-tag`)
  both tabs render; `selectionv2/ZoomSlider.tsx` and the SVG bar's inline slider
  are gone. The pair shell wraps (`flex-wrap`) at large zoom, so the two
  previews stack instead of overlapping the neighbouring columns, and both tabs'
  previews columns can shrink (`minmax(0, …)`) instead of pushing the row's
  other cells off-screen.
* The SVG tab's `.v2-thumb`/`.svg-thumb` fixed `max-width: 126px`/square-box
  assumptions are removed — that cap is exactly what clipped a wide thumbnail
  above 126 px of width. Both sides of a pair are sized in the same render from
  the same value (RULE 24 / I-16).

## 4. Tests first (written before the code, RULE 8)

`tests/reviewprefs.test.ts` (range, thumbBox, vectorThumbBox), a new
`tests/svg_queue.test.ts` (pure queue: order, head-taking, removal, ids,
label), `tests/pairmeta.test.ts` (preferred round-trip, v2 → v3 read),
`tests/svg_queue_ui.test.tsx` (real panel + hanging fetch: Generate stays
enabled, the second confirmation queues, the queued batch really runs when the
first ends), `tests/svg_variants_ui.test.tsx` (popup lists every version, prefer
v1 → row preview + Copy + pair file change, restart keeps it, rechoose back),
and extended zoom assertions in `tests/selectionv2_ui.test.tsx` /
`tests/svg_ui.test.tsx` (both tabs: same max, both boxes resize, ratio-driven
box, no fixed width cap). Each test fails if its feature is deleted.
