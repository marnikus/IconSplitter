# List review + multi-select bulk decisions — design (2026-10-01)

Extends the Selection mode designed in
`docs/archive/2026-10-01-selection-review/design.md` with the review-workflow
requirements: two view layouts (Comparison / List review), dual thumbnails per
row, a thumbnail-height zoom slider, multi-selection, and bulk approve/decline
with honest partial-failure reporting. TDD; RULE 16/18 budget on every new
file (fn ≤ 30 LOC, ≤ 4 params via props/domain objects, files ≤ 300).

## Reuse (no second implementation — RULE 1/3)

* `lib/pairing.ts`, `lib/scan.ts` — discovery unchanged.
* `lib/reviewfilter.ts` / `reviewsort.ts` / `reviewfile.ts` / `reviewmeta.ts` —
  filters gain one status option; everything else unchanged.
* `selection/state.ts` reducers, `reviewstore.ts` atomic write — decision
  persistence untouched; bulk decisions reuse `recordsFromViews`.
* `selection/thumbs.ts` object-URL cache — extended to resolve per side.

## New pure modules — `src/lib/`

### reviewselect.ts — multi-selection model
Checked rows are a `string[]` of pair ids, **separate from review status**
(spec §5). Pure helpers:
* `toggleId(checked, id)` — add/remove one id.
* `headerCheck(checked, visibleIds)` → `"unchecked" | "checked" | "indeterminate"`
  — tri-state over the **visible** scope only.
* `intersectIds(checked, visible)` / `hiddenIds(checked, visible)` — the bulk
  scope split: actions never silently touch hidden rows (spec §5/§6).
* `pruneIds(checked, aliveIds)` — rescan drops vanished pairs safely (spec §12).

**Selection policy (spec §5 asks us to define it):** selection persists across
filter/sort changes keyed by pair id; it is pruned only when a pair disappears
at rescan. `Select all` unions the visible ids into the selection; `Deselect
all` clears the whole selection (never leaves invisible strays). Bulk actions
affect checked ∩ visible (scope `selected`) or all visible (scope `visible`);
the confirmation dialog always shows how many checked rows are hidden and will
be skipped.

### reviewthumb.ts — thumbnail geometry + persistence
* `THUMB_MIN 48 / THUMB_MAX 240 / THUMB_DEFAULT 128`, store key
  `iconSplitter.sel.thumbH.v1`.
* `clampThumbH(px)` — validation for slider + persisted reads (RULE 13).
* `thumbBox(natural | null, maxH)` → `{w, h}`: height = min(maxH, natural h)
  so a small source is **never upscaled** past its own pixels; width follows
  the aspect ratio exactly (spec §4).
* `readThumbH(store)` / `writeThumbH(store, px)` — Storage-shaped parameter
  (pure inputs, RULE 3); missing/garbage values fall back to default, out of
  range clamps.

### reviewbulk.ts — bulk planning + honest reporting
* `planBulk(scope, checked, visibleIds)` → `{ ids, hiddenSkipped }`.
* `bulkSummary(pairs, ids, verdict)` → `{ total, missing, changing }` for the
  confirmation dialog: how many are affected, how many lack a side (never
  approved silently, spec §6), how many change an earlier decision.
* `bulkResultText(verdict, applied, skipped, saved)` — the ONE result message
  (no per-image toasts, spec §6) carrying affected/unaffected counts.

## Changed pure modules

* `reviewfilter.ts` — `ListFilter.status` gains `"missing"`: pairs where
  `attentionInfo(p) !== null` (missing original or missing AI result).
* `selection/state.ts` — `SelState` gains `view: "compare"|"list"`,
  `thumbH: number`, `checked: string[]`; `selectedId` renamed `activeId`
  (active row = keyboard target, distinct from checked rows). New reducer
  `withDecisions(s, ids, verdict, nowIso)` → `{ state, applied, skipped }`
  applies one bulk decision in a single logical operation; `withDecision`
  delegates to it. `applyScan` prunes `checked` and keeps `activeId` when the
  pair survives.

## UI — `src/selection/*`

* `SelectionToolbar` (new): view-mode toggle (`sel-view-compare` /
  `sel-view-list`), thumbnail zoom slider (`sel-thumbzoom`, aria-label
  "Thumbnail maximum height", min 48 / max 240 / current "N px"), Select all /
  Deselect all, selected count, bulk buttons ("Approve selected", "Decline
  selected", "Approve visible list", "Decline visible list") disabled when the
  scope is empty.
* `PairRow` (new): checkbox + **both** thumbnails (Original / AI result,
  labelled, aspect preserved, height from the slider, dims from decode) +
  filename, folder, date, decision chip + missing-side chip, row actions
  (approve / decline / open-path per side, wide layout). Row body is one
  button (click ⇒ active; checkbox and actions stay independent).
* `PairList` gains `variant: "side" | "wide"` — same rows, same filters,
  selection, decisions; wide adds dims + actions columns. Header carries the
  tri-state select-all checkbox.
* `SelectionPanel` — `view === "list"` renders the full-width list **without**
  any comparison panel (acceptance §15); `view === "compare"` keeps the
  sidebar + `CompareView`. Confirmation dialog before every bulk apply,
  showing `bulkSummary` + hidden-skipped count. Active row scrolls into view.
* `FilterBar` — status filter gains "Missing pair"; filter select renamed
  `sel-status-filter` (the compare chip keeps `sel-status`) fixing a duplicate
  handle that made DOM assertions vacuous.

## Storage map (delta)

* `localStorage iconSplitter.sel.thumbH.v1` — thumbnail max height (validated
  on read, clamped 48–240).
* Decisions stay in `<root>/review-decisions.json` (unchanged protocol);
  bulk decisions write the file **once** per operation.
* View mode and checked selection are session state (selection pruned at
  rescan); nothing else is persisted.
