# Selection and pairing tests

Focused test inventory; [all tests](../TESTS.md).

* `pairing.test.ts` — nested pairing, variants, duplicates, unpaired sides, ids
* `reviewfilter.test.ts` — month/custom ranges (inclusive, either anchor), status+search
* `reviewsort.test.ts` — all sort modes × directions, status meta, hotkeys
* `reviewfile.test.ts` — corrupt/valid parse, orphans, rename carry, diff
* `reviewstore.test.ts` — missing/corrupt load, atomic write + failure path
* `selection_state.test.ts` — applyScan/withDecision/nextPending/counters
* `scanseq` + `scankey` (in `svg_scan.test.ts`) — the ticket order and the
  snapshot key: a superseded scan commits nothing, an identical one commits
  nothing, a changed one commits exactly once
* `selection_scan.test.ts` — the Selection `rescan` end to end: identical
  rescan keeps `pairs`/`records` by reference, a rename carries the decision
  once, and an overlapping older rescan commits nothing
* `handles.test.ts`, `fmt.test.ts` — path resolution, formatters
* `selection_ui.test.tsx` — DOM smoke: pick → list → A/D hotkeys → text chips
* `reviewselect.test.ts`, `reviewbulk.test.ts`, `reviewprefs.test.ts`,
  `selection_bulk.test.ts`, `hotkeys.test.ts`, `copypath.test.ts` — V2 rules:
  selection incl. indeterminate, bulk scope + one summary line, zoom clamp /
  no-upscale / corrupt prefs, bulk reducer, shared hotkeys/row-control guards, path fallback
* `selectionv2_ui.test.tsx` — DOM: recursive scan + both thumbnails, layout
  switch, active row + A/D + auto-next, zoom bounds/value/persistence,
  selection across filter + sort, **armed selected-only** approve/decline/reset
  scoped to checked ∩ visible ∩ complete (never approve-visible), incomplete
  and hidden counts, save failure + retry, empty/no-match, corrupt JSON,
  rescan, restart persistence, a11y labels. RULE 25 acceptance: initial
  unchecked, plain click changes active/anchor but not checks, modifiers and
  checkbox follow Batch, header only toggles visible, and one Undo/Redo
  restores the entire changed gesture without bypassing the bulk arm.
