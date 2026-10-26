# Large-list selection presentation

Part of [shared state](shared.md); gestures remain [RULE 25](../rules/BEHAVIOR.md#rule-25) / [I-73](invariants/shared.md#i-73). Applies to Batch, Selection V2, Generate SVG and SVG to upload. Sheets has no checkable image list.

## One state, inexpensive projection

Canonical checked ids stay in the app store's arrays; lists never keep an
independent selection state. `ui/checkedrows.ts` registers mounted row/input
bindings and owns the whole selection **projection**: `input.checked`, the
`.selected` class, the `.active` row class, `aria-current`, the roving
`tabIndex` and the active row's `scrollIntoView`. A layout effect projects each
committed snapshot before paint and writes only values that changed. Rows
therefore receive neither the checked array nor an `active` prop, and each list
memoizes its row element array (`ReviewList`, `SvgList`, `UploadList`,
`ScanTable`). An active move updates at most two mounted rows; bulk checks
project every changed checkbox without rerendering all row contents.

All rows/controls remain mounted; no virtualization, deferred/chunked
selection, hidden rows or provider/file work on selection. Filtering unmounts
bindings, not hidden checked ids; remounting projects the current snapshot.
Batch stays non-roving: its rows keep their own `tabIndex` rule.

## One notification per gesture

Panels read only their slice (`useAppSlice`); an upload patch wakes upload
consumers only. A gesture that changes checked ids, anchor and the active row is
ONE store notification: `patchV2Selection` writes the V2 slice and the shared
active row together. History is split into stable **actions** (`push`,
`pushGesture`, `undo`, `redo`) and a **view** (entries, cursor, labels, error),
so recording an entry never re-renders the recorder. `useSelection`,
`useSelectionV2`, `useBatch`, `useBatchView`, `useBatchSelection`, the SVG
context and the upload API keep their identities between real changes, and every
hotkey listener reads its targets through a ref (one window listener per tab).

## Compact, ordered history entries

`lib/selectiondelta.ts` records what a gesture changed, not the selection:
runs of removed ids at their source positions and added ids at their destination
positions, plus anchor/active. Selection order is the request order (RULE 10),
so an undo inserts ids back at their recorded positions; when the live selection
has moved on, apply degrades to id-based removal/insertion so ids are still
correct and never duplicated. Absolute entry payloads (older timelines) are
still read by `state/apply.ts`, and an unparsable payload is refused without
moving the cursor. Entry `ids` is a capped label (24 ids), never a copy of the
list. Persistence writes the timeline after the gesture (one deferred write per
burst), flushes on `pagehide`, unmount and any read, and keeps working in memory
when storage refuses.

## Derived summaries

Counts and scopes are one pass per rows snapshot: `svg/panelcounts.ts`
(`countsOf`, `decidableCount`), the Batch header trio, `useBulkSummary` for
Upload. Batch reuses a row-data snapshot ignoring **only** its legacy
`row.selected` processing mirror, so ordinary checkbox changes do not rerun
filter/sort. Every other field, including reference and output paths, invalidates
that snapshot; nothing displayed is hidden by a sort-field-only signature.

[Explicit state sorting](list-state-sorting.md) stays live: selected sorting
subscribes to canonical checks in addition to the data snapshot. SVG bypasses
its pin only for state sorts. Request-local Skip and whole-batch Cancel remain
separate. Ordered deltas also record existing ids that moved (e.g. Shift after
sorting), and applying repeated ids in an insertion run never creates duplicates.

## Verification and timing

- `tests/selection_perf_budgets.test.tsx`: slice isolation, history actions/view
  isolation, entry byte budgets at 1,000 rows, linear `countsOf`/`decidableCount`,
  same-DOM-node row identity across click/toggle, no re-sort on a Batch
  mirror-only change, live canonical selected sorting and reference/output
  invalidation.
- `tests/selectiondelta.test.ts`: order-exact forward/inverse apply, malformed
  payload refusal, id fallback, reorder round trips, duplicate prevention and
  single-toggle size that does not grow with the selection.
- `tests/history_persist.test.tsx`: one deferred write per burst, pagehide and
  unmount flush, read-through load, storage refusal, no write when idle.
- `tests/checkedrows.test.tsx`, `tests/rowpresentation.test.tsx`,
  `tests/selection_response.test.tsx`: projection, invalidation and the real
  four-list algorithms; the existing selection/history/undo suites protect
  RULE 25 semantics and cross-tab undo.

Reproducible Chromium fixture/runner: `tools/perf/selection-response.html`,
`tools/selection-response-bench.mjs` (gestures now record real history and report
`byKind` medians plus the serialized `historyBytes`); production build config
`tools/perf/vite.selection.config.ts`. Plan, methodology and the per-tab
historical measurements: [plan](../../archive/2026-10-26-selection-response-v2/README.md)
and [first pass](../../archive/2026-10-26-selection-response/README.md). Timing
results are fixture/browser measurements, not universal hardware guarantees.


Imported from `arena/0216b05e-iconsplitter` (`cde75d1` plus its plan), preserving
current sorting and SVG work; [integration evidence](../../archive/2026-10-26-import-selection-performance/README.md).
The source plan’s serialization figures are historical Node measurements, **not**
a new browser latency claim. The updated browser harness records real history;
its end-to-end comparison remains unmeasured in this integration.

Upload still has work outside the shared list boundary: see the
[Upload-specific response research/redesign](upload-response.md). Its diagnostic
tests exercise the full panel; they are not a new browser speedup claim.
