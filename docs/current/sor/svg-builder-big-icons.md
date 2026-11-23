# SVG builder — big icons over 2 × 2 cells (2026-11-23)

Parent: [SVG builder](svg-builder.md) · [quick edit](svg-builder-quickedit.md) · selectors: [templates & quick edit](../selectors/svg-builder-presets.md) · [owners](owners/svg-builder.md).

## What the user does

- On any icon of a grid of at least 2 × 2, the quick toolbar has **⊞** (yellow): it marks the icon's cell — a bright red frame on the artboard (`.bld-cell.is-marked`); ⊞ again unmarks. Marks are working state (`model.mergeMarks`, grid positions, at most four; never undone, never saved).
- The fourth mark of a **2 × 2 square** combines the four cells at once into ONE big icon — the icon of the cell marked **first** — as one undo step of the look ("Combine 4 cells into one big icon"). Four marks that are not a square only say so.
- On a big icon the toolbar offers **≡** its own stroke width (`builder-quick-merge-stroke` → panel with ↺ *Sheet stroke*; 0 = follows the sheet's) and **✕** breaks it back into four cells (one undo step). The sheet's ≡ is not offered there.

## The model

- **In the look** (`config.grid.merges`, `lib/svgBuilder/merges.ts`): `{ col, row, pick, strokeWidth }` per square — its top-left cell, which cell gives the icon (0 TL, 1 TR, 2 BL, 3 BR), its own pen (0 = the sheet's). Validated field by field (`parseMerges`: bad positions drop, bad pick → 0, pen clamped to the stroke range). Templates, artboard overrides, preset JSON and `sheet.json` carry it like any look setting; layout presets reset it.
- **Active merges** (`activeMerges`): inside the grid and not overlapping an earlier one; others wait (growing the grid back revives them).
- **Layout** (`layout.ts` `mergedCells`): the square's icon cell becomes one cell as big as the four boxes with their gaps (one caption row under it), centred; the other three leave the cell list. `CellFrame.index` is the **slot**, `pos` the grid position, `span: 2` marks the big cell, `stroke` its own pen; `capacity` = drawn cells. Gap strips only between plain neighbours (`gapdrag.ts`, by position).
- **Placements**: the app store keeps one entry per **grid position**; the builder sees **slots** (`toSlots` in `useSvgBuilder`, `toFull` in the checked writers of `useBuilderActions`; the grid a write maps into follows a dispatched config at once). The three hidden cells keep their icons, so ✕ brings the same four back; an icon that meanwhile went elsewhere is shown once (a repeat would shift every later cell) and its cell is refilled from the recipe, quietly (the break is the undo step). With no merge both translations return the list itself.
- Combining / breaking never grows or truncates the sheet: auto placement refits only when columns × rows change.
- **Drawing** (`compose.ts`): the big cell's icon uses its own stroke (outlined and colored icons; colored ones only while a colored width is set).
