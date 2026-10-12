# Batch Preview splits column — why it stayed narrow (2026-10-12)

Follow-up to `docs/archive/2026-10-13-batch-preview-layout-fix/README.md`: that
pass changed the `.batch-row` grid and the preview cell, and the column was
*still* 122 px wide with two icons behind a scrollbar. This doc records the
actual root cause, the fix, and how it is pinned.

## Report (screenshot, second round)

* The Preview splits column starts far to the right of the file name; the red
  line on the screenshot marks where it should start — beside the name.
* Only ~2 of the 4 icons show, with a horizontal scrollbar, while the space to
  the left of the column is empty.
* Two rows of icons are acceptable; a scrollbar hiding icons is not.

## Root cause — a cascade tie the shared rule wins

`ScanTable.tsx` renders the row as `class="svg-row batch-row <status>"` and the
header as `class="svg-columns batch-columns"`: the batch table deliberately
reuses the Generate SVG row grammar. `src/index.css` declares both grids:

| line (before) | selector | specificity | tracks |
|---|---|---|---|
| ~421 | `.batch-columns, .batch-row` | (0,1,0) | 7 — `34px 140px max-content minmax(300px,1fr) 110px 90px 130px` |
| ~1174 | `.svg-columns, .svg-row` | (0,1,0) | 8 — `34px max-content minmax(280px,1fr) 122px 118px 130px 158px 210px` |

Equal specificity ⇒ **the later rule wins**, and the shared `.svg-row` rule sits
~750 lines below the batch one. So above 1360 px every batch row was laid out in
the SVG tab's eight tracks:

1. checkbox → `34px`
2. AI thumbnail → `max-content`
3. **File / path → `minmax(280px, 1fr)`** — the flexible track, i.e. the wide
   column with a short name inside it: the "huge unused space".
4. **Preview splits → `122px`** — two 48 px icons + gap, the rest clipped, the
   strip's own wrap unable to help because the cell really was 122 px.
5. Created → `118px`, Status → `130px`, Open → `158px`
6. and a **dead eighth track of `210px`** with no cell in it, which is what made
   the row wider than the panel and gave `.pair-table` (`overflow-x: auto`) its
   horizontal scrollbar.

The `@media (max-width: 1360px)` block *did* carry `!important`, which is why the
narrow breakpoint looked closer to intended and the wide one did not — the
defect only showed on a wide window, exactly what the screenshots are.

## Fix

`src/index.css` — the batch grid is now declared on the **compound** selectors,
which out-specify the shared rule at any width, in both the base rule and the
`@media (max-width: 1360px)` block:

```
.svg-columns.batch-columns,
.svg-row.batch-row {
  grid-template-columns: 34px max-content minmax(170px, 220px) minmax(240px, 1fr) 110px 90px 130px;
  …
}
```

* `max-content` for the AI thumbnail keeps I-55 honest: the column is the
  thumb's own zoomed box (48–800 px), never a fixed 140 px that a larger zoom
  would overflow.
* `minmax(170px, 220px)` for File / path: bounded, so the free space is no
  longer spent here. 220 px holds a typical `icon-…_AI.png` name (10 px
  monospace ≈ 36 chars) and a relPath (8 px ≈ 45 chars); anything longer
  ellipsises into the `title` both cells already carry — the full text is one
  hover away, never silently dropped.
* `minmax(240px, 1fr)` for Preview splits: the column now starts beside the
  file name and takes **every** pixel up to Created. The 240 px floor holds four
  48 px icons + three 6 px gaps (210 px) in one row on any window; the `1fr`
  gives ~1100 px on a 1920 px screen, so a 20-icon split is one row there and
  wraps to two rows on a narrower one. `flex-wrap` (no `overflow-x-auto`) plus
  `flex: none` thumbnails means an icon is either fully visible or on the next
  line — never half-cut behind a scrollbar, and never squeezed.
* Seven tracks, seven cells: the dead eighth track is gone, so the row is no
  longer wider than the panel and `.pair-table` does not scroll sideways at
  normal widths (it still does at an 800 px zoom, which I-55 requires).

`src/batch/ScanTable.tsx` needed no change: `PreviewCell` already renders the
count above a `flex min-w-0 w-full flex-wrap` strip, and the fourth cell is
stretched by `.batch-row > :nth-child(4)`.

## Pinning it (RULE 8)

`tests/batch_preview_column.test.tsx` resolves the cascade the way a browser
does — parse `src/index.css`, keep the rules whose selector matches a batch
row's real class list, pick the winner by specificity then order — and asserts:

* the winning rule is **more specific than one class** (the tie is the defect);
* row, header and the ≤1360 px block all resolve to **seven** tracks;
* track 2 is `max-content` (I-55), track 3 has no `1fr`, track 4 is a `1fr`
  track with a floor ≥ 240 px, and exactly three tracks follow it;
* the other tabs' own rows are untouched (Generate SVG 8, Selection V2 8,
  SVG to upload 7);
* in the DOM the preview strip is the row's **fourth** cell, wraps
  (`flex-wrap`, no `overflow-x-auto`), and renders every icon of the split
  (4 of 4, 10 of 10) with `flex: none`.

A CSS-text test is the honest seam here: happy-dom computes no layout, so a
pixel assertion would be a guess, while the cascade that produced the defect is
fully decidable from the stylesheet.

## Also in this change

* `tests/refactor_optimize.test.tsx` still expected the pre-preview **6**-column
  header and was red at HEAD; it now expects the 7 real labels.
* Nine lint errors and two `tsc` errors left red at HEAD by the earlier batch
  passes were fixed so the RULE 16 gate could run green: an empty `catch` now
  says why a failed prefs write is survivable (`src/lib/batchprefs.ts`), a
  `let` that is never reassigned (`src/lib/batchselect.ts`, two in
  `tests/svg_queue_ui.test.tsx`), three `@ts-ignore` + `(window as any)` deletes
  replaced by a typed optional property, and two unused locals in
  `tests/batch_merge_preview.test.tsx` turned into the assertions they were
  collected for (a strip only exists where a count does; thumbnails never exceed
  `MAX_THUMBS` × rows).
