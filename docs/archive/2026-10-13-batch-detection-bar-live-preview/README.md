# Batch Detection column: one row, a live value, and an Apply that previews itself — 2026-10-13

Three reports against the per-row merge bar shipped the same day
(`docs/archive/2026-10-13-batch-row-merge-override/README.md`), plus one
iteration after the earlier layout doc
(`docs/archive/2026-10-13-batch-preview-layout-fix/README.md`).

## Problem (user report)

1. **The Detection column is too narrow — the controls stack.** Every row's
   bar shows `Detection · Merge 0.0200 · slider · Apply · ↺ Reset` one above
   another instead of one line.
2. **The bar's number never moves while dragging.** It is fixed at the
   effective (global) value until Apply — the slider moves, the number does
   not.
3. **Apply shows nothing.** The row's split preview only appears after a
   global "Preview splits" run, so the override cannot be judged where it was
   made.

## Research — why each one happens

1. `.batch-columns, .batch-row` sizes the Detection track with plain
   `max-content`. A `max-content` track is `minmax(auto, max-content)`, so when
   the row's tracks do not fit the pair-table's definite width the track stops
   at its **min-content** contribution — and the bar is `flex flex-wrap`, so
   min-content means "the widest single control, one per line". The cell is
   stretched (`justify-self: stretch` on children 4/5), so the wrap is real.
   The preview-layout doc fixed the same failure for the Preview column by
   giving it a definite floor; the Detection column never got one.
2. `BatchRowMergeBar` renders `Merge {eff.toFixed(4)}` — the *effective* value
   (the override, else the global). `local` (the slider) is the only thing the
   drag moves. RULE 24: a visible value must mirror the change immediately.
3. `useBatchPreview` clears the WHOLE previews map in an effect whose deps
   include `merges` (`rowMerges`), and only the queue (`previewSelected`) can
   refill it. So Apply erases every row's preview and the user must re-run the
   global preview to see anything — including for the row just changed.

## Decisions

* **D1 — the Detection track gets a definite floor, the bar never wraps.**
  `--batch-detect-col` (a `:root` token, one source of truth for both the base
  rule and the `@media (max-width: 1360px)` rule) is the track's minimum:
  `minmax(var(--batch-detect-col), max-content)`. The bar itself becomes a
  4-lane CSS grid — `value · slider(flex) · Apply · Reset` — so no width can
  ever stack its controls. The in-bar `Detection` title goes: the sticky column
  header already names the cell, and the ~60 px it cost is what the slider
  lane needs (RULE 10 — one label per decision, not per row).
* **D2 — the value is live, and it says what it is** (RULE 24). The label is
  rendered from the slider's own value:
  `0.0325 · not applied` while the slider differs from the row's effective
  value, `auto` / `0.0200` / `0.0500 · overridden` when it matches what the
  row would really use. Apply is enabled only when there is something to apply
  (RULE 4: a control that can do nothing says so). Reset keeps its rule:
  enabled only while an override exists.
* **D3 — Apply (and Reset) preview THAT row immediately.** The bar never
  re-runs the queue. The applied distance is passed explicitly to a single-row
  preview call (`mergeForRow(global, merges, relPath, explicit)`), so the
  result can never be computed from a stale `rowMerges` closure (RULE 3).
  `rowMerges` leaves the clear-effect deps: other rows' previews stay valid
  because only this row's override changed. A global merge change still clears
  everything — every row really is stale then.
* **D4 — pure rules in the lib, the two runners in two cohesive files.**
  `effectiveMerge` + `mergeForRow` move to `src/lib/batchpreview.ts` (RULE 1:
  the rule lives in the lib, the hook only wires it). The runs split by what
  they own: the multi-row run AND the own-row referee go to the new
  `src/batch/previewqueue.ts` (125 lines), and the single-row runner
  (`useRowPreview`, exported as `previewRow`) stays beside the caches and the
  source loader it needs inside `useBatchPreview.ts` (256 lines, RULE 18
  reason on the header). No third file was needed — the referee is what the
  two runs share, so it lives with the run that reads it.

## Consequences

* `ScanTable` takes `applyRowMerge(row, value)` / `resetRowMerge(row)` instead
  of the two path-based setters, so the row object (needed for the preview)
  travels with the click; `BatchPanel` composes them: one store write + one
  row preview.
* `useRowPreview` aborts its own previous request and is cancelled by
  `useBatchPreview.clear()` (settings change, unmount, "Clear previews"), so a
  late result can never repaint a stale entry.
* The Detection column floors at 400 px; the pair-table scrolls sideways on
  narrow windows exactly as it already does for an 800 px zoom pair (I-55).

## TDD plan (tests first)

1. `tests/batchpreview.test.ts` — `mergeForRow`: explicit wins over map and
   global (the Apply path), map hit wins over global, a `null` entry means
   auto, a missing entry falls back to the global, the key lookup is
   case-insensitive.
2. `tests/batch_row_merge.test.tsx` — the live label (drag → new number +
   `not applied`, before any Apply), the one-row layout contract from
   `src/index.css` (definite Detection floor via `--batch-detect-col`, every
   batch template uses the token, the bar's rule does not wrap), Apply on a
   never-previewed row shows that row's preview straight away, Apply leaves
   the other rows' previews in place, Reset re-previews the row with the
   global value, and no file writes anywhere in the flow.
3. Existing suites stay green (`effectiveMerge` import moves to the lib).
